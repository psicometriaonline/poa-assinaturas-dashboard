import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRevenue,
  formatBRL,
  formatBRLExact,
  formatBRLShort,
  formatNumber,
  formatPct,
} from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import { PageHeader, Panel, ErrorBanner } from "@/components/Panel";
import { GranularityToggle } from "@/components/GranularityToggle";
import { defaultGranularity, rollUpByYear, type Granularity } from "@/lib/time-grouping";
import {
  CHROME,
  POLARITY,
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

type ScaleTab = "mrr" | "arr";

export default function Revenue() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;
  const [scale, setScale] = useState<ScaleTab>("mrr");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["revenue", start, end],
    queryFn: () => fetchRevenue(start, end),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;
  const history = d?.history ?? [];

  const [granularity, setGranularity] = useState<Granularity | null>(null);
  const effectiveGranularity = granularity ?? defaultGranularity(history.length);
  const byYear = effectiveGranularity === "ano";

  const movementData = useMemo(() => {
    const rows = history.map((h) => ({
      monthKey: h.monthKey,
      label: h.month,
      "Novo MRR": h.newMrr,
      "MRR cancelado": -h.churnedMrr,
    }));
    return byYear ? rollUpByYear(rows, ["Novo MRR", "MRR cancelado"]) : rows;
  }, [history, byYear]);

  // MRR and ARR are stocks: rolled up to a year they take the closing value,
  // never a sum. Billings is a flow and is summed.
  const scaleData = useMemo(() => {
    const rows = history.map((h) => ({
      monthKey: h.monthKey,
      label: h.month,
      mrr: h.mrr,
      arr: h.arr,
    }));
    return byYear ? rollUpByYear(rows, [], ["mrr", "arr"]) : rows;
  }, [history, byYear]);

  const billingsData = useMemo(() => {
    const rows = history.map((h) => ({
      monthKey: h.monthKey,
      label: h.month,
      billings: h.billings,
    }));
    return byYear ? rollUpByYear(rows, ["billings"]) : rows;
  }, [history, byYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receita"
        subtitle="MRR, ARR e caixa das assinaturas pagas"
      />

      {hasError && <ErrorBanner message={errMsg} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="MRR atual"
          value={d ? formatBRL(d.mrr) : "—"}
          change={d?.mrrChangePct}
          subtitle={d ? `de ${formatBRL(d.mrrAtStart)} no início do período` : undefined}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="ARR projetado"
          value={d ? formatBRL(d.arr) : "—"}
          subtitle="MRR × 12"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="ARPU"
          value={d ? formatBRL(d.arpu) : "—"}
          subtitle={d ? `${formatNumber(d.activeSubscribers)} assinantes ativos` : undefined}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Quick Ratio"
          value={d?.quickRatio != null ? d.quickRatio.toFixed(2).replace(".", ",") : "—"}
          subtitle="novo MRR / MRR cancelado"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Novo MRR"
          value={d ? formatBRL(d.newMrr) : "—"}
          subtitle="adicionado no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="MRR cancelado"
          value={d ? formatBRL(d.churnedMrr) : "—"}
          subtitle="perdido no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
        <KPICard
          title="Caixa (billings)"
          value={d ? formatBRL(d.billings) : "—"}
          subtitle="cobranças aprovadas no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="GRR"
          value={d ? formatPct(d.grr) : "—"}
          subtitle="receita bruta retida"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <Panel
        title={scale === "mrr" ? "Evolução do MRR" : "Evolução do ARR"}
        description={
          byYear
            ? "Medido no fechamento de cada ano, não acumulado"
            : "Medido no último instante de cada mês, não acumulado"
        }
        loading={isLoading}
        isEmpty={scaleData.length === 0}
        action={
          <div className="flex items-center gap-2 shrink-0">
            <GranularityToggle value={effectiveGranularity} onChange={setGranularity} />
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1 shrink-0">
            {(["mrr", "arr"] as ScaleTab[]).map((key) => (
              <button
                key={key}
                onClick={() => setScale(key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  scale === key
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={scaleData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatBRLShort} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number) => [formatBRL(v), scale.toUpperCase()]}
            />
            <Area
              type="monotone"
              dataKey={scale}
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#gradRevenue)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="Movimentação de MRR"
          description={byYear ? "Quanto entrou e saiu em cada ano" : "Quanto entrou e saiu em cada mês"}
          loading={isLoading}
          isEmpty={movementData.length === 0}
          action={<GranularityToggle value={effectiveGranularity} onChange={setGranularity} />}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={movementData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatBRLShort(Math.abs(v))}
              />
              <Tooltip
                {...tooltipProps}
                formatter={(v: number, name: string) => [formatBRL(Math.abs(v)), name]}
              />
              <Legend wrapperStyle={legendStyle} />
              <Bar
                dataKey="Novo MRR"
                fill={POLARITY.positive}
                maxBarSize={40}
                radius={[4, 4, 0, 0]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
              <Bar
                dataKey="MRR cancelado"
                fill={POLARITY.negative}
                maxBarSize={40}
                radius={[0, 0, 4, 4]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title={byYear ? "Caixa recebido por ano" : "Caixa recebido por mês"}
          description="Cobranças aprovadas — dinheiro que entrou, não receita reconhecida"
          loading={isLoading}
          isEmpty={billingsData.every((h) => h.billings === 0)}
          emptyMessage="Sem cobranças registradas via webhook no período"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={billingsData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatBRLShort} />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatBRL(v), "Caixa"]} />
              <Bar
                dataKey="billings"
                fill={SERIES[1]}
                maxBarSize={40}
                radius={[4, 4, 0, 0]}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <Panel
          title="MRR por plano"
          description={d ? `${formatBRL(d.mrr)} distribuídos entre ${d.byPlan.length} planos` : undefined}
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
              <XAxis
                type="number"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatBRLShort}
              />
              <YAxis
                type="category"
                dataKey="plan"
                width={170}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 26)}…` : v)}
              />
              <Tooltip {...tooltipProps} formatter={(v: number) => [formatBRL(v), "MRR"]} />
              <Bar dataKey="mrr" maxBarSize={28} radius={[0, 4, 4, 0]}>
                {(d?.byPlan ?? []).map((entry, i) => (
                  <Cell key={entry.plan} fill={seriesColor(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="MRR por periodicidade"
          description={d ? `${formatPct(d.annualMrrShare)} do MRR está em contratos anuais` : undefined}
          loading={isLoading}
          isEmpty={(d?.byInterval.length ?? 0) === 0}
        >
          <div className="space-y-4">
            {(d?.byInterval ?? []).map((row, i) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: seriesColor(i) }}
                    />
                    {row.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBRL(row.mrr)} · {formatNumber(row.subscribers)} assinantes
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${row.percentage}%`, background: seriesColor(i) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {d && d.byPlan.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Detalhe por plano</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border text-xs">
                  <th className="pb-2 font-medium">Plano</th>
                  <th className="pb-2 font-medium">Periodicidade</th>
                  <th className="pb-2 font-medium text-right">Assinantes</th>
                  <th className="pb-2 font-medium text-right">MRR</th>
                  <th className="pb-2 font-medium text-right">ARR</th>
                  <th className="pb-2 font-medium text-right">ARPU</th>
                  <th className="pb-2 font-medium text-right">% do MRR</th>
                </tr>
              </thead>
              <tbody>
                {d.byPlan.map((p, i) => (
                  <tr key={p.plan} className="border-b border-border/50">
                    <td className="py-2.5 flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: seriesColor(i) }}
                      />
                      {p.plan}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{p.interval}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(p.subscribers)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRLExact(p.mrr)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRL(p.arr)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRLExact(p.arpu)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatPct(p.percentage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Tabela mensal</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border text-xs">
                  <th className="pb-2 font-medium">Mês</th>
                  <th className="pb-2 font-medium text-right">MRR</th>
                  <th className="pb-2 font-medium text-right">Δ MRR</th>
                  <th className="pb-2 font-medium text-right">Ativos</th>
                  <th className="pb-2 font-medium text-right">Novas</th>
                  <th className="pb-2 font-medium text-right">Cancel.</th>
                  <th className="pb-2 font-medium text-right">Caixa</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.monthKey} className="border-b border-border/50">
                    <td className="py-2.5">{h.month}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRL(h.mrr)}</td>
                    <td
                      className={`py-2.5 text-right tabular-nums ${
                        h.netNewMrr > 0
                          ? "text-[#0ca30c]"
                          : h.netNewMrr < 0
                            ? "text-[#d03b3b]"
                            : "text-muted-foreground"
                      }`}
                    >
                      {h.netNewMrr > 0 ? "+" : ""}
                      {formatBRL(h.netNewMrr)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(h.activeSubs)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(h.newSubs)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNumber(h.churnedSubs)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRL(h.billings)}</td>
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
