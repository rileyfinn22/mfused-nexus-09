import { lazy, type ComponentType } from "react";

/**
 * After a deploy, old chunk file names disappear, so an open tab fails with
 * "Failed to fetch dynamically imported module" and shows a blank screen.
 * Retry once, then reload the page once to pick up the new build.
 */
const RELOAD_KEY = "chunk-reload-at";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // One quick retry handles a transient network blip.
      try {
        return await factory();
      } catch (err2) {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 10000) {
          // Don't cut off an artwork upload: wait for it to finish, then reload.
          while (((window as any).__artworkUploads || 0) > 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          // Never resolves; the reload takes over.
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2;
      }
    }
  });
}
