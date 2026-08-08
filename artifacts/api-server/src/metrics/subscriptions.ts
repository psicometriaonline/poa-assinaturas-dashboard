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

export interface SubscriptionsMetrics {
  activeSubscribers: number;
  mrr: number;
  arpu: number;
  /** Subscribers acquired inside the selected window. */
  newSubscribers: number;
  churnedSubscribers: number;
  netNewSubscribers: number;
  /** Average months the currently-active base has been subscribed. */
  avgTenureMonths: number;
  byStatus: Array<{ status: string; label: string; subscribers: number; mrr: number }>;
  byPlan: Array<{
    plan: string;
    interval: string;
    subscribers: number;
    mrr: number;
    percentage: number;
    arpu: number;
  }>;
  byInterval: Array<{ label: string; subscribers: number; mrr: number; percentage: number }>;
  byProduct: Array<{ product: string; subscribers: number; mrr: number }>;
  /** How long the *active* base has been paying — a stability read on the book. */
  tenureBuckets: Array<{ bucket: string; subscribers: number; mrr: number; percentage: number }>;
  /** New subscriptions per month broken down by plan (acquisition mix over time). */
  acquisitionHistory: Array<{ month: string; monthKey: string; total: number; plans: Record<string, number> }>;
  topPlans: string[];
  /** Contract value coming up for renewal — the concrete retention workload. */
  renewals: Array<{ window: string; days: number; subscribers: number; mrr: number; contractValue: number }>;
  upcomingRenewalsByMonth: Array<{ month: string; monthKey: string; subscribers: number; contractValue: number }>;
  /** Late payers: still recoverable, but currently contributing nothing. */
  delinquent: { subscribers: number; mrr: number; percentageOfBase: number };
}

const INTERVAL_LABELS: Record<string, string> = {
  ANNUAL: "Anual",
  SEMIANNUAL: "Semestral",
  MONTHLY: "Mensal",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  CANCELLED: "Cancelado",
  INACTIVE: "Inativo",
  DELAYED: "Atrasado",
  PAST_DUE: "Atrasado",
  STARTED: "Iniciado",
};

const TENURE_BUCKETS = [
  { bucket: "< 3 meses", max: 3 },
  { bucket: "3–6 meses", max: 6 },
  { bucket: "6–12 meses", max: 12 },
  { bucket: "12–24 meses", max: 24 },
  { bucket: "24+ meses", max: Infinity },
];

const RENEWAL_WINDOWS = [
  { window: "Próximos 30 dias", days: 30 },
  { window: "Próximos 60 dias", days: 60 },
  { window: "Próximos 90 dias", days: 90 },
];

function intervalLabel(raw: string): string {
  return INTERVAL_LABELS[(raw ?? "").toUpperCase()] ?? raw ?? "Outro";
}

export async function getSubscriptionsMetrics(
  startDate: Date,
  endDate: Date
): Promise<SubscriptionsMetrics> {
  const params = [startDate.toISOString(), endDate.toISOString()];

  const [
    statusRows,
    planRows,
    productRows,
    tenureRows,
    periodRows,
    acquisitionRows,
    renewalRows,
    renewalMonthRows,
  ] = await Promise.all([
    query<{ status: string; subs: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT status, COUNT(*) AS subs, COALESCE(SUM(mrr), 0) AS mrr
       FROM subs GROUP BY status ORDER BY subs DESC`
    ),

    query<{ plan_name: string; plan_interval: string; subs: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT plan_name, plan_interval, COUNT(*) AS subs, COALESCE(SUM(mrr), 0) AS mrr
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'
       GROUP BY plan_name, plan_interval
       ORDER BY mrr DESC`
    ),

    query<{ product_name: string; subs: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT product_name, COUNT(*) AS subs, COALESCE(SUM(mrr), 0) AS mrr
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'
       GROUP BY product_name
       ORDER BY mrr DESC`
    ),

    query<{ months_alive: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT
         EXTRACT(EPOCH FROM (now() - started_at)) / (30.4375 * 86400) AS months_alive,
         mrr
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'`
    ),

    query<{ new_subs: string; churned_subs: string }>(
      `WITH ${BASE_CTES}
       SELECT
         COUNT(*) FILTER (WHERE started_at >= $1::timestamptz AND started_at <= $2::timestamptz) AS new_subs,
         COUNT(*) FILTER (WHERE ended_at   >= $1::timestamptz AND ended_at   <= $2::timestamptz) AS churned_subs
       FROM timeline`,
      params
    ),

    query<{ month_key: string; plan_name: string; cnt: string }>(
      `WITH ${BASE_CTES},${MONTHS_CTE}
       SELECT mo.month_key, s.plan_name, COUNT(*) AS cnt
       FROM months mo
       JOIN timeline s ON s.started_at >= mo.m AND s.started_at < mo.m_end
       GROUP BY mo.month_key, mo.m, s.plan_name
       ORDER BY mo.m ASC`,
      params
    ),

    query<{ days: string; subs: string; mrr: string; contract_value: string }>(
      `WITH ${BASE_CTES}, windows AS (SELECT unnest(ARRAY[30, 60, 90]) AS days)
       SELECT
         w.days::text AS days,
         COUNT(*) FILTER (
           WHERE s.next_charge_at >= now()
             AND s.next_charge_at < now() + make_interval(days => w.days)
         )::text AS subs,
         COALESCE(SUM(s.mrr) FILTER (
           WHERE s.next_charge_at >= now()
             AND s.next_charge_at < now() + make_interval(days => w.days)
         ), 0)::text AS mrr,
         COALESCE(SUM(s.price_value) FILTER (
           WHERE s.next_charge_at >= now()
             AND s.next_charge_at < now() + make_interval(days => w.days)
         ), 0)::text AS contract_value
       FROM windows w
       LEFT JOIN subs s ON s.ended_at IS NULL AND s.status = 'ACTIVE'
       GROUP BY w.days
       ORDER BY w.days`
    ),

    query<{ month_key: string; subs: string; contract_value: string }>(
      `WITH ${BASE_CTES}
       SELECT
         to_char(date_trunc('month', next_charge_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS month_key,
         COUNT(*) AS subs,
         COALESCE(SUM(price_value), 0) AS contract_value
       FROM subs
       WHERE ended_at IS NULL
         AND status = 'ACTIVE'
         AND next_charge_at >= now()
         AND next_charge_at < now() + interval '12 months'
       GROUP BY 1
       ORDER BY 1`
    ),
  ]);

  const byStatus = statusRows.map((r) => ({
    status: r.status,
    label: STATUS_LABELS[r.status] ?? r.status,
    subscribers: int(r.subs),
    mrr: round2(num(r.mrr)),
  }));

  const activeSubscribers = planRows.reduce((s, r) => s + int(r.subs), 0);
  const mrr = round2(planRows.reduce((s, r) => s + num(r.mrr), 0));

  const byPlan = planRows.map((r) => {
    const subs = int(r.subs);
    const planMrr = round2(num(r.mrr));
    return {
      plan: r.plan_name,
      interval: intervalLabel(r.plan_interval),
      subscribers: subs,
      mrr: planMrr,
      percentage: pct(planMrr, mrr),
      arpu: subs > 0 ? round2(planMrr / subs) : 0,
    };
  });

  const intervalTotals = new Map<string, { subscribers: number; mrr: number }>();
  for (const r of planRows) {
    const label = intervalLabel(r.plan_interval);
    const entry = intervalTotals.get(label) ?? { subscribers: 0, mrr: 0 };
    entry.subscribers += int(r.subs);
    entry.mrr += num(r.mrr);
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

  const tenures = tenureRows.map((r) => ({ months: num(r.months_alive), mrr: num(r.mrr) }));
  const avgTenureMonths =
    tenures.length > 0
      ? round2(tenures.reduce((s, t) => s + t.months, 0) / tenures.length)
      : 0;

  const tenureCounts = TENURE_BUCKETS.map((b) => ({ ...b, subscribers: 0, mrr: 0 }));
  for (const t of tenures) {
    const bucket =
      tenureCounts.find((b) => t.months < b.max) ?? tenureCounts[tenureCounts.length - 1];
    bucket.subscribers++;
    bucket.mrr += t.mrr;
  }
  const tenureBuckets = tenureCounts.map((b) => ({
    bucket: b.bucket,
    subscribers: b.subscribers,
    mrr: round2(b.mrr),
    percentage: pct(b.subscribers, tenures.length),
  }));

  // Group acquisition by plan, folding the long tail into "Outros" so the
  // stacked chart stays legible however many offers exist.
  const planTotals = new Map<string, number>();
  for (const r of acquisitionRows) {
    planTotals.set(r.plan_name, (planTotals.get(r.plan_name) ?? 0) + int(r.cnt));
  }
  const topPlans = Array.from(planTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const acquisitionMap = new Map<string, { total: number; plans: Record<string, number> }>();
  for (const r of acquisitionRows) {
    const entry = acquisitionMap.get(r.month_key) ?? { total: 0, plans: {} };
    const group = topPlans.includes(r.plan_name) ? r.plan_name : "Outros";
    const cnt = int(r.cnt);
    entry.plans[group] = (entry.plans[group] ?? 0) + cnt;
    entry.total += cnt;
    acquisitionMap.set(r.month_key, entry);
  }
  const acquisitionHistory = Array.from(acquisitionMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, v]) => ({
      month: formatMonthKey(monthKey),
      monthKey,
      total: v.total,
      plans: v.plans,
    }));

  const renewalByDays = new Map(renewalRows.map((r) => [int(r.days), r]));
  const renewals = RENEWAL_WINDOWS.map(({ window, days }) => {
    const row = renewalByDays.get(days);
    return {
      window,
      days,
      subscribers: int(row?.subs),
      mrr: round2(num(row?.mrr)),
      contractValue: round2(num(row?.contract_value)),
    };
  });

  const upcomingRenewalsByMonth = renewalMonthRows.map((r) => ({
    month: formatMonthKey(r.month_key),
    monthKey: r.month_key,
    subscribers: int(r.subs),
    contractValue: round2(num(r.contract_value)),
  }));

  const delinquentRow = byStatus.filter((s) => s.status === "DELAYED" || s.status === "PAST_DUE");
  const delinquentSubs = delinquentRow.reduce((s, r) => s + r.subscribers, 0);
  const delinquentMrr = round2(delinquentRow.reduce((s, r) => s + r.mrr, 0));

  const newSubscribers = int(periodRows[0]?.new_subs);
  const churnedSubscribers = int(periodRows[0]?.churned_subs);

  return {
    activeSubscribers,
    mrr,
    arpu: activeSubscribers > 0 ? round2(mrr / activeSubscribers) : 0,
    newSubscribers,
    churnedSubscribers,
    netNewSubscribers: newSubscribers - churnedSubscribers,
    avgTenureMonths,
    byStatus,
    byPlan,
    byInterval,
    byProduct: productRows.map((r) => ({
      product: r.product_name,
      subscribers: int(r.subs),
      mrr: round2(num(r.mrr)),
    })),
    tenureBuckets,
    acquisitionHistory,
    topPlans: topPlans.concat(planTotals.size > topPlans.length ? ["Outros"] : []),
    renewals,
    upcomingRenewalsByMonth,
    delinquent: {
      subscribers: delinquentSubs,
      mrr: delinquentMrr,
      percentageOfBase: pct(delinquentSubs, activeSubscribers + delinquentSubs),
    },
  };
}
