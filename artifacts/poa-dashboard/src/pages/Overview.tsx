import { useQuery } from "@tanstack/react-query";
import {
  fetchOverview,
  formatBRL,
  formatBRLShort,
  formatMonths,
  formatNumber,
  formatPct,
} from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import { PageHeader, Panel, ErrorBanner } from "@/components/Panel";
import { POLARITY, SERIES, axisTick, legendStyle, tooltipProps, CHROME } from "@/lib/chart-theme";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

  const movementData = (d?.history ?? []).map((h) => ({
    month: h.month,
    Novas: h.newSubs,
    Cancelamentos: -h.churnedSubs,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão Geral"
        subtitle="Assinaturas pagas — Hotmart. Todos os indicadores respeitam o período selecionado."
      />

      {hasError && <ErrorBanner message={errMsg} />}

      {/* Receita recorrente */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Receita recorrente
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            title="MRR"
            value={d ? formatBRL(d.mrr) : "—"}
            change={d?.mrrChangePct}
            subtitle="no período"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="ARR"
            value={d ? formatBRL(d.arr) : "—"}
            subtitle="MRR × 12"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="Net New MRR"
            value={d ? formatBRL(d.netNewMrr) : "—"}
            subtitle="novo − cancelado"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="ARPU"
            value={d ? formatBRL(d.arpu) : "—"}
            subtitle="MRR por assinante"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
        </div>
      </section>

      {/* Base de assinantes */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Base de assinantes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            title="Assinantes ativos"
            value={d ? formatNumber(d.activeSubscribers) : "—"}
            subtitle="pagando agora"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="Novas assinaturas"
            value={d ? formatNumber(d.newSubscribers) : "—"}
            subtitle="no período"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="Cancelamentos"
            value={d ? formatNumber(d.cancellations) : "—"}
            subtitle={
              d
                ? `${formatNumber(d.voluntaryCancellations)} voluntários · ${formatNumber(d.involuntaryCancellations)} inadimplência`
                : "no período"
            }
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
            invertChange
          />
          <KPICard
            title="Crescimento líquido"
            value={d ? formatNumber(d.netNewSubscribers) : "—"}
            subtitle="novas − canceladas"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
        </div>
      </section>

      {/* Retenção */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Retenção
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            title="Churn mensal"
            value={d ? formatPct(d.churnRate) : "—"}
            subtitle={d ? `${formatPct(d.annualizedChurnRate)} ao ano` : "média do período"}
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
            invertChange
          />
          <KPICard
            title="Churn de receita"
            value={d ? formatPct(d.revenueChurnRate) : "—"}
            subtitle="MRR perdido / MRR inicial"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
            invertChange
          />
          <KPICard
            title="NRR"
            value={d ? formatPct(d.nrr) : "—"}
            subtitle="retenção líquida de receita"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="LTV estimado"
            value={d?.ltv != null ? formatBRL(d.ltv) : "—"}
            subtitle={d ? `permanência média ${formatMonths(d.avgTenureMonths)}` : "ARPU / churn"}
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
        </div>
      </section>

      {/* Risco e caixa */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Risco e caixa
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            title="Inadimplentes"
            value={d ? formatNumber(d.delinquentSubscribers) : "—"}
            subtitle={d ? `${formatBRL(d.delinquentMrr)} de MRR recuperável` : "pagamento atrasado"}
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
            invertChange
          />
          <KPICard
            title="Renovações em 30 dias"
            value={d ? formatNumber(d.renewals30d.subscribers) : "—"}
            subtitle={d ? `${formatBRL(d.renewals30d.contractValue)} em contratos` : "próximas cobranças"}
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="Caixa no período"
            value={d ? formatBRL(d.billings) : "—"}
            subtitle="valores efetivamente cobrados"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
          <KPICard
            title="MRR em planos anuais"
            value={d ? formatPct(d.annualMrrShare) : "—"}
            subtitle="parcela travada por 12 meses"
            loading={isLoading}
            error={!!hasError}
            errorMessage={errMsg}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="Evolução do MRR"
          description="Saldo real da base ao final de cada mês"
          loading={isLoading}
          isEmpty={(d?.history.length ?? 0) === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.history ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMrr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatBRLShort}
              />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatBRL(v), "MRR"]} />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke={SERIES[0]}
                strokeWidth={2}
                fill="url(#gradMrr)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Novas assinaturas vs. cancelamentos"
          description="Cancelamentos abaixo da linha zero"
          loading={isLoading}
          isEmpty={movementData.length === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={movementData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={(v: number) => formatNumber(Math.abs(v))}
              />
              <Tooltip
                {...tooltipProps}
                formatter={(v: number, name: string) => [formatNumber(Math.abs(v)), name]}
              />
              <Legend wrapperStyle={legendStyle} />
              <Bar
                dataKey="Novas"
                fill={POLARITY.positive}
                maxBarSize={40}
                radius={[4, 4, 0, 0]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
              <Bar
                dataKey="Cancelamentos"
                fill={POLARITY.negative}
                maxBarSize={40}
                radius={[0, 0, 4, 4]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {d && d.dataQuality.undatedExits > 0 && (
        <p className="text-xs text-muted-foreground">
          Nota de qualidade de dados: {formatNumber(d.dataQuality.undatedExits)} de{" "}
          {formatNumber(d.dataQuality.totalSubscriptions)} assinaturas encerradas não têm data de
          cancelamento registrada e ficam fora da série temporal (continuam contadas como inativas).
          {d.dataQuality.withoutPrice > 0 &&
            ` ${formatNumber(d.dataQuality.withoutPrice)} assinaturas não têm valor e contribuem R$ 0 para o MRR.`}
        </p>
      )}
    </div>
  );
}
