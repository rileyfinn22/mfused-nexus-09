import { Check, ChevronsUpDown, Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Compact company switcher for the top header (more discoverable than sidebar-only).
 */
export function CompanyHeaderSwitcher({ className }: { className?: string }) {
  const { companies, activeCompany, setActiveCompany, isMultiCompany } = useCompany();

  if (!activeCompany) return null;

  if (!isMultiCompany) {
    return (
      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {activeCompany.name}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 px-2 gap-2 min-w-0 justify-start hover:bg-accent",
            className
          )}
        >
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-medium text-foreground truncate max-w-[220px]">
              {activeCompany.name}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {companies.length} companies
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[260px] bg-popover text-popover-foreground border shadow-md z-50"
      >
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => setActiveCompany(company)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="w-7 h-7 bg-muted rounded-md flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{company.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{company.role}</p>
            </div>
            {company.id === activeCompany.id && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
