import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Quiet empty state: a sentence, a hint, maybe one action. No large grey icon.
 */
export function EmptyState({ title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-14 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
