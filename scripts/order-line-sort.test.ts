import { describe, expect, it } from 'vitest';
import { sortOrderLines } from '../src/lib/orderLineSort';

describe('PDF saved line order', () => {
  it('keeps invoice 11127 boxes before shippers using saved line numbers, including gaps', () => {
    const items = [
      { line_number: 24, name: 'Sleep shipper' },
      { line_number: 13, name: 'Immune shipper' },
      { line_number: 12, name: 'Sleep box' },
      { line_number: 1, name: 'Immune box' },
      { line_number: 11, name: 'Boost box' },
    ];
    expect(sortOrderLines(items).map(item => item.line_number)).toEqual([1, 11, 12, 13, 24]);
    expect(items.map(item => item.line_number)).toEqual([24, 13, 12, 1, 11]);
  });

  it('puts unnumbered lines last and preserves their relative order', () => {
    const items = [{ id: 'a', line_number: null }, { id: 'b' }, { id: 'c', line_number: 2 }];
    expect(sortOrderLines(items).map(item => item.id)).toEqual(['c', 'a', 'b']);
  });
});