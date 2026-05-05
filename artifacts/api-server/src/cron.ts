import cron from "node-cron";
import { takeLeadsSnapshot } from "./metrics/leads";
import { getListContactEmails, getTagContactEmails } from "./sources/activecampaign";
import { logger } from "./lib/logger";

const ALUNOS_POA_LIST_ID = "30";
const FREE_TRIAL_TAG_ID = "401";

async function warmAcEmailCaches(): Promise<void> {
  logger.info("Cron: warming AC email caches (tag-401 + list-30)");
  try {
    const [tagEmails, listEmails] = await Promise.all([
      getTagContactEmails(FREE_TRIAL_TAG_ID),
      getListContactEmails(ALUNOS_POA_LIST_ID),
    ]);
    logger.info(
      { tagCount: tagEmails.size, listCount: listEmails.size },
      "Cron: AC email caches warmed"
    );
  } catch (err) {
    logger.error({ err }, "Cron: AC email cache warm failed");
  }
}

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

  cron.schedule("*/15 * * * *", warmAcEmailCaches);

  warmAcEmailCaches();

  logger.info("Cron jobs scheduled (leads snapshot @ 03:00 BRT daily; AC email cache refresh every 15 min)");
}
