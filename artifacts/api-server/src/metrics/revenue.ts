import { query } from "../lib/db";
import { CHURN_EVENTS } from "../lib/churn-events";

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  totalSubscribers: number;
  totalRevenue: number;
  byPlan: Array<{ plan: string; subscribers: number; revenue: number; percentage: number }>;
  history: Array<{
    month: string;
    monthKey: string;
    mrr: number;
    arr: number;
    arpu: number;
    newSubs: number;
    churnedSubs: number;
    mrrLost: number;
    totalSubs: number;
    churnRate: number;
    byPlan: Record<string, number>;
  }>;
}

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[d.getMonth()]}/${year.slice(2)}`;
}

export async function getRevenueMetrics(_startDate: Date, _endDate: Date): Promise<RevenueMetrics> {
  const [summaryRows, byPlanRows, historyRows, cancellationRows] = await Promise.all([
    query<{ mrr: string; count: string }>(
      `SELECT
         COALESCE(SUM(
           CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
                WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
                ELSE price_value END
         ), 0) AS mrr,
         COUNT(*) AS count
       FROM hotmart_subscriptions
       WHERE status = 'ACTIVE' AND price_value IS NOT NULL`
    ),
    query<{ plan_name: string; count: string; mrr: string }>(
      `SELECT
         COALESCE(plan_name, 'Sem plano') AS plan_name,
         COUNT(*) AS count,
         COALESCE(SUM(
           CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
                WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
                ELSE price_value END
         ), 0) AS mrr
       FROM hotmart_subscriptions
       WHERE status = 'ACTIVE' AND price_value IS NOT NULL
       GROUP BY plan_name
       ORDER BY mrr DESC`
    ),
    query<{ month: string; month_key: string; new_subs: string; mrr_added: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(accession_date / 1000)), 'Mon/YY') AS month,
         TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(accession_date / 1000)), 'YYYY-MM') AS month_key,
         COUNT(*) AS new_subs,
         COALESCE(SUM(
           CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
                WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
                ELSE price_value END
         ), 0) AS mrr_added
       FROM hotmart_subscriptions
       WHERE accession_date IS NOT NULL
         AND price_value IS NOT NULL
         AND original_event IN ('IMPORT_CSV', 'PURCHASE_APPROVED', 'REACTIVATED_PURCHASE')
       GROUP BY 1, 2
       ORDER BY 2 ASC`
    ),
    query<{ month_key: string; cancelled: string; mrr_lost: string }>(
      `WITH monthly_cancels AS (
         SELECT DISTINCT ON (
           TO_CHAR(DATE_TRUNC('month', received_at), 'YYYY-MM'),
           subscriber_code
         )
           TO_CHAR(DATE_TRUNC('month', received_at), 'YYYY-MM') AS month_key,
           subscriber_code
         FROM hotmart_webhook_events
         WHERE event = ANY($1::text[])
         ORDER BY
           TO_CHAR(DATE_TRUNC('month', received_at), 'YYYY-MM'),
           subscriber_code,
           received_at ASC
       )
       SELECT
         mc.month_key,
         COUNT(*) AS cancelled,
         COALESCE(SUM(
           CASE WHEN hs.mrr_contribution IS NOT NULL THEN hs.mrr_contribution
                WHEN hs.plan_interval = 'ANNUAL' THEN ROUND(hs.price_value / 12, 2)
                ELSE hs.price_value END
         ), 0) AS mrr_lost
       FROM monthly_cancels mc
       LEFT JOIN hotmart_subscriptions hs
         ON hs.subscriber_code = mc.subscriber_code
         AND hs.price_value IS NOT NULL
       GROUP BY mc.month_key
       ORDER BY mc.month_key ASC`,
      [[...CHURN_EVENTS]]
    ),
  ]);

  const mrr = parseFloat(summaryRows[0]?.mrr ?? "0");
  const totalSubscribers = parseInt(summaryRows[0]?.count ?? "0", 10);
  const arr = Math.round(mrr * 12 * 100) / 100;
  const arpu = totalSubscribers > 0 ? Math.round((mrr / totalSubscribers) * 100) / 100 : 0;

  const byPlan = byPlanRows.map((r) => {
    const rev = parseFloat(r.mrr);
    return {
      plan: r.plan_name,
      subscribers: parseInt(r.count, 10),
      revenue: rev,
      percentage: mrr > 0 ? Math.round((rev / mrr) * 1000) / 10 : 0,
    };
  });

  const acquisitionByMonth = new Map<string, { month: string; newSubs: number; mrrAdded: number }>(
    historyRows.map((r) => [
      r.month_key,
      {
        month: r.month,
        newSubs: parseInt(r.new_subs, 10),
        mrrAdded: parseFloat(r.mrr_added),
      },
    ])
  );

  const cancellationByMonth = new Map<string, { count: number; mrrLost: number }>(
    cancellationRows.map((r) => [
      r.month_key,
      { count: parseInt(r.cancelled, 10), mrrLost: parseFloat(r.mrr_lost) },
    ])
  );

  const allMonthKeys = Array.from(
    new Set([...acquisitionByMonth.keys(), ...cancellationByMonth.keys()])
  ).sort();

  let cumulativeSubs = 0;
  let cumulativeMrr = 0;
  let totalMrrAdded = 0;

  const history = allMonthKeys.map((monthKey) => {
    const acq = acquisitionByMonth.get(monthKey);
    const newSubs = acq?.newSubs ?? 0;
    const mrrAdded = acq?.mrrAdded ?? 0;
    const cancel = cancellationByMonth.get(monthKey) ?? { count: 0, mrrLost: 0 };
    const churnedSubs = cancel.count;
    const mrrLost = cancel.mrrLost;

    const startSubs = cumulativeSubs;
    const base = startSubs + churnedSubs;
    const churnRate = base > 0 ? Math.round((churnedSubs / base) * 10000) / 100 : 0;
    cumulativeSubs += newSubs - churnedSubs;

    cumulativeMrr = Math.round((cumulativeMrr + mrrAdded - mrrLost) * 100) / 100;
    totalMrrAdded += mrrAdded;

    return {
      month: acq?.month ?? formatMonthKey(monthKey),
      monthKey,
      mrr: cumulativeMrr,
      arr: Math.round(cumulativeMrr * 12 * 100) / 100,
      arpu: cumulativeSubs > 0 ? Math.round((cumulativeMrr / cumulativeSubs) * 100) / 100 : 0,
      newSubs,
      churnedSubs,
      mrrLost,
      totalSubs: cumulativeSubs,
      churnRate,
      byPlan: {},
    };
  });

  return {
    mrr,
    arr,
    arpu,
    totalSubscribers,
    totalRevenue: Math.round(totalMrrAdded * 100) / 100,
    byPlan,
    history,
  };
}
