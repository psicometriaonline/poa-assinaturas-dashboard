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
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchLeads, formatNumber, formatPct } from "@/lib/api";
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
  mediums: Array<{ medium: string; total: number; byMonth: Record<string, number> }>;
}

function UtmTable({
  months,
  rows,
}: {
  months: string[];
  rows: ExpandableRow[];
}) {
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

  const visibleMonths = months;

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
            {visibleMonths.map((mk) => (
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
              <tr
                className="border-b border-border/40 hover:bg-sidebar-accent cursor-pointer"
                onClick={() => toggle(row.source)}
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
                {visibleMonths.map((mk) => {
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
              {expanded[row.source] &&
                row.mediums.map((med) => (
                  <tr
                    key={`${row.source}:${med.medium}`}
                    className="border-b border-border/20 bg-sidebar/40"
                  >
                    <td className="py-1.5 pr-4 pl-8 sticky left-0 bg-sidebar/40 text-muted-foreground">
                      ↳ {med.medium}
                    </td>
                    {visibleMonths.map((mk) => {
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
            <td className="py-2 pr-4 pl-2 sticky left-0 bg-sidebar/60 font-bold text-foreground">
              Total
            </td>
            {visibleMonths.map((mk) => (
              <td
                key={mk}
                className="text-right py-2 px-2 font-bold text-foreground"
              >
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

  const d = resp?.data ?? null;
  const hasError = isError || resp?.error;
  const errMsg = (resp as { message?: string } | null)?.message ?? (error as Error)?.message;

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
          Cadastros gratuitos (Free-trial) × assinantes ativos — via ActiveCampaign
        </p>
      </div>

      {hasError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {errMsg ?? "Erro ao carregar dados de leads. Verifique as credenciais do ActiveCampaign."}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Total de Leads"
          value={d ? formatNumber(d.totalLeads) : "—"}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Conversões"
          value={d ? formatNumber(d.totalConversions) : "—"}
          subtitle="tornaram-se assinantes"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Taxa de Conversão"
          value={d ? formatPct(d.conversionRate) : "—"}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Tempo Médio p/ Converter"
          value={d ? `${d.avgDaysToConvert} dias` : "—"}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
          invertChange
        />
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
          Clique em uma origem para expandir por mídia (utm_medium)
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
