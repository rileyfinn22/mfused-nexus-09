import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/contexts/CompanyContext";

interface CompanySwitcherProps {
  collapsed?: boolean;
}

export function CompanySwitcher({ collapsed = false }: CompanySwitcherProps) {
  const { companies, activeCompany, setActiveCompany, isMultiCompany } = useCompany();

  if (!activeCompany) return null;

  // If user only has one company, just show the name (no dropdown)
  if (!isMultiCompany) {
    return (
      <div className={cn(
        "flex items-center gap-3",
        collapsed && "justify-center"
      )}>
        <div className="w-9 h-9 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow shrink-0">
          <span className="text-primary-foreground font-bold text-sm">
            {activeCompany.name.charAt(0).toUpperCase()}
          </span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sidebar-foreground text-sm truncate">
              {activeCompany.name}
            </h2>
            <p className="text-[10px] text-muted-foreground">Invoice Portal</p>
          </div>
        )}
      </div>
    );
  }

  // Multi-company: show dropdown switcher
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 px-0 hover:bg-sidebar-accent h-auto py-0",
            collapsed && "justify-center px-2"
          )}
        >
          <div className="w-9 h-9 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow shrink-0">
            <span className="text-primary-foreground font-bold text-sm">
              {activeCompany.name.charAt(0).toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <h2 className="font-semibold text-sidebar-foreground text-sm truncate">
                  {activeCompany.name}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {companies.length} companies
                </p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
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
