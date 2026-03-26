export interface HotmartWebhookPayload {
  id: string;
  creation_date: number;
  event: string;
  version: string;
  data: {
    subscription?: {
      subscriber?: { code: string };
      plan?: { id: string; name: string };
      status?: string;
    };
    buyer?: { name: string; email: string };
    product?: { id: number; name: string; ucode: string };
    purchase?: {
      transaction: string;
      status: string;
      recurrency_number?: number;
      is_subscription?: boolean;
      approved_date?: number;
      price?: { value: number; currency_code: string };
      offer?: { code: string };
    };
  };
}

export const SUBSCRIPTION_EVENTS = [
  "PURCHASE_APPROVED",
  "PURCHASE_CANCELED",
  "PURCHASE_COMPLETE",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "SUBSCRIPTION_CANCELLATION",
  "PURCHASE_DELAYED",
  "SWITCH_PLAN",
  "UPDATE_SUBSCRIPTION_CHARGE_DATE",
  "REACTIVATED_PURCHASE",
] as const;

export type SubscriptionEvent = typeof SUBSCRIPTION_EVENTS[number];
