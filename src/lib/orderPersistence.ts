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

/** Save replacements first, check every response, then remove only obsolete lines. */
export async function persistOrderLines(client: SupabaseClient, orderId: string, desired: Line[]) {
  const { data: existing, error: readError } = await client.from('order_items')
    .select('id, product_id, sku').eq('order_id', orderId);
  if (readError) throw readError;
  const { rows, deleteIds } = reconcileOrderLines(existing || [], desired);
  if (rows.length) {
    const { data: saved, error } = await client.from('order_items')
      .upsert(rows as any, { onConflict: 'id' }).select('id');
    if (error) throw error;
    if (saved?.length !== rows.length) throw new Error('Not all product lines saved. Please retry before leaving this page.');
  }
  if (deleteIds.length) {
    const { error } = await client.from('order_items').delete().in('id', deleteIds);
    if (error) throw error;
  }
  const { data: verified, error } = await client.from('order_items')
    .select('id, quantity, unit_price').eq('order_id', orderId);
  if (error) throw error;
  if (verified?.length !== desired.length) throw new Error('The saved product count does not match. Please retry.');
  return (verified || []).reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
}