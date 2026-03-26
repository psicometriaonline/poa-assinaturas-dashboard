import type { PeriodKey } from "@/lib/api";

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (v: PeriodKey) => void;
}

const OPTIONS: { label: string; value: PeriodKey }[] = [
  { label: "Este mês", value: "month" },
  { label: "3 meses", value: "3months" },
  { label: "6 meses", value: "6months" },
  { label: "12 meses", value: "12months" },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 bg-secondary rounded-lg p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${
            value === opt.value
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
