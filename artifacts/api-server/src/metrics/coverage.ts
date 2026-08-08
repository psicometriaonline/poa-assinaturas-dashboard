import { query } from "../lib/db";
import { BASE_CTES, int, num, round2 } from "../lib/subscription-sql";
import { METRICS_FLOOR_ISO } from "../lib/metrics-window";

export interface DataCoverage {
  /** Date before which nothing is reported. */
  floor: string;
  subscriptions: {
    total: number;
    firstAccession: string | null;
    lastAccession: string | null;
    /** Rows whose start date precedes the floor — excluded from every metric. */
    beforeFloor: number;
    mrrBeforeFloor: number;
  };
  /** One row per calendar year of `accession_date`, oldest first. */
  byYear: Array<{
    year: string;
    subscriptions: number;
    withPrice: number;
    mrr: number;
    excluded: boolean;
  }>;
  events: {
    total: number;
    firstEvent: string | null;
    lastEvent: string | null;
    byEvent: Array<{ event: string; count: number; first: string | null; last: string | null }>;
  };
}

/**
 * Diagnostic endpoint: what the database actually contains, before any clamping.
 *
 * Use it to decide where the reporting floor belongs — it deliberately reads the
 * raw table rather than the clamped window, so excluded rows stay countable.
 */
export async function getDataCoverage(): Promise<DataCoverage> {
  const [summaryRows, yearRows, eventSummaryRows, eventRows] = await Promise.all([
    query<{
      total: string;
      first_accession: string | null;
      last_accession: string | null;
      before_floor: string;
      mrr_before_floor: string;
    }>(
      `WITH ${BASE_CTES}
       SELECT
         COUNT(*) AS total,
         to_char(MIN(started_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS first_accession,
         to_char(MAX(started_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS last_accession,
         COUNT(*) FILTER (WHERE started_at < $1::timestamptz) AS before_floor,
         COALESCE(SUM(mrr) FILTER (WHERE started_at < $1::timestamptz), 0) AS mrr_before_floor
       FROM subs_all`,
      [`${METRICS_FLOOR_ISO}T00:00:00-03:00`]
    ),

    query<{ year: string; subscriptions: string; with_price: string; mrr: string }>(
      `WITH ${BASE_CTES}
       SELECT
         to_char(started_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY') AS year,
         COUNT(*) AS subscriptions,
         COUNT(*) FILTER (WHERE mrr > 0) AS with_price,
         COALESCE(SUM(mrr), 0) AS mrr
       FROM subs_all
       GROUP BY 1
       ORDER BY 1 ASC`
    ),

    query<{ total: string; first_event: string | null; last_event: string | null }>(
      `SELECT
         COUNT(*) AS total,
         to_char(MIN(received_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS first_event,
         to_char(MAX(received_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS last_event
       FROM hotmart_webhook_events`
    ),

    query<{ event: string; count: string; first: string | null; last: string | null }>(
      `SELECT
         event,
         COUNT(*) AS count,
         to_char(MIN(received_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS first,
         to_char(MAX(received_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS last
       FROM hotmart_webhook_events
       GROUP BY event
       ORDER BY COUNT(*) DESC`
    ),
  ]);

  const floorYear = METRICS_FLOOR_ISO.slice(0, 4);

  return {
    floor: METRICS_FLOOR_ISO,
    subscriptions: {
      total: int(summaryRows[0]?.total),
      firstAccession: summaryRows[0]?.first_accession ?? null,
      lastAccession: summaryRows[0]?.last_accession ?? null,
      beforeFloor: int(summaryRows[0]?.before_floor),
      mrrBeforeFloor: round2(num(summaryRows[0]?.mrr_before_floor)),
    },
    byYear: yearRows.map((r) => ({
      year: r.year,
      subscriptions: int(r.subscriptions),
      withPrice: int(r.with_price),
      mrr: round2(num(r.mrr)),
      excluded: r.year < floorYear,
    })),
    events: {
      total: int(eventSummaryRows[0]?.total),
      firstEvent: eventSummaryRows[0]?.first_event ?? null,
      lastEvent: eventSummaryRows[0]?.last_event ?? null,
      byEvent: eventRows.map((r) => ({
        event: r.event,
        count: int(r.count),
        first: r.first,
        last: r.last,
      })),
    },
  };
}
