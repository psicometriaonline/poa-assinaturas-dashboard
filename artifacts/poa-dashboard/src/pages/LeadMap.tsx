import { useQuery } from "@tanstack/react-query";
import { fetchLeadMap, formatNumber, type LeadMapData } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#14b8a6",
  "#f97316", "#6366f1",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12,
};

function YesNoChart({ title, data }: { title: string; data: { sim: number; nao: number } }) {
  const total = data.sim + data.nao;
  const pct = total > 0 ? ((data.sim / total) * 100).toFixed(1) : "0";
  const chartData = [
    { name: "Sim", value: data.sim },
    { name: "Não", value: data.nao },
  ];

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-2xl font-bold text-foreground tabular-nums">{pct}%</p>
      <p className="text-xs text-muted-foreground mb-3">{formatNumber(data.sim)} de {formatNumber(total)}</p>
      <div className="w-full h-3 bg-sidebar rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HorizontalBarSection({ title, data, max = 15 }: { title: string; data: Array<{ label: string; value: number }>; max?: number }) {
  const sliced = data.slice(0, max);
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={sliced.length * 36 + 20}>
        <BarChart data={sliced} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            width={180}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name="Membros" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutSection({ title, data }: { title: string; data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            label={({ label, value }) => `${label} (${((value / total) * 100).toFixed(0)}%)`}
            labelLine={{ stroke: "#64748b", strokeWidth: 1 }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [formatNumber(value), "Membros"]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function LeadMap() {
  const { data: result, isLoading, error } = useQuery({
    queryKey: ["leadmap"],
    queryFn: fetchLeadMap,
    staleTime: 30 * 60 * 1000,
  });

  const d = result?.data;
  const hasError = error || result?.error;
  const errMsg = result?.message ?? (error as Error)?.message;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mapa do Lead</h1>
        <p className="text-sm text-muted-foreground">Perfil demográfico e acadêmico dos membros — dados da planilha de cadastro</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Perfis Preenchidos"
          value={d ? formatNumber(d.totalWithProfile) : "—"}
          subtitle="com escolaridade informada"
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Pesquisadores"
          value={d ? `${((d.pesquisador.sim / (d.pesquisador.sim + d.pesquisador.nao)) * 100).toFixed(0)}%` : "—"}
          subtitle={d ? `${formatNumber(d.pesquisador.sim)} membros` : ""}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Professores"
          value={d ? `${((d.professor.sim / (d.professor.sim + d.professor.nao)) * 100).toFixed(0)}%` : "—"}
          subtitle={d ? `${formatNumber(d.professor.sim)} membros` : ""}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
        <KPICard
          title="Coord. PPG"
          value={d ? `${((d.coordPPG.sim / (d.coordPPG.sim + d.coordPPG.nao)) * 100).toFixed(0)}%` : "—"}
          subtitle={d ? `${formatNumber(d.coordPPG.sim)} membros` : ""}
          loading={isLoading}
          error={!!hasError}
          errorMessage={errMsg}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <DonutSection title="Escolaridade" data={d?.escolaridade ?? []} />
        <DonutSection title="Sexo" data={d?.sexo ?? []} />
      </div>

      <HorizontalBarSection title="Área de Atuação" data={d?.area ?? []} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <YesNoChart title="Pesquisador" data={d?.pesquisador ?? { sim: 0, nao: 0 }} />
        <YesNoChart title="Professor Universitário" data={d?.professor ?? { sim: 0, nao: 0 }} />
        <YesNoChart title="Coord. Grupo de Pesquisa" data={d?.coordPesquisa ?? { sim: 0, nao: 0 }} />
        <YesNoChart title="Coord. Pós-Graduação" data={d?.coordPPG ?? { sim: 0, nao: 0 }} />
      </div>

      <HorizontalBarSection title="Top Cursos" data={d?.curso ?? []} max={20} />

      <HorizontalBarSection title="Top Instituições" data={d?.topInstituicoes ?? []} max={20} />
    </div>
  );
}
