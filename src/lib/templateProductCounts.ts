import { supabase } from "@/integrations/supabase/client";

/**
 * Product counts per template.
 *
 * This used to be one `count: exact, head: true` request per template (hundreds of
 * round-trips on the admin view). Instead we pull the template_id column for the
 * templates in scope in a handful of batched requests and count client-side.
 */
export async function fetchTemplateProductCounts(
  templateIds: string[],
  companyId?: string | null
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!templateIds.length) return counts;

  const chunks: string[][] = [];
  for (let i = 0; i < templateIds.length; i += 150) {
    chunks.push(templateIds.slice(i, i + 150));
  }

  const results = await Promise.all(
    chunks.map(async (ids) => {
      let q = supabase
        .from("products")
        .select("template_id")
        .in("template_id", ids)
        .limit(100000);
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) {
        console.error("Error fetching template product counts:", error);
        return [] as any[];
      }
      return data || [];
    })
  );

  results.flat().forEach((row: any) => {
    if (!row?.template_id) return;
    counts[row.template_id] = (counts[row.template_id] || 0) + 1;
  });

  templateIds.forEach((id) => {
    if (counts[id] === undefined) counts[id] = 0;
  });

  return counts;
}
