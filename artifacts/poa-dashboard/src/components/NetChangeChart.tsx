import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/Panel";
import { YearTabs } from "@/components/GranularityToggle";
import { CHROME, POLARITY, axisTick, tooltipProps } from "@/lib/chart-theme";
import { MONTH_ABBR, yearOf, yearsFrom } from "@/lib/time-grouping";
import { formatNumber } from "@/lib/api";

export interface NetChangePoint {
  monthKey: string;
  newSubs: number;
  churnedSubs: number;
}

type Mode = "ano" | "mes";

interface Row {
  label: string;
  net: number;
  newSubs: number;
  churnedSubs: number;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Row;
}

/**
 * Bar with the rounded corners on the data end — the top for growth, the bottom
 * for a loss — so the shape itself says which way the month went. Recharts'
 * `radius` prop is fixed per series, hence the custom path.
 */
function NetBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
  // Recharts hands back a negative height for bars that hang below the axis, so
  // normalise to a top edge and a positive height before drawing — using the raw
  // values inverted the path and rendered the negative bars as a funnel shape.
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  const bottom = top + h;
  const r = Math.min(4, width / 2, h);
  const up = (payload?.net ?? 0) >= 0;

  const d = up
    ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top}` +
      ` H${x + width - r} Q${x + width},${top} ${x + width},${top + r}` +
      ` V${bottom} Z`
    : `M${x},${top} H${x + width} V${bottom - r}` +
      ` Q${x + width},${bottom} ${x + width - r},${bottom}` +
      ` H${x + r} Q${x},${bottom} ${x},${bottom - r} Z`;

  return <path d={d} fill={fill} />;
}

/**
 * Net subscription change — one bar per period, above or below zero.
 *
 * Two stacked series (new vs. cancelled) forced the reader to do the subtraction
 * by eye; the question being asked is whether the base grew or shrank, so the
 * chart answers that directly and keeps the components in the tooltip.
 */
export function NetChangeChart({
  data,
  loading,
}: {
  data: NetChangePoint[];
  loading?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("ano");
  const [year, setYear] = useState<string | null>(null);

  const years = yearsFrom(data.map((d) => d.monthKey));
  const selectedYear = year && years.includes(year) ? year : years[0];

  const rows = useMemo<Row[]>(() => {
    if (mode === "ano") {
      const byYear = new Map<string, Row>();
      for (const point of data) {
        const y = yearOf(point.monthKey);
        const row = byYear.get(y) ?? { label: y, net: 0, newSubs: 0, churnedSubs: 0 };
        row.newSubs += point.newSubs;
        row.churnedSubs += point.churnedSubs;
        row.net = row.newSubs - row.churnedSubs;
        byYear.set(y, row);
      }
      return Array.from(byYear.values()).sort((a, b) => a.label.localeCompare(b.label));
    }

    if (!selectedYear) return [];
    // Every month of the chosen year, including the ones with no movement, so a
    // quiet month reads as a gap in the series rather than disappearing.
    return MONTH_ABBR.map((abbr, i) => {
      const monthKey = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
      const point = data.find((d) => d.monthKey === monthKey);
      return {
        label: abbr,
        net: (point?.newSubs ?? 0) - (point?.churnedSubs ?? 0),
        newSubs: point?.newSubs ?? 0,
        churnedSubs: point?.churnedSubs ?? 0,
      };
    });
  }, [data, mode, selectedYear]);

  const description =
    mode === "ano"
      ? "Novas assinaturas menos cancelamentos em cada ano"
      : `Novas assinaturas menos cancelamentos, mês a mês em ${selectedYear ?? ""}`;

  return (
    <Panel
      title="Variação líquida de assinaturas"
      description={description}
      loading={loading}
      isEmpty={rows.length === 0}
      height={280}
      action={
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
            {(
              [
                { key: "ano", label: "Ano" },
                { key: "mes", label: "Mês" },
              ] as { key: Mode; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  mode === t.key
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {mode === "mes" && years.length > 0 && (
            <YearTabs years={years} value={selectedYear ?? ""} onChange={setYear} />
          )}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            className="capitalize"
          />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReferenceLine y={0} stroke={CHROME.axisTick} strokeWidth={1} />
          <Tooltip
            {...tooltipProps}
            formatter={(value: number, _name: string, item: { payload?: Row }) => [
              `${value > 0 ? "+" : ""}${formatNumber(value)}  (${formatNumber(item?.payload?.newSubs ?? 0)} novas − ${formatNumber(item?.payload?.churnedSubs ?? 0)} canceladas)`,
              "Variação líquida",
            ]}
          />
          <Bar dataKey="net" maxBarSize={56} shape={NetBar}>
            {rows.map((row) => (
              <Cell key={row.label} fill={row.net >= 0 ? POLARITY.positive : POLARITY.negative} />
            ))}
            <LabelList
              dataKey="net"
              position="top"
              style={{ fontSize: 11, fontWeight: 600, fill: CHROME.tooltipText }}
              formatter={(v: number) => (v === 0 ? "" : `${v > 0 ? "+" : ""}${v}`)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
