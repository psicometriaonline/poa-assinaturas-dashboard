export const MONTH_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

/** "2026-03" → "mar" */
export function monthAbbr(monthKey: string): string {
  const idx = parseInt(monthKey.slice(5, 7), 10) - 1;
  return MONTH_ABBR[idx] ?? monthKey;
}

/** "2026-03" → "mar/26" */
export function monthLabel(monthKey: string): string {
  return `${monthAbbr(monthKey)}/${monthKey.slice(2, 4)}`;
}

export function yearOf(monthKey: string): string {
  return monthKey.slice(0, 4);
}

/** Distinct years present in a list of `YYYY-MM` keys, newest first. */
export function yearsFrom(monthKeys: string[]): string[] {
  return Array.from(new Set(monthKeys.map(yearOf))).sort((a, b) => b.localeCompare(a));
}

export type Granularity = "mes" | "ano";

/**
 * Rolls a monthly series up to calendar years.
 *
 * `sumFields` are added together; `lastFields` take the value of the latest month
 * in the year — a stock like MRR must not be summed across months, only a flow
 * like "new subscriptions" may be.
 */
export function rollUpByYear<T extends { monthKey: string; label: string }>(
  rows: T[],
  sumFields: Array<keyof T>,
  lastFields: Array<keyof T> = []
): T[] {
  const byYear = new Map<string, T>();

  for (const row of rows) {
    const year = yearOf(row.monthKey);
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, { ...row, label: year });
      continue;
    }
    for (const field of sumFields) {
      (existing[field] as number) = (existing[field] as number) + (row[field] as number);
    }
    // rows arrive oldest-first, so the last write wins for stock fields
    for (const field of lastFields) {
      existing[field] = row[field];
    }
  }

  return Array.from(byYear.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Below this many months a monthly axis is still readable; above it the bars
 * become sub-pixel and the chart reads as empty, so year is the safer default.
 */
export const MONTHLY_AXIS_LIMIT = 30;

export function defaultGranularity(monthCount: number): Granularity {
  return monthCount > MONTHLY_AXIS_LIMIT ? "ano" : "mes";
}
