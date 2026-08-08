import { getRevenueMetrics } from "./revenue";
import { getChurnMetrics } from "./churn";
import { getSubscriptionsMetrics } from "./subscriptions";

export interface OverviewMetrics {
  // Receita
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

  // Base
  activeSubscribers: number;
  newSubscribers: number;
  cancellations: number;
  netNewSubscribers: number;
  avgTenureMonths: number;

  // Retenção
  churnRate: number;
  annualizedChurnRate: number;
  revenueChurnRate: number;
  nrr: number;
  grr: number;
  ltv: number | null;
  voluntaryCancellations: number;
  involuntaryCancellations: number;

  // Risco
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

  dataQuality: {
    totalSubscriptions: number;
    withoutPrice: number;
    undatedExits: number;
  };
}

/**
 * The overview composes the same functions the dedicated pages use rather than
 * re-implementing the SQL. Previously each page derived its own MRR and churn,
 * which is how the dashboard ended up showing three different churn rates.
 */
export async function getOverviewMetrics(
  startDate: Date,
  endDate: Date
): Promise<OverviewMetrics> {
  const [revenue, churn, subscriptions] = await Promise.all([
    getRevenueMetrics(startDate, endDate),
    getChurnMetrics(startDate, endDate),
    getSubscriptionsMetrics(startDate, endDate),
  ]);

  const renewals30d = subscriptions.renewals.find((r) => r.days === 30);

  return {
    mrr: revenue.mrr,
    arr: revenue.arr,
    arpu: revenue.arpu,
    mrrAtStart: revenue.mrrAtStart,
    mrrChange: revenue.mrrChange,
    mrrChangePct: revenue.mrrChangePct,
    newMrr: revenue.newMrr,
    churnedMrr: revenue.churnedMrr,
    netNewMrr: revenue.netNewMrr,
    billings: revenue.billings,
    annualMrrShare: revenue.annualMrrShare,
    quickRatio: revenue.quickRatio,

    activeSubscribers: revenue.activeSubscribers,
    newSubscribers: subscriptions.newSubscribers,
    cancellations: subscriptions.churnedSubscribers,
    netNewSubscribers: subscriptions.netNewSubscribers,
    avgTenureMonths: subscriptions.avgTenureMonths,

    churnRate: churn.churnRate,
    annualizedChurnRate: churn.annualizedChurnRate,
    revenueChurnRate: churn.revenueChurnRate,
    nrr: churn.nrr,
    grr: churn.grr,
    ltv: churn.ltv,
    voluntaryCancellations: churn.voluntaryCancellations,
    involuntaryCancellations: churn.involuntaryCancellations,

    delinquentSubscribers: subscriptions.delinquent.subscribers,
    delinquentMrr: subscriptions.delinquent.mrr,
    renewals30d: {
      subscribers: renewals30d?.subscribers ?? 0,
      contractValue: renewals30d?.contractValue ?? 0,
    },

    history: revenue.history.map((h) => ({
      month: h.month,
      monthKey: h.monthKey,
      mrr: h.mrr,
      arr: h.arr,
      activeSubs: h.activeSubs,
      newSubs: h.newSubs,
      churnedSubs: h.churnedSubs,
      netNewMrr: h.netNewMrr,
    })),

    dataQuality: revenue.dataQuality,
  };
}
