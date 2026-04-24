import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query } from "../lib/db";
import { upsertSubscriptionFromWebhook } from "../lib/subscription-db";
import { clearCache } from "../cache";
import type { HotmartWebhookPayload } from "../lib/hotmart-webhook-types";
import { SUBSCRIPTION_EVENTS } from "../lib/hotmart-webhook-types";

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
    // SUBSCRIPTION_CANCELLATION uses data.subscriber.code; PURCHASE_* use data.subscription.subscriber.code
    const subscriberCode =
      payload?.data?.subscription?.subscriber?.code ??
      payload?.data?.subscriber?.code ??
      null;

    logger.info({ event, subscriberCode }, "Hotmart webhook received");

    await query(
      `INSERT INTO hotmart_webhook_events (event, hottok, subscriber_code, payload)
       VALUES ($1, $2, $3, $4)`,
      [event, hottok || null, subscriberCode, JSON.stringify(payload)]
    );

    if ((SUBSCRIPTION_EVENTS as readonly string[]).includes(event)) {
      await upsertSubscriptionFromWebhook(payload, event);
      clearCache();
      logger.info({ event, subscriberCode }, "Cache limpo após evento de assinatura");
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

/**
 * POST /hotmart/simulate
 * Simulates a Hotmart webhook event without requiring hottok auth.
 * Only enabled when ADMIN_SECRET is configured and the correct header is provided.
 * Use this endpoint with Hotmart test payloads to verify the upsert flow.
 */
router.post("/hotmart/simulate", async (req: Request, res: Response) => {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      res.status(503).json({ error: "ADMIN_SECRET not configured" });
      return;
    }

    const token = req.headers["x-admin-token"];
    if (token !== adminSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = req.body as HotmartWebhookPayload;
    const event = payload?.event ?? "UNKNOWN";
    const subscriberCode =
      payload?.data?.subscription?.subscriber?.code ??
      payload?.data?.subscriber?.code ??
      null;

    logger.info({ event, subscriberCode }, "Hotmart webhook SIMULATE received");

    await query(
      `INSERT INTO hotmart_webhook_events (event, hottok, subscriber_code, payload)
       VALUES ($1, $2, $3, $4)`,
      [event, "SIMULATE", subscriberCode, JSON.stringify(payload)]
    );

    let upserted = false;
    if ((SUBSCRIPTION_EVENTS as readonly string[]).includes(event)) {
      await upsertSubscriptionFromWebhook(payload, event);
      clearCache();
      upserted = true;
      logger.info({ event, subscriberCode }, "Simulate: upsert complete, cache cleared");
    }

    res.status(200).json({ received: true, event, subscriberCode, upserted });
  } catch (err) {
    logger.error({ err }, "Error processing Hotmart simulate webhook");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
