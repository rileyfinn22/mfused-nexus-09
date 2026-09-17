import { cn } from "@/lib/utils";

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  /** Tint the value: only for numbers that need attention (overdue, unpaid). */
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

interface SummaryStripProps {
  items: SummaryItem[];
  className?: string;
}

const TONE: Record<NonNullable<SummaryItem["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-foreground",
};

/**
 * Quiet stat tiles: a row of small bordered boxes, label above, number below. No shadow,
 * no uppercase tracking, numbers at 18px rather than 30px. Colour only on values that
 * need attention.
 */
export function SummaryStrip({ items, className }: SummaryStripProps) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-[8.5rem] flex-1 sm:flex-none rounded-lg border border-border bg-card px-4 py-3"
        >
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={cn("mt-0.5 text-lg font-semibold leading-6 tabular-nums", TONE[item.tone ?? "default"])}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default SummaryStrip;
