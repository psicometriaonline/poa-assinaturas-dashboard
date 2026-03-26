const BASE = "/api/metrics";

async function apiFetch<T>(url: string): Promise<{ error: boolean; message?: string; data: T | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    return { error: true, message: `HTTP ${res.status}`, data: null };
  }
  return res.json();
}

export async function fetchOverview() {
  return apiFetch<{
    mrr: number;
    mrrPrev: number;
    mrrChange: number;
    newSubscribers: number;
    newSubscribersPrev: number;
    cancellations: number;
    cancellationsPrev: number;
    churnRate: number;
    totalRegistrations: number;
    conversionRate: number;
    avgDaysToConversion: number;
  }>(`${BASE}/overview`);
}

export async function fetchRevenue(start: string, end: string) {
  return apiFetch<{
    mrr: number;
    arr: number;
    arpu: number;
    totalSubscribers: number;
    byPlan: Array<{ plan: string; subscribers: number; revenue: number; percentage: number }>;
    history: Array<{ month: string; mrr: number; arr: number; arpu: number; byPlan: Record<string, number> }>;
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
  hourly: UmamiMetric[];
}

export async function fetchTraffic(start: string, end: string) {
  return apiFetch<TrafficData>(`${BASE}/traffic?start=${start}&end=${end}`);
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
