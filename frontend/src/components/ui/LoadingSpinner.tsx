import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-16", className)}>
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-navy-700" />
        <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin" />
      </div>
    </div>
  );
}

export function InlineLoader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <div className="h-4 w-4 rounded-full border-2 border-t-accent border-navy-700 animate-spin" />
      {text}
    </div>
  );
}
