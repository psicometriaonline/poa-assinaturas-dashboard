import { useState, useCallback } from "react";
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
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { fetchTraffic, type UmamiMetric } from "@/lib/api";
import { KPICard } from "@/components/KPICard";
import { usePeriod } from "@/context/PeriodContext";

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
  { key: "utmSource" as const, label: "Origem" },
  { key: "utmMedium" as const, label: "Mídia" },
  { key: "utmCampaign" as const, label: "Campanha" },
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
  const { dateRange } = usePeriod();
  const { start, end } = dateRange;
  const [utmTab, setUtmTab] = useState<"utmSource" | "utmMedium" | "utmCampaign">("utmSource");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const handleMoveEnd = useCallback((pos: { coordinates: [number, number]; zoom: number }) => {
    setMapCenter(pos.coordinates);
    setMapZoom(pos.zoom);
  }, []);

  const { data: resp, isLoading, isError } = useQuery({
    queryKey: ["traffic", start, end],
    queryFn: () => fetchTraffic(start, end),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const d = resp?.data ?? null;

  const countryMap = d ? buildCountryMap(d.countries) : {};
  const maxCountry = d?.countries.length ? Math.max(...d.countries.map((c) => c.y)) : 1;
  const weeklyHourly = d?.weeklyHourly ?? Array.from({ length: 7 }, () => new Array(24).fill(0));
  const maxHourly = Math.max(1, ...weeklyHourly.flat());

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
      <div>
        <h1 className="text-xl font-bold text-foreground">Análise de Tráfego</h1>
        <p className="text-sm text-muted-foreground">Dados do Umami Analytics</p>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar dados de tráfego. Verifique as credenciais do Umami.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
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
                  color: "#e2e8f0",
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Top Pages Table */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
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
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
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
                    color: "#e2e8f0",
                  }}
                />
                <Bar dataKey="value" fill={CHART_COLOR_1} radius={[0, 4, 4, 0]} name="Sessões" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* World Map */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Visitantes por País</h3>
            <p className="text-xs text-muted-foreground">
              {d?.countries.length
                ? `${d.countries.length} países detectados`
                : isLoading
                ? "Carregando…"
                : "Sem dados"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMapZoom((z) => Math.min(z * 1.5, 8))}
              className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="Zoom +"
            >
              +
            </button>
            <button
              onClick={() => setMapZoom((z) => Math.max(z / 1.5, 1))}
              className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="Zoom −"
            >
              −
            </button>
            <button
              onClick={() => { setMapZoom(1); setMapCenter([0, 0]); }}
              className="px-2 h-7 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="Resetar"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="w-full overflow-hidden rounded-lg h-[260px] sm:h-[360px] lg:h-[440px]">
          <ComposableMap
            projectionConfig={{ scale: 160 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ZoomableGroup
              zoom={mapZoom}
              center={mapCenter}
              onMoveEnd={handleMoveEnd}
              minZoom={1}
              maxZoom={8}
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
            </ZoomableGroup>
          </ComposableMap>
        </div>
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

      {/* Hourly Heatmap — 7 days × 24 hours */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Horários de Pico</h3>
        <p className="text-xs text-muted-foreground mb-4">Pageviews por dia da semana e hora (horário de Brasília)</p>
        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
        ) : (
          <div className="overflow-x-auto scrollbar-hide">
            <div className="min-w-max">
              {/* Hour labels row */}
              <div className="flex gap-px mb-px ml-9">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-9 text-center text-[9px] text-muted-foreground/70">
                    {String(h).padStart(2, "0")}h
                  </div>
                ))}
              </div>
              {/* Data rows */}
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((dayLabel, rowIdx) => (
                <div key={dayLabel} className="flex items-center gap-px mb-px">
                  <span className="w-8 shrink-0 text-[10px] text-muted-foreground text-right pr-1.5">
                    {dayLabel}
                  </span>
                  {(weeklyHourly[rowIdx] ?? new Array(24).fill(0)).map((val, hour) => {
                    const intensity = val > 0 ? Math.max(0.12, val / maxHourly) : 0;
                    return (
                      <div
                        key={hour}
                        className="w-9 h-7 rounded-sm flex items-center justify-center text-[9px] font-medium transition-colors cursor-default"
                        style={{
                          background: val > 0 ? `rgba(59, 130, 246, ${intensity})` : "hsl(220 30% 14%)",
                          color: intensity > 0.55 ? "#fff" : "hsl(var(--muted-foreground))",
                        }}
                        title={`${dayLabel} ${String(hour).padStart(2, "0")}h: ${val} pageviews`}
                      >
                        {val > 0 ? val : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="mt-3 flex items-center gap-2 ml-9">
                <span className="text-xs text-muted-foreground">Menor</span>
                <div className="flex gap-0.5">
                  {[0.12, 0.28, 0.45, 0.62, 0.8, 1].map((v) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
