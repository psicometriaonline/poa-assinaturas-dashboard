import { getAllSubscriptionsByStatus, getSubscriptions, type HotmartSubscription } from "../sources/hotmart";

export interface ChurnMetrics {
  totalCancellations: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  churnRate: number;
  history: Array<{
    month: string;
    total: number;
    voluntary: number;
    involuntary: number;
    churnRate: number;
  }>;
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

function inRange(s: HotmartSubscription, start: number, end: number): boolean {
  const ts = s.cancellation_date ?? s.accession_date;
  if (!ts) return false;
  return ts >= start && ts <= end;
}

export async function getChurnMetrics(startDate: Date, endDate: Date): Promise<ChurnMetrics> {
  const [allCancelled, allDelayed, allInactive] = await Promise.all([
    getAllSubscriptionsByStatus("CANCELLED"),
    getAllSubscriptionsByStatus("DELAYED"),
    getAllSubscriptionsByStatus("INACTIVE"),
  ]);

  const history: ChurnMetrics["history"] = [];
  let totalCancellations = 0;
  let voluntaryChurn = 0;
  let involuntaryChurn = 0;

  const current = new Date(startDate);
  while (current <= endDate) {
    const monthStart = startOfMonth(current);
    const monthEnd = endOfMonth(current);
    const startTs = monthStart.getTime();
    const endTs = monthEnd.getTime();

    const monthCancelled = allCancelled.filter(s => inRange(s, startTs, endTs));
    const monthDelayed = allDelayed.filter(s => inRange(s, startTs, endTs));
    const monthInactive = allInactive.filter(s => inRange(s, startTs, endTs));

    const active = await getSubscriptions("ACTIVE", startTs, endTs);

    const monthVoluntary = monthCancelled.length;
    const monthInvoluntary = monthDelayed.length + monthInactive.length;
    const monthTotal = monthVoluntary + monthInvoluntary;
    const totalBase = active.length + monthTotal;
    const churnRate = totalBase > 0 ? (monthTotal / totalBase) * 100 : 0;

    totalCancellations += monthTotal;
    voluntaryChurn += monthVoluntary;
    involuntaryChurn += monthInvoluntary;

    history.push({
      month: monthLabel(current),
      total: monthTotal,
      voluntary: monthVoluntary,
      involuntary: monthInvoluntary,
      churnRate: parseFloat(churnRate.toFixed(2)),
    });

    current.setMonth(current.getMonth() + 1);
  }

  const lastMonth = history[history.length - 1];
  const churnRate = lastMonth?.churnRate ?? 0;

  return { totalCancellations, voluntaryChurn, involuntaryChurn, churnRate, history };
}
