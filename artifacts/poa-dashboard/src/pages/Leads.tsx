import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
  LabelList,
  LineChart,
} from "recharts";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { fetchLeads, fetchLeadsSnapshots, formatNumber, formatPct } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";

const COLOR_LEADS = "#3b82f6";
const COLOR_CONV = "#22c55e";
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
  mediums: Array<{
    medium: string;
    total: number;
    byMonth: Record<string, number>;
    contents: Array<{ content: string; total: number; byMonth: Record<string, number> }>;
  }>;
}

function UtmTable({
  months,
  rows,
}: {
  months: string[];
  rows: ExpandableRow[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedMediums, setExpandedMediums] = useState<Record<string, boolean>>({});

  const toggleSource = (src: string) =>
    setExpanded((p) => ({ ...p, [src]: !p[src] }));
  const toggleMedium = (key: string) =>
    setExpandedMediums((p) => ({ ...p, [key]: !p[key] }));

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
            <th className="text-left py-2 pr-4 pl-2 text-muted-foreground font-medium w-44 min-w-[10rem] sticky left-0 bg-card">
              Origem UTM
            </th>
            {months.map((mk) => (
              <th
                key={mk}
                className="text-right py-2 px-2 text-muted-foreground font-medium min-w-[4rem]"
              >
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
              {/* Level 1: source */}
              <tr
                className="border-b border-border/40 hover:bg-sidebar-accent cursor-pointer"
                onClick={() => toggleSource(row.source)}
              >
                <td className="py-2 pr-4 pl-2 sticky left-0 bg-card">
                  <div className="flex items-center gap-1.5">
                    {row.mediums.length > 0 ? (
                      expanded[row.source] ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      )
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
                <td className="text-right py-2 px-2 pl-4 text-foreground font-bold">
                  {row.total}
                </td>
              </tr>

              {/* Level 2: medium */}
              {expanded[row.source] &&
                row.mediums.map((med) => {
                  const medKey = `${row.source}::${med.medium}`;
                  const hasContents = med.contents.length > 0;
                  return (
                    <Fragment key={medKey}>
                      <tr
                        className={`border-b border-border/20 bg-sidebar/40 ${hasContents ? "cursor-pointer hover:bg-sidebar/60" : ""}`}
                        onClick={hasContents ? () => toggleMedium(medKey) : undefined}
                      >
                        <td className="py-1.5 pr-4 pl-7 sticky left-0 bg-sidebar/40 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {hasContents ? (
                              expandedMediums[medKey] ? (
                                <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                              ) : (
                                <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                              )
                            ) : (
                              <span className="w-2.5 h-2.5 shrink-0" />
                            )}
                            ↳ {med.medium}
                          </div>
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

                      {/* Level 3: content */}
                      {expandedMediums[medKey] &&
                        med.contents.map((ct) => (
                          <tr
                            key={`${medKey}::${ct.content}`}
                            className="border-b border-border/10 bg-sidebar/20"
                          >
                            <td className="py-1 pr-4 pl-12 sticky left-0 bg-sidebar/20 text-muted-foreground/70 truncate">
                              ↳↳ {ct.content}
                            </td>
                            {months.map((mk) => {
                              const val = ct.byMonth[mk] ?? 0;
                              return (
                                <td key={mk} className="text-right py-1 px-2 text-muted-foreground/60">
                                  {val > 0 ? val : <span className="text-muted-foreground/20">—</span>}
                                </td>
                              );
                            })}
                            <td className="text-right py-1 px-2 pl-4 text-muted-foreground/70 font-medium">
                              {ct.total}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
            </Fragment>
          ))}
          <tr className="border-t border-border bg-sidebar/60">
            <td className="py-2 pr-4 pl-2 sticky left-0 bg-sidebar/60 font-bold text-foreground">
              Total
            </td>
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

export default function Leads() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data: resp, isLoading, isError, error } = useQuery({
    queryKey: ["leads", start, end],
    queryFn: () => fetchLeads(start, end),
  });

  const { data: snapResp, isLoading: snapLoading } = useQuery({
    queryKey: ["leads-snapshots"],
    queryFn: () => fetchLeadsSnapshots(90),
    staleTime: 5 * 60 * 1000,
  });

  const d = resp?.data ?? null;
  const hasError = isError || resp?.error;
  const errMsg = (resp as { message?: string } | null)?.message ?? (error as Error)?.message;

  const snapshots = (snapResp?.data ?? []).slice().reverse();
  const latestSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const snapChartData = snapshots.map((s) => {
    const dateStr = s.snapshot_date.split("T")[0];
    const [, mo, day] = dateStr.split("-");
    return {
      name: `${day}/${mo}`,
      "Free-Trial": s.total_free_trial,
      "Alunos POA": s.total_alunos_poa,
      "Convertidos": s.converted,
      "Taxa %": Number(s.conversion_rate),
    };
  });

  const monthlyChartData = (d?.monthly ?? []).map((m) => ({
    name: m.month,
    Leads: m.leads,
    Conversões: m.conversions,
    "Taxa %": m.conversionRate,
  }));

  const dailyChartData = (d?.daily ?? []).map((item) => {
    const [, m, day] = item.date.split("-");
    return { name: `${day}/${m}`, Leads: item.leads };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Leads e Conversão</h1>
        <p className="text-sm text-muted-foreground">
          Tag Free-Trial → lista Alunos - POA — snapshot diário às 03h (horário de Brasília)
        </p>
      </div>

      {hasError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {errMsg ?? "Erro ao carregar dados de leads. Verifique as credenciais do ActiveCampaign."}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Free-Trial (período)"
          value={d ? formatNumber(d.totalLeads) : "—"}
          subtitle="com tag Free-Trial no período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Convertidos (período)"
          value={d ? formatNumber(d.totalConversions) : "—"}
          subtitle="Free-Trial e estão em Alunos - POA"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Taxa de Conversão"
          value={d ? formatPct(d.conversionRate) : "—"}
          subtitle="do período"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Alunos - POA (total)"
          value={latestSnap ? formatNumber(latestSnap.total_alunos_poa) : "—"}
          subtitle={latestSnap ? `snapshot de ${new Date(latestSnap.snapshot_date.split("T")[0] + "T12:00:00").toLocaleDateString("pt-BR")}` : "aguardando snapshot"}
          loading={snapLoading && !latestSnap}
        />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Monitoramento Diário</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Free-Trial vs Alunos - POA — snapshot capturado diariamente às 03h
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            {snapshots.length > 0 ? `${snapshots.length} snapshot${snapshots.length > 1 ? "s" : ""}` : "Nenhum snapshot ainda"}
          </div>
        </div>

        {snapLoading ? (
          <div className="h-48 bg-muted rounded animate-pulse" />
        ) : snapshots.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-sidebar/40 p-6 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Monitoramento iniciado</p>
            <p className="text-xs text-muted-foreground mt-1">
              O primeiro snapshot será capturado hoje às 03h (horário de Brasília).
              <br />O histórico será acumulado aqui diariamente.
            </p>
            {latestSnap && (
              <div className="mt-3 inline-flex gap-6 text-xs text-muted-foreground">
                <span>Free-Trial: <strong className="text-foreground">{formatNumber(latestSnap.total_free_trial)}</strong></span>
                <span>Alunos POA: <strong className="text-foreground">{formatNumber(latestSnap.total_alunos_poa)}</strong></span>
                <span>Convertidos: <strong className="text-[#22c55e]">{latestSnap.converted} ({latestSnap.conversion_rate}%)</strong></span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-6 text-xs text-muted-foreground">
              <span>Último: {new Date(latestSnap!.snapshot_date.split("T")[0] + "T12:00:00").toLocaleDateString("pt-BR")}</span>
              <span>Free-Trial: <strong className="text-foreground">{formatNumber(latestSnap!.total_free_trial)}</strong></span>
              <span>Alunos POA: <strong className="text-foreground">{formatNumber(latestSnap!.total_alunos_poa)}</strong></span>
              <span>Convertidos: <strong className="text-[#22c55e]">{latestSnap!.converted} ({latestSnap!.conversion_rate}%)</strong></span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={snapChartData} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }}
                  interval={Math.max(0, Math.floor(snapChartData.length / 10) - 1)} />
                <YAxis yAxisId="count" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) =>
                    name === "Taxa %" ? [`${v.toFixed(1)}%`, name] : [formatNumber(v), name]
                  }
                />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Line yAxisId="count" type="monotone" dataKey="Free-Trial" stroke={COLOR_LEADS} strokeWidth={2} dot={false} />
                <Line yAxisId="count" type="monotone" dataKey="Alunos POA" stroke="#a855f7" strokeWidth={2} dot={false} />
                <Line yAxisId="count" type="monotone" dataKey="Convertidos" stroke={COLOR_CONV} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line yAxisId="pct" type="monotone" dataKey="Taxa %" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Leads vs. Conversões + Taxa % (mensal)
          </h2>
          {isLoading ? (
            <div className="h-52 bg-muted rounded animate-pulse" />
          ) : monthlyChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados para o período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={monthlyChartData} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis yAxisId="count" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) =>
                    name === "Taxa %" ? [`${v.toFixed(1)}%`, name] : [v, name]
                  }
                />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Bar yAxisId="count" dataKey="Leads" fill={COLOR_LEADS} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Leads" position="top" style={{ fill: "#94a3b8", fontSize: 10 }} />
                </Bar>
                <Bar yAxisId="count" dataKey="Conversões" fill={COLOR_CONV} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Conversões" position="top" style={{ fill: "#94a3b8", fontSize: 10 }} />
                </Bar>
                <Line yAxisId="pct" type="monotone" dataKey="Taxa %" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Novos Leads por Dia (período selecionado)
          </h2>
          {isLoading ? (
            <div className="h-52 bg-muted rounded animate-pulse" />
          ) : dailyChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados para o período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={dailyChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  interval={Math.max(0, Math.floor(dailyChartData.length / 8) - 1)}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Leads" fill={COLOR_LEADS} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Taxa de Conversão por Origem UTM
        </h2>
        {isLoading ? (
          <div className="h-52 bg-muted rounded animate-pulse" />
        ) : !d || d.bySource.length === 0 ? (
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
                {d.bySource.map((row) => {
                  const maxLeads = d.bySource[0]?.leads ?? 1;
                  const barPct = (row.leads / maxLeads) * 100;
                  return (
                    <tr key={row.source} className="border-b border-border/40 hover:bg-sidebar-accent">
                      <td className="py-2.5 pr-4 font-medium text-foreground">{row.source}</td>
                      <td className="text-right py-2.5 px-2 text-foreground">{formatNumber(row.leads)}</td>
                      <td className="text-right py-2.5 px-2 text-foreground">{formatNumber(row.conversions)}</td>
                      <td className="text-right py-2.5 px-2 font-semibold text-[#22c55e]">
                        {formatPct(row.rate)}
                      </td>
                      <td className="py-2.5 px-2 w-32">
                        <div className="h-1.5 bg-sidebar rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barPct}%`, background: COLOR_LEADS }}
                          />
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

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Leads por Origem UTM × Mês
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Clique em uma origem para expandir por mídia (utm_medium) · clique na mídia para expandir por conteúdo (utm_content)
        </p>
        {isLoading ? (
          <div className="h-52 bg-muted rounded animate-pulse" />
        ) : (
          <UtmTable
            months={d?.tableMonths ?? []}
            rows={d?.tableData ?? []}
          />
        )}
      </div>
    </div>
  );
}
