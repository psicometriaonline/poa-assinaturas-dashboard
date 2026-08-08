import { createContext, useContext, useState, type ReactNode } from "react";

export type GlobalPeriodKey =
  | "today"
  | "yesterday"
  | "7days"
  | "30days"
  | "3months"
  | "6months"
  | "1year"
  | "all"
  | "custom";

/**
 * The Academy started selling in January 2021. Hotmart holds records with older
 * accession dates (tests, migrations, bad spreadsheet rows), so "Todo período"
 * used to start in 2015 and stretch every axis across 137 mostly-empty months.
 * The server clamps to this same floor — this constant only keeps the UI honest
 * about what it is asking for. Keep both in sync (API: METRICS_START_DATE).
 */
export const METRICS_FLOOR = "2021-01-01";

export const PERIOD_LABELS: Record<GlobalPeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7days": "7 dias",
  "30days": "30 dias",
  "3months": "3 meses",
  "6months": "6 meses",
  "1year": "1 ano",
  all: "Todo período",
  custom: "Personalizado",
};

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function computeDateRange(
  period: GlobalPeriodKey,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: fmt(today), end: fmt(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }
    case "7days": {
      const s = new Date(today);
      s.setDate(today.getDate() - 6);
      return { start: fmt(s), end: fmt(today) };
    }
    case "30days": {
      const s = new Date(today);
      s.setDate(today.getDate() - 29);
      return { start: fmt(s), end: fmt(today) };
    }
    case "3months": {
      const s = new Date(today);
      s.setMonth(today.getMonth() - 3);
      return { start: fmt(s), end: fmt(today) };
    }
    case "6months": {
      const s = new Date(today);
      s.setMonth(today.getMonth() - 6);
      return { start: fmt(s), end: fmt(today) };
    }
    case "1year": {
      const s = new Date(today);
      s.setFullYear(today.getFullYear() - 1);
      return { start: maxDate(fmt(s), METRICS_FLOOR), end: fmt(today) };
    }
    case "custom":
      return {
        start: maxDate(customStart || fmt(new Date(today.getFullYear(), 0, 1)), METRICS_FLOOR),
        end: customEnd || fmt(today),
      };
    case "all":
    default:
      return { start: METRICS_FLOOR, end: fmt(today) };
  }
}

interface PeriodContextValue {
  period: GlobalPeriodKey;
  customStart: string;
  customEnd: string;
  setPeriod: (p: GlobalPeriodKey) => void;
  setCustomRange: (start: string, end: string) => void;
  dateRange: { start: string; end: string };
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<GlobalPeriodKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  function setCustomRange(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    setPeriod("custom");
  }

  const dateRange = computeDateRange(period, customStart, customEnd);

  return (
    <PeriodContext.Provider value={{ period, customStart, customEnd, setPeriod, setCustomRange, dateRange }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used inside PeriodProvider");
  return ctx;
}
