import { supabase } from "@/integrations/supabase/client";

export interface BrandRef {
  id: string;
  name: string;
}

/**
 * Brand per product id, for labelling and filtering orders and invoices by the brands they
 * contain. Products with no brand are simply absent from the map. Any failure yields an empty
 * map so the calling page renders without brand labels rather than breaking.
 */
export async function fetchBrandsByProductId(productIds: Array<string | null | undefined>): Promise<Record<string, BrandRef>> {
  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return {};

  try {
    const brandIdByProduct: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from("products")
        .select("id, brand_id")
        .in("id", ids.slice(i, i + 150))
        .not("brand_id", "is", null);
      if (error) throw error;
      (data || []).forEach((p) => {
        if (p.brand_id) brandIdByProduct[p.id] = p.brand_id;
      });
    }

    const brandIds = Array.from(new Set(Object.values(brandIdByProduct)));
    if (brandIds.length === 0) return {};

    const nameByBrand: Record<string, string> = {};
    for (let i = 0; i < brandIds.length; i += 150) {
      const { data, error } = await supabase
        .from("product_brands")
        .select("id, name")
        .in("id", brandIds.slice(i, i + 150));
      if (error) throw error;
      (data || []).forEach((b) => {
        nameByBrand[b.id] = b.name;
      });
    }

    const out: Record<string, BrandRef> = {};
    Object.entries(brandIdByProduct).forEach(([productId, brandId]) => {
      const name = nameByBrand[brandId];
      if (name) out[productId] = { id: brandId, name };
    });
    return out;
  } catch (error) {
    console.error("Error fetching brands for products:", error);
    return {};
  }
}

/** Distinct brands across a set of line items, alphabetical by name. */
export function brandsForItems(
  items: Array<{ product_id?: string | null }> | null | undefined,
  brandByProduct: Record<string, BrandRef>
): BrandRef[] {
  const seen = new Map<string, BrandRef>();
  (items || []).forEach((item) => {
    const brand = item.product_id ? brandByProduct[item.product_id] : undefined;
    if (brand) seen.set(brand.id, brand);
  });
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Does a record with these brands pass the brand filter ("all" | "none" | brand id)? */
export function recordMatchesBrandFilter(brands: BrandRef[] | undefined, brandFilter: string): boolean {
  if (brandFilter === "all") return true;
  const list = brands || [];
  if (brandFilter === "none") return list.length === 0;
  return list.some((b) => b.id === brandFilter);
}
