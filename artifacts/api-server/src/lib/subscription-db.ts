import { query } from "./db";
import { logger } from "./logger";
import type { HotmartWebhookPayload } from "./hotmart-webhook-types";

export type PlanInterval = "ANNUAL" | "MONTHLY" | "SEMIANNUAL";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.4375;

/**
 * Guesses the billing cycle from the plan's name.
 *
 * Defaulting to ANNUAL divides the price by 12, so a mislabelled monthly plan
 * silently understates MRR twelvefold. Prefer `detectPlanIntervalFromDates`
 * whenever the payload carries real dates — this is only the last resort.
 */
export function detectPlanInterval(planName: string): PlanInterval {
  const name = planName ?? "";
  if (/mensal|monthly|pro mensal/i.test(name) || /^REC_/i.test(name)) return "MONTHLY";
  if (/semestral|semiannual/i.test(name)) return "SEMIANNUAL";
  if (/trimestral|quarterly/i.test(name)) return "SEMIANNUAL";
  return "ANNUAL";
}

/**
 * Derives the billing cycle from the distance between the approved charge and
 * the next scheduled charge — the only signal Hotmart gives us that reflects
 * what the customer is actually billed, rather than how the offer was named.
 */
export function detectPlanIntervalFromDates(
  chargedAtMs: number | null | undefined,
  nextChargeMs: number | null | undefined
): PlanInterval | null {
  if (!chargedAtMs || !nextChargeMs || nextChargeMs <= chargedAtMs) return null;
  const months = (nextChargeMs - chargedAtMs) / MS_PER_DAY / DAYS_PER_MONTH;
  if (months >= 10) return "ANNUAL";
  if (months >= 4.5) return "SEMIANNUAL";
  if (months >= 0.5) return "MONTHLY";
  return null;
}

export function mrrFor(priceValue: number | null, interval: PlanInterval): number | null {
  if (priceValue == null) return null;
  const divisor = interval === "ANNUAL" ? 12 : interval === "SEMIANNUAL" ? 6 : 1;
  return Math.round((priceValue / divisor) * 100) / 100;
}

const CANCELLATION_EVENTS = [
  "SUBSCRIPTION_CANCELLATION",
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
];

export async function upsertSubscriptionFromWebhook(
  payload: HotmartWebhookPayload,
  event: string
): Promise<void> {
  const data = payload.data;
  const sub = data.subscription;
  // SUBSCRIPTION_CANCELLATION: subscriber at data.subscriber.code
  // PURCHASE_*: subscriber at data.subscription.subscriber.code
  // Some PURCHASE_APPROVED payloads may omit data.subscription entirely —
  // fall back to data.subscriber.code in that case.
  const subscriberCode = sub?.subscriber?.code ?? data.subscriber?.code;

  if (!subscriberCode) {
    // Log event type and top-level keys only — avoid logging payload body which may contain PII
    logger.warn({ event, payloadKeys: Object.keys(payload?.data ?? {}) }, "Webhook missing subscriber code, skipping upsert");
    return;
  }

  const productId = String(data.product?.id ?? "");
  const productName = data.product?.name ?? null;
  const planId = sub?.plan?.id ?? null;
  const planName = sub?.plan?.name ?? null;
  // buyer is present on PURCHASE_* events; subscriber is present on SUBSCRIPTION_CANCELLATION
  const buyerName = data.buyer?.name ?? data.subscriber?.name ?? null;
  const buyerEmail = data.buyer?.email ?? data.subscriber?.email ?? null;
  // approved_date is in ms on PURCHASE_APPROVED; creation_date is the webhook timestamp fallback
  const purchaseDate = data.purchase?.approved_date ?? payload.creation_date ?? null;
  const priceValue = data.purchase?.price?.value ?? data.actual_recurrence_value ?? null;
  const priceCurrency = data.purchase?.price?.currency_code ?? null;
  const dateNextCharge = data.date_next_charge ?? null;

  const isSwitchPlan = event === "SWITCH_PLAN";
  const mappedStatus = sub?.status ?? mapEventToStatus(event);
  const status = isSwitchPlan ? "ACTIVE" : mappedStatus;

  const cancellationDate = CANCELLATION_EVENTS.includes(event) ? payload.creation_date : null;

  // Dates first, plan name only as a fallback.
  const planInterval =
    detectPlanIntervalFromDates(data.purchase?.approved_date ?? payload.creation_date, dateNextCharge) ??
    detectPlanInterval(planName ?? "");
  const mrrContribution = mrrFor(priceValue, planInterval);

  await query(
    `INSERT INTO hotmart_subscriptions (
        subscriber_code, status, product_id, product_name,
        plan_name, plan_id, subscriber_name, subscriber_email,
        accession_date, cancellation_date, date_next_charge,
        price_value, price_currency,
        plan_interval, mrr_contribution,
        last_event, original_event, last_event_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,NOW(),NOW())
      ON CONFLICT (subscriber_code) DO UPDATE SET
        status = EXCLUDED.status,
        product_id = COALESCE(EXCLUDED.product_id, hotmart_subscriptions.product_id),
        product_name = COALESCE(EXCLUDED.product_name, hotmart_subscriptions.product_name),
        plan_name = COALESCE(EXCLUDED.plan_name, hotmart_subscriptions.plan_name),
        plan_id = COALESCE(EXCLUDED.plan_id, hotmart_subscriptions.plan_id),
        subscriber_name = COALESCE(EXCLUDED.subscriber_name, hotmart_subscriptions.subscriber_name),
        subscriber_email = COALESCE(EXCLUDED.subscriber_email, hotmart_subscriptions.subscriber_email),
        cancellation_date = COALESCE(EXCLUDED.cancellation_date, hotmart_subscriptions.cancellation_date),
        date_next_charge = COALESCE(EXCLUDED.date_next_charge, hotmart_subscriptions.date_next_charge),
        price_value = COALESCE(EXCLUDED.price_value, hotmart_subscriptions.price_value),
        price_currency = COALESCE(EXCLUDED.price_currency, hotmart_subscriptions.price_currency),
        plan_interval = COALESCE(EXCLUDED.plan_interval, hotmart_subscriptions.plan_interval),
        mrr_contribution = COALESCE(EXCLUDED.mrr_contribution, hotmart_subscriptions.mrr_contribution),
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
      dateNextCharge,
      priceValue,
      priceCurrency,
      planInterval,
      mrrContribution,
      event,
    ]
  );

  logger.info({ subscriberCode, status, event, productId, planInterval }, "Subscription upserted from webhook");
}

function mapEventToStatus(event: string): string {
  switch (event) {
    case "PURCHASE_APPROVED":
    case "REACTIVATED_PURCHASE":
    case "PURCHASE_COMPLETE":
      return "ACTIVE";
    case "SUBSCRIPTION_CANCELLATION":
    case "PURCHASE_CANCELED":
    case "PURCHASE_REFUNDED":
    case "PURCHASE_CHARGEBACK":
      return "CANCELLED";
    case "PURCHASE_EXPIRED":
      return "INACTIVE";
    case "PURCHASE_DELAYED":
      return "DELAYED";
    default:
      return "ACTIVE";
  }
}
