import { query } from "./db";
import { logger } from "./logger";

/**
 * Idempotent schema migrations, applied on every boot. Extracted from `index.ts`
 * so it can be exercised against a scratch database without starting the server.
 */
export async function runMigrations() {
  await query(`ALTER TABLE hotmart_subscriptions ADD COLUMN IF NOT EXISTS original_event text`);
  await query(`ALTER TABLE hotmart_subscriptions ADD COLUMN IF NOT EXISTS date_next_charge bigint`);

  // Hotmart's own status vocabulary was being stored verbatim, but only 'ACTIVE'
  // counts toward MRR. A sale that arrived as STARTED or OVERDUE was therefore
  // invisible: no MRR, no active count, and no knowable end date, so it was also
  // dropped from the timeline. Fold the stored values into the four canonical
  // statuses, preferring what the last event proves about the payment.
  const repaired = await query<{ subscriber_code: string; status: string }>(
    `UPDATE hotmart_subscriptions SET status = CASE
        WHEN last_event IN ('PURCHASE_APPROVED','PURCHASE_COMPLETE','REACTIVATED_PURCHASE','SWITCH_PLAN') THEN 'ACTIVE'
        WHEN last_event IN ('SUBSCRIPTION_CANCELLATION','PURCHASE_CANCELED','PURCHASE_REFUNDED','PURCHASE_CHARGEBACK') THEN 'CANCELLED'
        WHEN last_event = 'PURCHASE_EXPIRED' THEN 'INACTIVE'
        WHEN last_event = 'PURCHASE_DELAYED' THEN 'DELAYED'
        WHEN status IN ('STARTED','TRIAL') THEN 'ACTIVE'
        WHEN status IN ('OVERDUE','PAST_DUE') THEN 'DELAYED'
        WHEN status LIKE 'CANCELLED_BY_%' OR status = 'CANCELED' THEN 'CANCELLED'
        WHEN status IN ('EXPIRED','ENDED') THEN 'INACTIVE'
        ELSE status
      END
      WHERE status NOT IN ('ACTIVE','CANCELLED','INACTIVE','DELAYED')
      RETURNING subscriber_code, status`
  );
  if (repaired.length > 0) {
    logger.info(
      { count: repaired.length, sample: repaired.slice(0, 10) },
      "Migração: status não-canônicos do Hotmart normalizados"
    );
  }

  // The point-in-time metrics scan the whole subscription table per month and
  // join webhook events by subscriber; without these the dashboard degrades as
  // the event log grows.
  await query(
    `CREATE INDEX IF NOT EXISTS idx_hotmart_subs_lifecycle
       ON hotmart_subscriptions (accession_date, cancellation_date, status)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_hotmart_events_subscriber_event
       ON hotmart_webhook_events (subscriber_code, event)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_hotmart_events_event
       ON hotmart_webhook_events (event)`
  );
  await query(`UPDATE hotmart_subscriptions SET original_event = 'IMPORT_CSV' WHERE last_event = 'IMPORT_CSV' AND original_event IS NULL`);
  await query(`
    UPDATE hotmart_subscriptions s
    SET original_event = (
      SELECT event FROM hotmart_webhook_events e
      WHERE e.subscriber_code = s.subscriber_code
      ORDER BY received_at ASC LIMIT 1
    )
    WHERE last_event != 'IMPORT_CSV' AND original_event IS NULL
  `);

  // Fix: SUBSCRIPTION_CANCELLATION events had subscriber_code stored as NULL
  // because the handler was reading data.subscription.subscriber.code instead of data.subscriber.code.
  // Backfill subscriber_code from the payload JSON.
  await query(`
    UPDATE hotmart_webhook_events
    SET subscriber_code = payload->'data'->'subscriber'->>'code'
    WHERE subscriber_code IS NULL
      AND event = 'SUBSCRIPTION_CANCELLATION'
      AND payload->'data'->'subscriber'->>'code' IS NOT NULL
      AND payload->'data'->'subscriber'->>'code' != ''
  `);

  // After backfill, upsert subscription records for each recovered subscriber.
  // subscriber_code column is now populated by the UPDATE above.
  // Uses earliest event per subscriber to get cancellation_date.
  await query(`
    INSERT INTO hotmart_subscriptions (
      subscriber_code, status, product_id, product_name,
      plan_name, plan_id, subscriber_name, subscriber_email,
      cancellation_date, price_value, plan_interval, mrr_contribution,
      last_event, original_event, last_event_at, updated_at
    )
    SELECT DISTINCT ON (subscriber_code)
      subscriber_code,
      'CANCELLED' AS status,
      (payload->'data'->'product'->>'id') AS product_id,
      payload->'data'->'product'->>'name' AS product_name,
      payload->'data'->'subscription'->'plan'->>'name' AS plan_name,
      payload->'data'->'subscription'->'plan'->>'id' AS plan_id,
      payload->'data'->'subscriber'->>'name' AS subscriber_name,
      payload->'data'->'subscriber'->>'email' AS subscriber_email,
      (payload->>'creation_date')::bigint AS cancellation_date,
      (payload->'data'->>'actual_recurrence_value')::numeric AS price_value,
      'ANNUAL' AS plan_interval,
      ROUND((payload->'data'->>'actual_recurrence_value')::numeric / 12, 2) AS mrr_contribution,
      'SUBSCRIPTION_CANCELLATION' AS last_event,
      'SUBSCRIPTION_CANCELLATION' AS original_event,
      NOW() AS last_event_at,
      NOW() AS updated_at
    FROM hotmart_webhook_events
    WHERE event = 'SUBSCRIPTION_CANCELLATION'
      AND subscriber_code IS NOT NULL
      AND subscriber_code != ''
      AND payload->'data'->'subscriber'->>'code' IS NOT NULL
    ORDER BY subscriber_code, received_at ASC
    ON CONFLICT (subscriber_code) DO UPDATE SET
      status = 'CANCELLED',
      cancellation_date = COALESCE(hotmart_subscriptions.cancellation_date, EXCLUDED.cancellation_date),
      subscriber_name = COALESCE(hotmart_subscriptions.subscriber_name, EXCLUDED.subscriber_name),
      subscriber_email = COALESCE(hotmart_subscriptions.subscriber_email, EXCLUDED.subscriber_email),
      last_event = 'SUBSCRIPTION_CANCELLATION',
      last_event_at = NOW(),
      updated_at = NOW()
    WHERE hotmart_subscriptions.last_event = 'IMPORT_CSV'
  `);

  logger.info("DB migrations applied");
}
