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

export interface ChurnHistoryPoint {
  month: string;
  monthKey: string;
  /** Paying subscribers at the first instant of the month — the churn denominator. */
  activeStart: number;
  newSubs: number;
  churned: number;
  voluntary: number;
  involuntary: number;
  /** Logo churn: cancelled / active at start of month. */
  churnRate: number;
  mrrStart: number;
  mrrChurned: number;
  mrrNew: number;
  /** Revenue churn: MRR lost / MRR at start of month. */
  revenueChurnRate: number;
  /** Net MRR churn — negative means new sales more than replaced what was lost. */
  netRevenueChurnRate: number;
  /** Net revenue retention over the month. */
  nrr: number;
}

export interface ChurnMetrics {
  totalCancellations: number;
  voluntaryCancellations: number;
  involuntaryCancellations: number;
  mrrLost: number;
  /** Weighted average monthly logo churn over the window. */
  churnRate: number;
  /** Same rate annualised: 1 − (1 − monthly)^12. */
  annualizedChurnRate: number;
  revenueChurnRate: number;
  /** Net revenue retention over the whole window. */
  nrr: number;
  grr: number;
  /** Average months a churned subscriber stayed. */
  avgLifetimeMonths: number;
  /** ARPU / monthly churn — expected lifetime revenue of a subscriber. */
  ltv: number | null;
  delinquent: { subscribers: number; mrr: number };
  history: ChurnHistoryPoint[];
  byPlan: Array<{
    plan: string;
    interval: string;
    activeNow: number;
    churned: number;
    churnRate: number;
    mrrLost: number;
  }>;
  tenureAtChurn: Array<{ bucket: string; count: number; percentage: number }>;
}

const INTERVAL_LABELS: Record<string, string> = {
  ANNUAL: "Anual",
  SEMIANNUAL: "Semestral",
  MONTHLY: "Mensal",
};

const TENURE_BUCKETS = [
  { bucket: "< 1 mês", max: 1 },
  { bucket: "1–3 meses", max: 3 },
  { bucket: "3–6 meses", max: 6 },
  { bucket: "6–12 meses", max: 12 },
  { bucket: "12–24 meses", max: 24 },
  { bucket: "24+ meses", max: Infinity },
];

interface MonthRow {
  month_key: string;
  active_start: string;
  mrr_start: string;
  new_subs: string;
  new_mrr: string;
  churned: string;
  voluntary: string;
  involuntary: string;
  mrr_churned: string;
}

export async function getChurnMetrics(startDate: Date, endDate: Date): Promise<ChurnMetrics> {
  const params = [startDate.toISOString(), endDate.toISOString()];

  const [monthRows, planRows, tenureRows, delinquentRows] = await Promise.all([
    query<MonthRow>(
      `WITH ${BASE_CTES},${MONTHS_CTE}
       SELECT
         mo.month_key,
         COUNT(*) FILTER (
           WHERE s.started_at < mo.m AND (s.ended_at IS NULL OR s.ended_at >= mo.m)
         ) AS active_start,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.started_at < mo.m AND (s.ended_at IS NULL OR s.ended_at >= mo.m)
         ), 0) AS mrr_start,
         COUNT(*) FILTER (
           WHERE s.started_at >= mo.m AND s.started_at < mo.m_end
         ) AS new_subs,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.started_at >= mo.m AND s.started_at < mo.m_end
         ), 0) AS new_mrr,
         COUNT(*) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end
         ) AS churned,
         COUNT(*) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end AND s.churn_kind = 'voluntario'
         ) AS voluntary,
         COUNT(*) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end AND s.churn_kind = 'involuntario'
         ) AS involuntary,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.ended_at >= mo.m AND s.ended_at < mo.m_end
         ), 0) AS mrr_churned
       FROM months mo
       LEFT JOIN timeline s ON TRUE
       GROUP BY mo.month_key, mo.m
       ORDER BY mo.m ASC`,
      params
    ),

    query<{
      plan_name: string;
      plan_interval: string;
      active_now: string;
      churned: string;
      mrr_lost: string;
    }>(
      `WITH ${BASE_CTES}
       SELECT
         plan_name,
         plan_interval,
         COUNT(*) FILTER (WHERE ended_at IS NULL AND status = 'ACTIVE') AS active_now,
         COUNT(*) FILTER (WHERE ended_at >= $1::timestamptz AND ended_at <= $2::timestamptz) AS churned,
         COALESCE(SUM(mrr) FILTER (
           WHERE ended_at >= $1::timestamptz AND ended_at <= $2::timestamptz
         ), 0) AS mrr_lost
       FROM subs
       GROUP BY plan_name, plan_interval
       HAVING COUNT(*) FILTER (WHERE ended_at IS NULL AND status = 'ACTIVE') > 0
           OR COUNT(*) FILTER (WHERE ended_at >= $1::timestamptz AND ended_at <= $2::timestamptz) > 0
       ORDER BY churned DESC, active_now DESC`,
      params
    ),

    query<{ months_alive: string }>(
      `WITH ${BASE_CTES}
       SELECT EXTRACT(EPOCH FROM (ended_at - started_at)) / (30.4375 * 86400) AS months_alive
       FROM subs
       WHERE ended_at >= $1::timestamptz AND ended_at <= $2::timestamptz
         AND ended_at > started_at`,
      params
    ),

    query<{ subs: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT COUNT(*) AS subs, COALESCE(SUM(mrr), 0) AS mrr
       FROM subs
       WHERE is_delinquent`
    ),
  ]);

  const history: ChurnHistoryPoint[] = monthRows.map((r) => {
    const activeStart = int(r.active_start);
    const mrrStart = round2(num(r.mrr_start));
    const mrrChurned = round2(num(r.mrr_churned));
    const mrrNew = round2(num(r.new_mrr));
    const churned = int(r.churned);

    return {
      month: formatMonthKey(r.month_key),
      monthKey: r.month_key,
      activeStart,
      newSubs: int(r.new_subs),
      churned,
      voluntary: int(r.voluntary),
      involuntary: int(r.involuntary),
      churnRate: pct(churned, activeStart),
      mrrStart,
      mrrChurned,
      mrrNew,
      revenueChurnRate: pct(mrrChurned, mrrStart),
      netRevenueChurnRate: pct(mrrChurned - mrrNew, mrrStart),
      nrr: mrrStart > 0 ? pct(mrrStart - mrrChurned + mrrNew, mrrStart) : 0,
    };
  });

  const totalCancellations = history.reduce((s, h) => s + h.churned, 0);
  const voluntaryCancellations = history.reduce((s, h) => s + h.voluntary, 0);
  const involuntaryCancellations = history.reduce((s, h) => s + h.involuntary, 0);
  const mrrLost = round2(history.reduce((s, h) => s + h.mrrChurned, 0));
  const mrrGained = round2(history.reduce((s, h) => s + h.mrrNew, 0));

  // Weighted average: total events over the summed month-start base. This is the
  // correct denominator — the old version divided by every row ever inserted
  // (cancelled subscribers included), which drove the rate down as the table grew.
  const sumActiveStart = history.reduce((s, h) => s + h.activeStart, 0);
  const sumMrrStart = history.reduce((s, h) => s + h.mrrStart, 0);
  const churnRate = pct(totalCancellations, sumActiveStart);
  const revenueChurnRate = pct(mrrLost, sumMrrStart);

  const monthlyRate = churnRate / 100;
  const annualizedChurnRate =
    monthlyRate > 0 && monthlyRate < 1 ? round2((1 - Math.pow(1 - monthlyRate, 12)) * 100) : 0;

  const lifetimes = tenureRows.map((r) => num(r.months_alive)).filter((v) => v >= 0);
  const avgLifetimeMonths =
    lifetimes.length > 0 ? round2(lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) : 0;

  const tenureCounts = TENURE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const months of lifetimes) {
    const bucket = tenureCounts.find((b) => months < b.max) ?? tenureCounts[tenureCounts.length - 1];
    bucket.count++;
  }
  const tenureAtChurn = tenureCounts.map((b) => ({
    bucket: b.bucket,
    count: b.count,
    percentage: pct(b.count, lifetimes.length),
  }));

  // LTV from the last month's ARPU and the window's monthly churn rate.
  const lastMonth = history[history.length - 1];
  const arpuNow =
    lastMonth && lastMonth.activeStart > 0 ? lastMonth.mrrStart / lastMonth.activeStart : 0;
  const ltv = monthlyRate > 0 ? round2(arpuNow / monthlyRate) : null;

  const byPlan = planRows.map((r) => {
    const activeNow = int(r.active_now);
    const churned = int(r.churned);
    return {
      plan: r.plan_name,
      interval: INTERVAL_LABELS[(r.plan_interval ?? "").toUpperCase()] ?? r.plan_interval,
      activeNow,
      churned,
      churnRate: pct(churned, activeNow + churned),
      mrrLost: round2(num(r.mrr_lost)),
    };
  });

  return {
    totalCancellations,
    voluntaryCancellations,
    involuntaryCancellations,
    mrrLost,
    churnRate,
    annualizedChurnRate,
    revenueChurnRate,
    nrr: sumMrrStart > 0 ? pct(sumMrrStart - mrrLost + mrrGained, sumMrrStart) : 0,
    grr: sumMrrStart > 0 ? pct(sumMrrStart - mrrLost, sumMrrStart) : 0,
    avgLifetimeMonths,
    ltv,
    delinquent: {
      subscribers: int(delinquentRows[0]?.subs),
      mrr: round2(num(delinquentRows[0]?.mrr)),
    },
    history,
    byPlan,
    tenureAtChurn,
  };
}
