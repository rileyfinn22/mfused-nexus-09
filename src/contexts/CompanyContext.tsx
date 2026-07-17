import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Company {
  id: string;
  name: string;
  role: string;
}

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (company: Company) => void;
  loading: boolean;
  isMultiCompany: boolean;
  hasFinanceRole: boolean;
  hasVibeAdminRole: boolean;
  hasForwarderRole: boolean;
  hasVendorRole: boolean;
  isFinancePortalUser: boolean;
  isForwarderPortalUser: boolean;
  isVendorPortalUser: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const ACTIVE_COMPANY_KEY = "activeCompanyId";
const COMPANY_LOAD_TIMEOUT_MS = 4000;

const withTimeout = async <T,>(promise: PromiseLike<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timeout`)), COMPANY_LOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasFinanceRole, setHasFinanceRole] = useState(false);
  const [hasVibeAdminRole, setHasVibeAdminRole] = useState(false);
  const [hasForwarderRole, setHasForwarderRole] = useState(false);
  const [hasVendorRole, setHasVendorRole] = useState(false);

  // Highest privilege first. If a user has multiple role rows for the same company,
  // we pick the most privileged one to keep UI + permissions stable.
  const ROLE_PRECEDENCE = [
    "vibe_admin",
    "finance",
    "forwarder",
    "company",
    "vendor",
  ];

  useEffect(() => {
    loadCompanies();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadCompanies();
      } else if (event === "SIGNED_OUT") {
        setCompanies([]);
        setActiveCompanyState(null);
        setHasFinanceRole(false);
        setHasVibeAdminRole(false);
        setHasForwarderRole(false);
        setHasVendorRole(false);
        localStorage.removeItem(ACTIVE_COMPANY_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        "Auth session restore"
      );
      const user = session?.user;
      if (!user) {
        setCompanies([]);
        setActiveCompanyState(null);
        setHasFinanceRole(false);
        setHasVibeAdminRole(false);
        setHasForwarderRole(false);
        setHasVendorRole(false);
        setLoading(false);
        return;
      }

      // Fetch all companies the user has access to
      const { data: userRoles, error } = await withTimeout(
        supabase
          .from("user_roles")
          .select(`
            role,
            company_id,
            companies:company_id (
              id,
              name
            )
          `)
          .eq("user_id", user.id),
        "Company roles load"
      );

      if (error) {
        console.error("Error fetching user companies:", error);
        setCompanies([]);
        setActiveCompanyState(null);
        setHasFinanceRole(false);
        setHasVibeAdminRole(false);
        setHasForwarderRole(false);
        setHasVendorRole(false);
        setLoading(false);
        return;
      }

      const roleSet = new Set((userRoles || []).map((ur: any) => String(ur.role)));
      setHasFinanceRole(roleSet.has("finance"));
      setHasVibeAdminRole(roleSet.has("vibe_admin"));
      setHasForwarderRole(roleSet.has("forwarder"));
      setHasVendorRole(roleSet.has("vendor"));

      // De-dupe by company_id and choose the highest-privilege role per company.
      const byCompanyId = new Map<string, Company>();

      (userRoles || [])
        .filter((ur: any) => ur.companies)
        .forEach((ur: any) => {
          const id = String(ur.companies.id);
          const name = String(ur.companies.name);
          const role = String(ur.role);

          const existing = byCompanyId.get(id);
          if (!existing) {
            byCompanyId.set(id, { id, name, role });
            return;
          }

          const existingRank = ROLE_PRECEDENCE.indexOf(existing.role);
          const candidateRank = ROLE_PRECEDENCE.indexOf(role);

          // Unknown roles fall to the bottom.
          const safeExistingRank = existingRank === -1 ? ROLE_PRECEDENCE.length : existingRank;
          const safeCandidateRank = candidateRank === -1 ? ROLE_PRECEDENCE.length : candidateRank;

          if (safeCandidateRank < safeExistingRank) {
            byCompanyId.set(id, { id, name, role });
          }
        });

      const companyList: Company[] = Array.from(byCompanyId.values());

      setCompanies(companyList);

      // Restore saved active company or use first one
      const savedCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
      const savedCompany = companyList.find((c) => c.id === savedCompanyId);

      if (savedCompany) {
        setActiveCompanyState(savedCompany);
      } else if (companyList.length > 0) {
        setActiveCompanyState(companyList[0]);
        localStorage.setItem(ACTIVE_COMPANY_KEY, companyList[0].id);
      } else {
        setActiveCompanyState(null);
      }
    } catch (err) {
      console.error("Error loading companies:", err);
      setCompanies([]);
      setActiveCompanyState(null);
      setHasFinanceRole(false);
      setHasVibeAdminRole(false);
      setHasForwarderRole(false);
      setHasVendorRole(false);
    } finally {
      setLoading(false);
    }
  };

  const setActiveCompany = (company: Company) => {
    setActiveCompanyState(company);
    localStorage.setItem(ACTIVE_COMPANY_KEY, company.id);
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        setActiveCompany,
        loading,
        isMultiCompany: companies.length > 1,
        hasFinanceRole,
        hasVibeAdminRole,
        hasForwarderRole,
        hasVendorRole,
        isFinancePortalUser: hasFinanceRole && !hasVibeAdminRole,
        isForwarderPortalUser: hasForwarderRole && !hasVibeAdminRole && !hasFinanceRole,
        isVendorPortalUser: hasVendorRole && !hasVibeAdminRole && !hasFinanceRole && !hasForwarderRole,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    // During HMR, context can temporarily be undefined — return safe defaults
    // to avoid blank-screen crashes while modules re-link.
    return {
      companies: [],
      activeCompany: null,
      setActiveCompany: () => {},
      loading: true,
      isMultiCompany: false,
      hasFinanceRole: false,
      hasVibeAdminRole: false,
      hasForwarderRole: false,
      hasVendorRole: false,
      isFinancePortalUser: false,
      isForwarderPortalUser: false,
      isVendorPortalUser: false,
    } as CompanyContextType;
  }
  return context;
}
