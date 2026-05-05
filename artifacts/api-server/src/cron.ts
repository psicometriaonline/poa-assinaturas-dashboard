import cron from "node-cron";
import { takeLeadsSnapshot } from "./metrics/leads";
import { getListContactEmails, getTagContactEmails } from "./sources/activecampaign";
import { logger } from "./lib/logger";

const ALUNOS_POA_LIST_ID = "30";
const FREE_TRIAL_TAG_ID = "401";

export interface AcEmailCacheSizes {
  tagCount: number;
  listCount: number;
}

export async function warmAcEmailCaches(): Promise<AcEmailCacheSizes> {
  logger.info("Cron: warming AC email caches (tag-401 + list-30)");
  const [tagEmails, listEmails] = await Promise.all([
    getTagContactEmails(FREE_TRIAL_TAG_ID),
    getListContactEmails(ALUNOS_POA_LIST_ID),
  ]);
  logger.info(
    { tagCount: tagEmails.size, listCount: listEmails.size },
    "Cron: AC email caches warmed"
  );
  return { tagCount: tagEmails.size, listCount: listEmails.size };
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

  cron.schedule("*/15 * * * *", async () => {
    try {
      await warmAcEmailCaches();
    } catch (err) {
      logger.error({ err }, "Cron: AC email cache warm failed");
    }
  });

  warmAcEmailCaches().catch((err) => {
    logger.error({ err }, "Cron: initial AC email cache warm failed");
  });

  logger.info("Cron jobs scheduled (leads snapshot @ 03:00 BRT daily; AC email cache refresh every 15 min)");
}
