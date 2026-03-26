import { query } from "../lib/db";

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  totalSubscribers: number;
  totalRevenue: number;
  byPlan: Array<{ plan: string; subscribers: number; revenue: number; percentage: number }>;
  history: Array<{
    month: string;
    mrr: number;
    arr: number;
    arpu: number;
    newSubs: number;
    churnedSubs: number;
    totalSubs: number;
    churnRate: number;
    byPlan: Record<string, number>;
  }>;
}

export async function getRevenueMetrics(_startDate: Date, _endDate: Date): Promise<RevenueMetrics> {
  const [summaryRows, byPlanRows, historyRows] = await Promise.all([
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
    query<{ month: string; new_subs: string; mrr_added: string }>(
      `SELECT
         TO_CHAR(TO_TIMESTAMP(accession_date / 1000), 'Mon/YY') AS month,
         TO_TIMESTAMP(accession_date / 1000) AS month_ts,
         COUNT(*) AS new_subs,
         COALESCE(SUM(
           CASE WHEN mrr_contribution IS NOT NULL THEN mrr_contribution
                WHEN plan_interval = 'ANNUAL' THEN ROUND(price_value / 12, 2)
                ELSE price_value END
         ), 0) AS mrr_added
       FROM hotmart_subscriptions
       WHERE status = 'ACTIVE'
         AND accession_date IS NOT NULL
         AND price_value IS NOT NULL
       GROUP BY month, month_ts
       ORDER BY month_ts ASC`
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

  let cumulativeSubs = 0;
  let cumulativeMrr = 0;
  const history = historyRows.map((r) => {
    const newSubs = parseInt(r.new_subs, 10);
    const mrrAdded = parseFloat(r.mrr_added);
    cumulativeSubs += newSubs;
    cumulativeMrr = Math.round((cumulativeMrr + mrrAdded) * 100) / 100;
    return {
      month: r.month,
      mrr: cumulativeMrr,
      arr: Math.round(cumulativeMrr * 12 * 100) / 100,
      arpu: cumulativeSubs > 0 ? Math.round((cumulativeMrr / cumulativeSubs) * 100) / 100 : 0,
      newSubs,
      churnedSubs: 0,
      totalSubs: cumulativeSubs,
      churnRate: 0,
      byPlan: {},
    };
  });

  const totalRevenue = history.reduce((sum, h) => sum + h.mrr, 0);

  return { mrr, arr, arpu, totalSubscribers, totalRevenue, byPlan, history };
}
