import { describe, expect, it } from 'vitest';
import { resolveEmailRecipients } from '../src/lib/emailRecipients';

describe('Manual PO email recipients', () => {
  it('sends to a typed address with no saved vendor email', () => {
    expect(resolveEmailRecipients([], ' vendor@example.com ')).toEqual(['vendor@example.com']);
  });
  it('rejects an invalid typed address even when another recipient exists', () => {
    expect(() => resolveEmailRecipients(['saved@example.com'], 'invalid')).toThrow('Please enter a valid email address');
  });
  it('keeps saved recipients and deduplicates the typed address', () => {
    expect(resolveEmailRecipients(['saved@example.com'], 'SAVED@example.com')).toEqual(['saved@example.com']);
  });
  it('returns no recipients when nothing is saved or typed', () => {
    expect(resolveEmailRecipients([], '')).toEqual([]);
  });
});