import { query } from "../lib/db";
import { CHURN_EVENTS } from "../lib/churn-events";

export interface ChurnMetrics {
  totalCancellations: number;
  churnRate: number;
  history: Array<{
    month: string;
    monthKey: string;
    total: number;
    churnRate: number;
    mrrLost: number;
  }>;
}

export async function getChurnMetrics(_startDate: Date, _endDate: Date): Promise<ChurnMetrics> {
  const [acquisitionRows, cancellationRows] = await Promise.all([
    query<{ month_key: string; new_subs: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(accession_date / 1000)), 'YYYY-MM') AS month_key,
         COUNT(*) AS new_subs
       FROM hotmart_subscriptions
       WHERE accession_date IS NOT NULL
         AND original_event IN ('IMPORT_CSV', 'PURCHASE_APPROVED', 'REACTIVATED_PURCHASE')
       GROUP BY 1
       ORDER BY 1 ASC`
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

  const acqByMonth = new Map<string, number>(
    acquisitionRows.map((r) => [r.month_key, parseInt(r.new_subs, 10)])
  );
  const cancelByMonth = new Map<string, { count: number; mrrLost: number }>(
    cancellationRows.map((r) => [
      r.month_key,
      { count: parseInt(r.cancelled, 10), mrrLost: parseFloat(r.mrr_lost) },
    ])
  );

  const allMonths = Array.from(
    new Set([...acqByMonth.keys(), ...cancelByMonth.keys()])
  ).sort();

  let cumulativeSubs = 0;
  let totalCancellations = 0;
  const history: ChurnMetrics["history"] = [];

  for (const monthKey of allMonths) {
    const newSubs = acqByMonth.get(monthKey) ?? 0;
    const cancelled = cancelByMonth.get(monthKey) ?? { count: 0, mrrLost: 0 };

    cumulativeSubs += newSubs;
    const base = cumulativeSubs + cancelled.count;
    const churnRate = base > 0 ? parseFloat(((cancelled.count / base) * 100).toFixed(2)) : 0;
    cumulativeSubs -= cancelled.count;

    totalCancellations += cancelled.count;

    const [year, month] = monthKey.split("-");
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthLabel = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    history.push({
      month: monthLabel,
      monthKey,
      total: cancelled.count,
      churnRate,
      mrrLost: cancelled.mrrLost,
    });
  }

  const lastMonthWithChurn = [...history].reverse().find((h) => h.total > 0);
  const churnRate = lastMonthWithChurn?.churnRate ?? 0;

  return { totalCancellations, churnRate, history };
}
