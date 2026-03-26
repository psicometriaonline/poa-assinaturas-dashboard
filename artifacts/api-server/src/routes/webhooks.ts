import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query } from "../lib/db";
import { upsertSubscriptionFromWebhook } from "../lib/subscription-db";
import type { HotmartWebhookPayload } from "../lib/hotmart-webhook-types";

const router = Router();

const HOTTOK = process.env.HOTMART_WEBHOOK_TOKEN ?? "";

router.post("/hotmart", async (req: Request, res: Response) => {
  try {
    const hottok = (req.query.hottok as string) ?? req.headers["x-hotmart-hottok"] ?? "";

    if (HOTTOK && hottok !== HOTTOK) {
      logger.warn({ hottok }, "Invalid hottok on Hotmart webhook");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = req.body as HotmartWebhookPayload;
    const event = payload?.event ?? "UNKNOWN";
    const subscriberCode = payload?.data?.subscription?.subscriber?.code ?? null;

    logger.info({ event, subscriberCode }, "Hotmart webhook received");

    await query(
      `INSERT INTO hotmart_webhook_events (event, hottok, subscriber_code, payload)
       VALUES ($1, $2, $3, $4)`,
      [event, hottok || null, subscriberCode, JSON.stringify(payload)]
    );

    const subscriptionEvents = [
      "PURCHASE_APPROVED",
      "PURCHASE_CANCELED",
      "PURCHASE_COMPLETE",
      "PURCHASE_REFUNDED",
      "PURCHASE_CHARGEBACK",
      "PURCHASE_EXPIRED",
      "SUBSCRIPTION_CANCELLATION",
      "PURCHASE_DELAYED",
      "SWITCH_PLAN",
      "UPDATE_SUBSCRIPTION_CHARGE_DATE",
      "REACTIVATED_PURCHASE",
    ];

    if (subscriptionEvents.includes(event)) {
      await upsertSubscriptionFromWebhook(payload, event);
    }

    res.status(200).json({ received: true, event });
  } catch (err) {
    logger.error({ err }, "Error processing Hotmart webhook");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/hotmart/status", async (_req: Request, res: Response) => {
  try {
    const [events, subs] = await Promise.all([
      query<{ count: string; event: string }>(
        `SELECT event, COUNT(*) as count FROM hotmart_webhook_events GROUP BY event ORDER BY count DESC`
      ),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM hotmart_subscriptions GROUP BY status`
      ),
    ]);
    res.json({ events, subscriptions: subs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
