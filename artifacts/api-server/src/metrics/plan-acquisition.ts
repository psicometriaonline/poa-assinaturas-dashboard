import { query } from "../lib/db";
import { getListContactEmails, getTagContactEmails } from "../sources/activecampaign";
import { logger } from "../lib/logger";

const ALUNOS_POA_LIST_ID = "30";
const FREE_TRIAL_TAG_ID = "401";

export interface PlanAcquisitionMetrics {
  byPlan: Array<{ plan: string; interval: string; count: number }>;
  byInterval: Array<{ label: string; count: number }>;
  history: Array<{ month: string; plans: Record<string, number> }>;
  topPlans: string[];
  totalConversions: number;
}

function toMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function intervalLabel(raw: string): string {
  const up = (raw ?? "").toUpperCase();
  if (up === "ANNUAL") return "Anual";
  if (up === "MONTHLY") return "Mensal";
  if (up === "SEMIANNUAL") return "Semestral";
  return raw ?? "Outro";
}

export async function getPlanAcquisitionMetrics(
  startMs: number,
  endMs: number
): Promise<PlanAcquisitionMetrics> {
  const [alunosPoaEmails, freeTrialEmails] = await Promise.all([
    getListContactEmails(ALUNOS_POA_LIST_ID),
    getTagContactEmails(FREE_TRIAL_TAG_ID),
  ]);

  // Intersection: contacts who are both in list-30 (Alunos POA) AND have tag-401 (Free Trial)
  const intersectionEmails = Array.from(alunosPoaEmails).filter((email) =>
    freeTrialEmails.has(email)
  );

  logger.info(
    {
      alunosPoaCount: alunosPoaEmails.size,
      freeTrialCount: freeTrialEmails.size,
      intersectionCount: intersectionEmails.length,
    },
    "Plan acquisition: Free Trial converts (tag-401 ∩ list-30)"
  );

  const emailsArray = intersectionEmails;

  if (emailsArray.length === 0) {
    return { byPlan: [], byInterval: [], history: [], topPlans: [], totalConversions: 0 };
  }

  const [planRows, monthlyRows] = await Promise.all([
    query<{ plan_name: string; plan_interval: string; cnt: string }>(
      `SELECT plan_name, plan_interval, COUNT(*) as cnt
       FROM hotmart_subscriptions
       WHERE LOWER(subscriber_email) = ANY($1)
         AND accession_date IS NOT NULL
         AND accession_date >= $2
         AND accession_date <= $3
       GROUP BY plan_name, plan_interval
       ORDER BY cnt DESC`,
      [emailsArray, startMs, endMs]
    ),
    query<{ month: string; plan_name: string; cnt: string }>(
      `SELECT
         TO_CHAR(
           (to_timestamp(accession_date / 1000) AT TIME ZONE 'America/Sao_Paulo'),
           'YYYY-MM'
         ) AS month,
         plan_name,
         COUNT(*) AS cnt
       FROM hotmart_subscriptions
       WHERE LOWER(subscriber_email) = ANY($1)
         AND accession_date IS NOT NULL
         AND accession_date >= $2
         AND accession_date <= $3
       GROUP BY 1, 2
       ORDER BY 1`,
      [emailsArray, startMs, endMs]
    ),
  ]);

  logger.info({ planRows: planRows.length, monthlyRows: monthlyRows.length }, "Plan acquisition: DB rows");

  const byPlan = planRows.map((r) => ({
    plan: r.plan_name ?? "Desconhecido",
    interval: intervalLabel(r.plan_interval),
    count: parseInt(r.cnt, 10),
  }));

  const totalConversions = byPlan.reduce((s, p) => s + p.count, 0);

  const intervalMap: Record<string, number> = {};
  for (const r of planRows) {
    const lbl = intervalLabel(r.plan_interval);
    intervalMap[lbl] = (intervalMap[lbl] ?? 0) + parseInt(r.cnt, 10);
  }
  const byInterval = Object.entries(intervalMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const planTotals: Record<string, number> = {};
  for (const r of planRows) {
    const name = r.plan_name ?? "Desconhecido";
    planTotals[name] = (planTotals[name] ?? 0) + parseInt(r.cnt, 10);
  }
  const topPlans = Object.entries(planTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const monthSet = new Set(monthlyRows.map((r) => r.month));
  const months = Array.from(monthSet).sort();

  const historyMap: Record<string, Record<string, number>> = {};
  for (const mk of months) historyMap[mk] = {};

  for (const r of monthlyRows) {
    const name = r.plan_name ?? "Desconhecido";
    const groupName = topPlans.includes(name) ? name : "Outros";
    historyMap[r.month][groupName] = (historyMap[r.month][groupName] ?? 0) + parseInt(r.cnt, 10);
  }

  const history = months.map((mk) => ({
    month: toMonthLabel(mk),
    plans: historyMap[mk],
  }));

  return { byPlan, byInterval, history, topPlans, totalConversions };
}
