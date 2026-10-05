import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface ScopeCompany {
  id: string;
  name: string;
}

interface CompanyScopeContextType {
  /** Every customer company, for the picker. Empty for non-admins. */
  companies: ScopeCompany[];
  /** The company the admin is currently "working in", or null for all companies. */
  scopeCompany: ScopeCompany | null;
  scopeCompanyId: string | null;
  setScopeCompanyId: (id: string | null) => void;
  loading: boolean;
}

const CompanyScopeContext = createContext<CompanyScopeContextType | undefined>(undefined);

const STORAGE_KEY = "companyScopeId";

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Master company filter for VibePKG staff. When set, every company-aware list
 * (orders, invoices, artwork, products, inventory, quotes, production sheet, dashboard)
 * is locked to that company and hides its own company dropdown, so an admin can move
 * between pages while staying inside one customer. Persisted per browser so it survives
 * reloads; cleared automatically for accounts without the vibe_admin role.
 */
export function CompanyScopeProvider({ children }: { children: ReactNode }) {
  const { hasVibeAdminRole, loading: companyLoading } = useCompany();
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeCompanyId, setScopeState] = useState<string | null>(() => readStored());

  useEffect(() => {
    if (companyLoading) return;
    if (!hasVibeAdminRole) {
      setCompanies([]);
      setScopeState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (cancelled) return;
      if (error) {
        console.error("Error loading companies for scope picker:", error);
        setCompanies([]);
      } else {
        setCompanies((data as ScopeCompany[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasVibeAdminRole, companyLoading]);

  // A remembered company that no longer exists (or isn't visible) falls back to all.
  useEffect(() => {
    if (loading || !scopeCompanyId) return;
    if (!companies.some((c) => c.id === scopeCompanyId)) setScopeState(null);
  }, [companies, loading, scopeCompanyId]);

  const setScopeCompanyId = useCallback((id: string | null) => {
    setScopeState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: scope still applies for this session */
    }
  }, []);

  const scopeCompany = useMemo(
    () => (scopeCompanyId ? companies.find((c) => c.id === scopeCompanyId) ?? null : null),
    [companies, scopeCompanyId]
  );

  const value = useMemo<CompanyScopeContextType>(
    () => ({
      companies,
      scopeCompany,
      // Only an admin with a resolvable company is ever "in scope".
      scopeCompanyId: hasVibeAdminRole && scopeCompany ? scopeCompany.id : null,
      setScopeCompanyId,
      loading,
    }),
    [companies, scopeCompany, hasVibeAdminRole, setScopeCompanyId, loading]
  );

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

const NO_SCOPE: CompanyScopeContextType = {
  companies: [],
  scopeCompany: null,
  scopeCompanyId: null,
  setScopeCompanyId: () => {},
  loading: false,
};

export function useCompanyScope(): CompanyScopeContextType {
  // Outside the provider (or during HMR re-linking) behave as "no scope" rather than crash.
  return useContext(CompanyScopeContext) ?? NO_SCOPE;
}
