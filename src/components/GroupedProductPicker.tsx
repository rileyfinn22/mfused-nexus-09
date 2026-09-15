import { useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BrandFilterValue, ProductBrand } from "@/hooks/useBrandFilter";
import { orderPickerGroupKey, type OrderPickerConfig } from "@/hooks/useCompanyPortalFeatures";

export interface PickerProduct {
  id: string;
  name: string;
  item_id: string | null;
  price: number | null;
  state: string | null;
  brand_id?: string | null;
  product_type?: string | null;
}

export interface PickedItem {
  productId: string;
  quantity: number;
  unit_price?: number;
}

interface GroupedProductPickerProps {
  /** Products still available to add (already-added ones are excluded by the caller). */
  products: PickerProduct[];
  brands: ProductBrand[];
  config: OrderPickerConfig;
  brandFilter: BrandFilterValue;
  onBrandFilterChange: (value: BrandFilterValue) => void;
  onAdd: (items: PickedItem[]) => void;
  onCancel: () => void;
}

const NONE = "none";

/**
 * Name as shown in the picker. The catalog-wide "General" state is noise for a brand-organised
 * catalog (every Nutrastrips SKU carries it), so only a real state prefix survives.
 */
const displayName = (p: PickerProduct) =>
  p.state && p.state.toLowerCase() !== "general" ? `${p.state} - ${p.name}` : p.name;

/**
 * "Add items" for companies whose catalog is organised by brand and kind (switched on per
 * company via portal_features.order_picker). Brands down the left, products grouped by
 * kind on the right, quantity entered on the row itself so picking and counting is one step.
 */
export function GroupedProductPicker({
  products,
  brands,
  config,
  brandFilter,
  onBrandFilterChange,
  onAdd,
  onCancel,
}: GroupedProductPickerProps) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const q = search.trim().toLowerCase();
  const searched = useMemo(
    () =>
      q
        ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.item_id && p.item_id.toLowerCase().includes(q)))
        : products,
    [products, q]
  );

  // Brand rail counts follow the search so "Curapeptix 3" means three matches, not three SKUs.
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    searched.forEach((p) => {
      const key = p.brand_id || NONE;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [searched]);

  const brandById = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b])), [brands]);

  // Sections to render: one per brand when "all", otherwise just the chosen brand.
  const sections = useMemo(() => {
    const wanted =
      brandFilter === "all"
        ? [...brands.map((b) => b.id), NONE]
        : [brandFilter === "none" ? NONE : brandFilter];
    return wanted
      .map((brandKey) => {
        const inBrand = searched.filter((p) => (p.brand_id || NONE) === brandKey);
        if (inBrand.length === 0) return null;
        const byGroup: Record<string, PickerProduct[]> = {};
        inBrand.forEach((p) => {
          const g = orderPickerGroupKey(config, p.product_type);
          (byGroup[g] ||= []).push(p);
        });
        const groups = [
          ...config.groups.map((g) => ({ key: g.key, label: g.label, items: byGroup[g.key] || [] })),
          { key: "__other__", label: config.other_label, items: byGroup.__other__ || [] },
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.name.localeCompare(b.name)) }));
        return {
          key: brandKey,
          label: brandKey === NONE ? "Unbranded" : brandById[brandKey]?.name ?? "Unknown brand",
          groups,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [brands, brandById, brandFilter, searched, config]);

  const picked = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([productId, quantity]) => {
          const product = products.find((p) => p.id === productId);
          return {
            productId,
            quantity,
            ...(product?.price != null ? { unit_price: Number(product.price) } : {}),
            price: product?.price != null ? Number(product.price) : 0,
          };
        }),
    [qty, products]
  );
  const pickedCount = picked.length;
  const pickedUnits = picked.reduce((s, i) => s + i.quantity, 0);
  const pickedTotal = picked.reduce((s, i) => s + i.quantity * i.price, 0);

  const setQuantity = (id: string, n: number) =>
    setQty((prev) => {
      const next = { ...prev };
      if (n > 0) next[id] = Math.floor(n);
      else delete next[id];
      return next;
    });

  const railItem = (key: BrandFilterValue, label: string, count: number | undefined) => {
    const active = brandFilter === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onBrandFilterChange(key)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-sm text-left rounded-md",
          active ? "bg-accent font-medium" : "hover:bg-accent/60 text-muted-foreground"
        )}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && <span className="ml-2 text-xs tabular-nums opacity-70">{count}</span>}
      </button>
    );
  };

  const totalCount = searched.length;
  const unbrandedCount = brandCounts[NONE] || 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add items</DialogTitle>
        <DialogDescription>Pick a brand, then type a quantity on each product you need.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or item ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      <div className="flex-1 min-h-0 flex border rounded-md overflow-hidden">
        {/* Brand rail */}
        <div className="w-48 shrink-0 border-r bg-muted/30 p-2 space-y-0.5 overflow-y-auto">
          {railItem("all", "All brands", totalCount)}
          {brands.map((b) => railItem(b.id, b.name, brandCounts[b.id] || 0))}
          {unbrandedCount > 0 && railItem("none", "Unbranded", unbrandedCount)}
        </div>

        {/* Products by kind */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {sections.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
              {q ? "No products match that search." : "No products available for this brand."}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                {brandFilter === "all" && (
                  <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 text-sm font-semibold">
                    {section.label}
                  </div>
                )}
                {section.groups.map((group) => (
                  <div key={group.key} className="border-b last:border-b-0">
                    <div className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label} <span className="normal-case tracking-normal opacity-70">({group.items.length})</span>
                    </div>
                    <div>
                      {group.items.map((product) => {
                        const n = qty[product.id] || 0;
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 hover:bg-muted/40",
                              n > 0 && "bg-primary/5"
                            )}
                          >
                            {/* Plain text on purpose: a row is only picked by entering a quantity,
                                so scrolling or a stray click never adds anything. */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{displayName(product)}</p>
                              <p className="text-xs text-muted-foreground font-mono">{product.item_id || "No SKU"}</p>
                            </div>
                            <span className="w-20 text-right text-sm tabular-nums shrink-0">
                              {product.price != null ? `$${Number(product.price).toFixed(3)}` : "—"}
                            </span>
                            <div className="flex items-center shrink-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-r-none"
                                onClick={() => setQuantity(product.id, n - 1)}
                                disabled={n === 0}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={n === 0 ? "" : n}
                                placeholder="0"
                                onChange={(e) => setQuantity(product.id, parseInt(e.target.value, 10) || 0)}
                                className="h-8 w-20 rounded-none border-x-0 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                aria-label={`Quantity for ${product.name}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-l-none"
                                onClick={() => setQuantity(product.id, n + 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        <p className="text-sm text-muted-foreground tabular-nums">
          {pickedCount === 0
            ? "Nothing picked yet"
            : `${pickedCount} item${pickedCount !== 1 ? "s" : ""}, ${pickedUnits.toLocaleString()} units, $${pickedTotal.toFixed(2)}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pickedCount === 0}
            onClick={() => onAdd(picked.map(({ productId, quantity, unit_price }) => ({ productId, quantity, unit_price })))}
          >
            Add {pickedCount > 0 ? pickedCount : ""} {pickedCount === 1 ? "item" : "items"}
          </Button>
        </div>
      </div>
    </>
  );
}

export default GroupedProductPicker;
