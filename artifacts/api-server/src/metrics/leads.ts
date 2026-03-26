import {
  getLeadContacts,
  getListContactEmails,
  getContactUtmField,
  getTagContactCount,
  getListContactCount,
} from "../sources/activecampaign";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const FREE_TRIAL_TAG_ID = "401";
const ALUNOS_POA_LIST_ID = "30";
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

export interface LeadsSnapshot {
  id: number;
  snapshot_date: string;
  total_free_trial: number;
  total_alunos_poa: number;
  converted: number;
  conversion_rate: number;
  created_at: string;
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
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  const [allFreeTrialContacts, alunosPoaEmails] = await Promise.all([
    getLeadContacts(FREE_TRIAL_TAG_ID),
    getListContactEmails(ALUNOS_POA_LIST_ID),
  ]);

  const contacts = allFreeTrialContacts.filter((c) => {
    const t = new Date(c.cdate).getTime();
    return t >= startMs && t <= endMs;
  });

  logger.info(
    {
      totalFreeTrial: allFreeTrialContacts.length,
      inPeriod: contacts.length,
      alunosPoaCount: alunosPoaEmails.size,
    },
    "Leads metrics: fetched AC data"
  );

  let totalConversions = 0;

  const dailyMap: Record<string, number> = {};
  const monthlyLeads: Record<string, number> = {};
  const monthlyConversions: Record<string, number> = {};

  const sourceLeads: Record<string, number> = {};
  const sourceConversions: Record<string, number> = {};
  const sourceMediumLeads: Record<string, Record<string, number>> = {};
  const sourceMediumConversions: Record<string, Record<string, number>> = {};

  const sourceMonthLeads: Record<string, Record<string, number>> = {};
  const sourceMediumMonthLeads: Record<
    string,
    Record<string, Record<string, number>>
  > = {};

  for (const contact of contacts) {
    const cdate = new Date(contact.cdate);
    const dateStr = toDateStr(cdate);
    const monthKey = toMonthKey(cdate);
    const utmSource =
      getContactUtmField(contact, UTM_SOURCE_FIELD_ID) || "(direto)";
    const utmMedium =
      getContactUtmField(contact, UTM_MEDIUM_FIELD_ID) || "(nenhum)";

    dailyMap[dateStr] = (dailyMap[dateStr] ?? 0) + 1;
    monthlyLeads[monthKey] = (monthlyLeads[monthKey] ?? 0) + 1;

    sourceLeads[utmSource] = (sourceLeads[utmSource] ?? 0) + 1;
    if (!sourceMediumLeads[utmSource]) sourceMediumLeads[utmSource] = {};
    sourceMediumLeads[utmSource][utmMedium] =
      (sourceMediumLeads[utmSource][utmMedium] ?? 0) + 1;

    if (!sourceMonthLeads[utmSource]) sourceMonthLeads[utmSource] = {};
    sourceMonthLeads[utmSource][monthKey] =
      (sourceMonthLeads[utmSource][monthKey] ?? 0) + 1;

    if (!sourceMediumMonthLeads[utmSource])
      sourceMediumMonthLeads[utmSource] = {};
    if (!sourceMediumMonthLeads[utmSource][utmMedium])
      sourceMediumMonthLeads[utmSource][utmMedium] = {};
    sourceMediumMonthLeads[utmSource][utmMedium][monthKey] =
      (sourceMediumMonthLeads[utmSource][utmMedium][monthKey] ?? 0) + 1;

    const email = contact.email?.toLowerCase().trim();
    const isConverted = email ? alunosPoaEmails.has(email) : false;

    if (isConverted) {
      totalConversions++;
      monthlyConversions[monthKey] = (monthlyConversions[monthKey] ?? 0) + 1;
      sourceConversions[utmSource] = (sourceConversions[utmSource] ?? 0) + 1;

      if (!sourceMediumConversions[utmSource])
        sourceMediumConversions[utmSource] = {};
      sourceMediumConversions[utmSource][utmMedium] =
        (sourceMediumConversions[utmSource][utmMedium] ?? 0) + 1;
    }
  }

  const totalLeads = contacts.length;
  const conversionRate =
    totalLeads > 0
      ? parseFloat(((totalConversions / totalLeads) * 100).toFixed(2))
      : 0;

  const allMonths = monthsBetween(startDate, endDate);

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, leads]) => ({ date, leads }));

  const monthly = allMonths.map((mk) => {
    const leads = monthlyLeads[mk] ?? 0;
    const conversions = monthlyConversions[mk] ?? 0;
    const rate =
      leads > 0 ? parseFloat(((conversions / leads) * 100).toFixed(2)) : 0;
    return {
      month: toMonthLabel(mk),
      monthKey: mk,
      leads,
      conversions,
      conversionRate: rate,
    };
  });

  const bySource: LeadsBySourceRow[] = Object.entries(sourceLeads)
    .map(([source, leads]) => {
      const conversions = sourceConversions[source] ?? 0;
      const rate =
        leads > 0 ? parseFloat(((conversions / leads) * 100).toFixed(2)) : 0;
      const mediumMap = sourceMediumLeads[source] ?? {};
      const mediums = Object.entries(mediumMap)
        .map(([medium, mLeads]) => ({
          medium,
          leads: mLeads,
          conversions: sourceMediumConversions[source]?.[medium] ?? 0,
        }))
        .sort((a, b) => b.leads - a.leads);
      return { source, leads, conversions, rate, mediums };
    })
    .sort((a, b) => b.leads - a.leads);

  const tableData = Object.entries(sourceMonthLeads)
    .map(([source, byMonth]) => {
      const total = sourceLeads[source] ?? 0;
      const mediumMonthMap = sourceMediumMonthLeads[source] ?? {};
      const mediums = Object.entries(mediumMonthMap)
        .map(([medium, mByMonth]) => ({
          medium,
          total: Object.values(mByMonth).reduce((a, b) => a + b, 0),
          byMonth: mByMonth,
        }))
        .sort((a, b) => b.total - a.total);
      return { source, total, byMonth, mediums };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalLeads,
    totalConversions,
    conversionRate,
    avgDaysToConvert: 0,
    daily,
    monthly,
    bySource,
    tableMonths: allMonths,
    tableData,
  };
}

/**
 * Take a daily snapshot: total Free-Trial, total Alunos-POA, intersection count.
 * Upserts by date so it's safe to re-run.
 */
export async function takeLeadsSnapshot(): Promise<LeadsSnapshot> {
  const today = new Date().toISOString().split("T")[0];

  const [totalFreeTrial, alunosPoaEmails, allFreeTrialContacts] =
    await Promise.all([
      getTagContactCount(FREE_TRIAL_TAG_ID),
      getListContactEmails(ALUNOS_POA_LIST_ID),
      getLeadContacts(FREE_TRIAL_TAG_ID),
    ]);

  const totalAlunosPoa = alunosPoaEmails.size;

  let converted = 0;
  for (const c of allFreeTrialContacts) {
    const email = c.email?.toLowerCase().trim();
    if (email && alunosPoaEmails.has(email)) converted++;
  }

  const conversionRate =
    totalFreeTrial > 0
      ? parseFloat(((converted / totalFreeTrial) * 100).toFixed(2))
      : 0;

  const rows = await query<LeadsSnapshot>(
    `INSERT INTO leads_daily_snapshots
       (snapshot_date, total_free_trial, total_alunos_poa, converted, conversion_rate)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (snapshot_date) DO UPDATE SET
       total_free_trial = EXCLUDED.total_free_trial,
       total_alunos_poa = EXCLUDED.total_alunos_poa,
       converted        = EXCLUDED.converted,
       conversion_rate  = EXCLUDED.conversion_rate,
       created_at       = NOW()
     RETURNING *`,
    [today, totalFreeTrial, totalAlunosPoa, converted, conversionRate]
  );

  logger.info(
    { date: today, totalFreeTrial, totalAlunosPoa, converted, conversionRate },
    "Leads daily snapshot saved"
  );

  return rows[0];
}

/**
 * Get the last N daily snapshots ordered by date DESC.
 */
export async function getLeadsSnapshots(
  limit = 90
): Promise<LeadsSnapshot[]> {
  return query<LeadsSnapshot>(
    `SELECT * FROM leads_daily_snapshots ORDER BY snapshot_date DESC LIMIT $1`,
    [limit]
  );
}
