import { useQuery } from "@tanstack/react-query";
import { fetchOverview, fetchRevenue, fetchWebhookStatus, formatBRL, formatPct, formatNumber } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";
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
    <div className="bg-card border border-card-border rounded-xl p-5">
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

function WebhookBanner() {
  const { data } = useQuery({
    queryKey: ["webhook-status"],
    queryFn: fetchWebhookStatus,
    retry: false,
  });

  const subs = data?.data?.subscriptions ?? [];
  const totalFromWebhooks = subs.reduce((sum, s) => sum + parseInt(s.count, 10), 0);
  const hasWebhookData = totalFromWebhooks > 0;

  if (hasWebhookData) return null;

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 flex gap-3 items-start">
      <span className="text-yellow-400 text-lg mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-yellow-300">Webhooks do Hotmart ainda não configurados</p>
        <p className="text-xs text-yellow-400/80 mt-1">
          Para receber dados completos dos seus 765 assinantes, configure o webhook no Hotmart apontando para:
        </p>
        <code className="text-xs bg-yellow-500/10 text-yellow-200 px-2 py-1 rounded mt-2 block break-all">
          {window.location.origin}/api/webhooks/hotmart
        </code>
        <p className="text-xs text-yellow-400/60 mt-1">
          Hotmart → Ferramentas → Webhooks → Adicionar URL de notificação
        </p>
      </div>
    </div>
  );
}

export default function Overview() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  const ds = d?.dataSource;
  const activeSubtitle = ds
    ? `${ds.apiActive} API${ds.webhookActive > 0 ? ` + ${ds.webhookActive} webhook` : ""}`
    : "assinantes ativos";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">Resumo de métricas do mês atual</p>
      </div>

      <WebhookBanner />

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <KPICard
          title="MRR Atual"
          value={d ? formatBRL(d.mrr) : "—"}
          change={d?.mrrChange}
          subtitle="vs. mês anterior"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Assinantes Ativos"
          value={d ? formatNumber(d.activeSubscribers ?? 0) : "—"}
          subtitle={activeSubtitle}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Novos Assinantes"
          value={d ? formatNumber(d.newSubscribers) : "—"}
          subtitle="este mês"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Cancelamentos"
          value={d ? formatNumber(d.cancellations) : "—"}
          subtitle="este mês"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Churn Rate"
          value={d ? formatPct(d.churnRate) : "—"}
          subtitle="do total de assinantes"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Taxa de Conversão"
          value={d ? formatPct(d.conversionRate) : "—"}
          subtitle="cadastro → pago"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <MrrChart />
    </div>
  );
}
