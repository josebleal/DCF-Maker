import { cn } from "@/lib/utils";

interface KPITileProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
  accent?: boolean;
}

export function KPITile({ label, value, sub, trend, className, accent }: KPITileProps) {
  const trendColor =
    trend === "up"
      ? "text-positive"
      : trend === "down"
      ? "text-negative"
      : "text-neutral";

  return (
    <div
      className={cn(
        "kpi-tile",
        accent && "border-accent/20 bg-accent/5",
        className
      )}
    >
      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          "text-xl font-bold tabular-nums tracking-tight",
          accent ? "text-accent-light" : "text-slate-100",
          trend && trendColor
        )}
      >
        {value}
      </span>
      {sub && (
        <span className={cn("text-xs", trendColor || "text-slate-500")}>
          {sub}
        </span>
      )}
    </div>
  );
}
