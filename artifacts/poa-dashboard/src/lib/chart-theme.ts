/**
 * Chart palette and chrome, shared by every page.
 *
 * The categorical slots are assigned in fixed order and never cycled through a
 * hue generator: a plan keeps its colour when a filter changes how many plans
 * are on screen. The previous ad-hoc palette failed colour-vision separation
 * (green ↔ yellow measured ΔE 4.2 under protanopia against this surface); these
 * eight slots pass the lightness band, chroma floor, CVD separation, normal-vision
 * floor and 3:1 contrast checks on the dashboard's `--card` surface (#0f1729).
 */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

/**
 * Reserved for state, never for "series 4". Always shipped with a label so the
 * meaning never rests on hue alone.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Growth vs. loss — a polarity pair, so it uses status colours, not series slots. */
export const POLARITY = {
  positive: STATUS.good,
  negative: STATUS.critical,
} as const;

/** Single-hue blue ramp, light → dark, for magnitude (cohort heatmap). */
export const SEQUENTIAL = [
  "#0d366b",
  "#184f95",
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
] as const;

export const CHROME = {
  grid: "rgba(255,255,255,0.06)",
  axisTick: "#94a3b8",
  tooltipBg: "#0f172a",
  tooltipBorder: "#334155",
  tooltipText: "#f1f5f9",
  tooltipLabel: "#94a3b8",
  cursorFill: "rgba(255,255,255,0.04)",
  /** 2px surface gap between stacked segments and adjacent bars. */
  surface: "#0f1729",
} as const;

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

/** Recharts tooltip props — text always in ink tokens, never in the series colour. */
export const tooltipProps = {
  contentStyle: {
    backgroundColor: CHROME.tooltipBg,
    border: `1px solid ${CHROME.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: CHROME.tooltipText,
  },
  labelStyle: { color: CHROME.tooltipLabel, marginBottom: 4 },
  itemStyle: { color: CHROME.tooltipText },
  cursor: { fill: CHROME.cursorFill },
} as const;

export const axisTick = { fill: CHROME.axisTick, fontSize: 11 } as const;

export const legendStyle = { fontSize: 12, color: CHROME.axisTick, paddingTop: 12 } as const;

/** Interpolates the sequential ramp for a 0–1 magnitude. */
export function sequentialColor(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return CHROME.surface;
  const clamped = Math.min(1, t);
  const idx = Math.min(SEQUENTIAL.length - 1, Math.floor(clamped * SEQUENTIAL.length));
  return SEQUENTIAL[idx];
}

/**
 * Ink for a label sitting on `sequentialColor(t)`.
 *
 * The top of the ramp is a pale blue: white text on it was barely legible, which
 * is exactly where the cohort heatmap puts its most common value (100%). Past the
 * midpoint the cell needs dark ink instead.
 */
export function sequentialTextColor(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return CHROME.axisTick;
  const clamped = Math.min(1, t);
  const idx = Math.min(SEQUENTIAL.length - 1, Math.floor(clamped * SEQUENTIAL.length));
  return idx >= 4 ? "#0b1220" : "#ffffff";
}
