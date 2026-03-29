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

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[d.getMonth()]}/${year.slice(2)}`;
}

export async function getChurnMetrics(startDate: Date, endDate: Date): Promise<ChurnMetrics> {
  const startKey = startDate.toISOString().slice(0, 7);
  const endKey = endDate.toISOString().slice(0, 7);

  const [acquisitionRows, cancellationRows] = await Promise.all([
    query<{ month_key: string; new_subs: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(accession_date / 1000)), 'YYYY-MM') AS month_key,
         COUNT(*) AS new_subs
       FROM hotmart_subscriptions
       WHERE accession_date IS NOT NULL
         AND original_event IN ('IMPORT_CSV', 'PURCHASE_APPROVED', 'REACTIVATED_PURCHASE')
         AND TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(accession_date / 1000)), 'YYYY-MM') <= $1
       GROUP BY 1
       ORDER BY 1 ASC`,
      [endKey]
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
           AND TO_CHAR(DATE_TRUNC('month', received_at), 'YYYY-MM') <= $2
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
      [[...CHURN_EVENTS], endKey]
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

  const allMonthKeys = Array.from(
    new Set([...acqByMonth.keys(), ...cancelByMonth.keys()])
  ).sort();

  let cumulativeSubs = 0;
  let totalCancellations = 0;
  const history: ChurnMetrics["history"] = [];

  for (const monthKey of allMonthKeys) {
    const newSubs = acqByMonth.get(monthKey) ?? 0;
    const cancel = cancelByMonth.get(monthKey) ?? { count: 0, mrrLost: 0 };

    const startSubs = cumulativeSubs;
    const base = startSubs + cancel.count;
    const churnRate = base > 0 ? parseFloat(((cancel.count / base) * 100).toFixed(2)) : 0;
    cumulativeSubs += newSubs - cancel.count;

    if (monthKey >= startKey) {
      totalCancellations += cancel.count;
      history.push({
        month: formatMonthKey(monthKey),
        monthKey,
        total: cancel.count,
        churnRate,
        mrrLost: cancel.mrrLost,
      });
    }
  }

  const churnRate = history.length > 0 ? (history[history.length - 1]?.churnRate ?? 0) : 0;

  return { totalCancellations, churnRate, history };
}
