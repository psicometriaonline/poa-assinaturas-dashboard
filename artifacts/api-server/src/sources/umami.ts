import { logger } from "../lib/logger";

export function isUmamiConfigured(): boolean {
  const { token, websiteId } = getConfig();
  return Boolean(token && websiteId);
}

function getConfig() {
  const baseUrl = (process.env.UMAMI_BASE_URL || "https://api.umami.is").replace(/\/+$/, "");
  const token = process.env.UMAMI_API_TOKEN || "";
  const websiteId = process.env.UMAMI_WEBSITE_ID || "";
  return { baseUrl, token, websiteId };
}

/**
 * Where the API actually lives.
 *
 * Umami Cloud serves `/v1`, self-hosted serves `/api`. The old code appended `/v1`
 * to anything that did not already end in `/api`, so a self-hosted install was
 * queried on the wrong path, and pasting the endpoint Umami's own docs give
 * (`https://api.umami.is/v1`) produced `https://api.umami.is/v1/v1`.
 */
export function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/(v1|api)$/.test(trimmed)) return trimmed;
  let host = "";
  try {
    host = new URL(trimmed).hostname;
  } catch {
    return `${trimmed}/v1`;
  }
  return /(^|\.)umami\.is$/i.test(host) ? `${trimmed}/v1` : `${trimmed}/api`;
}

async function umamiFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const { baseUrl, token } = getConfig();
  const url = new URL(`${resolveApiBase(baseUrl)}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: {
      // Umami Cloud authenticates with x-umami-api-key; self-hosted uses a bearer
      // token. Only Bearer was being sent, so every Cloud call came back 401 and
      // the traffic page rendered zeros. Each install ignores the header it does
      // not use, so sending both is what makes one config work for either.
      "x-umami-api-key": token,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ url: url.toString(), status: response.status, body }, "Umami API error");
    throw new Error(`Umami API error ${response.status}: ${body}`);
  }

  return response.json();
}

// Umami Cloud v1 returns flat numbers; older self-hosted returns { value, prev }
type StatField = number | { value: number; prev?: number };

export interface UmamiStats {
  pageviews: StatField;
  uniques?: StatField;
  visitors?: StatField;
  visits?: StatField;
  bounces: StatField;
  totaltime: StatField;
}

export function readStat(field: StatField | undefined): number {
  if (field === undefined || field === null) return 0;
  if (typeof field === "number") return field;
  return field.value ?? 0;
}

export interface UmamiMetric {
  x: string;
  y: number;
}

export interface UmamiPageView {
  x: string;
  y: number;
}

export interface UmamiReferrer {
  x: string;
  y: number;
}

export interface UmamiUtmSource {
  x: string;
  y: number;
}

export async function getWebsiteStats(startAt: number, endAt: number): Promise<UmamiStats> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/stats`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
    });
    return data as UmamiStats;
  } catch (err) {
    logger.error({ err }, "Error fetching Umami stats");
    throw err;
  }
}

/**
 * Picks the bucket size Umami can actually serve for the requested window.
 * Asking for `unit=day` across several years makes the API return thousands of
 * buckets (or reject the call outright), which is how the traffic page ended up
 * blank whenever the period was set to "Todo período".
 */
export function pickUnit(startAt: number, endAt: number): "hour" | "day" | "month" {
  const days = (endAt - startAt) / (24 * 60 * 60 * 1000);
  if (days <= 2) return "hour";
  if (days <= 120) return "day";
  return "month";
}

export async function getPageViews(
  startAt: number,
  endAt: number,
  unit: "hour" | "day" | "month" = pickUnit(startAt, endAt)
): Promise<{ pageviews: UmamiPageView[]; sessions: UmamiPageView[] }> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/pageviews`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      unit,
      timezone: "America/Sao_Paulo",
    });
    return data as { pageviews: UmamiPageView[]; sessions: UmamiPageView[] };
  } catch (err) {
    logger.error({ err }, "Error fetching Umami pageviews");
    throw err;
  }
}

export async function getReferrers(startAt: number, endAt: number): Promise<UmamiReferrer[]> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/metrics`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      type: "referrer",
    });
    return (data as UmamiReferrer[]) ?? [];
  } catch (err) {
    logger.error({ err }, "Error fetching Umami referrers");
    throw err;
  }
}

export async function getUtmSources(startAt: number, endAt: number): Promise<UmamiUtmSource[]> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/metrics`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      type: "utm_source",
    });
    return (data as UmamiUtmSource[]) ?? [];
  } catch (err) {
    logger.error({ err }, "Error fetching Umami UTM sources");
    throw err;
  }
}

async function getMetrics(type: string, startAt: number, endAt: number): Promise<UmamiMetric[]> {
  const { websiteId } = getConfig();
  const data = await umamiFetch(`/websites/${websiteId}/metrics`, {
    startAt: startAt.toString(),
    endAt: endAt.toString(),
    type,
    limit: "50",
  });
  return (data as UmamiMetric[]) ?? [];
}

export async function getCountries(startAt: number, endAt: number): Promise<UmamiMetric[]> {
  try {
    return await getMetrics("country", startAt, endAt);
  } catch (err) {
    logger.error({ err }, "Error fetching Umami countries");
    throw err;
  }
}

export async function getUrlPaths(startAt: number, endAt: number): Promise<UmamiMetric[]> {
  try {
    return await getMetrics("url", startAt, endAt);
  } catch (err) {
    logger.error({ err }, "Error fetching Umami URL paths");
    throw err;
  }
}

export async function getUtmMedium(startAt: number, endAt: number): Promise<UmamiMetric[]> {
  try {
    return await getMetrics("utm_medium", startAt, endAt);
  } catch (err) {
    logger.error({ err }, "Error fetching Umami UTM medium");
    throw err;
  }
}

export async function getUtmCampaign(startAt: number, endAt: number): Promise<UmamiMetric[]> {
  try {
    return await getMetrics("utm_campaign", startAt, endAt);
  } catch (err) {
    logger.error({ err }, "Error fetching Umami UTM campaign");
    throw err;
  }
}

export async function getHourlyPageviews(
  startAt: number,
  endAt: number
): Promise<{ pageviews: UmamiPageView[]; sessions: UmamiPageView[] }> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/pageviews`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      unit: "hour",
      timezone: "America/Sao_Paulo",
    });
    return data as { pageviews: UmamiPageView[]; sessions: UmamiPageView[] };
  } catch (err) {
    logger.error({ err }, "Error fetching Umami hourly pageviews");
    throw err;
  }
}
