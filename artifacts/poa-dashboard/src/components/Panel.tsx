import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      Erro ao carregar dados{message ? `: ${message}` : "."}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  loading,
  isEmpty,
  emptyMessage = "Sem dados para o período",
  height = 240,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {loading ? (
        <div className="bg-muted rounded animate-pulse" style={{ height }} />
      ) : isEmpty ? (
        <div
          className="flex items-center justify-center text-muted-foreground text-sm"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** A labelled figure inside a panel — used where a chart would be overkill. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[#0ca30c]"
      : tone === "negative"
        ? "text-[#d03b3b]"
        : "text-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <p className={`text-lg sm:text-2xl font-bold truncate ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
