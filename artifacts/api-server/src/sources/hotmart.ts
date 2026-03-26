import { logger } from "../lib/logger";

const BASE_URL = process.env.HOTMART_BASE_URL || "https://developers.hotmart.com/payments/api/v1";
const CLIENT_ID = process.env.HOTMART_CLIENT_ID || "";
const CLIENT_SECRET = process.env.HOTMART_CLIENT_SECRET || "";

let accessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Hotmart credentials not configured (HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET missing)");
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const response = await fetch(
    "https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Hotmart OAuth failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function hotmartFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ url: url.toString(), status: response.status, body }, "Hotmart API error");
    throw new Error(`Hotmart API error ${response.status}: ${body}`);
  }

  return response.json();
}

export type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "INACTIVE" | "DELAYED" | "STARTED";

export interface HotmartSubscription {
  subscription_id: string;
  status: SubscriptionStatus;
  accession_date: number;
  end_accession_date?: number;
  cancellation_date?: number;
  price: { value: number; currency_code: string };
  product: { id: string; name: string };
  buyer: { name: string; email: string };
  plan?: { name: string };
}

export interface HotmartTransaction {
  transaction: string;
  status: string;
  product: { id: string; name: string };
  price: { value: number };
  order_date: number;
}

export interface HotmartProduct {
  id: string;
  name: string;
}

async function paginateAll<T>(
  path: string,
  params: Record<string, string>,
  dataKey: string
): Promise<T[]> {
  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const p = pageToken ? { ...params, page_token: pageToken } : params;
    const data = (await hotmartFetch(path, p)) as {
      items?: T[];
      page_info?: { next_page_token?: string; total_results?: number; results_per_page?: number };
      [key: string]: unknown;
    };

    logger.info({ path, page_info: data.page_info, keys: Object.keys(data), items_count: data.items?.length }, "Hotmart paginate page");

    const items = data.items ?? (data as Record<string, T[]>)[dataKey] ?? [];
    results.push(...items);
    pageToken = data.page_info?.next_page_token;
  } while (pageToken);

  return results;
}

export async function getSubscriptions(
  status: SubscriptionStatus,
  startDate: number,
  endDate: number
): Promise<HotmartSubscription[]> {
  try {
    return await paginateAll<HotmartSubscription>(
      "/subscriptions",
      {
        status,
        accession_date: startDate.toString(),
        end_accession_date: endDate.toString(),
        max_results: "50",
      },
      "items"
    );
  } catch (err) {
    logger.error({ err }, "Error fetching Hotmart subscriptions");
    throw err;
  }
}

export async function getAllActiveSubscriptions(): Promise<HotmartSubscription[]> {
  try {
    return await paginateAll<HotmartSubscription>(
      "/subscriptions",
      { status: "ACTIVE", max_results: "500" },
      "items"
    );
  } catch (err) {
    logger.error({ err }, "Error fetching all active Hotmart subscriptions");
    throw err;
  }
}

export async function getAllSubscriptionsByStatus(status: Exclude<SubscriptionStatus, "ACTIVE">): Promise<HotmartSubscription[]> {
  try {
    return await paginateAll<HotmartSubscription>(
      "/subscriptions",
      { status, max_results: "500" },
      "items"
    );
  } catch (err) {
    logger.error({ err }, `Error fetching all ${status} subscriptions`);
    return [];
  }
}

export async function getTransactions(
  startDate: number,
  endDate: number
): Promise<HotmartTransaction[]> {
  try {
    return await paginateAll<HotmartTransaction>(
      "/sales/summary",
      {
        start_date: startDate.toString(),
        end_date: endDate.toString(),
        max_results: "50",
      },
      "items"
    );
  } catch (err) {
    logger.error({ err }, "Error fetching Hotmart transactions");
    throw err;
  }
}

export async function getProductList(): Promise<HotmartProduct[]> {
  try {
    const data = (await hotmartFetch("/products")) as { items?: HotmartProduct[] };
    return data.items ?? [];
  } catch (err) {
    logger.error({ err }, "Error fetching Hotmart products");
    throw err;
  }
}
