import { supabase } from "@/integrations/supabase/client";

/**
 * Brand name per product id, for labelling orders and invoices by the brands they contain.
 * Products with no brand are simply absent from the map. Any failure yields an empty map so
 * the calling page renders without brand labels rather than breaking.
 */
export async function fetchBrandNamesByProductId(productIds: Array<string | null | undefined>): Promise<Record<string, string>> {
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

    const out: Record<string, string> = {};
    Object.entries(brandIdByProduct).forEach(([productId, brandId]) => {
      const name = nameByBrand[brandId];
      if (name) out[productId] = name;
    });
    return out;
  } catch (error) {
    console.error("Error fetching brand names for products:", error);
    return {};
  }
}

/** Distinct brand names across a set of line items, in alphabetical order. */
export function brandNamesForItems(
  items: Array<{ product_id?: string | null }> | null | undefined,
  brandByProduct: Record<string, string>
): string[] {
  const names = new Set<string>();
  (items || []).forEach((item) => {
    const name = item.product_id ? brandByProduct[item.product_id] : undefined;
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
