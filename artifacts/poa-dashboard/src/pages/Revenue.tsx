import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRevenue, formatBRL, formatPct, formatNumber } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts";

const PLAN_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4"];

type MrrTab = "breakdown" | "mrr" | "arr";

const tooltip = {
  contentStyle: { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 },
  labelStyle: { color: "#94a3b8" },
};
const axTick = { fill: "#94a3b8", fontSize: 11 };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />;

export default function Revenue() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;
  const [mrrTab, setMrrTab] = useState<MrrTab>("arr");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["revenue", start, end],
    queryFn: () => fetchRevenue(start, end),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  const allPlans = Array.from(
    new Set(d?.history.flatMap((h) => Object.keys(h.byPlan ?? {})) ?? [])
  );

  const stackedData = d?.history.map((h) => ({ month: h.month, ...h.byPlan })) ?? [];

  const startKey = start.slice(0, 7);
  const endKey = end.slice(0, 7);
  const totalCancellations = d?.history
    .filter((h) => h.monthKey >= startKey && h.monthKey <= endKey)
    .reduce((sum, h) => sum + h.churnedSubs, 0) ?? 0;

  const lastMonth = d?.history[d.history.length - 1];
  const currentChurnRate = lastMonth?.churnRate ?? 0;

  const newSubsChartData = (d?.history ?? [])
    .filter((h) => h.monthKey >= "2026-03")
    .map((h) => ({
      month: h.month,
      "Novas Assinaturas": h.newSubs,
      "Cancelamentos": h.churnedSubs,
    }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Receita & Churn</h1>
        <p className="text-sm text-muted-foreground">Métricas financeiras e de retenção</p>
      </div>

      {hasError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar dados: {errMsg}
        </div>
      )}

      {/* ── Summary row (image 1) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center text-center gap-1 sm:gap-2">
          {isLoading ? (
            <div className="h-8 w-40 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground tracking-widest uppercase">MRR Atual</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground tabular-nums">
                {d ? formatBRL(d.mrr) : "—"}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">receita mensal recorrente</p>
            </>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center text-center gap-1 sm:gap-2">
          {isLoading ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground tracking-widest uppercase">Assinantes Pagantes</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground tabular-nums">
                {d ? formatNumber(d.totalSubscribers) : "—"}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">assinantes ativos</p>
            </>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center text-center gap-1 sm:gap-2">
          {isLoading ? (
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground tracking-widest uppercase">Média por Assinante</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground tabular-nums">
                {d ? formatBRL(d.arpu) : "—"}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">receita média mensal</p>
            </>
          )}
        </div>
      </div>

      {/* ── Churn KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <KPICard title="ARR Projetado" value={d ? formatBRL(d.arr) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Cancelamentos no Período" value={d ? formatNumber(totalCancellations) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
        <KPICard title="Churn Rate" value={d ? formatPct(currentChurnRate) : "—"} subtitle="último mês" loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
      </div>

      {/* ── MRR / ARR chart (image 2) ─────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Crescimento de Receita</h2>
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
            {([
              { key: "breakdown", label: "Por Plano" },
              { key: "mrr", label: "MRR" },
              { key: "arr", label: "ARR" },
            ] as { key: MrrTab; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setMrrTab(t.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  mrrTab === t.key
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="h-60 bg-muted rounded animate-pulse" />
        ) : mrrTab === "breakdown" ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stackedData}>
              {grid}
              <XAxis dataKey="month" tick={axTick} />
              <YAxis tick={axTick} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltip} formatter={(v: number, name: string) => [formatBRL(v), name]} />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              {allPlans.map((plan, i) => (
                <Bar key={plan} dataKey={plan} stackId="a" fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.history ?? []}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="month" tick={axTick} />
              <YAxis
                tick={axTick}
                tickFormatter={(v) =>
                  v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                }
              />
              <Tooltip
                {...tooltip}
                formatter={(v: number) => [
                  formatBRL(v),
                  mrrTab === "mrr" ? "MRR" : "ARR",
                ]}
              />
              <Area
                type="monotone"
                dataKey={mrrTab}
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradRevenue)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Subscriptions chart (image 3) ────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Inscrições</h2>
        {isLoading ? (
          <div className="h-60 bg-muted rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.history ?? []}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="month" tick={axTick} />
              <YAxis tick={axTick} allowDecimals={false} />
              <Tooltip
                {...tooltip}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="totalSubs"
                name="Total de Assinantes"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradTotal)"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="newSubs"
                name="Novos"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="churnedSubs"
                name="Cancelamentos"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Plan breakdown table ──────────────────────────────────── */}
      {d?.byPlan && d.byPlan.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Breakdown por Plano</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border">
                <th className="pb-2 font-medium">Plano</th>
                <th className="pb-2 font-medium text-right">Assinantes</th>
                <th className="pb-2 font-medium text-right">Receita</th>
                <th className="pb-2 font-medium text-right">% do MRR</th>
              </tr>
            </thead>
            <tbody>
              {d.byPlan.map((p) => (
                <tr key={p.plan} className="border-b border-border/50">
                  <td className="py-2.5 flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: PLAN_COLORS[d.byPlan.indexOf(p) % PLAN_COLORS.length] }}
                    />
                    {p.plan}
                  </td>
                  <td className="py-2.5 text-right">{formatNumber(p.subscribers)}</td>
                  <td className="py-2.5 text-right">{formatBRL(p.revenue)}</td>
                  <td className="py-2.5 text-right">{formatPct(p.percentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Evolução Mensal (Mar/2026 em diante) ─────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Evolução Mensal</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Novas assinaturas e cancelamentos a partir de Mar/2026</p>
        </div>
        {newSubsChartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Aguardando dados de Mar/2026...</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={newSubsChartData} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
              {grid}
              <XAxis dataKey="month" tick={axTick} axisLine={false} tickLine={false} />
              <YAxis tick={axTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
                labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
                itemStyle={{ color: "#f1f5f9" }}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                formatter={(value: number, name: string) => [value, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }}
                payload={[
                  { value: "Novas Assinaturas", type: "square", color: "#22c55e" },
                  { value: "Cancelamentos", type: "square", color: "#ef4444" },
                ]}
              />
              {/* Cancelamentos embaixo (vermelho), Novas por cima (verde) */}
              <Bar dataKey="Cancelamentos" stackId="monthly" fill="#ef4444" maxBarSize={64} radius={[0, 0, 4, 4]}>
                <LabelList dataKey="Cancelamentos" position="insideTop" style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }} formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
              <Bar dataKey="Novas Assinaturas" stackId="monthly" fill="#22c55e" maxBarSize={64} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="Novas Assinaturas" position="top" style={{ fill: "#22c55e", fontSize: 11, fontWeight: 600 }} formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
