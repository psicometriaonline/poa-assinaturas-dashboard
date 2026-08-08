import { query } from "../lib/db";
import { BASE_CTES, formatMonthKey, int, num, pct, round2 } from "../lib/subscription-sql";

/** Cohorts older than this many months are truncated to keep the matrix readable. */
const MAX_OFFSET_MONTHS = 24;

export interface CohortRow {
  cohortKey: string;
  cohort: string;
  size: number;
  initialMrr: number;
  /** cells[k] = state k months after the cohort started (k = 0 is the first month). */
  cells: Array<{ offset: number; retained: number; retentionRate: number; mrrRetentionRate: number }>;
}

export interface RetentionMetrics {
  cohorts: CohortRow[];
  maxOffset: number;
  /** Average logo retention across cohorts at 1, 3, 6 and 12 months. */
  benchmarks: Array<{ offset: number; label: string; retentionRate: number; cohortsCounted: number }>;
  /** Share of the active base that has been paying for 12+ months. */
  loyalBaseShare: number;
}

interface CohortCellRow {
  cohort_key: string;
  size: string;
  initial_mrr: string;
  k: string;
  retained: string;
  retained_mrr: string;
}

export async function getRetentionMetrics(
  startDate: Date,
  endDate: Date
): Promise<RetentionMetrics> {
  const params = [startDate.toISOString(), endDate.toISOString()];

  const [cellRows, loyalRows] = await Promise.all([
    query<CohortCellRow>(
      `WITH ${BASE_CTES},
       cohorts AS (
         SELECT
           date_trunc('month', s.started_at AT TIME ZONE 'America/Sao_Paulo') AS cohort_month,
           s.ended_at,
           s.mrr
         FROM timeline s
         WHERE s.started_at >= $1::timestamptz AND s.started_at <= $2::timestamptz
       ),
       cohort_sizes AS (
         SELECT
           cohort_month,
           COUNT(*) AS size,
           COALESCE(SUM(mrr), 0) AS initial_mrr,
           LEAST(
             ${MAX_OFFSET_MONTHS},
             GREATEST(0, (
               EXTRACT(YEAR  FROM age(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), cohort_month)) * 12
             + EXTRACT(MONTH FROM age(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), cohort_month))
             )::int)
           ) AS max_k
         FROM cohorts
         GROUP BY cohort_month
       )
       SELECT
         to_char(cs.cohort_month, 'YYYY-MM') AS cohort_key,
         cs.size::text                       AS size,
         cs.initial_mrr::text                AS initial_mrr,
         g.k::text                           AS k,
         COUNT(*) FILTER (
           WHERE c.ended_at IS NULL
              OR c.ended_at >= ((cs.cohort_month + make_interval(months => g.k + 1))
                                AT TIME ZONE 'America/Sao_Paulo')
         )::text AS retained,
         COALESCE(SUM(c.mrr) FILTER (
           WHERE c.ended_at IS NULL
              OR c.ended_at >= ((cs.cohort_month + make_interval(months => g.k + 1))
                                AT TIME ZONE 'America/Sao_Paulo')
         ), 0)::text AS retained_mrr
       FROM cohort_sizes cs
       JOIN cohorts c ON c.cohort_month = cs.cohort_month
       CROSS JOIN LATERAL generate_series(0, cs.max_k) AS g(k)
       GROUP BY cs.cohort_month, cs.size, cs.initial_mrr, g.k
       ORDER BY cs.cohort_month ASC, g.k ASC`,
      params
    ),

    query<{ loyal: string; total: string }>(
      `WITH ${BASE_CTES}
       SELECT
         COUNT(*) FILTER (WHERE started_at <= now() - interval '12 months') AS loyal,
         COUNT(*) AS total
       FROM subs
       WHERE ended_at IS NULL AND status = 'ACTIVE'`
    ),
  ]);

  const byCohort = new Map<string, CohortRow>();
  let maxOffset = 0;

  for (const row of cellRows) {
    const size = int(row.size);
    const initialMrr = round2(num(row.initial_mrr));
    let cohort = byCohort.get(row.cohort_key);
    if (!cohort) {
      cohort = {
        cohortKey: row.cohort_key,
        cohort: formatMonthKey(row.cohort_key),
        size,
        initialMrr,
        cells: [],
      };
      byCohort.set(row.cohort_key, cohort);
    }
    const offset = int(row.k);
    const retained = int(row.retained);
    maxOffset = Math.max(maxOffset, offset);
    cohort.cells.push({
      offset,
      retained,
      retentionRate: pct(retained, size),
      mrrRetentionRate: pct(num(row.retained_mrr), initialMrr),
    });
  }

  const cohorts = Array.from(byCohort.values()).sort((a, b) =>
    a.cohortKey.localeCompare(b.cohortKey)
  );

  const benchmarks = [
    { offset: 0, label: "1º mês" },
    { offset: 2, label: "3 meses" },
    { offset: 5, label: "6 meses" },
    { offset: 11, label: "12 meses" },
  ].map(({ offset, label }) => {
    // Only cohorts old enough to have reached this offset may be averaged in —
    // otherwise young cohorts would inflate the number with missing data.
    const eligible = cohorts.filter((c) => c.cells.some((cell) => cell.offset === offset));
    const rates = eligible.map(
      (c) => c.cells.find((cell) => cell.offset === offset)?.retentionRate ?? 0
    );
    return {
      offset,
      label,
      retentionRate:
        rates.length > 0 ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : 0,
      cohortsCounted: rates.length,
    };
  });

  return {
    cohorts,
    maxOffset,
    benchmarks,
    loyalBaseShare: pct(int(loyalRows[0]?.loyal), int(loyalRows[0]?.total)),
  };
}
