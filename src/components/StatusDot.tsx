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

interface StatusDotProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
  /** Muted text regardless of tone (for secondary rows). */
  quiet?: boolean;
}

/**
 * Status as a small coloured dot and plain text, instead of a filled pill. Colour carries the
 * meaning; the text stays ink, so a column of forty statuses reads as a list, not confetti.
 */
export function StatusDot({ tone, children, className, quiet }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", quiet ? "text-muted-foreground" : TEXT[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export default StatusDot;
