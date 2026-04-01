import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown, Check } from "lucide-react";
import { usePeriod, type GlobalPeriodKey, PERIOD_LABELS } from "@/context/PeriodContext";

const QUICK_OPTIONS: GlobalPeriodKey[] = [
  "today",
  "yesterday",
  "7days",
  "30days",
  "3months",
  "6months",
  "1year",
  "all",
];

export function GlobalPeriodSelector() {
  const { period, customStart, customEnd, setPeriod, setCustomRange, dateRange } = usePeriod();
  const [showCustom, setShowCustom] = useState(false);
  const [draftStart, setDraftStart] = useState(customStart);
  const [draftEnd, setDraftEnd] = useState(customEnd);
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (period === "custom") {
      setDraftStart(customStart);
      setDraftEnd(customEnd);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleQuick(p: GlobalPeriodKey) {
    setPeriod(p);
    setShowCustom(false);
  }

  function handleApplyCustom() {
    if (draftStart && draftEnd && draftStart <= draftEnd) {
      setCustomRange(draftStart, draftEnd);
      setShowCustom(false);
    }
  }

  const isCustomActive = period === "custom";

  return (
    <div className="flex items-center gap-1 min-w-0">
      <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => handleQuick(opt)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors font-medium whitespace-nowrap ${
              period === opt
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {PERIOD_LABELS[opt]}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="relative" ref={customRef}>
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
            isCustomActive
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-secondary"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {isCustomActive
            ? `${dateRange.start} → ${dateRange.end}`
            : "Personalizado"}
          <ChevronDown className={`w-3 h-3 transition-transform ${showCustom ? "rotate-180" : ""}`} />
        </button>

        {showCustom && (
          <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px]">
            <p className="text-xs font-semibold text-foreground mb-3">Período personalizado</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Data inicial</label>
                <input
                  type="date"
                  value={draftStart}
                  max={draftEnd || undefined}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Data final</label>
                <input
                  type="date"
                  value={draftEnd}
                  min={draftStart || undefined}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <button
                onClick={handleApplyCustom}
                disabled={!draftStart || !draftEnd || draftStart > draftEnd}
                className="mt-1 flex items-center justify-center gap-1.5 w-full bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
