import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  brand: "bg-brand",
};

const TEXT: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-foreground",
  success: "text-foreground",
  warning: "text-foreground",
  danger: "text-danger",
  brand: "text-foreground",
};

/** Tinted pill styles: coloured text on a faint wash of the same hue, so the
    status reads at a glance even in a dense table. */
const PILL: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/12 text-info border-info/30",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-danger/12 text-danger border-danger/30",
  brand: "bg-brand/12 text-brand border-brand/30",
};

interface StatusDotProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
  /** Muted text regardless of tone (for secondary rows). */
  quiet?: boolean;
  /** Tinted pill background behind dot + text, for statuses that must stand out. */
  pill?: boolean;
}

/**
 * Status as a small coloured dot and text. By default the text stays ink so a column
 * of forty statuses reads as a list, not confetti; with `pill`, the status sits on a
 * faint tinted wash with coloured text so it pops (used for invoice states).
 */
export function StatusDot({ tone, children, className, quiet, pill }: StatusDotProps) {
  if (pill) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
          PILL[tone],
          className,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[tone])} aria-hidden />
        {children}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", quiet ? "text-muted-foreground" : TEXT[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export default StatusDot;
