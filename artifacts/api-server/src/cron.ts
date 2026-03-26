import cron from "node-cron";
import { takeLeadsSnapshot } from "./metrics/leads";
import { logger } from "./lib/logger";

export function startCronJobs(): void {
  cron.schedule(
    "0 3 * * *",
    async () => {
      logger.info("Cron: starting daily leads snapshot");
      try {
        const snap = await takeLeadsSnapshot();
        logger.info({ snap }, "Cron: daily leads snapshot complete");
      } catch (err) {
        logger.error({ err }, "Cron: daily leads snapshot failed");
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  logger.info("Cron jobs scheduled (leads snapshot @ 03:00 BRT daily)");
}
