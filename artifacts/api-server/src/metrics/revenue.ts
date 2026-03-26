import { getAllActiveSubscriptions, getSubscriptions } from "../sources/hotmart";

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  totalSubscribers: number;
  byPlan: Array<{ plan: string; subscribers: number; revenue: number; percentage: number }>;
  history: Array<{ month: string; mrr: number; arr: number; arpu: number; byPlan: Record<string, number> }>;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export async function getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics> {
  const activeSubscriptions = await getAllActiveSubscriptions();

  const totalSubscribers = activeSubscriptions.length;
  const mrr = activeSubscriptions.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
  const arr = mrr * 12;
  const arpu = totalSubscribers > 0 ? mrr / totalSubscribers : 0;

  const byPlanMap: Record<string, { subscribers: number; revenue: number }> = {};
  for (const sub of activeSubscriptions) {
    const plan = sub.plan?.name ?? sub.product?.name ?? "Sem plano";
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
  const current = new Date(startDate);
  while (current <= endDate) {
    const monthStart = startOfMonth(current);
    const monthEnd = endOfMonth(current);

    const monthSubs = await getSubscriptions(
      "ACTIVE",
      monthStart.getTime(),
      monthEnd.getTime()
    );

    const monthMrr = monthSubs.reduce((sum, s) => sum + (s.price?.value ?? 0), 0);
    const monthCount = monthSubs.length;
    const monthByPlan: Record<string, number> = {};

    for (const sub of monthSubs) {
      const plan = sub.plan?.name ?? sub.product?.name ?? "Sem plano";
      monthByPlan[plan] = (monthByPlan[plan] ?? 0) + (sub.price?.value ?? 0);
    }

    history.push({
      month: monthLabel(current),
      mrr: monthMrr,
      arr: monthMrr * 12,
      arpu: monthCount > 0 ? monthMrr / monthCount : 0,
      byPlan: monthByPlan,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return { mrr, arr, arpu, totalSubscribers, byPlan, history };
}
