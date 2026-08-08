import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAcquisition,
  formatBRL,
  formatNumber,
  formatPct,
  type AcquisitionData,
} from "@/lib/api";
import { usePeriod } from "@/context/PeriodContext";
import { KPICard } from "@/components/KPICard";
import { PageHeader, Panel, ErrorBanner } from "@/components/Panel";
import { CHROME, axisTick, seriesColor, tooltipProps } from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

function UtmTable({ data }: { data: AcquisitionData }) {
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});
  const [openMediums, setOpenMediums] = useState<Record<string, boolean>>({});

  const { months, monthLabels, bySource } = data;

  const totalsByMonth: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of bySource) {
    grandTotal += row.subscribers;
    for (const mk of months) {
      totalsByMonth[mk] = (totalsByMonth[mk] ?? 0) + (row.byMonth[mk] ?? 0);
    }
  }

  const cell = (value: number, muted = false) =>
    value > 0 ? (
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{value}</span>
    ) : (
      <span className="text-muted-foreground/30">—</span>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 pl-2 text-muted-foreground font-medium w-44 min-w-[10rem] sticky left-0 bg-card">
              Origem UTM
            </th>
            {monthLabels.map((label, i) => (
              <th
                key={months[i]}
                className="text-right py-2 px-2 text-muted-foreground font-medium min-w-[4rem]"
              >
                {label}
              </th>
            ))}
            <th className="text-right py-2 px-2 pl-4 text-muted-foreground font-medium min-w-[4rem]">
              Total
            </th>
            <th className="text-right py-2 px-2 pl-4 text-muted-foreground font-medium min-w-[5rem]">
              MRR
            </th>
          </tr>
        </thead>
        <tbody>
          {bySource.map((row) => (
            <Fragment key={row.source}>
              <tr
                className="border-b border-border/40 hover:bg-sidebar-accent cursor-pointer"
                onClick={() => setOpenSources((p) => ({ ...p, [row.source]: !p[row.source] }))}
              >
                <td className="py-2 pr-4 pl-2 sticky left-0 bg-card">
                  <div className="flex items-center gap-1.5">
                    {openSources[row.source] ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{row.source}</span>
                  </div>
                </td>
                {months.map((mk) => (
                  <td key={mk} className="text-right py-2 px-2 font-semibold tabular-nums">
                    {cell(row.byMonth[mk] ?? 0)}
                  </td>
                ))}
                <td className="text-right py-2 px-2 pl-4 text-foreground font-bold tabular-nums">
                  {row.subscribers}
                </td>
                <td className="text-right py-2 px-2 pl-4 text-foreground font-bold tabular-nums">
                  {formatBRL(row.mrr)}
                </td>
              </tr>

              {openSources[row.source] &&
                row.mediums.map((med) => {
                  const medKey = `${row.source}::${med.medium}`;
                  return (
                    <Fragment key={medKey}>
                      <tr
                        className="border-b border-border/20 bg-sidebar/40 cursor-pointer hover:bg-sidebar/60"
                        onClick={() => setOpenMediums((p) => ({ ...p, [medKey]: !p[medKey] }))}
                      >
                        <td className="py-1.5 pr-4 pl-7 sticky left-0 bg-sidebar/40 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {openMediums[medKey] ? (
                              <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                            )}
                            ↳ {med.medium}
                          </div>
                        </td>
                        {months.map((mk) => (
                          <td key={mk} className="text-right py-1.5 px-2 tabular-nums">
                            {cell(med.byMonth[mk] ?? 0, true)}
                          </td>
                        ))}
                        <td className="text-right py-1.5 px-2 pl-4 text-muted-foreground font-semibold tabular-nums">
                          {med.subscribers}
                        </td>
                        <td className="text-right py-1.5 px-2 pl-4 text-muted-foreground tabular-nums">
                          {formatBRL(med.mrr)}
                        </td>
                      </tr>

                      {openMediums[medKey] &&
                        med.campaigns.map((camp) => (
                          <tr
                            key={`${medKey}::${camp.campaign}`}
                            className="border-b border-border/10 bg-sidebar/25"
                          >
                            <td className="py-1 pr-4 pl-12 sticky left-0 bg-sidebar/25 text-muted-foreground/80 truncate">
                              ↳↳ {camp.campaign}
                            </td>
                            {months.map((mk) => (
                              <td
                                key={mk}
                                className="text-right py-1 px-2 text-muted-foreground/70 tabular-nums"
                              >
                                {camp.byMonth[mk] ?? 0 ? camp.byMonth[mk] : "—"}
                              </td>
                            ))}
                            <td className="text-right py-1 px-2 pl-4 text-muted-foreground/80 font-medium tabular-nums">
                              {camp.subscribers}
                            </td>
                            <td className="text-right py-1 px-2 pl-4 text-muted-foreground/80 tabular-nums">
                              {formatBRL(camp.mrr)}
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
              <td key={mk} className="text-right py-2 px-2 font-bold text-foreground tabular-nums">
                {totalsByMonth[mk] || "—"}
              </td>
            ))}
            <td className="text-right py-2 px-2 pl-4 font-bold text-foreground tabular-nums">
              {grandTotal}
            </td>
            <td className="text-right py-2 px-2 pl-4 font-bold text-foreground tabular-nums">
              {formatBRL(data.mrrAttributed)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Acquisition() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["acquisition", start, end],
    queryFn: () => fetchAcquisition(start, end),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  const chartData = (d?.bySource ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aquisição"
        subtitle="De onde vêm as assinaturas pagas — origem UTM cruzada com a base do ActiveCampaign"
      />

      {hasError && <ErrorBanner message={errMsg} />}

      {d && !d.available && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Atribuição indisponível: o ActiveCampaign não está configurado ou não respondeu. As
          assinaturas do período continuam contabilizadas nas demais páginas.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Assinaturas no período"
          value={d ? formatNumber(d.totalSubscriptions) : "—"}
          subtitle="novas assinaturas pagas"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Com origem identificada"
          value={d ? formatNumber(d.attributed) : "—"}
          subtitle={d ? `${formatPct(d.attributionRate)} de cobertura` : undefined}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="MRR atribuído"
          value={d ? formatBRL(d.mrrAttributed) : "—"}
          subtitle="receita das assinaturas rastreadas"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Origens ativas"
          value={d ? formatNumber(d.bySource.length) : "—"}
          subtitle="canais que geraram assinatura"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <Panel
        title="Assinaturas por origem"
        description="Quantas assinaturas pagas cada canal originou no período"
        loading={isLoading}
        isEmpty={chartData.length === 0}
        height={Math.max(220, chartData.length * 46)}
      >
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 46)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} horizontal={false} />
            <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="source"
              width={150}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(
                value: number,
                _name: string,
                item: { payload?: { mrr?: number } }
              ) => [
                `${formatNumber(value)} assinaturas · ${formatBRL(item?.payload?.mrr ?? 0)} de MRR`,
                "Origem",
              ]}
            />
            <Bar dataKey="subscribers" maxBarSize={28} radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={entry.source} fill={seriesColor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Assinaturas por origem × mês"
        description="Clique na origem para abrir por mídia, e na mídia para abrir por campanha"
        loading={isLoading}
        isEmpty={(d?.bySource.length ?? 0) === 0}
        emptyMessage="Sem dados de UTM para o período"
        height={200}
      >
        {d && <UtmTable data={d} />}
      </Panel>
    </div>
  );
}
