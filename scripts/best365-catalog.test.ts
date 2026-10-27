import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { parseOrderPickerConfig, orderPickerGroupKey } from '../src/hooks/useCompanyPortalFeatures';

// Mirrors Best 365's company-owned configuration; no shared category defaults change.
const config = parseOrderPickerConfig({
  groups: [
    { key: 'labels', label: 'Labels', product_types: ['label', 'labels'] },
    { key: 'tubes', label: 'Tubes', product_types: ['tube', 'tubes'] },
    { key: 'tinctures', label: 'Tinctures', product_types: ['tincture', 'tinctures'] },
    { key: 'closures', label: 'Closures', product_types: ['closure', 'closures'] },
  ],
  other_label: 'Other',
});

describe('Best 365 product category routing', () => {
  it.each([
    ['label', 'labels'], ['labels', 'labels'],
    ['tube', 'tubes'], ['tubes', 'tubes'],
    ['tincture', 'tinctures'], ['tinctures', 'tinctures'],
    ['closure', 'closures'], ['closures', 'closures'],
  ])('routes %s products to %s', (type, group) => {
    if (!config) throw new Error('Configuration must be valid');
    expect(orderPickerGroupKey(config, type)).toBe(group);
  });
  it('routes boxes, foils and uncategorized products to Other without relabeling them', () => {
    if (!config) throw new Error('Configuration must be valid');
    for (const type of ['box', 'pouches', null]) {
      expect(orderPickerGroupKey(config, type)).toBe('__other__');
    }
  });
});