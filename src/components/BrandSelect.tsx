import { useState } from "react";
import { Check, ChevronsUpDown, Settings2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { BrandFilterValue, ProductBrand } from "@/hooks/useBrandFilter";

interface BrandSelectProps {
  brands: ProductBrand[];
  value: BrandFilterValue;
  onChange: (value: BrandFilterValue) => void;
  /** Optional item counts keyed by brand id, plus "none" for unbranded items. */
  counts?: Record<string, number>;
  /** When set, a "Manage brands" entry is added at the bottom of the list. */
  onManage?: () => void;
  /** Render a "Set up brands" button when the company has no brands yet (needs onManage). */
  showWhenEmpty?: boolean;
  /**
   * Set when the control sits inside a Dialog. A non-modal Popover inside a modal Dialog
   * cannot receive clicks (the dialog's pointer-events lock swallows them), so the list
   * opens but nothing can be picked.
   */
  inDialog?: boolean;
  className?: string;
}

/**
 * Brand filter as a searchable dropdown, styled like the other filter controls
 * (same Popover + Command pattern as the state filter on Artwork). Renders nothing
 * for companies without brands, so those screens are unchanged.
 */
export function BrandSelect({
  brands,
  value,
  onChange,
  counts,
  onManage,
  showWhenEmpty = false,
  inDialog = false,
  className,
}: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  if (brands.length === 0) {
    if (!(showWhenEmpty && onManage)) return null;
    return (
      <Button variant="outline" className={cn("font-normal", className)} onClick={onManage} type="button">
        <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
        Set up brands
      </Button>
    );
  }

  const unbranded = counts?.none ?? 0;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const label =
    value === "all" ? "All brands" : value === "none" ? "Unbranded" : brands.find((b) => b.id === value)?.name ?? "All brands";

  const pick = (next: BrandFilterValue) => {
    onChange(next);
    setOpen(false);
  };

  const row = (key: BrandFilterValue, text: string, count?: number) => (
    <CommandItem key={key} value={`${text} ${key}`} onSelect={() => pick(key)}>
      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === key ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{text}</span>
      {count !== undefined && <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{count}</span>}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={inDialog}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full sm:w-52 justify-between font-normal", className)}
        >
          <span className="flex items-center min-w-0">
            <Tag className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brands" />
          <CommandList>
            <CommandEmpty>No brand found.</CommandEmpty>
            <CommandGroup>
              {row("all", "All brands", total)}
              {brands.map((b) => row(b.id, b.name, counts ? counts[b.id] ?? 0 : undefined))}
              {unbranded > 0 && row("none", "Unbranded", unbranded)}
            </CommandGroup>
            {onManage && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="manage brands"
                    onSelect={() => {
                      setOpen(false);
                      onManage();
                    }}
                    className="text-muted-foreground"
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Manage brands
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default BrandSelect;
