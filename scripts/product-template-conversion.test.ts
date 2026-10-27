import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, clearCached } = vi.hoisted(() => ({ rpc: vi.fn(), clearCached: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/lib/pageCache', () => ({ clearCached }));
import { convertProductToTemplate } from '../src/lib/productTemplateConversion';

describe('product to template conversion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the original product ID to one atomic conversion without replacing it', async () => {
    rpc.mockResolvedValue({ data: 'new-template', error: null });
    expect(await convertProductToTemplate('original-sku-product', ' Pink Fox Can ')).toBe('new-template');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('convert_product_to_template', {
      p_product_id: 'original-sku-product', p_template_name: 'Pink Fox Can',
    });
    expect(clearCached).toHaveBeenCalledWith('products:');
  });

  it('rejects an empty template name without writing', async () => {
    await expect(convertProductToTemplate('original', '  ')).rejects.toThrow('Template name is required');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not report conversion success for a customer denied by the staff-only function', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Only VibePKG staff can convert products to templates' } });
    await expect(convertProductToTemplate('original', 'Can')).rejects.toThrow('Only VibePKG staff');
    expect(clearCached).not.toHaveBeenCalled();
  });
});