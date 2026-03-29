import { getLeadContacts, getContactUtmField } from "../sources/activecampaign";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const FREE_TRIAL_TAG_ID = "401";
const UTM_SOURCE_FIELD_ID = "13";

export interface ConversionMetrics {
  totalRegistrations: number;
  totalConversions: number;
  conversionRate: number;
  avgDaysToConversion: number;
  distributionByRange: {
    "0-7": number;
    "8-14": number;
    "15-30": number;
    "+30": number;
  };
  byChannel: Array<{ channel: string; registrations: number; conversions: number; rate: number }>;
  history: Array<{
    month: string;
    registrations: number;
    conversions: number;
    conversionRate: number;
  }>;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Funnel always starts from this date — the launch of the Free-Trial program
const FUNNEL_START = new Date("2026-03-01T00:00:00.000Z");

export async function getConversionMetrics(
  startDate: Date,
  endDate: Date
): Promise<ConversionMetrics> {
  // Chart always begins at the launch of the trial program
  const chartStart = startDate < FUNNEL_START ? FUNNEL_START : startDate;

  // Fetch free-trial contacts from AC (tag 401) and subscriber emails from local DB in parallel
  const [leadContacts, subscriberRows] = await Promise.all([
    getLeadContacts(FREE_TRIAL_TAG_ID),
    query<{ subscriber_email: string; accession_date: string }>(
      `SELECT subscriber_email, accession_date
       FROM hotmart_subscriptions
       WHERE subscriber_email IS NOT NULL
         AND accession_date IS NOT NULL
         AND original_event != 'IMPORT_CSV'`
    ),
  ]);

  logger.info({ totalLeads: leadContacts.length, totalSubscribers: subscriberRows.length }, "Conversion metrics: fetched sources");

  // Build fast lookup: email → accession_date (ms)
  const subscriberMap = new Map<string, number>();
  for (const row of subscriberRows) {
    const email = row.subscriber_email.toLowerCase().trim();
    const accMs = parseInt(row.accession_date, 10);
    if (!isNaN(accMs)) subscriberMap.set(email, accMs);
  }

  // KPI totals use ALL contacts with the tag (no date filter)
  // so the count always matches what's in ActiveCampaign
  const allContacts = leadContacts;
  const totalRegistrations = allContacts.length;

  const distribution: ConversionMetrics["distributionByRange"] = { "0-7": 0, "8-14": 0, "15-30": 0, "+30": 0 };
  const daysToConversion: number[] = [];
  let totalConversions = 0;
  const channelMap: Record<string, { registrations: number; conversions: number }> = {};

  for (const c of allContacts) {
    const refMs = new Date(c._tagDate ?? c.cdate).getTime();
    const email = c.email?.toLowerCase().trim() ?? "";
    const accessionMs = subscriberMap.get(email);
    const converted = accessionMs !== undefined;

    if (converted) {
      totalConversions++;
      const days = Math.max(0, Math.floor((accessionMs! - refMs) / (1000 * 60 * 60 * 24)));
      daysToConversion.push(days);
      if (days <= 7) distribution["0-7"]++;
      else if (days <= 14) distribution["8-14"]++;
      else if (days <= 30) distribution["15-30"]++;
      else distribution["+30"]++;
    }

    // UTM channel
    const utmSource = getContactUtmField(c, UTM_SOURCE_FIELD_ID) || "direto";
    if (!channelMap[utmSource]) channelMap[utmSource] = { registrations: 0, conversions: 0 };
    channelMap[utmSource].registrations++;
    if (converted) channelMap[utmSource].conversions++;
  }

  // Monthly chart: only from FUNNEL_START (March 2026) forward, skip empty leading months
  const monthlyMap: Map<string, { registrations: number; conversions: number; label: string }> = new Map();
  const current = new Date(chartStart);
  current.setDate(1);
  current.setHours(0, 0, 0, 0);
  while (current <= endDate) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { registrations: 0, conversions: 0, label: monthLabel(current) });
    current.setMonth(current.getMonth() + 1);
  }

  for (const c of allContacts) {
    const refMs = new Date(c._tagDate ?? c.cdate).getTime();
    const email = c.email?.toLowerCase().trim() ?? "";
    const converted = subscriberMap.has(email);
    const refDate = new Date(refMs);
    const monthKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyMap.get(monthKey);
    if (bucket) {
      bucket.registrations++;
      if (converted) bucket.conversions++;
    }
  }

  const conversionRate = totalRegistrations > 0
    ? parseFloat(((totalConversions / totalRegistrations) * 100).toFixed(2))
    : 0;

  const avgDaysToConversion = daysToConversion.length > 0
    ? parseFloat((daysToConversion.reduce((a, b) => a + b, 0) / daysToConversion.length).toFixed(1))
    : 0;

  const byChannel = Object.entries(channelMap)
    .map(([channel, data]) => ({
      channel,
      registrations: data.registrations,
      conversions: data.conversions,
      rate: data.registrations > 0 ? parseFloat(((data.conversions / data.registrations) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.registrations - a.registrations);

  const history = Array.from(monthlyMap.entries()).map(([, bucket]) => ({
    month: bucket.label,
    registrations: bucket.registrations,
    conversions: bucket.conversions,
    conversionRate: bucket.registrations > 0
      ? parseFloat(((bucket.conversions / bucket.registrations) * 100).toFixed(2))
      : 0,
  }));

  return {
    totalRegistrations,
    totalConversions,
    conversionRate,
    avgDaysToConversion,
    distributionByRange: distribution,
    byChannel,
    history,
  };
}
