import cron from "node-cron";
import {
  getListContacts,
  isActiveCampaignConfigured,
  MEMBERS_LIST_ID,
} from "./sources/activecampaign";
import { logger } from "./lib/logger";

/**
 * Keeps the ActiveCampaign members-list cache warm so the acquisition page never
 * pays for a full pagination on a user request. The old free-trial tag warm-up
 * and the daily free-trial snapshot were removed with the free-trial product.
 */
export async function warmAcContactCache(): Promise<number> {
  if (!isActiveCampaignConfigured()) {
    logger.info("Cron: ActiveCampaign not configured, skipping contact cache warm");
    return 0;
  }
  const contacts = await getListContacts(MEMBERS_LIST_ID);
  logger.info({ listId: MEMBERS_LIST_ID, count: contacts.length }, "Cron: AC contact cache warmed");
  return contacts.length;
}

export function startCronJobs(): void {
  cron.schedule("*/15 * * * *", async () => {
    try {
      await warmAcContactCache();
    } catch (err) {
      logger.error({ err }, "Cron: AC contact cache warm failed");
    }
  });

  warmAcContactCache().catch((err) => {
    logger.error({ err }, "Cron: initial AC contact cache warm failed");
  });

  logger.info("Cron jobs scheduled (AC contact cache refresh every 15 min)");
}
