import { useCallback, useEffect, useState } from "react";
import { orderPickerGroupKey, type OrderPickerConfig } from "@/hooks/useCompanyPortalFeatures";

/** "all" = no filter, otherwise a group key from the config, or "__other__". */
export type KindFilterValue = "all" | string;

const storageKey = (companyId: string) => `kindFilter:${companyId}`;

const readStored = (companyId: string | null | undefined): KindFilterValue => {
  if (!companyId) return "all";
  try {
    return localStorage.getItem(storageKey(companyId)) || "all";
  } catch {
    return "all";
  }
};

/**
 * Product-kind filter (Boxes / Foils / Other) for companies whose portal_features define
 * order_picker groups. Persisted per company like the brand filter so it follows the user
 * from Products to Artwork to ordering. With no config, `matches` is always true.
 */
export function useKindFilter(companyId: string | null | undefined, config: OrderPickerConfig | null) {
  const [kindFilter, setKindFilterState] = useState<KindFilterValue>(() => readStored(companyId));

  useEffect(() => {
    setKindFilterState(readStored(companyId));
  }, [companyId]);

  // A remembered kind that the config no longer defines falls back to "all".
  useEffect(() => {
    if (kindFilter === "all") return;
    const valid = !!config && (kindFilter === "__other__" || config.groups.some((g) => g.key === kindFilter));
    if (!valid) setKindFilterState("all");
  }, [config, kindFilter]);

  const setKindFilter = useCallback(
    (value: KindFilterValue) => {
      setKindFilterState(value);
      if (!companyId) return;
      try {
        if (value === "all") localStorage.removeItem(storageKey(companyId));
        else localStorage.setItem(storageKey(companyId), value);
      } catch {
        /* storage unavailable: filter still works for this page view */
      }
    },
    [companyId]
  );

  const matches = useCallback(
    (productType: string | null | undefined) => {
      if (!config || kindFilter === "all") return true;
      return orderPickerGroupKey(config, productType) === kindFilter;
    },
    [config, kindFilter]
  );

  /** True when any of the given product types matches (for templates, which hold many products). */
  const matchesAny = useCallback(
    (productTypes: Array<string | null | undefined>) => {
      if (!config || kindFilter === "all") return true;
      return productTypes.some((t) => orderPickerGroupKey(config, t) === kindFilter);
    },
    [config, kindFilter]
  );

  return { kindFilter, setKindFilter, matches, matchesAny };
}
