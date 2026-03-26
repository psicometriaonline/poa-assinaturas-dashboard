import { useQuery } from "@tanstack/react-query";
import { fetchFunnel, formatNumber, formatPct, type PeriodKey } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart as HBarChart,
} from "recharts";

export default function Funnel() {
  const [period, setPeriod] = useState<PeriodKey>("12months");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["funnel", period],
    queryFn: () => fetchFunnel(period),
  });

  const d = data?.data;
  const hasError = isError || data?.error;
  const errMsg = data?.message ?? (error as Error)?.message;

  const distributionData = d ? [
    { name: "0–7 dias", value: d.distributionByRange["0-7"] },
    { name: "8–14 dias", value: d.distributionByRange["8-14"] },
    { name: "15–30 dias", value: d.distributionByRange["15-30"] },
    { name: "+30 dias", value: d.distributionByRange["+30"] },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Funil de Conversão</h1>
          <p className="text-sm text-muted-foreground">Do cadastro gratuito até o pagamento</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Cadastros Gratuitos" value={d ? formatNumber(d.totalRegistrations) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Conversões" value={d ? formatNumber(d.totalConversions) : "—"} subtitle="tornaram-se assinantes" loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Taxa de Conversão" value={d ? formatPct(d.conversionRate) : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} />
        <KPICard title="Tempo Médio Conversão" value={d ? `${d.avgDaysToConversion} dias` : "—"} loading={isLoading} error={!!hasError} errorMessage={errMsg} invertChange />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Cadastros vs. Conversões (mensal)</h2>
        {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d?.history ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Bar dataKey="registrations" name="Cadastros" fill="#3b82f6" />
              <Bar dataKey="conversions" name="Conversões" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Taxa de Conversão por Canal UTM</h2>
          {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, (d?.byChannel?.length ?? 5) * 40)}>
              <HBarChart layout="vertical" data={d?.byChannel ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="channel" tick={{ fill: "#94a3b8", fontSize: 11 }} width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Taxa"]}
                />
                <Bar dataKey="rate" name="Taxa %" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </HBarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Tempo até Conversão</h2>
          {isLoading ? <div className="h-52 bg-muted rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                <Bar dataKey="value" name="Conversões" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
