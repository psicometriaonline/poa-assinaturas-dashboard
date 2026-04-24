import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFunnel, fetchLeads, fetchPlanAcquisition, formatNumber, formatPct } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList,
  PieChart, Pie, Cell,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

const COLOR_LEADS = "#3b82f6";
const COLOR_CONV = "#22c55e";
const PLAN_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];
const INTERVAL_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e"];
const TOOLTIP_STYLE = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12,
};

function toMonthLabel(mk: string): string {
  const [y, m] = mk.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

interface ExpandableRow {
  source: string;
  total: number;
  byMonth: Record<string, number>;
  mediums: Array<{ medium: string; total: number; byMonth: Record<string, number> }>;
}

function UtmTable({ months, rows }: { months: string[]; rows: ExpandableRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (src: string) => setExpanded((p) => ({ ...p, [src]: !p[src] }));

  const totalsRow: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of rows) {
    grandTotal += row.total;
    for (const mk of months) {
      totalsRow[mk] = (totalsRow[mk] ?? 0) + (row.byMonth[mk] ?? 0);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Sem dados para o período
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 pl-2 text-muted-foreground font-medium w-40 min-w-[9rem] sticky left-0 bg-card">
              Origem UTM
            </th>
            {months.map((mk) => (
              <th key={mk} className="text-right py-2 px-2 text-muted-foreground font-medium min-w-[4rem]">
                {toMonthLabel(mk)}
              </th>
            ))}
            <th className="text-right py-2 px-2 pl-4 text-muted-foreground font-medium min-w-[4rem]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.source}>
              <tr
                className="border-b border-border/40 hover:bg-sidebar-accent cursor-pointer"
                onClick={() => toggle(row.source)}
              >
                <td className="py-2 pr-4 pl-2 sticky left-0 bg-card">
                  <div className="flex items-center gap-1.5">
                    {row.mediums.length > 0 ? (
                      expanded[row.source]
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <span className="w-3 h-3 shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{row.source}</span>
                  </div>
                </td>
                {months.map((mk) => {
                  const val = row.byMonth[mk] ?? 0;
                  return (
                    <td key={mk} className="text-right py-2 px-2 text-foreground font-semibold">
                      {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
                <td className="text-right py-2 px-2 pl-4 text-foreground font-bold">{row.total}</td>
              </tr>
              {expanded[row.source] && row.mediums.map((med) => (
                <tr key={`${row.source}:${med.medium}`} className="border-b border-border/20 bg-sidebar/40">
                  <td className="py-1.5 pr-4 pl-8 sticky left-0 bg-sidebar/40 text-muted-foreground">
                    ↳ {med.medium}
                  </td>
                  {months.map((mk) => {
                    const val = med.byMonth[mk] ?? 0;
                    return (
                      <td key={mk} className="text-right py-1.5 px-2 text-muted-foreground">
                        {val > 0 ? val : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="text-right py-1.5 px-2 pl-4 text-muted-foreground font-semibold">
                    {med.total}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="border-t border-border bg-sidebar/60">
            <td className="py-2 pr-4 pl-2 sticky left-0 bg-sidebar/60 font-bold text-foreground">Total</td>
            {months.map((mk) => (
              <td key={mk} className="text-right py-2 px-2 font-bold text-foreground">
                {totalsRow[mk] > 0 ? totalsRow[mk] : <span className="text-muted-foreground/40">—</span>}
              </td>
            ))}
            <td className="text-right py-2 px-2 pl-4 font-bold text-foreground">{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Funnel() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data: funnelResp, isLoading: funnelLoading, isError: funnelError, error: funnelErr } = useQuery({
    queryKey: ["funnel", start, end],
    queryFn: () => fetchFunnel(start, end),
  });

  const { data: leadsResp, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", start, end],
    queryFn: () => fetchLeads(start, end),
  });

  const { data: planResp, isLoading: planLoading } = useQuery({
    queryKey: ["plan-acquisition", start, end],
    queryFn: () => fetchPlanAcquisition(start, end),
  });
  const pa = planResp?.data ?? null;

  const f = funnelResp?.data;
  const l = leadsResp?.data ?? null;
  const hasError = funnelError || funnelResp?.error;
  const errMsg = funnelResp?.message ?? (funnelErr as Error)?.message;

  const isLoading = funnelLoading;

  const [leadsGranularity, setLeadsGranularity] = useState<"dia" | "mes" | "ano">("dia");

  const distributionData = f ? [
    { name: "0–7 dias", value: f.distributionByRange["0-7"] },
    { name: "8–14 dias", value: f.distributionByRange["8-14"] },
    { name: "15–30 dias", value: f.distributionByRange["15-30"] },
    { name: "+30 dias", value: f.distributionByRange["+30"] },
  ] : [];

  const rawDaily = l?.daily ?? [];
  const uniqueMonths = Array.from(new Set(rawDaily.map((d) => d.date.slice(0, 7))));
  const uniqueYears  = Array.from(new Set(rawDaily.map((d) => d.date.slice(0, 4))));
  const hasManyMonths = uniqueMonths.length > 1;
  const hasManyYears  = uniqueYears.length > 1;

  const leadsChartData = (() => {
    if (leadsGranularity === "mes") {
      const agg: Record<string, number> = {};
      for (const d of rawDaily) {
        const mk = d.date.slice(0, 7);
        agg[mk] = (agg[mk] ?? 0) + d.leads;
      }
      return Object.entries(agg).sort(([a], [b]) => a.localeCompare(b)).map(([mk, leads]) => {
        const [y, m] = mk.split("-");
        const label = new Date(parseInt(y), parseInt(m) - 1, 1)
          .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        return { name: label, Leads: leads };
      });
    }
    if (leadsGranularity === "ano") {
      const agg: Record<string, number> = {};
      for (const d of rawDaily) {
        const yr = d.date.slice(0, 4);
        agg[yr] = (agg[yr] ?? 0) + d.leads;
      }
      return Object.entries(agg).sort(([a], [b]) => a.localeCompare(b)).map(([yr, leads]) => ({
        name: yr, Leads: leads,
      }));
    }
    // dia (default)
    return rawDaily.map((item) => {
      const [, m, day] = item.date.split("-");
      return { name: `${day}/${m}`, Leads: item.leads };
    });
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Funil de Conversão</h1>
        <p className="text-sm text-muted-foreground">Do cadastro gratuito (Free-Trial) até o pagamento</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard title="Cadastros Gratuitos" value={f ? formatNumber(f.totalRegistrations) : "—"} subtitle="com tag Free-Trial" loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Conversões" value={f ? formatNumber(f.totalConversions) : "—"} subtitle="tornaram-se assinantes" loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Taxa de Conversão" value={f ? formatPct(f.conversionRate) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Tempo Médio Conversão" value={f ? `${f.avgDaysToConversion} dias` : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
      </div>

      {/* Cadastros vs. Conversões (mensal) — estilo Evolução Mensal */}
      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Cadastros vs. Conversões (mensal)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Free-Trial a partir de Mar/2026</p>
        </div>
        {isLoading ? <div className="h-64 bg-muted rounded animate-pulse" /> : (f?.history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Aguardando dados de Mar/2026...</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={(f?.history ?? []).map((h) => ({
                month: h.month,
                Conversões: h.conversions,
                "Não Convertidos": h.registrations - h.conversions,
              }))}
              margin={{ top: 24, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
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
                  { value: "Conversões", type: "square", color: COLOR_CONV },
                  { value: "Não Convertidos", type: "square", color: COLOR_LEADS },
                ]}
              />
              <Bar dataKey="Conversões" stackId="funnel" fill={COLOR_CONV} maxBarSize={64} radius={[0, 0, 4, 4]}>
                <LabelList dataKey="Conversões" position="insideTop" style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }} formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
              <Bar dataKey="Não Convertidos" stackId="funnel" fill={COLOR_LEADS} maxBarSize={64} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="Não Convertidos" position="top" style={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }} formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Novos Leads por Dia + Tempo até Conversão */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Novos Leads</h2>
            <div className="flex gap-1">
              {(["dia", "mes", "ano"] as const).map((g) => {
                const disabled = (g === "mes" && !hasManyMonths) || (g === "ano" && !hasManyYears);
                const label = g === "dia" ? "Dia" : g === "mes" ? "Mês" : "Ano";
                return (
                  <button
                    key={g}
                    disabled={disabled}
                    onClick={() => !disabled && setLeadsGranularity(g)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      leadsGranularity === g
                        ? "bg-primary text-primary-foreground"
                        : disabled
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {leadsLoading ? (
            <div className="h-52 bg-muted rounded animate-pulse" />
          ) : leadsChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados para o período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={leadsChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  interval={leadsGranularity === "dia" ? Math.max(0, Math.floor(leadsChartData.length / 8) - 1) : 0}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Leads" fill={COLOR_LEADS} radius={[3, 3, 0, 0]} maxBarSize={leadsGranularity === "dia" ? 24 : 48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Tempo até Conversão</h2>
          {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" name="Conversões" fill={COLOR_CONV} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Planos Adquiridos — Alunos POA */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Planos Adquiridos — Alunos POA</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Distribuição de planos dos assinantes ativos (Alunos POA)
          {pa ? ` · ${pa.totalConversions} assinaturas no período` : ""}
        </p>
      </div>

      {/* Pie charts: by plan + by interval */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Distribuição por Plano</h2>
          {planLoading ? (
            <div className="h-80 bg-muted rounded animate-pulse" />
          ) : !pa || pa.byPlan.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">Sem dados para o período</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Pie
                  data={pa.byPlan.map((p) => ({ name: p.plan, value: p.count }))}
                  cx="50%"
                  cy="45%"
                  innerRadius={58}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pa.byPlan.map((_, i) => (
                    <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [formatNumber(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}
                  formatter={(value: string) => value.length > 28 ? value.slice(0, 28) + "…" : value}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Distribuição por Periodicidade</h2>
          {planLoading ? (
            <div className="h-80 bg-muted rounded animate-pulse" />
          ) : !pa || pa.byInterval.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">Sem dados para o período</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Pie
                  data={pa.byInterval}
                  cx="50%"
                  cy="45%"
                  innerRadius={58}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="label"
                  label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pa.byInterval.map((_, i) => (
                    <Cell key={i} fill={INTERVAL_COLORS[i % INTERVAL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [formatNumber(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Stacked bar chart: monthly conversion by plan */}
      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Conversões por Plano — Evolução Mensal</h2>
        <p className="text-xs text-muted-foreground mb-4">Assinantes Alunos POA por plano, agrupados por mês de adesão</p>
        {planLoading ? (
          <div className="h-64 bg-muted rounded animate-pulse" />
        ) : !pa || pa.history.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados para o período</div>
        ) : (() => {
          const allSeries = [...pa.topPlans, "Outros"].filter((planName) =>
            pa.history.some((h) => (h.plans[planName] ?? 0) > 0)
          );
          const chartData = pa.history.map((h) => {
            const row: Record<string, string | number> = { month: h.month };
            for (const s of allSeries) row[s] = h.plans[s] ?? 0;
            return row;
          });
          return (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(value: number, name: string) => [formatNumber(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 12 }}
                  formatter={(value: string) => value.length > 24 ? value.slice(0, 24) + "…" : value}
                />
                {allSeries.map((planName, i) => (
                  <Bar
                    key={planName}
                    dataKey={planName}
                    stackId="plans"
                    fill={PLAN_COLORS[i % PLAN_COLORS.length]}
                    maxBarSize={64}
                    radius={i === allSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        })()}
      </div>

      {/* Taxa de Conversão por Origem UTM */}
      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Taxa de Conversão por Origem UTM</h2>
        {leadsLoading ? (
          <div className="h-32 bg-muted rounded animate-pulse" />
        ) : !l || l.bySource.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            Sem dados de UTM para o período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Origem</th>
                  <th className="text-right py-2 px-2 font-medium">Leads</th>
                  <th className="text-right py-2 px-2 font-medium">Conversões</th>
                  <th className="text-right py-2 px-2 font-medium">Taxa</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {l.bySource.map((row) => {
                  const maxLeads = l.bySource[0]?.leads ?? 1;
                  const barPct = (row.leads / maxLeads) * 100;
                  return (
                    <tr key={row.source} className="border-b border-border/40 hover:bg-sidebar-accent">
                      <td className="py-2.5 pr-4 font-medium text-foreground">{row.source}</td>
                      <td className="text-right py-2.5 px-2 text-foreground">{formatNumber(row.leads)}</td>
                      <td className="text-right py-2.5 px-2 text-foreground">{formatNumber(row.conversions)}</td>
                      <td className="text-right py-2.5 px-2 font-semibold text-[#22c55e]">{formatPct(row.rate)}</td>
                      <td className="py-2.5 px-2 w-32">
                        <div className="h-1.5 bg-sidebar rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: COLOR_LEADS }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leads por Origem UTM × Mês */}
      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Leads por Origem UTM × Mês</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Clique em uma origem para expandir por mídia (utm_medium) — exclusivo tag Free-Trial, a partir de março/2026
        </p>
        {leadsLoading ? (
          <div className="h-52 bg-muted rounded animate-pulse" />
        ) : (
          <UtmTable
            months={l?.tableMonths ?? []}
            rows={l?.tableData ?? []}
          />
        )}
      </div>
    </div>
  );
}
