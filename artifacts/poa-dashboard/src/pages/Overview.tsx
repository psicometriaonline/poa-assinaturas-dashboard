import { useQuery } from "@tanstack/react-query";
import { fetchOverview, fetchRevenue, formatBRL, formatPct, formatNumber } from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLOR = "#3b82f6";

function MrrChart() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data, isLoading } = useQuery({
    queryKey: ["revenue", start, end],
    queryFn: () => fetchRevenue(start, end),
  });

  if (isLoading) return <div className="h-56 bg-muted rounded animate-pulse" />;

  const chartData = data?.data?.history ?? [];

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Evolução do MRR</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(v: number) => [formatBRL(v), "MRR"]}
          />
          <Line type="monotone" dataKey="mrr" stroke={CHART_COLOR} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Overview() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["overview", start, end],
    queryFn: () => fetchOverview(start, end),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">Métricas baseadas na planilha importada e webhooks em tempo real</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <KPICard
          title="MRR Atual"
          value={d ? formatBRL(d.mrr) : "—"}
          subtitle="receita mensal recorrente"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="ARR"
          value={d ? formatBRL(d.arr ?? d.mrr * 12) : "—"}
          subtitle="MRR × 12"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Total de Assinantes"
          value={d ? formatNumber(d.totalSubscribers ?? 0) : "—"}
          subtitle="todos os status"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Assinantes Ativos"
          value={d ? formatNumber(d.activeSubscribers ?? 0) : "—"}
          subtitle="status ativo · agora"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Atrasados"
          value={d ? formatNumber(d.pastDueSubscribers ?? 0) : "—"}
          subtitle="pagamento pendente"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Cancelados / Inativos"
          value={d ? formatNumber(d.inactiveSubscribers ?? 0) : "—"}
          subtitle="não estão mais ativos"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Novas Assinaturas"
          value={d ? formatNumber(d.newSubscribers ?? 0) : "—"}
          subtitle="adesões no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Cancelamentos"
          value={d ? formatNumber(d.cancellations ?? 0) : "—"}
          subtitle="cancelados no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Churn Rate"
          value={d ? formatPct(d.churnRate ?? 0) : "—"}
          subtitle="cancelamentos / total"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Taxa de Conversão"
          value={d ? formatPct(d.conversionRate ?? 0) : "—"}
          subtitle="cadastro → assinante"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <MrrChart />
    </div>
  );
}
