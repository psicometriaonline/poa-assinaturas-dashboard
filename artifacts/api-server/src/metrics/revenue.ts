import { getAllActiveSubscriptions, getAllSubscriptionsByStatus, getSubscriptions, type HotmartSubscription } from "../sources/hotmart";

export interface RevenueMetrics {
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
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function inRange(ts: number | undefined, start: number, end: number): boolean {
  if (!ts) return false;
  return ts >= start && ts <= end;
}

function planName(s: HotmartSubscription): string {
  return s.plan?.name ?? s.product?.name ?? "Sem plano";
}

export async function getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics> {
  const [activeSubscriptions, allCancelled, allDelayed, allInactive] = await Promise.all([
    getAllActiveSubscriptions(),
    getAllSubscriptionsByStatus("CANCELLED"),
    getAllSubscriptionsByStatus("DELAYED"),
    getAllSubscriptionsByStatus("INACTIVE"),
  ]);

  const allNonActive = [...allCancelled, ...allDelayed, ...allInactive];

  const totalSubscribers = activeSubscriptions.length;
  const mrr = activeSubscriptions.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
  const arr = mrr * 12;
  const arpu = totalSubscribers > 0 ? mrr / totalSubscribers : 0;

  const byPlanMap: Record<string, { subscribers: number; revenue: number }> = {};
  for (const sub of activeSubscriptions) {
    const plan = planName(sub);
    if (!byPlanMap[plan]) byPlanMap[plan] = { subscribers: 0, revenue: 0 };
    byPlanMap[plan].subscribers += 1;
    byPlanMap[plan].revenue += sub.price?.value ?? 0;
  }

  const byPlan = Object.entries(byPlanMap).map(([plan, data]) => ({
    plan,
    subscribers: data.subscribers,
    revenue: data.revenue,
    percentage: mrr > 0 ? (data.revenue / mrr) * 100 : 0,
  }));

  const history: RevenueMetrics["history"] = [];
  let runningTotal = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const monthStart = startOfMonth(current);
    const monthEnd = endOfMonth(current);
    const startTs = monthStart.getTime();
    const endTs = monthEnd.getTime();

    const activeSubs = await getSubscriptions("ACTIVE", startTs, endTs);

    const churnedThisMonth = allNonActive.filter(s => {
      const ts = s.cancellation_date ?? s.accession_date;
      return inRange(ts, startTs, endTs);
    });

    const newSubs = activeSubs.length;
    const churnedSubs = churnedThisMonth.length;
    runningTotal = Math.max(0, runningTotal + newSubs - churnedSubs);

    const monthMrr = activeSubs.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
    const churnBase = runningTotal + churnedSubs;
    const churnRate = churnBase > 0 ? (churnedSubs / churnBase) * 100 : 0;

    const monthByPlan: Record<string, number> = {};
    for (const sub of activeSubs) {
      const plan = planName(sub);
      monthByPlan[plan] = (monthByPlan[plan] ?? 0) + (sub.price?.value ?? 0);
    }

    history.push({
      month: monthLabel(current),
      mrr: monthMrr,
      arr: monthMrr * 12,
      arpu: newSubs > 0 ? monthMrr / newSubs : 0,
      newSubs,
      churnedSubs,
      totalSubs: runningTotal,
      churnRate: parseFloat(churnRate.toFixed(2)),
      byPlan: monthByPlan,
    });

    current.setMonth(current.getMonth() + 1);
  }

  const totalRevenue = history.reduce((sum, h) => sum + h.mrr, 0);

  return { mrr, arr, arpu, totalSubscribers, totalRevenue, byPlan, history };
}
