import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrderPickerGroup {
  key: string;
  label: string;
  product_types: string[];
}

export interface OrderPickerConfig {
  groups: OrderPickerGroup[];
  other_label: string;
}

/** Turns the raw jsonb into a config we trust, or null when the company has none. */
export function parseOrderPickerConfig(raw: unknown): OrderPickerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const groupsRaw = Array.isArray(obj.groups) ? obj.groups : [];
  const groups: OrderPickerGroup[] = [];
  groupsRaw.forEach((g, i) => {
    if (!g || typeof g !== "object") return;
    const gg = g as Record<string, unknown>;
    const label = typeof gg.label === "string" ? gg.label.trim() : "";
    const types = Array.isArray(gg.product_types)
      ? gg.product_types.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase())
      : [];
    if (!label) return;
    groups.push({ key: typeof gg.key === "string" && gg.key ? gg.key : `group-${i}`, label, product_types: types });
  });
  if (groups.length === 0) return null;
  return { groups, other_label: typeof obj.other_label === "string" && obj.other_label ? obj.other_label : "Other" };
}

/** Which of the config's groups a product belongs to, by its product_type. */
export function orderPickerGroupKey(config: OrderPickerConfig, productType: string | null | undefined): string {
  const t = (productType || "").toLowerCase();
  const hit = t ? config.groups.find((g) => g.product_types.includes(t)) : undefined;
  return hit ? hit.key : "__other__";
}

/**
 * Per-company portal switches from companies.portal_features. Everything is optional and
 * absent for most companies, so callers must treat null as "the default behaviour".
 */
export function useCompanyPortalFeatures(companyId: string | null | undefined) {
  const [features, setFeatures] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setFeatures({});
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("portal_features")
          .eq("id", companyId)
          .maybeSingle();
        if (error) throw error;
        const raw = (data as { portal_features?: unknown } | null)?.portal_features;
        if (!cancelled) setFeatures(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
      } catch (error) {
        // A missing column or a denied read must never break the page.
        console.error("Error loading portal features:", error);
        if (!cancelled) setFeatures({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return {
    features,
    loading,
    orderPicker: parseOrderPickerConfig(features.order_picker),
  };
}
