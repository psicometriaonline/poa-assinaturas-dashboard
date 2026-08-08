import type { Granularity } from "@/lib/time-grouping";

export function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1 shrink-0">
      {(
        [
          { key: "mes", label: "Mês" },
          { key: "ano", label: "Ano" },
        ] as { key: Granularity; label: string }[]
      ).map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
            value === t.key
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function YearTabs({
  years,
  value,
  onChange,
}: {
  years: string[];
  value: string;
  onChange: (year: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1 shrink-0 overflow-x-auto">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onChange(year)}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap ${
            value === year
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
