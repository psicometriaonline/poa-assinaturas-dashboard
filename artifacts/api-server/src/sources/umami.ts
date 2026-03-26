import { logger } from "../lib/logger";

function getConfig() {
  const baseUrl = (process.env.UMAMI_BASE_URL || "https://api.umami.is").replace(/\/$/, "");
  const token = process.env.UMAMI_API_TOKEN || "";
  const websiteId = process.env.UMAMI_WEBSITE_ID || "";
  return { baseUrl, token, websiteId };
}

async function umamiFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const { baseUrl, token } = getConfig();
  const apiBase = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/v1`;
  const url = new URL(`${apiBase}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
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

export interface UmamiStats {
  pageviews: { value: number; prev?: number };
  uniques?: { value: number; prev?: number };
  visitors?: { value: number; prev?: number };
  visits?: { value: number; prev?: number };
  bounces: { value: number; prev?: number };
  totaltime: { value: number; prev?: number };
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

export async function getPageViews(
  startAt: number,
  endAt: number
): Promise<{ pageviews: UmamiPageView[]; sessions: UmamiPageView[] }> {
  const { websiteId } = getConfig();
  try {
    const data = await umamiFetch(`/websites/${websiteId}/pageviews`, {
      startAt: startAt.toString(),
      endAt: endAt.toString(),
      unit: "day",
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
