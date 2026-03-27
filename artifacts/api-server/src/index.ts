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
