import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Filters = Record<string, string>;

const storageKey = (page: string) => `listFilters:${page}`;

const readStored = <T extends Filters>(page: string, defaults: T): Partial<T> => {
  try {
    const raw = sessionStorage.getItem(storageKey(page));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<T> = {};
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = parsed[key as string];
      if (typeof v === "string") out[key] = v as T[keyof T];
    }
    return out;
  } catch {
    return {};
  }
};

const writeStored = <T extends Filters>(page: string, defaults: T, values: T) => {
  try {
    const diff: Partial<T> = {};
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      if (values[key] !== defaults[key]) diff[key] = values[key];
    }
    if (Object.keys(diff).length === 0) sessionStorage.removeItem(storageKey(page));
    else sessionStorage.setItem(storageKey(page), JSON.stringify(diff));
  } catch {
    /* storage unavailable: filters still work for this page view */
  }
};

/**
 * Filters for a list page that survive leaving the page and coming back — open an
 * order, press Back, and the company / status / search you had are still applied.
 *
 * Values live in sessionStorage under `listFilters:<page>` (per tab, so a fresh tab starts
 * clean). Keys listed in `urlKeys` are also mirrored to the query string
 * (`{ company: "company" }` ⇒ `?company=…`) so links can preset them and the address bar
 * stays honest; a value present in the URL always wins over the remembered one. URL
 * writes use `replace`, so typing in a filter never adds history entries.
 */
export function useListFilters<T extends Filters>(
  page: string,
  defaults: T,
  urlKeys: Partial<Record<keyof T & string, string>> = {}
) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<T>(() => {
    const next: T = { ...defaults, ...readStored(page, defaults) };
    for (const [key, param] of Object.entries(urlKeys)) {
      const v = param ? searchParams.get(param) : null;
      if (v !== null) (next as Filters)[key] = v;
    }
    return next;
  });

  // Keep URL and state agreeing: a param in the URL updates state (e.g. global search
  // navigating to `/invoices?q=…` while already on the page); a remembered non-default
  // value gets written to the URL when the page is opened by a bare path.
  useEffect(() => {
    let stateChanged = false;
    let urlChanged = false;
    const nextState: T = { ...filters };
    const nextParams = new URLSearchParams(searchParams);
    for (const [key, param] of Object.entries(urlKeys)) {
      if (!param) continue;
      const urlValue = searchParams.get(param);
      const stateValue = filters[key];
      if (urlValue !== null) {
        if (urlValue !== stateValue) {
          (nextState as Filters)[key] = urlValue;
          stateChanged = true;
        }
      } else if (stateValue !== defaults[key]) {
        nextParams.set(param, stateValue);
        urlChanged = true;
      }
    }
    if (stateChanged) {
      setFilters(nextState);
      writeStored(page, defaults, nextState);
    } else if (urlChanged) {
      setSearchParams(nextParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const set = useCallback(
    <K extends keyof T & string>(key: K, value: T[K]) => {
      setFilters((prev) => {
        if (prev[key] === value) return prev;
        const next = { ...prev, [key]: value };
        writeStored(page, defaults, next);
        return next;
      });
      const param = urlKeys[key];
      if (param) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (value === defaults[key]) next.delete(param);
            else next.set(param, value);
            return next;
          },
          { replace: true }
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page]
  );

  const reset = useCallback(() => {
    setFilters(defaults);
    writeStored(page, defaults, defaults);
    const params = Object.values(urlKeys).filter(Boolean) as string[];
    if (params.length) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          params.forEach((p) => next.delete(p));
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const isDefault = useMemo(
    () => (Object.keys(defaults) as (keyof T)[]).every((k) => filters[k] === defaults[k]),
    [filters, defaults]
  );

  return { filters, set, reset, isDefault };
}
