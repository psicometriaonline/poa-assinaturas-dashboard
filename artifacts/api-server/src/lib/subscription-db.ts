import { query, queryOne } from "./db";
import { logger } from "./logger";
import type { HotmartWebhookPayload } from "./hotmart-webhook-types";

export interface DbSubscription {
  subscriber_code: string;
  subscription_id: string | null;
  status: string;
  product_id: string | null;
  product_name: string | null;
  plan_name: string | null;
  plan_id: string | null;
  subscriber_name: string | null;
  subscriber_email: string | null;
  accession_date: number | null;
  cancellation_date: number | null;
  date_next_charge: number | null;
  price_value: number | null;
  price_currency: string | null;
  last_event: string | null;
  last_event_at: string;
}

export interface SubscriptionSummary {
  total: number;
  active: number;
  inactive: number;
  cancelled: number;
  delayed: number;
  byProduct: Record<string, { name: string; count: number; active: number }>;
  newThisMonth: number;
  cancelledThisMonth: number;
  mrr: number;
}

export async function upsertSubscriptionFromWebhook(
  payload: HotmartWebhookPayload,
  event: string
): Promise<void> {
  const data = payload.data;
  const sub = data.subscription;
  const subscriberCode = sub?.subscriber?.code;

  if (!subscriberCode) {
    logger.warn({ event }, "Webhook missing subscriber code, skipping upsert");
    return;
  }

  const productId = String(data.product?.id ?? "");
  const productName = data.product?.name ?? null;
  const planId = sub?.plan?.id ?? null;
  const planName = sub?.plan?.name ?? null;
  const buyerName = data.buyer?.name ?? null;
  const buyerEmail = data.buyer?.email ?? null;
  const purchaseDate = data.purchase?.approved_date ?? payload.creation_date ?? null;
  const priceValue = data.purchase?.price?.value ?? null;
  const priceCurrency = data.purchase?.price?.currency_code ?? null;

  let status = sub?.status ?? mapEventToStatus(event);
  const cancellationDate =
    ["SUBSCRIPTION_CANCELLATION", "PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"].includes(event)
      ? payload.creation_date
      : null;

  await query(
    `INSERT INTO hotmart_subscriptions (
        subscriber_code, status, product_id, product_name,
        plan_name, plan_id, subscriber_name, subscriber_email,
        accession_date, cancellation_date, price_value, price_currency,
        last_event, last_event_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
      ON CONFLICT (subscriber_code) DO UPDATE SET
        status = EXCLUDED.status,
        product_id = COALESCE(EXCLUDED.product_id, hotmart_subscriptions.product_id),
        product_name = COALESCE(EXCLUDED.product_name, hotmart_subscriptions.product_name),
        plan_name = COALESCE(EXCLUDED.plan_name, hotmart_subscriptions.plan_name),
        plan_id = COALESCE(EXCLUDED.plan_id, hotmart_subscriptions.plan_id),
        subscriber_name = COALESCE(EXCLUDED.subscriber_name, hotmart_subscriptions.subscriber_name),
        subscriber_email = COALESCE(EXCLUDED.subscriber_email, hotmart_subscriptions.subscriber_email),
        cancellation_date = COALESCE(EXCLUDED.cancellation_date, hotmart_subscriptions.cancellation_date),
        price_value = COALESCE(EXCLUDED.price_value, hotmart_subscriptions.price_value),
        price_currency = COALESCE(EXCLUDED.price_currency, hotmart_subscriptions.price_currency),
        last_event = EXCLUDED.last_event,
        last_event_at = NOW(),
        updated_at = NOW()`,
    [
      subscriberCode,
      status,
      productId || null,
      productName,
      planName,
      planId,
      buyerName,
      buyerEmail,
      purchaseDate,
      cancellationDate,
      priceValue,
      priceCurrency,
      event,
    ]
  );

  logger.info({ subscriberCode, status, event, productId }, "Subscription upserted from webhook");
}

function mapEventToStatus(event: string): string {
  switch (event) {
    case "PURCHASE_APPROVED":
    case "REACTIVATED_PURCHASE":
      return "ACTIVE";
    case "SUBSCRIPTION_CANCELLATION":
    case "PURCHASE_CANCELED":
    case "PURCHASE_REFUNDED":
    case "PURCHASE_CHARGEBACK":
      return "CANCELLED";
    case "PURCHASE_DELAYED":
      return "DELAYED";
    case "PURCHASE_COMPLETE":
      return "ACTIVE";
    default:
      return "ACTIVE";
  }
}

export async function getDbSubscriptionSummary(
  startMs?: number,
  endMs?: number
): Promise<SubscriptionSummary> {
  const now = Date.now();
  const monthStart = startMs ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthEnd = endMs ?? now;

  const [totals, byProduct, newThisMonth, cancelledThisMonth, mrrRows] = await Promise.all([
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM hotmart_subscriptions GROUP BY status`
    ),
    query<{ product_id: string; product_name: string; status: string; count: string }>(
      `SELECT product_id, product_name, status, COUNT(*) as count
       FROM hotmart_subscriptions GROUP BY product_id, product_name, status`
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM hotmart_subscriptions
       WHERE accession_date >= $1 AND accession_date <= $2`,
      [monthStart, monthEnd]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM hotmart_subscriptions
       WHERE cancellation_date >= $1 AND cancellation_date <= $2`,
      [monthStart, monthEnd]
    ),
    query<{ sum: string }>(
      `SELECT COALESCE(SUM(price_value), 0) as sum FROM hotmart_subscriptions
       WHERE status = 'ACTIVE' AND price_currency IS NOT NULL`
    ),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of totals) {
    statusMap[row.status] = parseInt(row.count, 10);
  }

  const productMap: Record<string, { name: string; count: number; active: number }> = {};
  for (const row of byProduct) {
    const pid = row.product_id ?? "unknown";
    if (!productMap[pid]) {
      productMap[pid] = { name: row.product_name ?? pid, count: 0, active: 0 };
    }
    const c = parseInt(row.count, 10);
    productMap[pid].count += c;
    if (row.status === "ACTIVE") productMap[pid].active += c;
  }

  return {
    total: Object.values(statusMap).reduce((a, b) => a + b, 0),
    active: statusMap["ACTIVE"] ?? 0,
    inactive: statusMap["INACTIVE"] ?? 0,
    cancelled: statusMap["CANCELLED"] ?? 0,
    delayed: statusMap["DELAYED"] ?? 0,
    byProduct: productMap,
    newThisMonth: parseInt(newThisMonth?.count ?? "0", 10),
    cancelledThisMonth: parseInt(cancelledThisMonth?.count ?? "0", 10),
    mrr: parseFloat(mrrRows[0]?.sum ?? "0"),
  };
}

export async function getTotalActiveFromDb(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM hotmart_subscriptions WHERE status = 'ACTIVE'`
  );
  return parseInt(row?.count ?? "0", 10);
}
