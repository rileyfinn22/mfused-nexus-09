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
  muted: "text-muted-foreground",
};

/**
 * Replaces the row of four stat cards. A single quiet line of label / value pairs with
 * hairline dividers: the numbers are still there, they just stop shouting.
 */
export function SummaryStrip({ items, className }: SummaryStripProps) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm", className)}>
      {items.map((item, i) => (
        <div key={item.label} className="flex items-baseline gap-2">
          {i > 0 && <span className="hidden sm:inline-block h-3 w-px bg-border self-center -ml-3" aria-hidden />}
          <span className="text-muted-foreground">{item.label}</span>
          <span className={cn("font-medium tabular-nums", TONE[item.tone ?? "default"])}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default SummaryStrip;
