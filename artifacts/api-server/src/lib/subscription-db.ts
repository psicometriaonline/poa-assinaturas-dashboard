import { query } from "./db";
import { logger } from "./logger";
import type { HotmartWebhookPayload } from "./hotmart-webhook-types";

export type PlanInterval = "ANNUAL" | "MONTHLY" | "SEMIANNUAL";

/** The only four statuses the metrics understand. */
export type CanonicalStatus = "ACTIVE" | "DELAYED" | "CANCELLED" | "INACTIVE";

/**
 * Hotmart's own subscription vocabulary → ours.
 *
 * Hotmart sends ACTIVE, INACTIVE, DELAYED, STARTED, OVERDUE, CANCELLED_BY_CUSTOMER,
 * CANCELLED_BY_SELLER and CANCELLED_BY_ADMIN. Only "ACTIVE" counts toward MRR, so
 * storing the raw value made every sale that arrived as STARTED or OVERDUE vanish
 * from the dashboard: no MRR, no active count, and — because a non-active row with
 * no cancellation date has no knowable end — dropped from the timeline entirely.
 */
const PAYLOAD_STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "ACTIVE",
  STARTED: "ACTIVE",
  TRIAL: "ACTIVE",
  DELAYED: "DELAYED",
  OVERDUE: "DELAYED",
  PAST_DUE: "DELAYED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
  CANCELLED_BY_CUSTOMER: "CANCELLED",
  CANCELLED_BY_SELLER: "CANCELLED",
  CANCELLED_BY_ADMIN: "CANCELLED",
  INACTIVE: "INACTIVE",
  EXPIRED: "INACTIVE",
  ENDED: "INACTIVE",
};

/**
 * What the event itself proves about the money, which outranks the payload's
 * status field: PURCHASE_APPROVED means the charge cleared, even on a payload
 * that still reads STARTED because the subscription record has not caught up.
 */
const EVENT_STATUS_MAP: Record<string, CanonicalStatus> = {
  PURCHASE_APPROVED: "ACTIVE",
  PURCHASE_COMPLETE: "ACTIVE",
  REACTIVATED_PURCHASE: "ACTIVE",
  SWITCH_PLAN: "ACTIVE",
  SUBSCRIPTION_CANCELLATION: "CANCELLED",
  PURCHASE_CANCELED: "CANCELLED",
  PURCHASE_REFUNDED: "CANCELLED",
  PURCHASE_CHARGEBACK: "CANCELLED",
  PURCHASE_EXPIRED: "INACTIVE",
  PURCHASE_DELAYED: "DELAYED",
};

/**
 * Resolves the status to store. Returns null when neither the event nor the
 * payload says anything recognisable — the caller then leaves the stored status
 * untouched rather than guessing, so an unknown event can never resurrect a
 * cancelled subscriber or silently drop an active one.
 */
export function resolveSubscriptionStatus(
  rawStatus: string | null | undefined,
  event: string
): CanonicalStatus | null {
  const fromEvent = EVENT_STATUS_MAP[event];
  if (fromEvent) return fromEvent;

  const raw = rawStatus?.trim().toUpperCase();
  if (!raw) return null;

  const mapped = PAYLOAD_STATUS_MAP[raw];
  if (!mapped) {
    logger.warn(
      { event, rawStatus: raw },
      "Unknown Hotmart subscription status — keeping the stored status. Add it to PAYLOAD_STATUS_MAP."
    );
    return null;
  }
  return mapped;
}

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
  return detectPlanIntervalFromName(planName) ?? "ANNUAL";
}

/**
 * Same detection, but null when the name says nothing.
 *
 * `detectPlanInterval` defaults to ANNUAL, which is right for a brand-new row but
 * wrong as an update: an event that carries no plan name (a cancellation, a charge-date
 * change) would rewrite a monthly subscriber to ANNUAL and divide their MRR by twelve.
 */
export function detectPlanIntervalFromName(planName: string | null | undefined): PlanInterval | null {
  const name = planName ?? "";
  if (!name.trim()) return null;
  if (/mensal|monthly|pro mensal/i.test(name) || /^REC_/i.test(name)) return "MONTHLY";
  if (/semestral|semiannual/i.test(name)) return "SEMIANNUAL";
  if (/trimestral|quarterly/i.test(name)) return "SEMIANNUAL";
  if (/anual|annual|yearly/i.test(name)) return "ANNUAL";
  return null;
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

  const status = resolveSubscriptionStatus(sub?.status, event);

  const cancellationDate = CANCELLATION_EVENTS.includes(event) ? payload.creation_date : null;

  // Dates first, plan name only as a fallback. Null when neither is conclusive —
  // the SQL below then keeps whatever is already stored.
  const planInterval =
    detectPlanIntervalFromDates(data.purchase?.approved_date ?? payload.creation_date, dateNextCharge) ??
    detectPlanIntervalFromName(planName);
  const mrrContribution = planInterval ? mrrFor(priceValue, planInterval) : null;

  await query(
    `INSERT INTO hotmart_subscriptions (
        subscriber_code, status, product_id, product_name,
        plan_name, plan_id, subscriber_name, subscriber_email,
        accession_date, cancellation_date, date_next_charge,
        price_value, price_currency,
        plan_interval, mrr_contribution,
        last_event, original_event, last_event_at, updated_at
      ) VALUES ($1,COALESCE($2,'ACTIVE'),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,'ANNUAL'),$15,$16,$16,NOW(),NOW())
      ON CONFLICT (subscriber_code) DO UPDATE SET
        -- $2/$14 rather than EXCLUDED: the inserted values are already defaulted,
        -- and a null here must mean "leave what is stored alone".
        status = COALESCE($2, hotmart_subscriptions.status),
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
        plan_interval = COALESCE($14, hotmart_subscriptions.plan_interval),
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
