import { getSubscriptions } from "../sources/hotmart";

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

export async function getChurnMetrics(startDate: Date, endDate: Date): Promise<ChurnMetrics> {
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

    const [cancelled, overdue, inactive, active] = await Promise.all([
      getSubscriptions("CANCELLED", startTs, endTs),
      getSubscriptions("OVERDUE", startTs, endTs),
      getSubscriptions("INACTIVE", startTs, endTs),
      getSubscriptions("ACTIVE", startTs, endTs),
    ]);

    const monthVoluntary = cancelled.length;
    const monthInvoluntary = overdue.length + inactive.length;
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
