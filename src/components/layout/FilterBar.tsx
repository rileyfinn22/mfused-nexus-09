import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Filter controls (selects, brand picker) in one row after the search box. */
  children?: React.ReactNode;
  /** Right-aligned controls, e.g. a grid/list toggle. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * One filter row for every list page: search first, then filters, anything else on the right.
 * Controls are the standard 36px inputs; nothing here is a chip or a pill.
 */
export function FilterBar({ search, children, trailing, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {search && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={search.placeholder ?? "Search"}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              className="pl-8"
            />
          </div>
        )}
        {children}
      </div>
      {trailing && <div className="flex items-center gap-2 shrink-0">{trailing}</div>}
    </div>
  );
}

export default FilterBar;
