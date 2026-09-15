import { Tag, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BrandFilterValue, ProductBrand } from "@/hooks/useBrandFilter";

interface BrandFilterBarProps {
  brands: ProductBrand[];
  value: BrandFilterValue;
  onChange: (value: BrandFilterValue) => void;
  /** Optional item counts keyed by brand id, plus "none" for unbranded items. */
  counts?: Record<string, number>;
  /** When set, a "Manage brands" button is rendered. */
  onManage?: () => void;
  /** Render the bar (with only the manage button) even when the company has no brands yet. */
  showWhenEmpty?: boolean;
  className?: string;
}

/**
 * One row of brand chips. Renders nothing for companies without brands, so screens that
 * include it look unchanged until a company starts using brands.
 */
export function BrandFilterBar({
  brands,
  value,
  onChange,
  counts,
  onManage,
  showWhenEmpty = false,
  className,
}: BrandFilterBarProps) {
  if (brands.length === 0 && !(showWhenEmpty && onManage)) return null;

  const unbranded = counts?.none ?? 0;

  const chip = (key: BrandFilterValue, label: string, count?: number) => {
    const active = value === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={active}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground hover:bg-accent"
        )}
      >
        <span className="truncate max-w-[12rem]">{label}</span>
        {count !== undefined && (
          <span className={cn("text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Tag className="h-4 w-4 text-muted-foreground mr-0.5" aria-hidden />
      {brands.length > 0 && chip("all", "All brands")}
      {brands.map((b) => chip(b.id, b.name, counts ? counts[b.id] ?? 0 : undefined))}
      {brands.length > 0 && unbranded > 0 && chip("none", "Unbranded", unbranded)}
      {onManage && (
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={onManage} type="button">
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          {brands.length === 0 ? "Add brands" : "Manage"}
        </Button>
      )}
    </div>
  );
}

export default BrandFilterBar;
