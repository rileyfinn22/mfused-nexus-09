import { useState } from "react";
import { Check, ChevronsUpDown, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyScope } from "@/contexts/CompanyScopeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Header control for the master company filter (VibePKG staff only).
 * Off: a quiet "All companies" button. On: a highlighted "Working in <company>" pill with
 * a clear button, so it's obvious every list on screen is scoped.
 */
export function CompanyScopePicker({ className }: { className?: string }) {
  const { companies, scopeCompany, setScopeCompanyId, loading } = useCompanyScope();
  const [query, setQuery] = useState("");

  if (loading && companies.length === 0) return null;

  const visible = query.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : companies;

  return (
    <div className={cn("flex items-center gap-1 min-w-0", className)}>
      <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={scopeCompany ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-9 gap-2 min-w-0 max-w-[280px]",
              scopeCompany && "bg-primary/10 text-primary hover:bg-primary/15 border border-primary/30"
            )}
            title={scopeCompany ? `All pages are filtered to ${scopeCompany.name}` : "Work inside one company"}
          >
            <Filter className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {scopeCompany ? (
                <>
                  <span className="hidden md:inline text-primary/70">Working in · </span>
                  {scopeCompany.name}
                </>
              ) : (
                "All companies"
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[280px] bg-popover text-popover-foreground border shadow-md z-50 p-0">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // The menu's own typeahead otherwise swallows these keystrokes.
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search companies..."
              className="h-8"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            <DropdownMenuItem onClick={() => setScopeCompanyId(null)} className="flex items-center gap-2 cursor-pointer">
              <span className="flex-1 text-sm">All companies</span>
              {!scopeCompany && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No companies match “{query}”.</p>
            ) : (
              visible.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => setScopeCompanyId(company.id)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className="flex-1 text-sm truncate">{company.name}</span>
                  {company.id === scopeCompany?.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {scopeCompany && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setScopeCompanyId(null)}
          aria-label="Clear company filter"
          title="Back to all companies"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default CompanyScopePicker;
