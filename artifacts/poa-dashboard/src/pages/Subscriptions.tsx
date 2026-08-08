import { useQuery } from "@tanstack/react-query";
import {
  fetchRevenue,
  fetchSubscriptions,
  formatBRL,
  formatMonths,
  formatNumber,
  formatPct,
} from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import { PageHeader, Panel, ErrorBanner, Stat } from "@/components/Panel";
import {
  CHROME,
  SERIES,
  axisTick,
  legendStyle,
  seriesColor,
  tooltipProps,
} from "@/lib/chart-theme";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function Subscriptions() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["subscriptions", start, end],
    queryFn: () => fetchSubscriptions(start, end),
  });

  const { data: revenueResp, isLoading: revenueLoading } = useQuery({
    queryKey: ["revenue", start, end],
    queryFn: () => fetchRevenue(start, end),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;
  const baseHistory = revenueResp?.data?.history ?? [];

  const acquisitionData = (d?.acquisitionHistory ?? []).map((h) => ({
    month: h.month,
    ...h.plans,
  }));
  const acquisitionPlans = Array.from(
    new Set((d?.acquisitionHistory ?? []).flatMap((h) => Object.keys(h.plans)))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinaturas"
        subtitle="Composição, crescimento e renovações da base pagante"
      />

      {hasError && <ErrorBanner message={errMsg} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Assinantes ativos"
          value={d ? formatNumber(d.activeSubscribers) : "—"}
          subtitle={d ? `${formatBRL(d.mrr)} de MRR` : undefined}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Novas no período"
          value={d ? formatNumber(d.newSubscribers) : "—"}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Canceladas no período"
          value={d ? formatNumber(d.churnedSubscribers) : "—"}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Permanência média"
          value={d ? formatMonths(d.avgTenureMonths) : "—"}
          subtitle="da base ativa hoje"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <Panel
        title="Base ativa ao longo do tempo"
        description="Assinantes pagando ao final de cada mês"
        loading={revenueLoading}
        isEmpty={baseHistory.length === 0}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={baseHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
            <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number) => [formatNumber(v), "Assinantes ativos"]}
            />
            <Area
              type="monotone"
              dataKey="activeSubs"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#gradBase)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Novas assinaturas por plano"
        description="Mix de aquisição mês a mês"
        loading={isLoading}
        isEmpty={acquisitionData.length === 0}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={acquisitionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
            <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number, name: string) => [formatNumber(v), name]}
            />
            <Legend wrapperStyle={legendStyle} />
            {acquisitionPlans.map((plan, i) => (
              <Bar
                key={plan}
                dataKey={plan}
                stackId="plans"
                fill={seriesColor(i)}
                maxBarSize={48}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="Assinantes por plano"
          loading={isLoading}
          isEmpty={(d?.byPlan.length ?? 0) === 0}
          height={Math.max(220, (d?.byPlan.length ?? 3) * 46)}
        >
          <ResponsiveContainer width="100%" height={Math.max(220, (d?.byPlan.length ?? 3) * 46)}>
            <BarChart
              data={d?.byPlan ?? []}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="plan"
                width={170}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 26)}…` : v)}
              />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatNumber(v), "Assinantes"]} />
              <Bar dataKey="subscribers" maxBarSize={28} radius={[0, 4, 4, 0]}>
                {(d?.byPlan ?? []).map((entry, i) => (
                  <Cell key={entry.plan} fill={seriesColor(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Tempo de casa da base ativa"
          description="Quanto mais peso à direita, mais estável é a carteira"
          loading={isLoading}
          isEmpty={(d?.tenureBuckets.length ?? 0) === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d?.tenureBuckets ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="bucket" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                {...tooltipProps}
                formatter={(v: number) => [formatNumber(v), "Assinantes"]}
              />
              <Bar
                dataKey="subscribers"
                fill={SERIES[0]}
                maxBarSize={48}
                radius={[4, 4, 0, 0]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Renovações e risco
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {(d?.renewals ?? []).map((r) => (
            <Stat
              key={r.days}
              label={r.window}
              value={formatNumber(r.subscribers)}
              hint={`${formatBRL(r.contractValue)} em contratos`}
            />
          ))}
          <Stat
            label="Inadimplentes"
            value={d ? formatNumber(d.delinquent.subscribers) : "—"}
            hint={
              d
                ? `${formatBRL(d.delinquent.mrr)} recuperáveis · ${formatPct(d.delinquent.percentageOfBase)} da base`
                : undefined
            }
            tone={d && d.delinquent.subscribers > 0 ? "negative" : "neutral"}
          />
        </div>
      </section>

      <Panel
        title="Renovações previstas nos próximos 12 meses"
        description="Baseado na próxima cobrança de cada assinatura ativa"
        loading={isLoading}
        isEmpty={(d?.upcomingRenewalsByMonth.length ?? 0) === 0}
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={d?.upcomingRenewalsByMonth ?? []}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
            <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              {...tooltipProps}
              formatter={(value: number, _name: string, item: { payload?: { contractValue?: number } }) => [
                `${formatNumber(value)} assinaturas · ${formatBRL(item?.payload?.contractValue ?? 0)}`,
                "A renovar",
              ]}
            />
            <Bar
              dataKey="subscribers"
              fill={SERIES[3]}
              maxBarSize={48}
              radius={[4, 4, 0, 0]}
              stroke={CHROME.surface}
              strokeWidth={2}
            />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {d && d.byStatus.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Situação de todas as assinaturas</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Inclui o histórico completo — apenas &quot;Ativo&quot; contribui para o MRR
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border text-xs">
                <th className="pb-2 font-medium">Situação</th>
                <th className="pb-2 font-medium text-right">Assinaturas</th>
                <th className="pb-2 font-medium text-right">MRR associado</th>
              </tr>
            </thead>
            <tbody>
              {d.byStatus.map((s) => (
                <tr key={s.status} className="border-b border-border/50">
                  <td className="py-2.5">{s.label}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatNumber(s.subscribers)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {s.status === "ACTIVE" ? formatBRL(s.mrr) : `(${formatBRL(s.mrr)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
