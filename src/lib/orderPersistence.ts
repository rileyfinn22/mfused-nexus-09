import type { SupabaseClient } from '@supabase/supabase-js';

type Line = Record<string, any>;

/** Match repeated catalog lines individually; never replace their saved IDs. */
export function reconcileOrderLines(existing: Line[], desired: Line[]) {
  const remaining = new Map(existing.map(line => [line.id, line]));
  const rows = desired.map(line => {
    const match = (line.id ? remaining.get(line.id) : undefined) ||
      [...remaining.values()].find(saved =>
        line.product_id ? saved.product_id === line.product_id :
          saved.product_id === null && saved.sku === line.sku);
    if (match) remaining.delete(match.id);
    return { ...line, id: match?.id || crypto.randomUUID() };
  });
  return { rows, deleteIds: [...remaining.keys()] };
}

export function assertOrderProcessable(lineCount: number, editing: boolean) {
  if (editing) throw new Error('Save your order changes before processing.');
  if (lineCount === 0) throw new Error('This order has no saved products. Add and save its products before processing.');
}

/** Persist the complete line set atomically, including reordering and removals. */
export async function persistOrderLines(client: SupabaseClient, orderId: string, desired: Line[]) {
  const { data: existing, error: readError } = await client.from('order_items')
    .select('id, product_id, sku').eq('order_id', orderId);
  if (readError) throw readError;
  const { rows, deleteIds } = reconcileOrderLines(existing || [], desired);
  const { data: subtotal, error: saveError } = await client.rpc('save_order_lines', {
    p_order_id: orderId,
    p_lines: rows.map((line, index) => ({ ...line, line_number: index + 1 })),
  });
  if (saveError) throw saveError;
  const { data: verified, error } = await client.from('order_items')
    .select('id, quantity, unit_price').eq('order_id', orderId);
  if (error) throw error;
  if (verified?.length !== desired.length) throw new Error('The saved product count does not match. Please retry.');
  return Number(subtotal);
}