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
    const client: any = { from: () => ({
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
  it('requires unsaved edits to be saved before processing', () => {
    expect(() => assertOrderProcessable(3, true)).toThrow('Save your order changes');
  });
});