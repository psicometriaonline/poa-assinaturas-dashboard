import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { fetchTraffic, type PeriodKey, type UmamiMetric } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { PeriodSelector } from "@/components/PeriodSelector";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const ISO2_TO_NUMERIC: Record<string, number> = {
  AF: 4, AL: 8, DZ: 12, AO: 24, AR: 32, AM: 51, AU: 36, AT: 40, AZ: 31,
  BH: 48, BD: 50, BY: 112, BE: 56, BZ: 84, BJ: 204, BO: 68, BA: 70, BW: 72,
  BR: 76, BN: 96, BG: 100, BF: 854, BI: 108, KH: 116, CM: 120, CA: 124,
  CF: 140, TD: 148, CL: 152, CN: 156, CO: 170, CD: 180, CG: 178, CR: 188,
  CI: 384, HR: 191, CU: 192, CY: 196, CZ: 203, DK: 208, DO: 214, EC: 218,
  EG: 818, SV: 222, ET: 231, FI: 246, FR: 250, GA: 266, DE: 276, GH: 288,
  GR: 300, GT: 320, GN: 324, GW: 624, HT: 332, HN: 340, HU: 348, IN: 356,
  ID: 360, IR: 364, IQ: 368, IE: 372, IL: 376, IT: 380, JM: 388, JP: 392,
  JO: 400, KZ: 398, KE: 404, KW: 414, KG: 417, LA: 418, LB: 422, LY: 434,
  LT: 440, LU: 442, MG: 450, MW: 454, MY: 458, ML: 466, MR: 478, MX: 484,
  MD: 498, MN: 496, MA: 504, MZ: 508, MM: 104, NA: 516, NP: 524, NL: 528,
  NZ: 554, NI: 558, NE: 562, NG: 566, NO: 578, OM: 512, PK: 586, PA: 591,
  PG: 598, PY: 600, PE: 604, PH: 608, PL: 616, PT: 620, PR: 630, QA: 634,
  RO: 642, RU: 643, RW: 646, SA: 682, SN: 686, RS: 688, SL: 694, SO: 706,
  ZA: 710, KR: 410, SS: 728, ES: 724, LK: 144, SD: 729, SE: 752, CH: 756,
  SY: 760, TW: 158, TJ: 762, TZ: 834, TH: 764, TG: 768, TN: 788, TR: 792,
  TM: 795, UG: 800, UA: 804, AE: 784, GB: 826, US: 840, UY: 858, UZ: 860,
  VE: 862, VN: 704, YE: 887, ZM: 894, ZW: 716, MK: 807, ME: 499, SK: 703,
  SI: 705, EE: 233, LV: 428, FI2: 246, GE: 268, PS: 275, XK: 0,
};

function buildCountryMap(countries: UmamiMetric[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const c of countries) {
    const numericCode = ISO2_TO_NUMERIC[c.x.toUpperCase()];
    if (numericCode) map[numericCode] = c.y;
  }
  return map;
}

const UTM_TABS = [
  { key: "utmSource" as const, label: "Source" },
  { key: "utmMedium" as const, label: "Medium" },
  { key: "utmCampaign" as const, label: "Campaign" },
];

function formatHour(h: string): string {
  const n = parseInt(h, 10);
  return `${String(n).padStart(2, "0")}h`;
}

function formatDateLabel(x: string): string {
  try {
    const d = new Date(x);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return x;
  }
}

const CHART_COLOR_1 = "#3b82f6";
const CHART_COLOR_2 = "#60a5fa";

export default function Traffic() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [utmTab, setUtmTab] = useState<"utmSource" | "utmMedium" | "utmCampaign">("utmSource");

  const { data: resp, isLoading, isError } = useQuery({
    queryKey: ["traffic", period],
    queryFn: () => fetchTraffic(period),
  });

  const d = resp?.data ?? null;

  const countryMap = d ? buildCountryMap(d.countries) : {};
  const maxCountry = d?.countries.length ? Math.max(...d.countries.map((c) => c.y)) : 1;
  const maxHourly = d?.hourly.length ? Math.max(...d.hourly.map((h) => h.y), 1) : 1;

  const lineData =
    d?.pageviewsHistory.map((pv, i) => ({
      label: formatDateLabel(pv.x),
      "Pageviews": pv.y,
      "Sessões": d.sessionsHistory[i]?.y ?? 0,
    })) ?? [];

  const utmData = (d ? d[utmTab] : []).map((item) => ({
    name: item.x || "(direto)",
    value: item.y,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Análise de Tráfego</h2>
          <p className="text-sm text-muted-foreground mt-1">Dados do Umami Analytics</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar dados de tráfego. Verifique as credenciais do Umami.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Pageviews"
          value={(d?.stats.pageviews ?? 0).toLocaleString("pt-BR")}
          loading={isLoading}
        />
        <KPICard
          title="Visitantes Únicos"
          value={(d?.stats.uniques ?? 0).toLocaleString("pt-BR")}
          loading={isLoading}
        />
        <KPICard
          title="Bounce Rate"
          value={`${d?.stats.bounceRate ?? 0}%`}
          loading={isLoading}
        />
        <KPICard
          title="Duração Média"
          value={`${d?.stats.avgDurationMin ?? 0} min`}
          loading={isLoading}
        />
      </div>

      {/* Visitors Line Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Visitantes ao longo do tempo</h3>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="Pageviews"
                stroke={CHART_COLOR_1}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Sessões"
                stroke={CHART_COLOR_2}
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Middle row: Top Pages + UTM Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Pages Table */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top Páginas</h3>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
          ) : d?.topPaths.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
          ) : (
            <div className="space-y-1 overflow-auto max-h-72">
              <div className="grid grid-cols-[1fr_auto] gap-2 px-2 pb-2 border-b border-border text-xs font-medium text-muted-foreground">
                <span>Página</span>
                <span className="text-right">Acessos</span>
              </div>
              {d?.topPaths.map((item) => {
                const maxVal = d.topPaths[0]?.y ?? 1;
                const pct = (item.y / maxVal) * 100;
                return (
                  <div key={item.x} className="grid grid-cols-[1fr_auto] gap-2 px-2 py-1.5 rounded hover:bg-sidebar-accent">
                    <div className="min-w-0">
                      <span className="text-xs text-foreground font-mono truncate block" title={item.x}>
                        {item.x}
                      </span>
                      <div className="mt-1 h-1 bg-sidebar rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: CHART_COLOR_1 }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-foreground font-semibold self-center">
                      {item.y.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* UTM Channels */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Canais de Aquisição</h3>
            <div className="flex gap-1">
              {UTM_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setUtmTab(tab.key)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    utmTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
          ) : utmData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                layout="vertical"
                data={utmData}
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill={CHART_COLOR_1} radius={[0, 4, 4, 0]} name="Sessões" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* World Map */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Visitantes por País</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {d?.countries.length
            ? `${d.countries.length} países detectados`
            : isLoading
            ? "Carregando…"
            : "Sem dados"}
        </p>
        <div className="w-full" style={{ height: 320 }}>
          <ComposableMap
            projectionConfig={{ scale: 140 }}
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; id: string; properties: Record<string, unknown> }> }) =>
                geographies.map((geo) => {
                  const numId = parseInt(geo.id, 10);
                  const visits = countryMap[numId] ?? 0;
                  const intensity = visits > 0 ? Math.max(0.15, visits / maxCountry) : 0;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={
                        visits > 0
                          ? `rgba(59, 130, 246, ${intensity})`
                          : "hsl(220 30% 14%)"
                      }
                      stroke="hsl(220 30% 20%)"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", fill: visits > 0 ? `rgba(96, 165, 250, ${Math.min(intensity + 0.2, 1)})` : "hsl(220 30% 18%)" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </div>
        {/* Country legend */}
        {d && d.countries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.countries.slice(0, 8).map((c) => (
              <span
                key={c.x}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: `rgba(59, 130, 246, ${Math.max(0.25, c.y / maxCountry)})` }}
                />
                {c.x} — {c.y.toLocaleString("pt-BR")}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hourly Heatmap */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Horários de Pico</h3>
        <p className="text-xs text-muted-foreground mb-4">Pageviews por hora do dia (horário de Brasília)</p>
        {isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {(d?.hourly ?? Array.from({ length: 24 }, (_, i) => ({ x: i.toString(), y: 0 }))).map((h) => {
                const intensity = h.y > 0 ? Math.max(0.1, h.y / maxHourly) : 0;
                return (
                  <div key={h.x} className="flex flex-col items-center gap-1">
                    <div
                      className="w-10 h-10 rounded flex items-center justify-center text-xs font-medium transition-colors"
                      style={{
                        background: h.y > 0 ? `rgba(59, 130, 246, ${intensity})` : "hsl(220 30% 14%)",
                        color: intensity > 0.5 ? "#fff" : "hsl(var(--muted-foreground))",
                      }}
                      title={`${formatHour(h.x)}: ${h.y} pageviews`}
                    >
                      {h.y > 0 ? h.y : ""}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{formatHour(h.x)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Menor</span>
              <div className="flex gap-0.5">
                {[0.1, 0.25, 0.45, 0.65, 0.85, 1].map((v) => (
                  <div
                    key={v}
                    className="w-5 h-3 rounded-sm"
                    style={{ background: `rgba(59, 130, 246, ${v})` }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Maior</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
