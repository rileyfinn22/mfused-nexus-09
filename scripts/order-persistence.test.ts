import { describe, it, expect } from 'vitest';
import { reconcileOrderLines, assertOrderProcessable, persistOrderLines } from '../src/lib/orderPersistence';

describe('order line persistence', () => {
  it('retains existing line IDs instead of deleting matching products', () => {
    const result = reconcileOrderLines([{ id: 'line-11145', product_id: 'frx-1g' }], [{ product_id: 'frx-1g', quantity: 5000 }]);
    expect(result.rows[0].id).toBe('line-11145');
    expect(result.deleteIds).toEqual([]);
  });
  it('keeps repeated product lines distinct', () => {
    const result = reconcileOrderLines([{ id: 'a', product_id: 'p' }, { id: 'b', product_id: 'p' }], [{ product_id: 'p' }, { product_id: 'p' }]);
    expect(result.rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(result.deleteIds).toEqual([]);
  });
  it('does not delete old lines when a replacement write fails', async () => {
    const operations: string[] = [];
    const client: any = { rpc: async () => { operations.push('save'); return { data: null, error: new Error('Save failed') }; }, from: () => ({
      select: () => ({ eq: async () => ({ data: [{ id: 'old', product_id: 'old-product' }], error: null }) }),
      upsert: () => { operations.push('save'); return { select: async () => ({ data: null, error: new Error('Save failed') }) }; },
      delete: () => { operations.push('delete'); return { in: async () => ({ error: null }) }; },
    }) };
    await expect(persistOrderLines(client, '11145', [{ product_id: 'new-product' }])).rejects.toThrow('Save failed');
    expect(operations).toEqual(['save']);
  });
  it('blocks processing an empty saved order', () => {
    expect(() => assertOrderProcessable(0, false)).toThrow('no saved products');
    expect(() => assertOrderProcessable(1, false)).not.toThrow();
  });
  it('saves all four lines in one transaction without client-side deletion', async () => {
    const calls: any[] = [];
    const desired = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, product_id: id, quantity: 10, unit_price: index + 1 }));
    const client: any = {
      rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: 100, error: null }; },
      from: () => ({ select: () => ({ eq: async () => ({ data: desired, error: null }) }) }),
    };
    expect(await persistOrderLines(client, '11146', desired)).toBe(100);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_lines.map((line: any) => line.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(calls[0].args.p_lines.map((line: any) => line.line_number)).toEqual([1, 2, 3, 4]);
  });
  it('requires unsaved edits to be saved before processing', () => {
    expect(() => assertOrderProcessable(3, true)).toThrow('Save your order changes');
  });
});