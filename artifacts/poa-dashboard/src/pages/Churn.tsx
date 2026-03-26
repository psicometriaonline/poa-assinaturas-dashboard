import { useQuery } from "@tanstack/react-query";
import { fetchChurn, formatNumber, formatPct, type PeriodKey } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";

const COLORS = { voluntary: "#ef4444", involuntary: "#eab308" };
const DONUT_COLORS = ["#ef4444", "#eab308"];

export default function Churn() {
  const [period, setPeriod] = useState<PeriodKey>("12months");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["churn", period],
    queryFn: () => fetchChurn(period),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  const donutData = d ? [
    { name: "Voluntário", value: d.voluntaryChurn },
    { name: "Inadimplência", value: d.involuntaryChurn },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Churn</h1>
          <p className="text-sm text-muted-foreground">Cancelamentos e motivos</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Total de Cancelamentos" value={d ? formatNumber(d.totalCancellations) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
        <KPICard title="Churn Voluntário" value={d ? formatNumber(d.voluntaryChurn) : "—"} subtitle="solicitado pelo cliente" loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
        <KPICard title="Churn por Inadimplência" value={d ? formatNumber(d.involuntaryChurn) : "—"} subtitle="falha de pagamento" loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
        <KPICard title="Churn Rate" value={d ? formatPct(d.churnRate) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Churn mensal: Voluntário vs. Inadimplência</h2>
          {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d?.history ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Bar dataKey="voluntary" name="Voluntário" fill={COLORS.voluntary} />
                <Bar dataKey="involuntary" name="Inadimplência" fill={COLORS.involuntary} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Proporção de Churn</h2>
          {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {donutData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DONUT_COLORS[i] }} />
                    <div>
                      <p className="text-sm text-foreground font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(entry.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {d?.history && d.history.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Evolução mensal</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border">
                <th className="pb-2 font-medium">Mês</th>
                <th className="pb-2 font-medium text-right">Total</th>
                <th className="pb-2 font-medium text-right">Voluntário</th>
                <th className="pb-2 font-medium text-right">Inadimplência</th>
                <th className="pb-2 font-medium text-right">Churn Rate</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h) => (
                <tr key={h.month} className="border-b border-border/50">
                  <td className="py-2.5">{h.month}</td>
                  <td className="py-2.5 text-right">{formatNumber(h.total)}</td>
                  <td className="py-2.5 text-right text-[#ef4444]">{formatNumber(h.voluntary)}</td>
                  <td className="py-2.5 text-right text-[#eab308]">{formatNumber(h.involuntary)}</td>
                  <td className="py-2.5 text-right">{formatPct(h.churnRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
