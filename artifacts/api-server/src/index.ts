import app from "./app";
import { logger } from "./lib/logger";
import { startCronJobs } from "./cron";
import { query } from "./lib/db";

async function runMigrations() {
  await query(`ALTER TABLE hotmart_subscriptions ADD COLUMN IF NOT EXISTS original_event text`);
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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runMigrations()
  .catch((err) => logger.error({ err }, "Failed to run DB migrations"))
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startCronJobs();
    });
  });
