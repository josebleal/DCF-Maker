import { cn } from "@/lib/utils";

type BadgeVariant = "positive" | "negative" | "warning" | "neutral" | "accent" | "blue";

const variantStyles: Record<BadgeVariant, string> = {
  positive: "bg-green-400/10 text-green-400 border-green-400/20",
  negative: "bg-red-400/10 text-red-400 border-red-400/20",
  warning: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  neutral: "bg-slate-400/10 text-slate-400 border-slate-400/20",
  accent: "bg-blue-500/10 text-blue-400 border-blue-400/20",
  blue: "bg-blue-900/40 text-blue-300 border-blue-700/40",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
