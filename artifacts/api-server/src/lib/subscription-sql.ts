/**
 * Shared SQL building blocks for the paid-subscription metrics.
 *
 * Every metric in `src/metrics/*` is derived from the same two CTEs defined here
 * so that MRR, churn, retention and cohort numbers always reconcile with each
 * other and with the live snapshot. Do not re-derive these expressions inline.
 *
 * Business model note: the Academy sells paid subscriptions only. There is no
 * free tier, so every row in `hotmart_subscriptions` is a paying (or formerly
 * paying) customer and no free-trial filtering is applied anywhere.
 */

/** Events that take a subscriber out of the paying base. */
export const CHURN_EVENTS = [
  "SUBSCRIPTION_CANCELLATION",
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
] as const;

/** Churn caused by a failed/absent payment rather than a customer decision. */
export const INVOLUNTARY_CHURN_EVENTS = ["PURCHASE_EXPIRED", "PURCHASE_CHARGEBACK"] as const;

/** Statuses that still count as a paying subscriber. */
export const ACTIVE_STATUS = "ACTIVE";

/**
 * Statuses meaning "stopped paying but potentially recoverable" (late payment).
 * These are excluded from MRR — they are not paying right now — but reported
 * separately as recoverable so the number is actionable instead of just lost.
 */
export const DELINQUENT_STATUSES = ["DELAYED", "PAST_DUE"] as const;

/** Monthly-normalised contribution of a subscription (MRR). */
export const MRR_EXPR = `
  COALESCE(
    s.mrr_contribution,
    CASE
      WHEN s.plan_interval = 'ANNUAL'     THEN ROUND(s.price_value / 12, 2)
      WHEN s.plan_interval = 'SEMIANNUAL' THEN ROUND(s.price_value / 6, 2)
      ELSE s.price_value
    END,
    0
  )::numeric`;

/** Number of months covered by one billing cycle of the plan. */
export const PERIOD_MONTHS_EXPR = `
  CASE s.plan_interval
    WHEN 'ANNUAL'     THEN 12
    WHEN 'SEMIANNUAL' THEN 6
    ELSE 1
  END`;

/**
 * Safely reads a numeric JSON field from a webhook payload.
 * Payload values are attacker-controllable strings, so a bad value must yield
 * NULL rather than aborting the whole query with a cast error.
 */
function numericJson(expr: string): string {
  return `CASE WHEN (${expr}) ~ '^[0-9]+(\\.[0-9]+)?$' THEN (${expr})::numeric END`;
}

const EVENT_TS_MS = numericJson(`e.payload->>'creation_date'`);

/**
 * `churn_ev` — the first churn event seen for each subscriber, with the event's
 * own timestamp (`creation_date`) rather than `received_at`. Using `received_at`
 * would bucket back-filled or replayed webhooks into the month we ingested them.
 */
export const CHURN_EVENT_CTE = `
  churn_ev AS (
    SELECT DISTINCT ON (e.subscriber_code)
      e.subscriber_code,
      e.event,
      to_timestamp(
        COALESCE(${EVENT_TS_MS}, EXTRACT(EPOCH FROM e.received_at) * 1000) / 1000.0
      ) AS churn_at
    FROM hotmart_webhook_events e
    WHERE e.subscriber_code IS NOT NULL
      AND e.subscriber_code <> ''
      AND e.event = ANY(ARRAY[${CHURN_EVENTS.map((e) => `'${e}'`).join(",")}])
    ORDER BY
      e.subscriber_code,
      COALESCE(${EVENT_TS_MS}, EXTRACT(EPOCH FROM e.received_at) * 1000) ASC
  )`;

/**
 * `subs` — one row per subscriber with a well-defined lifetime interval
 * [started_at, ended_at). This is what makes point-in-time metrics possible:
 * "active at date D" is simply `started_at <= D AND (ended_at IS NULL OR ended_at > D)`.
 *
 * `ended_at` deliberately does NOT fall back to `last_event_at`. That column is
 * set to NOW() on every upsert, so using it dumped every end-dateless subscriber
 * into the current month and produced a phantom MRR cliff. Subscribers whose exit
 * date is genuinely unknown get `ended_at = NULL` with `status <> 'ACTIVE'`; they
 * are excluded from the timeline and counted by `undatedExits` in the data-quality
 * report instead of silently distorting it.
 */
export const SUBS_CTE = `
  subs AS (
    SELECT
      s.subscriber_code,
      LOWER(TRIM(COALESCE(s.subscriber_email, ''))) AS email,
      s.subscriber_name,
      COALESCE(NULLIF(TRIM(s.plan_name), ''), 'Sem plano')       AS plan_name,
      COALESCE(NULLIF(TRIM(s.plan_interval), ''), 'ANNUAL')      AS plan_interval,
      COALESCE(NULLIF(TRIM(s.product_name), ''), 'Sem produto')  AS product_name,
      s.status,
      s.price_value,
      ${PERIOD_MONTHS_EXPR} AS period_months,
      ${MRR_EXPR} AS mrr,
      to_timestamp(s.accession_date / 1000.0) AS started_at,
      -- Next billing date. Hotmart only sends date_next_charge on some events, so
      -- fall back to projecting the plan's cycle forward from the accession date.
      COALESCE(
        CASE WHEN s.date_next_charge IS NOT NULL
             THEN to_timestamp(s.date_next_charge / 1000.0) END,
        to_timestamp(s.accession_date / 1000.0) + make_interval(months =>
          (${PERIOD_MONTHS_EXPR} * (
            FLOOR(
              (EXTRACT(YEAR  FROM age(now(), to_timestamp(s.accession_date / 1000.0))) * 12
             + EXTRACT(MONTH FROM age(now(), to_timestamp(s.accession_date / 1000.0))))
              / ${PERIOD_MONTHS_EXPR}
            ) + 1
          ))::int
        )
      ) AS next_charge_at,
      CASE
        WHEN s.status = '${ACTIVE_STATUS}' THEN NULL
        ELSE COALESCE(
          CASE WHEN s.cancellation_date IS NOT NULL
               THEN to_timestamp(s.cancellation_date / 1000.0) END,
          ce.churn_at
        )
      END AS ended_at,
      CASE
        WHEN s.status = '${ACTIVE_STATUS}' THEN NULL
        WHEN ce.event = ANY(ARRAY[${INVOLUNTARY_CHURN_EVENTS.map((e) => `'${e}'`).join(",")}]) THEN 'involuntario'
        WHEN ce.event IS NOT NULL THEN 'voluntario'
        WHEN s.status = ANY(ARRAY[${DELINQUENT_STATUSES.map((e) => `'${e}'`).join(",")}]) THEN 'involuntario'
        ELSE 'voluntario'
      END AS churn_kind,
      (s.status = ANY(ARRAY[${DELINQUENT_STATUSES.map((e) => `'${e}'`).join(",")}])) AS is_delinquent
    FROM hotmart_subscriptions s
    LEFT JOIN churn_ev ce ON ce.subscriber_code = s.subscriber_code
    WHERE s.accession_date IS NOT NULL
  )`;

/**
 * `timeline` — the subset of `subs` whose lifetime is actually knowable, and the
 * only table any point-in-time query may read.
 *
 * A subscriber that is no longer active but has no end date anywhere would test
 * as `ended_at IS NULL` and therefore stay "active" in every month forever,
 * pushing the curve above the live snapshot. Excluding them here keeps the last
 * point of the series equal to the current MRR by construction; they are still
 * counted by `dataQuality.undatedExits` and by the status breakdown, which read
 * `subs` directly.
 */
export const TIMELINE_CTE = `
  timeline AS (
    SELECT * FROM subs
    WHERE status = '${ACTIVE_STATUS}' OR ended_at IS NOT NULL
  )`;

/** All CTEs, ready to prefix a query with `WITH`. */
export const BASE_CTES = `${CHURN_EVENT_CTE},${SUBS_CTE},${TIMELINE_CTE}`;

/**
 * A month series in BRT. `$1`/`$2` are the range bounds; `m` is the timestamptz
 * of the first instant of each month and `m_end` the first instant of the next,
 * so `[m, m_end)` is a half-open month interval.
 */
export const MONTHS_CTE = `
  months AS (
    SELECT
      (g AT TIME ZONE 'America/Sao_Paulo')                        AS m,
      ((g + interval '1 month') AT TIME ZONE 'America/Sao_Paulo') AS m_end,
      to_char(g, 'YYYY-MM')                                       AS month_key
    FROM generate_series(
      date_trunc('month', $1::timestamptz AT TIME ZONE 'America/Sao_Paulo'),
      date_trunc('month', $2::timestamptz AT TIME ZONE 'America/Sao_Paulo'),
      interval '1 month'
    ) AS g
  )`;

const MONTH_NAMES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-03" → "mar/26" */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const idx = parseInt(month, 10) - 1;
  return `${MONTH_NAMES_PT[idx] ?? month}/${year.slice(2)}`;
}

export function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function int(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseInt(value ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Percentage with 2 decimals, safe against a zero denominator. */
export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return round2((numerator / denominator) * 100);
}
