import { query } from "../lib/db";
import {
  BASE_CTES,
  MONTHS_CTE,
  formatMonthKey,
  int,
  num,
  pct,
  round2,
} from "../lib/subscription-sql";

export interface RevenueHistoryPoint {
  month: string;
  monthKey: string;
  /** MRR at the last instant of the month (point-in-time, not a running sum). */
  mrr: number;
  arr: number;
  arpu: number;
  activeSubs: number;
  newSubs: number;
  churnedSubs: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
  /** Cash actually collected in the month (Hotmart PURCHASE_APPROVED). */
  billings: number;
  /** Gross revenue retention: MRR kept from the base that started the month. */
  grr: number;
  /** MRR growth vs. the previous month, in %. */
  growthRate: number;
}

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  activeSubscribers: number;
  /** MRR at the start of the selected window, for a like-for-like delta. */
  mrrAtStart: number;
  mrrChange: number;
  mrrChangePct: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
  /** (Novo MRR) / (MRR cancelado) — above 1 means the base is growing. */
  quickRatio: number | null;
  grr: number;
  billings: number;
  /** Share of MRR locked into annual contracts — the low-churn part of the base. */
  annualMrrShare: number;
  byPlan: Array<{
    plan: string;
    interval: string;
    subscribers: number;
    mrr: number;
    arr: number;
    arpu: number;
    percentage: number;
  }>;
  byInterval: Array<{ label: string; subscribers: number; mrr: number; percentage: number }>;
  history: RevenueHistoryPoint[];
  dataQuality: {
    totalSubscriptions: number;
    withoutPrice: number;
    /** Non-active subscribers with no reliable end date — excluded from the timeline. */
    undatedExits: number;
  };
}

const INTERVAL_LABELS: Record<string, string> = {
  ANNUAL: "Anual",
  SEMIANNUAL: "Semestral",
  MONTHLY: "Mensal",
};

function intervalLabel(raw: string): string {
  return INTERVAL_LABELS[(raw ?? "").toUpperCase()] ?? raw ?? "Outro";
}

interface MonthRow {
  month_key: string;
  mrr_end: string;
  mrr_start: string;
  active_end: string;
  new_subs: string;
  churned_subs: string;
  new_mrr: string;
  churned_mrr: string;
}

export async function getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics> {
  const params = [startDate.toISOString(), endDate.toISOString()];

  const [monthRows, snapshotRows, byPlanRows, billingRows, qualityRows] = await Promise.all([
    // Point-in-time monthly series. Every figure is a direct measurement of the
    // base at a given instant, so the curve can never drift away from the live
    // snapshot the way the old cumulative add/subtract reconstruction did.
    query<MonthRow>(
      `WITH ${BASE_CTES},${MONTHS_CTE}
       SELECT
         mo.month_key,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.started_at < mo.m_end AND (s.ended_at IS NULL OR s.ended_at >= mo.m_end)
         ), 0) AS mrr_end,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.started_at < mo.m AND (s.ended_at IS NULL OR s.ended_at >= mo.m)
         ), 0) AS mrr_start,
         COUNT(*) FILTER (
           WHERE s.started_at < mo.m_end AND (s.ended_at IS NULL OR s.ended_at >= mo.m_end)
         ) AS active_end,
         COUNT(*) FILTER (
           WHERE s.started_at >= mo.m AND s.started_at < mo.m_end
         ) AS new_subs,
         COUNT(*) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end
         ) AS churned_subs,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.started_at >= mo.m AND s.started_at < mo.m_end
         ), 0) AS new_mrr,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end
         ), 0) AS churned_mrr
       FROM months mo
       LEFT JOIN timeline s ON TRUE
       GROUP BY mo.month_key, mo.m
       ORDER BY mo.m ASC`,
      params
    ),

    query<{ mrr: string; subs: string; annual_mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT
         COALESCE(SUM(mrr), 0) AS mrr,
         COUNT(*) AS subs,
         COALESCE(SUM(mrr) FILTER (WHERE plan_interval = 'ANNUAL'), 0) AS annual_mrr
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'`
    ),

    query<{ plan_name: string; plan_interval: string; subs: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT plan_name, plan_interval, COUNT(*) AS subs, COALESCE(SUM(mrr), 0) AS mrr
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'
       GROUP BY plan_name, plan_interval
       ORDER BY mrr DESC`
    ),

    // Cash in, not recognised revenue. With annual plans dominating, MRR alone
    // hides when the money actually lands — this is the complementary view.
    query<{ month_key: string; billed: string }>(
      `SELECT
         to_char(
           date_trunc('month', to_timestamp(COALESCE(approved_ms, creation_ms) / 1000.0)
             AT TIME ZONE 'America/Sao_Paulo'),
           'YYYY-MM'
         ) AS month_key,
         COALESCE(SUM(value), 0) AS billed
       FROM (
         SELECT
           CASE WHEN (payload->'data'->'purchase'->>'approved_date') ~ '^[0-9]+$'
                THEN (payload->'data'->'purchase'->>'approved_date')::bigint END AS approved_ms,
           CASE WHEN (payload->>'creation_date') ~ '^[0-9]+$'
                THEN (payload->>'creation_date')::bigint END AS creation_ms,
           CASE WHEN (payload->'data'->'purchase'->'price'->>'value') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (payload->'data'->'purchase'->'price'->>'value')::numeric END AS value
         FROM hotmart_webhook_events
         WHERE event = 'PURCHASE_APPROVED'
       ) t
       WHERE value IS NOT NULL AND COALESCE(approved_ms, creation_ms) IS NOT NULL
       GROUP BY 1`
    ),

    query<{ total: string; without_price: string; undated_exits: string }>(
      `WITH ${BASE_CTES}
       SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE mrr = 0) AS without_price,
         COUNT(*) FILTER (WHERE status <> 'ACTIVE' AND ended_at IS NULL) AS undated_exits
       FROM subs`
    ),
  ]);

  const mrr = round2(num(snapshotRows[0]?.mrr));
  const activeSubscribers = int(snapshotRows[0]?.subs);
  const annualMrr = num(snapshotRows[0]?.annual_mrr);
  const arr = round2(mrr * 12);
  const arpu = activeSubscribers > 0 ? round2(mrr / activeSubscribers) : 0;

  const billingsByMonth = new Map(billingRows.map((r) => [r.month_key, num(r.billed)]));

  let prevMrr: number | null = null;
  const history: RevenueHistoryPoint[] = monthRows.map((r) => {
    const monthMrr = round2(num(r.mrr_end));
    const mrrStart = num(r.mrr_start);
    const churnedMrr = round2(num(r.churned_mrr));
    const activeSubs = int(r.active_end);

    const point: RevenueHistoryPoint = {
      month: formatMonthKey(r.month_key),
      monthKey: r.month_key,
      mrr: monthMrr,
      arr: round2(monthMrr * 12),
      arpu: activeSubs > 0 ? round2(monthMrr / activeSubs) : 0,
      activeSubs,
      newSubs: int(r.new_subs),
      churnedSubs: int(r.churned_subs),
      newMrr: round2(num(r.new_mrr)),
      churnedMrr,
      netNewMrr: round2(num(r.new_mrr) - churnedMrr),
      billings: round2(billingsByMonth.get(r.month_key) ?? 0),
      grr: mrrStart > 0 ? pct(mrrStart - churnedMrr, mrrStart) : 0,
      growthRate: prevMrr && prevMrr > 0 ? pct(monthMrr - prevMrr, prevMrr) : 0,
    };
    prevMrr = monthMrr;
    return point;
  });

  const newMrr = round2(history.reduce((sum, h) => sum + h.newMrr, 0));
  const churnedMrr = round2(history.reduce((sum, h) => sum + h.churnedMrr, 0));
  const billings = round2(history.reduce((sum, h) => sum + h.billings, 0));
  const mrrAtStart = round2(num(monthRows[0]?.mrr_start));
  const mrrAtEnd = history.length > 0 ? history[history.length - 1].mrr : mrr;

  const byPlan = byPlanRows.map((r) => {
    const planMrr = round2(num(r.mrr));
    const subs = int(r.subs);
    return {
      plan: r.plan_name,
      interval: intervalLabel(r.plan_interval),
      subscribers: subs,
      mrr: planMrr,
      arr: round2(planMrr * 12),
      arpu: subs > 0 ? round2(planMrr / subs) : 0,
      percentage: pct(planMrr, mrr),
    };
  });

  const intervalTotals = new Map<string, { subscribers: number; mrr: number }>();
  for (const row of byPlanRows) {
    const label = intervalLabel(row.plan_interval);
    const entry = intervalTotals.get(label) ?? { subscribers: 0, mrr: 0 };
    entry.subscribers += int(row.subs);
    entry.mrr += num(row.mrr);
    intervalTotals.set(label, entry);
  }
  const byInterval = Array.from(intervalTotals.entries())
    .map(([label, v]) => ({
      label,
      subscribers: v.subscribers,
      mrr: round2(v.mrr),
      percentage: pct(v.mrr, mrr),
    }))
    .sort((a, b) => b.mrr - a.mrr);

  return {
    mrr,
    arr,
    arpu,
    activeSubscribers,
    mrrAtStart,
    mrrChange: round2(mrrAtEnd - mrrAtStart),
    mrrChangePct: mrrAtStart > 0 ? pct(mrrAtEnd - mrrAtStart, mrrAtStart) : 0,
    newMrr,
    churnedMrr,
    netNewMrr: round2(newMrr - churnedMrr),
    quickRatio: churnedMrr > 0 ? round2(newMrr / churnedMrr) : null,
    grr: mrrAtStart > 0 ? pct(mrrAtStart - churnedMrr, mrrAtStart) : 0,
    billings,
    annualMrrShare: pct(annualMrr, mrr),
    byPlan,
    byInterval,
    history,
    dataQuality: {
      totalSubscriptions: int(qualityRows[0]?.total),
      withoutPrice: int(qualityRows[0]?.without_price),
      undatedExits: int(qualityRows[0]?.undated_exits),
    },
  };
}
