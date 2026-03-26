import { useQuery } from "@tanstack/react-query";
import { fetchRevenue, formatBRL, formatPct, formatNumber } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4"];

export default function Revenue() {
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;

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

  const stackedData = d?.history.map((h) => ({
    month: h.month,
    ...h.byPlan,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Receita</h1>
        <p className="text-sm text-muted-foreground">MRR, ARR e breakdown por plano</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="MRR" value={d ? formatBRL(d.mrr) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="ARR Projetado" value={d ? formatBRL(d.arr) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="ARPU" value={d ? formatBRL(d.arpu) : "—"} subtitle="por assinante" loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Assinantes Ativos" value={d ? formatNumber(d.totalSubscribers) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Evolução do MRR</h2>
        {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v: number) => [formatBRL(v), "MRR"]}
              />
              <Line type="monotone" dataKey="mrr" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {allPlans.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Receita por Plano (mensal)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stackedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v: number, name: string) => [formatBRL(v), name]}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              {allPlans.map((plan, i) => (
                <Bar key={plan} dataKey={plan} stackId="a" fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {d?.byPlan && d.byPlan.length > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Breakdown atual por plano</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border">
                <th className="pb-2 font-medium">Plano</th>
                <th className="pb-2 font-medium text-right">Assinantes</th>
                <th className="pb-2 font-medium text-right">Receita</th>
                <th className="pb-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {d.byPlan.map((p) => (
                <tr key={p.plan} className="border-b border-border/50">
                  <td className="py-2.5">{p.plan}</td>
                  <td className="py-2.5 text-right">{formatNumber(p.subscribers)}</td>
                  <td className="py-2.5 text-right">{formatBRL(p.revenue)}</td>
                  <td className="py-2.5 text-right">{formatPct(p.percentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
