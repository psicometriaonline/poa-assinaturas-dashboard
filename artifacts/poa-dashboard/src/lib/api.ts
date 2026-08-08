const BASE = "/api/metrics";

export interface ApiResponse<T> {
  error: boolean;
  message?: string;
  data: T | null;
}

async function apiFetch<T>(path: string, start?: string, end?: string): Promise<ApiResponse<T>> {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    return { error: true, message: `HTTP ${res.status}`, data: null };
  }
  return res.json();
}

/* ── Overview ─────────────────────────────────────────────────────────── */

export interface OverviewData {
  mrr: number;
  arr: number;
  arpu: number;
  mrrAtStart: number;
  mrrChange: number;
  mrrChangePct: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
  billings: number;
  annualMrrShare: number;
  quickRatio: number | null;
  activeSubscribers: number;
  newSubscribers: number;
  cancellations: number;
  netNewSubscribers: number;
  avgTenureMonths: number;
  churnRate: number;
  annualizedChurnRate: number;
  revenueChurnRate: number;
  nrr: number;
  grr: number;
  ltv: number | null;
  voluntaryCancellations: number;
  involuntaryCancellations: number;
  delinquentSubscribers: number;
  delinquentMrr: number;
  renewals30d: { subscribers: number; contractValue: number };
  history: Array<{
    month: string;
    monthKey: string;
    mrr: number;
    arr: number;
    activeSubs: number;
    newSubs: number;
    churnedSubs: number;
    netNewMrr: number;
  }>;
  dataQuality: { totalSubscriptions: number; withoutPrice: number; undatedExits: number };
}

export const fetchOverview = (start: string, end: string) =>
  apiFetch<OverviewData>("/overview", start, end);

/* ── Revenue ──────────────────────────────────────────────────────────── */

export interface RevenueData {
  mrr: number;
  arr: number;
  arpu: number;
  activeSubscribers: number;
  mrrAtStart: number;
  mrrChange: number;
  mrrChangePct: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
  quickRatio: number | null;
  grr: number;
  billings: number;
  annualMrrShare: number;
  byPlan: Array<{
    plan: string;
    interval: string;
    subscribers: number;
    mrr: number;
    arr: number;
    arpu: number;
    percentage: number;
  }>;
  byInterval: Array<{ label: string; subscribers: number; mrr: number; percentage: number }>;
  history: Array<{
    month: string;
    monthKey: string;
    mrr: number;
    arr: number;
    arpu: number;
    activeSubs: number;
    newSubs: number;
    churnedSubs: number;
    newMrr: number;
    churnedMrr: number;
    netNewMrr: number;
    billings: number;
    grr: number;
    growthRate: number;
  }>;
  dataQuality: { totalSubscriptions: number; withoutPrice: number; undatedExits: number };
}

export const fetchRevenue = (start: string, end: string) =>
  apiFetch<RevenueData>("/revenue", start, end);

/* ── Churn ────────────────────────────────────────────────────────────── */

export interface ChurnData {
  totalCancellations: number;
  voluntaryCancellations: number;
  involuntaryCancellations: number;
  mrrLost: number;
  churnRate: number;
  annualizedChurnRate: number;
  revenueChurnRate: number;
  nrr: number;
  grr: number;
  avgLifetimeMonths: number;
  ltv: number | null;
  delinquent: { subscribers: number; mrr: number };
  history: Array<{
    month: string;
    monthKey: string;
    activeStart: number;
    newSubs: number;
    churned: number;
    voluntary: number;
    involuntary: number;
    churnRate: number;
    mrrStart: number;
    mrrChurned: number;
    mrrNew: number;
    revenueChurnRate: number;
    netRevenueChurnRate: number;
    nrr: number;
  }>;
  byPlan: Array<{
    plan: string;
    interval: string;
    activeNow: number;
    churned: number;
    churnRate: number;
    mrrLost: number;
  }>;
  tenureAtChurn: Array<{ bucket: string; count: number; percentage: number }>;
}

export const fetchChurn = (start: string, end: string) => apiFetch<ChurnData>("/churn", start, end);

/* ── Retention (cohorts) ──────────────────────────────────────────────── */

export interface RetentionData {
  cohorts: Array<{
    cohortKey: string;
    cohort: string;
    size: number;
    initialMrr: number;
    cells: Array<{
      offset: number;
      retained: number;
      retentionRate: number;
      mrrRetentionRate: number;
    }>;
  }>;
  maxOffset: number;
  benchmarks: Array<{
    offset: number;
    label: string;
    retentionRate: number;
    cohortsCounted: number;
  }>;
  loyalBaseShare: number;
}

export const fetchRetention = (start: string, end: string) =>
  apiFetch<RetentionData>("/retention", start, end);

/* ── Subscriptions ────────────────────────────────────────────────────── */

export interface SubscriptionsData {
  activeSubscribers: number;
  mrr: number;
  arpu: number;
  newSubscribers: number;
  churnedSubscribers: number;
  netNewSubscribers: number;
  avgTenureMonths: number;
  byStatus: Array<{ status: string; label: string; subscribers: number; mrr: number }>;
  byPlan: Array<{
    plan: string;
    interval: string;
    subscribers: number;
    mrr: number;
    percentage: number;
    arpu: number;
  }>;
  byInterval: Array<{ label: string; subscribers: number; mrr: number; percentage: number }>;
  byProduct: Array<{ product: string; subscribers: number; mrr: number }>;
  tenureBuckets: Array<{ bucket: string; subscribers: number; mrr: number; percentage: number }>;
  acquisitionHistory: Array<{
    month: string;
    monthKey: string;
    total: number;
    plans: Record<string, number>;
  }>;
  topPlans: string[];
  renewals: Array<{
    window: string;
    days: number;
    subscribers: number;
    mrr: number;
    contractValue: number;
  }>;
  upcomingRenewalsByMonth: Array<{
    month: string;
    monthKey: string;
    subscribers: number;
    contractValue: number;
  }>;
  delinquent: { subscribers: number; mrr: number; percentageOfBase: number };
}

export const fetchSubscriptions = (start: string, end: string) =>
  apiFetch<SubscriptionsData>("/subscriptions", start, end);

/* ── Acquisition (UTM origin of paying subscriptions) ─────────────────── */

export interface AcquisitionData {
  totalSubscriptions: number;
  attributed: number;
  attributionRate: number;
  mrrAttributed: number;
  available: boolean;
  months: string[];
  monthLabels: string[];
  bySource: Array<{
    source: string;
    subscribers: number;
    mrr: number;
    percentage: number;
    byMonth: Record<string, number>;
    mediums: Array<{
      medium: string;
      subscribers: number;
      mrr: number;
      byMonth: Record<string, number>;
      campaigns: Array<{
        campaign: string;
        subscribers: number;
        mrr: number;
        byMonth: Record<string, number>;
      }>;
    }>;
  }>;
}

export const fetchAcquisition = (start: string, end: string) =>
  apiFetch<AcquisitionData>("/acquisition", start, end);

/* ── Traffic (Umami) ──────────────────────────────────────────────────── */

export interface UmamiMetric {
  x: string;
  y: number;
}

export interface TrafficData {
  /** False when UMAMI_API_TOKEN / UMAMI_WEBSITE_ID are missing on the server. */
  configured: boolean;
  /** Bucket size Umami was queried with — day for short windows, month for long. */
  unit: "hour" | "day" | "month";
  /** Calls that failed. Empty array means the zeros are real, not a broken query. */
  errors: Array<{ source: string; message: string }>;
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

export const fetchTraffic = (start: string, end: string) =>
  apiFetch<TrafficData>("/traffic", start, end);

/* ── Member profile ───────────────────────────────────────────────────── */

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

export const fetchLeadMap = () => apiFetch<LeadMapData>("/leadmap");

/* ── Data coverage (diagnóstico) ──────────────────────────────────────── */

export interface DataCoverageData {
  floor: string;
  subscriptions: {
    total: number;
    firstAccession: string | null;
    lastAccession: string | null;
    beforeFloor: number;
    mrrBeforeFloor: number;
  };
  byYear: Array<{
    year: string;
    subscriptions: number;
    withPrice: number;
    mrr: number;
    excluded: boolean;
  }>;
  events: {
    total: number;
    firstEvent: string | null;
    lastEvent: string | null;
    byEvent: Array<{ event: string; count: number; first: string | null; last: string | null }>;
  };
}

export const fetchDataCoverage = () => apiFetch<DataCoverageData>("/data-coverage");

/* ── Admin ────────────────────────────────────────────────────────────── */

export async function fetchWebhookStatus() {
  const res = await fetch("/api/webhooks/hotmart/status");
  if (!res.ok) return { error: true, message: `HTTP ${res.status}`, data: null };
  return res.json();
}

/* ── Formatting ───────────────────────────────────────────────────────── */

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBRLExact(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Compact axis label: R$12,5 mil / R$1,2 mi. */
export function formatBRLShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `R$${(value / 1_000).toFixed(0)} mil`;
  return `R$${value.toFixed(0)}`;
}

export function formatPct(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatMonths(value: number): string {
  if (value >= 12) {
    const years = value / 12;
    return `${years.toFixed(1).replace(".", ",")} anos`;
  }
  return `${value.toFixed(1).replace(".", ",")} meses`;
}
