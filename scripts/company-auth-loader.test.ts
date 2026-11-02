import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompanyAuthLoader } from '../src/lib/companyAuthLoader';

afterEach(() => vi.useRealTimers());
describe('company session loading', () => {
  it('defers queries until after the auth callback returns and deduplicates repeated sign-ins', () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {});
    const pending = vi.fn();
    const loader = createCompanyAuthLoader(load, pending);
    loader.update('riley');
    loader.update('riley');
    expect(pending).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('riley');
  });
  it('loads only the latest session when sign-out and sign-in overlap', () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {});
    const loader = createCompanyAuthLoader(load, () => {});
    loader.update('old-user');
    loader.update(null);
    loader.update('new-user');
    vi.runAllTimers();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('new-user');
  });
  it('does not load after unmount', () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {});
    const loader = createCompanyAuthLoader(load, () => {});
    loader.update('riley');
    loader.dispose();
    vi.runAllTimers();
    expect(load).not.toHaveBeenCalled();
  });
});