import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  invertChange?: boolean;
}

export function KPICard({ title, value, change, subtitle, loading, error, errorMessage, invertChange }: KPICardProps) {
  if (loading) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-3 sm:p-5 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4 mb-3" />
        <div className="h-8 bg-muted rounded w-1/2 mb-2" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-3 sm:p-5">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-sm text-destructive">{errorMessage ?? "Erro ao carregar"}</p>
      </div>
    );
  }

  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === undefined || change === 0;

  const goodChange = invertChange ? isNegative : isPositive;
  const badChange = invertChange ? isPositive : isNegative;

  return (
    <div className="bg-card border border-card-border rounded-xl p-3 sm:p-5">
      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">{title}</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground mb-1 truncate">{value}</p>
      <div className="flex items-center gap-1.5">
        {!isNeutral && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${goodChange ? "text-[#22c55e]" : badChange ? "text-[#ef4444]" : "text-muted-foreground"}`}>
            {goodChange && <TrendingUp className="w-3 h-3" />}
            {badChange && <TrendingDown className="w-3 h-3" />}
            {isNeutral && <Minus className="w-3 h-3" />}
            {change !== undefined ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : null}
          </span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
