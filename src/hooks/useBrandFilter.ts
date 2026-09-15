import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProductBrand {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
}

/** "all" = no filter, "none" = only unbranded items, otherwise a brand id. */
export type BrandFilterValue = "all" | "none" | string;

const storageKey = (companyId: string) => `brandFilter:${companyId}`;

const readStored = (companyId: string | null | undefined): BrandFilterValue => {
  if (!companyId) return "all";
  try {
    return localStorage.getItem(storageKey(companyId)) || "all";
  } catch {
    return "all";
  }
};

/**
 * Brands for one company plus a brand filter that follows the user from Products to
 * Artwork to the order item picker (persisted per company in localStorage).
 *
 * Companies with no brands get an empty list and `matches` always returns true, so
 * every screen that uses this renders exactly as before for them.
 */
export function useBrandFilter(companyId: string | null | undefined) {
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [loading, setLoading] = useState(false);
  const [brandFilter, setBrandFilterState] = useState<BrandFilterValue>(() => readStored(companyId));

  const refresh = useCallback(async () => {
    if (!companyId) {
      setBrands([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_brands")
        .select("id, company_id, name, sort_order")
        .eq("company_id", companyId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      setBrands((data as ProductBrand[]) || []);
    } catch (error) {
      // A missing table or a denied read must never break the page: behave as "no brands".
      console.error("Error fetching product brands:", error);
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Switching company re-reads that company's remembered filter.
  useEffect(() => {
    setBrandFilterState(readStored(companyId));
  }, [companyId]);

  // A remembered brand that no longer exists falls back to "all".
  useEffect(() => {
    if (loading) return;
    if (brandFilter !== "all" && brandFilter !== "none" && !brands.some((b) => b.id === brandFilter)) {
      setBrandFilterState("all");
    }
  }, [brands, loading, brandFilter]);

  const setBrandFilter = useCallback(
    (value: BrandFilterValue) => {
      setBrandFilterState(value);
      if (!companyId) return;
      try {
        if (value === "all") localStorage.removeItem(storageKey(companyId));
        else localStorage.setItem(storageKey(companyId), value);
      } catch {
        /* storage unavailable: filter still works for this page view */
      }
    },
    [companyId]
  );

  const matches = useCallback(
    (brandId: string | null | undefined) => {
      if (brands.length === 0 || brandFilter === "all") return true;
      if (brandFilter === "none") return !brandId;
      return brandId === brandFilter;
    },
    [brands.length, brandFilter]
  );

  const brandName = useCallback(
    (brandId: string | null | undefined) => (brandId ? brands.find((b) => b.id === brandId)?.name ?? null : null),
    [brands]
  );

  const activeBrand = useMemo(
    () => (brandFilter === "all" || brandFilter === "none" ? null : brands.find((b) => b.id === brandFilter) ?? null),
    [brands, brandFilter]
  );

  return { brands, loading, refresh, brandFilter, setBrandFilter, matches, brandName, activeBrand };
}
