/**
 * Last-known result per list page, kept for the life of the tab.
 *
 * Pages fetch with plain useEffect + useState, so every navigation started from an empty
 * spinner even when the same data had been on screen seconds earlier. A page now hydrates
 * from here first and refetches in the background; the user sees the previous result at
 * once and it updates in place. Keys include the company so switching seats never shows
 * another company's data.
 */
const store = new Map<string, { data: unknown; at: number }>();

/** Ignore entries older than this; a fresh fetch is always started anyway. */
const MAX_AGE_MS = 30 * 60 * 1000;

export function getCached<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function clearCached(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
