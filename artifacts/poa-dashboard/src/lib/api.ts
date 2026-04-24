const BASE = "/api/metrics";

async function apiFetch<T>(url: string): Promise<{ error: boolean; message?: string; data: T | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    return { error: true, message: `HTTP ${res.status}`, data: null };
  }
  return res.json();
}

export async function fetchOverview(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return apiFetch<{
    mrr: number;
    arr: number;
    mrrChange: number | null;
    activeSubscribers: number;
    pastDueSubscribers: number;
    inactiveSubscribers: number;
    totalSubscribers: number;
    newSubscribers: number;
    cancellations: number;
    netNewSubscribers: number;
    churnRate: number;
    conversionRate: number;
  }>(`${BASE}/overview${qs ? `?${qs}` : ""}`);
}

export async function fetchWebhookStatus() {
  return apiFetch<{
    events: Array<{ event: string; count: string }>;
    subscriptions: Array<{ status: string; count: string }>;
  }>("/api/webhooks/hotmart/status");
}

export async function fetchRevenue(start?: string, end?: string) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split("T")[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  start = start ?? defaultStart;
  end = end ?? defaultEnd;
  return apiFetch<{
    mrr: number;
    arr: number;
    arpu: number;
    totalSubscribers: number;
    totalRevenue: number;
    byPlan: Array<{ plan: string; subscribers: number; revenue: number; percentage: number }>;
    history: Array<{
      month: string;
      mrr: number;
      arr: number;
      arpu: number;
      newSubs: number;
      churnedSubs: number;
      totalSubs: number;
      churnRate: number;
      byPlan: Record<string, number>;
    }>;
  }>(`${BASE}/revenue?start=${start}&end=${end}`);
}

export async function fetchChurn(start: string, end: string) {
  return apiFetch<{
    totalCancellations: number;
    voluntaryChurn: number;
    involuntaryChurn: number;
    churnRate: number;
    history: Array<{ month: string; total: number; voluntary: number; involuntary: number; churnRate: number }>;
  }>(`${BASE}/churn?start=${start}&end=${end}`);
}

export async function fetchFunnel(start: string, end: string) {
  return apiFetch<{
    totalRegistrations: number;
    totalConversions: number;
    conversionRate: number;
    avgDaysToConversion: number;
    distributionByRange: { "0-7": number; "8-14": number; "15-30": number; "+30": number };
    byChannel: Array<{ channel: string; registrations: number; conversions: number; rate: number }>;
    history: Array<{ month: string; registrations: number; conversions: number; conversionRate: number }>;
  }>(`${BASE}/funnel?start=${start}&end=${end}`);
}

export interface PlanAcquisitionData {
  byPlan: Array<{ plan: string; interval: string; count: number }>;
  byInterval: Array<{ label: string; count: number }>;
  history: Array<{ month: string; plans: Record<string, number> }>;
  topPlans: string[];
}

export async function fetchPlanAcquisition(start: string, end: string) {
  return apiFetch<PlanAcquisitionData>(`${BASE}/plan-acquisition?start=${start}&end=${end}`);
}

export async function fetchAcquisition(start: string, end: string) {
  return apiFetch<{
    byUtmSource: Array<{ source: string; registrations: number }>;
    byTrafficChannel: Array<{ channel: string; sessions: number }>;
  }>(`${BASE}/acquisition?start=${start}&end=${end}`);
}

export interface UmamiMetric {
  x: string;
  y: number;
}

export interface TrafficData {
  stats: {
    pageviews: number;
    uniques: number;
    bounces: number;
    totaltime: number;
    bounceRate: number;
    avgDurationMin: number;
  };
  pageviewsHistory: UmamiMetric[];
  sessionsHistory: UmamiMetric[];
  topPaths: UmamiMetric[];
  utmSource: UmamiMetric[];
  utmMedium: UmamiMetric[];
  utmCampaign: UmamiMetric[];
  countries: UmamiMetric[];
  weeklyHourly: number[][];
}

export async function fetchTraffic(start: string, end: string) {
  return apiFetch<TrafficData>(`${BASE}/traffic?start=${start}&end=${end}`);
}

export interface LeadsData {
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
  bySource: Array<{
    source: string;
    leads: number;
    conversions: number;
    rate: number;
    mediums: Array<{ medium: string; leads: number; conversions: number }>;
  }>;
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

export async function fetchLeads(start: string, end: string) {
  return apiFetch<LeadsData>(`${BASE}/leads?start=${start}&end=${end}`);
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

export async function fetchLeadsSnapshots(limit = 90) {
  return apiFetch<LeadsSnapshot[]>(`${BASE}/leads/snapshots?limit=${limit}`);
}

export async function triggerLeadsSnapshot(adminSecret: string) {
  const res = await fetch(`${BASE}/leads/snapshot`, {
    method: "POST",
    headers: { "x-admin-token": adminSecret },
  });
  return res.json();
}

export interface LeadMapData {
  totalWithProfile: number;
  totalMembers: number;
  escolaridade: Array<{ label: string; value: number }>;
  area: Array<{ label: string; value: number }>;
  curso: Array<{ label: string; value: number }>;
  pesquisador: { sim: number; nao: number };
  professor: { sim: number; nao: number };
  coordPesquisa: { sim: number; nao: number };
  coordPPG: { sim: number; nao: number };
  sexo: Array<{ label: string; value: number }>;
  topInstituicoes: Array<{ label: string; value: number }>;
}

export async function fetchLeadMap() {
  return apiFetch<LeadMapData>(`${BASE}/leadmap`);
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
