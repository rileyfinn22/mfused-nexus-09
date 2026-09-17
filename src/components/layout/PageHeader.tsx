import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  /** One short line under the title. Leave it out unless it says something the title doesn't. */
  description?: React.ReactNode;
  /** Primary and secondary actions, right-aligned. */
  actions?: React.ReactNode;
  /** Small element before the title (a back button, an icon). */
  leading?: React.ReactNode;
  className?: string;
}

/**
 * The one page header. Title left, actions right, no divider, no icon glued to the title.
 * Every page uses this so the top of the app looks the same everywhere.
 */
export function PageHeader({ title, description, actions, leading, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {leading}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight leading-7 truncate">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
