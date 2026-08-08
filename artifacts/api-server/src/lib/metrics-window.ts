/**
 * The earliest date any metric is allowed to report on.
 *
 * The Academy started selling in January 2021. Hotmart, however, holds records
 * with `accession_date` values years earlier — test purchases, migrated rows and
 * imported spreadsheet lines with bad dates. With the period selector on "Todo
 * período" those rows stretched every chart back to 2015: the axis spanned 137
 * months, real bars became sub-pixel, and the monthly revenue table showed MRR in
 * years when the company did not exist.
 *
 * Clamping happens on the server so no caller can bypass it. Rows before the
 * floor are not deleted — `/api/metrics/data-coverage` reports exactly how many
 * there are and in which years, so the exclusion stays visible and auditable.
 *
 * Override with `METRICS_START_DATE=YYYY-MM-DD` if the cut-off ever changes.
 */
const DEFAULT_FLOOR = "2021-01-01";

function parseFloorDate(): Date {
  const raw = process.env.METRICS_START_DATE?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00-03:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(`${DEFAULT_FLOOR}T00:00:00-03:00`);
}

export const METRICS_FLOOR: Date = parseFloorDate();

/** ISO date (YYYY-MM-DD) of the floor, for display and for the API contract. */
export const METRICS_FLOOR_ISO: string = METRICS_FLOOR.toISOString().slice(0, 10);

/** Never let a requested window start before the company did. */
export function clampStart(startDate: Date): Date {
  return startDate < METRICS_FLOOR ? METRICS_FLOOR : startDate;
}
