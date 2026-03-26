import { getLeadContacts, getContactUtmField } from "../sources/activecampaign";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const FREE_TRIAL_TAG_ID = "401";
const UTM_SOURCE_FIELD_ID = "13";
const UTM_MEDIUM_FIELD_ID = "14";

export interface LeadsBySourceRow {
  source: string;
  leads: number;
  conversions: number;
  rate: number;
  mediums: Array<{ medium: string; leads: number; conversions: number }>;
}

export interface LeadsMetrics {
  totalLeads: number;
  totalConversions: number;
  conversionRate: number;
  avgDaysToConvert: number;
  daily: Array<{ date: string; leads: number }>;
  monthly: Array<{
    month: string;
    monthKey: string;
    leads: number;
    conversions: number;
    conversionRate: number;
  }>;
  bySource: LeadsBySourceRow[];
  tableMonths: string[];
  tableData: Array<{
    source: string;
    total: number;
    byMonth: Record<string, number>;
    mediums: Array<{
      medium: string;
      total: number;
      byMonth: Record<string, number>;
    }>;
  }>;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push(toMonthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

export async function getLeadsMetrics(
  startDate: Date,
  endDate: Date
): Promise<LeadsMetrics> {
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  const [contacts, activeSubscribers] = await Promise.all([
    getLeadContacts(FREE_TRIAL_TAG_ID, startStr, endStr),
    query<{ email: string; accession_date: string }>(
      `SELECT subscriber_email as email, accession_date
       FROM hotmart_subscriptions
       WHERE status = 'ACTIVE' AND subscriber_email IS NOT NULL`
    ),
  ]);

  const subscriberMap = new Map<string, number>();
  for (const s of activeSubscribers) {
    if (s.email) {
      subscriberMap.set(s.email.toLowerCase().trim(), Number(s.accession_date) || 0);
    }
  }

  logger.info(
    { leadCount: contacts.length, subscriberCount: subscriberMap.size },
    "Leads metrics: fetched AC contacts and DB subscribers"
  );

  let totalConversions = 0;
  const conversionTimes: number[] = [];

  const dailyMap: Record<string, number> = {};
  const monthlyLeads: Record<string, number> = {};
  const monthlyConversions: Record<string, number> = {};

  const sourceLeads: Record<string, number> = {};
  const sourceConversions: Record<string, number> = {};
  const sourceMediumLeads: Record<string, Record<string, number>> = {};
  const sourceMediumConversions: Record<string, Record<string, number>> = {};

  const sourceMonthLeads: Record<string, Record<string, number>> = {};
  const sourceMediumMonthLeads: Record<string, Record<string, Record<string, number>>> = {};

  for (const contact of contacts) {
    const cdate = new Date(contact.cdate);
    const dateStr = toDateStr(cdate);
    const monthKey = toMonthKey(cdate);
    const utmSource = getContactUtmField(contact, UTM_SOURCE_FIELD_ID) || "(direto)";
    const utmMedium = getContactUtmField(contact, UTM_MEDIUM_FIELD_ID) || "(nenhum)";

    dailyMap[dateStr] = (dailyMap[dateStr] ?? 0) + 1;
    monthlyLeads[monthKey] = (monthlyLeads[monthKey] ?? 0) + 1;

    sourceLeads[utmSource] = (sourceLeads[utmSource] ?? 0) + 1;
    if (!sourceMediumLeads[utmSource]) sourceMediumLeads[utmSource] = {};
    sourceMediumLeads[utmSource][utmMedium] = (sourceMediumLeads[utmSource][utmMedium] ?? 0) + 1;

    if (!sourceMonthLeads[utmSource]) sourceMonthLeads[utmSource] = {};
    sourceMonthLeads[utmSource][monthKey] = (sourceMonthLeads[utmSource][monthKey] ?? 0) + 1;

    if (!sourceMediumMonthLeads[utmSource]) sourceMediumMonthLeads[utmSource] = {};
    if (!sourceMediumMonthLeads[utmSource][utmMedium]) sourceMediumMonthLeads[utmSource][utmMedium] = {};
    sourceMediumMonthLeads[utmSource][utmMedium][monthKey] =
      (sourceMediumMonthLeads[utmSource][utmMedium][monthKey] ?? 0) + 1;

    const email = contact.email?.toLowerCase().trim();
    const accessionDate = email ? subscriberMap.get(email) : undefined;
    if (accessionDate !== undefined && accessionDate > 0) {
      totalConversions++;
      monthlyConversions[monthKey] = (monthlyConversions[monthKey] ?? 0) + 1;
      sourceConversions[utmSource] = (sourceConversions[utmSource] ?? 0) + 1;

      if (!sourceMediumConversions[utmSource]) sourceMediumConversions[utmSource] = {};
      sourceMediumConversions[utmSource][utmMedium] =
        (sourceMediumConversions[utmSource][utmMedium] ?? 0) + 1;

      const cdateMs = cdate.getTime();
      const days = (accessionDate - cdateMs) / (1000 * 60 * 60 * 24);
      if (days >= 0) conversionTimes.push(days);
    }
  }

  const totalLeads = contacts.length;
  const conversionRate =
    totalLeads > 0 ? parseFloat(((totalConversions / totalLeads) * 100).toFixed(2)) : 0;
  const avgDaysToConvert =
    conversionTimes.length > 0
      ? parseFloat(
          (conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length).toFixed(1)
        )
      : 0;

  const allMonths = monthsBetween(startDate, endDate);
  const tableMonths = allMonths;

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, leads]) => ({ date, leads }));

  const monthly = allMonths.map((mk) => {
    const leads = monthlyLeads[mk] ?? 0;
    const conversions = monthlyConversions[mk] ?? 0;
    const rate = leads > 0 ? parseFloat(((conversions / leads) * 100).toFixed(2)) : 0;
    return { month: toMonthLabel(mk), monthKey: mk, leads, conversions, conversionRate: rate };
  });

  const bySource: LeadsBySourceRow[] = Object.entries(sourceLeads)
    .map(([source, leads]) => {
      const conversions = sourceConversions[source] ?? 0;
      const rate = leads > 0 ? parseFloat(((conversions / leads) * 100).toFixed(2)) : 0;
      const mediumMap = sourceMediumLeads[source] ?? {};
      const mediums = Object.entries(mediumMap).map(([medium, mLeads]) => ({
        medium,
        leads: mLeads,
        conversions: sourceMediumConversions[source]?.[medium] ?? 0,
      })).sort((a, b) => b.leads - a.leads);
      return { source, leads, conversions, rate, mediums };
    })
    .sort((a, b) => b.leads - a.leads);

  const tableData = Object.entries(sourceMonthLeads)
    .map(([source, byMonth]) => {
      const total = sourceLeads[source] ?? 0;
      const mediumMonthMap = sourceMediumMonthLeads[source] ?? {};
      const mediums = Object.entries(mediumMonthMap).map(([medium, mByMonth]) => ({
        medium,
        total: Object.values(mByMonth).reduce((a, b) => a + b, 0),
        byMonth: mByMonth,
      })).sort((a, b) => b.total - a.total);
      return { source, total, byMonth, mediums };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalLeads,
    totalConversions,
    conversionRate,
    avgDaysToConvert,
    daily,
    monthly,
    bySource,
    tableMonths,
    tableData,
  };
}
