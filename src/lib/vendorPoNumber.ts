import { supabase } from "@/integrations/supabase/client";

/**
 * Next number in the running vendor PO sequence: highest numeric PO number so far, plus one.
 * Same rule the Create Custom / Expense / Assignment dialogs apply, kept in one place so every
 * path that mints a PO lands on the same sequence. Numbers start at 3001.
 */
export async function nextVendorPoNumber(): Promise<string> {
  const { data } = await supabase
    .from("vendor_pos")
    .select("po_number")
    .order("created_at", { ascending: false })
    .limit(100);

  let maxNumber = 3000;
  for (const po of data || []) {
    const match = String(po.po_number || "").match(/(\d+)$/);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    if (num >= 3001 && num > maxNumber) maxNumber = num;
  }
  return String(maxNumber + 1);
}
