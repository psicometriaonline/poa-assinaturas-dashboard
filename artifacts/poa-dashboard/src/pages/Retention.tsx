import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchChurn,
  fetchRetention,
  formatBRL,
  formatMonths,
  formatNumber,
  formatPct,
  type RetentionData,
} from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import { PageHeader, Panel, ErrorBanner, Stat } from "@/components/Panel";
import {
  CHROME,
  POLARITY,
  SERIES,
  STATUS,
  axisTick,
  legendStyle,
  sequentialColor,
  tooltipProps,
} from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CohortMode = "logo" | "mrr";

function CohortHeatmap({ data, mode }: { data: RetentionData; mode: CohortMode }) {
  const offsets = Array.from({ length: Math.min(data.maxOffset + 1, 13) }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground pr-3 sticky left-0 bg-card">
              Coorte
            </th>
            <th className="text-right font-medium text-muted-foreground pr-3">
              {mode === "logo" ? "Assinantes" : "MRR inicial"}
            </th>
            {offsets.map((k) => (
              <th key={k} className="text-center font-medium text-muted-foreground min-w-[3.25rem]">
                M{k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data.cohorts].reverse().map((cohort) => (
            <tr key={cohort.cohortKey}>
              <td className="pr-3 text-foreground font-medium whitespace-nowrap sticky left-0 bg-card">
                {cohort.cohort}
              </td>
              <td className="pr-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                {mode === "logo" ? formatNumber(cohort.size) : formatBRL(cohort.initialMrr)}
              </td>
              {offsets.map((k) => {
                const cell = cohort.cells.find((c) => c.offset === k);
                if (!cell) {
                  return <td key={k} className="text-center text-muted-foreground/20">·</td>;
                }
                const rate = mode === "logo" ? cell.retentionRate : cell.mrrRetentionRate;
                return (
                  <td
                    key={k}
                    className="text-center rounded tabular-nums text-white py-1.5 px-1"
                    style={{ background: sequentialColor(rate / 100) }}
                    title={`${cohort.cohort} · M${k}: ${formatPct(rate)} (${formatNumber(cell.retained)} de ${formatNumber(cohort.size)})`}
                  >
                    {rate.toFixed(0)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Retention() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;
  const [cohortMode, setCohortMode] = useState<CohortMode>("logo");

  const { data: churnResp, isLoading, isError, error } = useQuery({
    queryKey: ["churn", start, end],
    queryFn: () => fetchChurn(start, end),
  });

  const { data: retentionResp, isLoading: retentionLoading } = useQuery({
    queryKey: ["retention", start, end],
    queryFn: () => fetchRetention(start, end),
  });

  const c = churnResp?.data;
  const r = retentionResp?.data;
  const hasError = isError || churnResp?.error;
  const errMsg = churnResp?.message ?? (error as Error)?.message;

  const reasonData = (c?.history ?? []).map((h) => ({
    month: h.month,
    Voluntário: h.voluntary,
    Inadimplência: h.involuntary,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Churn & Retenção"
        subtitle="Quanto da base e da receita se mantém ao longo do tempo"
      />

      {hasError && <ErrorBanner message={errMsg} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Churn mensal"
          value={c ? formatPct(c.churnRate) : "—"}
          subtitle="cancelamentos / base no início do mês"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Churn anualizado"
          value={c ? formatPct(c.annualizedChurnRate) : "—"}
          subtitle="projeção do churn mensal"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Churn de receita"
          value={c ? formatPct(c.revenueChurnRate) : "—"}
          subtitle={c ? `${formatBRL(c.mrrLost)} de MRR perdido` : undefined}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Cancelamentos"
          value={c ? formatNumber(c.totalCancellations) : "—"}
          subtitle="no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="NRR"
          value={c ? formatPct(c.nrr) : "—"}
          subtitle="retenção líquida de receita"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="GRR"
          value={c ? formatPct(c.grr) : "—"}
          subtitle="retenção bruta de receita"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="LTV estimado"
          value={c?.ltv != null ? formatBRL(c.ltv) : "—"}
          subtitle="ARPU / churn mensal"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Vida média"
          value={c ? formatMonths(c.avgLifetimeMonths) : "—"}
          subtitle="de quem cancelou no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="Churn mensal ao longo do tempo"
          description="Percentual da base que cancelou em cada mês"
          loading={isLoading}
          isEmpty={(c?.history.length ?? 0) === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={c?.history ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatPct(v), "Churn"]} />
              <Line
                type="monotone"
                dataKey="churnRate"
                stroke={STATUS.critical}
                strokeWidth={2}
                dot={{ r: 3, fill: STATUS.critical, stroke: CHROME.surface, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Motivo do cancelamento"
          description="Decisão do cliente vs. falha de pagamento — atacam-se de formas diferentes"
          loading={isLoading}
          isEmpty={reasonData.every((r) => r.Voluntário === 0 && r.Inadimplência === 0)}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={reasonData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                {...tooltipProps}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
              />
              <Legend wrapperStyle={legendStyle} />
              <Bar
                dataKey="Voluntário"
                stackId="reason"
                fill={STATUS.critical}
                maxBarSize={48}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
              <Bar
                dataKey="Inadimplência"
                stackId="reason"
                fill={STATUS.warning}
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
          Retenção média por marco
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          {(r?.benchmarks ?? []).map((b) => (
            <Stat
              key={b.offset}
              label={`Retenção — ${b.label}`}
              value={b.cohortsCounted > 0 ? formatPct(b.retentionRate) : "—"}
              hint={
                b.cohortsCounted > 0
                  ? `média de ${b.cohortsCounted} coorte${b.cohortsCounted > 1 ? "s" : ""}`
                  : "sem coortes maduras"
              }
            />
          ))}
          <Stat
            label="Base fiel (12m+)"
            value={r ? formatPct(r.loyalBaseShare) : "—"}
            hint="assinantes com mais de 1 ano"
            tone="positive"
          />
        </div>
      </section>

      <Panel
        title="Retenção por coorte"
        description="Cada linha é o mês de entrada; M0 é o primeiro mês, M1 o seguinte, e assim por diante"
        loading={retentionLoading}
        isEmpty={(r?.cohorts.length ?? 0) === 0}
        emptyMessage="Sem coortes no período selecionado"
        height={320}
        action={
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1 shrink-0">
            {(
              [
                { key: "logo", label: "Assinantes" },
                { key: "mrr", label: "Receita" },
              ] as { key: CohortMode; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setCohortMode(t.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  cohortMode === t.key
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {r && <CohortHeatmap data={r} mode={cohortMode} />}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="Tempo até o cancelamento"
          description="Há quanto tempo assinavam os que cancelaram no período"
          loading={isLoading}
          isEmpty={(c?.tenureAtChurn ?? []).every((t) => t.count === 0)}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={c?.tenureAtChurn ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="bucket" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                {...tooltipProps}
                formatter={(v: number) => [formatNumber(v), "Cancelamentos"]}
              />
              <Bar
                dataKey="count"
                fill={SERIES[1]}
                maxBarSize={48}
                radius={[4, 4, 0, 0]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="NRR mês a mês"
          description="Acima de 100% significa que as novas vendas superaram as perdas"
          loading={isLoading}
          isEmpty={(c?.history.length ?? 0) === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={c?.history ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatPct(v), "NRR"]} />
              <Line
                type="monotone"
                dataKey="nrr"
                stroke={POLARITY.positive}
                strokeWidth={2}
                dot={{ r: 3, fill: POLARITY.positive, stroke: CHROME.surface, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {c && c.byPlan.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Churn por plano</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Taxa calculada sobre ativos + cancelados do plano no período
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border text-xs">
                  <th className="pb-2 font-medium">Plano</th>
                  <th className="pb-2 font-medium">Periodicidade</th>
                  <th className="pb-2 font-medium text-right">Ativos</th>
                  <th className="pb-2 font-medium text-right">Cancelados</th>
                  <th className="pb-2 font-medium text-right">Taxa</th>
                  <th className="pb-2 font-medium text-right">MRR perdido</th>
                </tr>
              </thead>
              <tbody>
                {c.byPlan.map((p) => (
                  <tr key={`${p.plan}-${p.interval}`} className="border-b border-border/50">
                    <td className="py-2.5">{p.plan}</td>
                    <td className="py-2.5 text-muted-foreground">{p.interval}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(p.activeNow)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(p.churned)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatPct(p.churnRate)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRL(p.mrrLost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
