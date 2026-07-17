import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTH_SESSION_EVENT,
  CompanyRoleRow,
  fetchUserCompanyRolesViaRest,
  readStoredAuthSession,
} from "@/lib/authSession";
import type { Session } from "@supabase/supabase-js";

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

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasFinanceRole, setHasFinanceRole] = useState(false);
  const [hasVibeAdminRole, setHasVibeAdminRole] = useState(false);
  const [hasForwarderRole, setHasForwarderRole] = useState(false);
  const [hasVendorRole, setHasVendorRole] = useState(false);
  const loadRequestIdRef = useRef(0);
  const backgroundRetryRef = useRef(0);

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
    loadCompanies(readStoredAuthSession());

    const handleAuthSession = (event: Event) => {
      const session = (event as CustomEvent<{ session?: Session }>).detail?.session;
      if (session?.user?.id) {
        loadCompanies(session);
      }
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleAuthSession);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        window.setTimeout(() => loadCompanies(session ?? readStoredAuthSession()), 0);
      } else if (event === "SIGNED_OUT") {
        loadRequestIdRef.current += 1;
        backgroundRetryRef.current = 0;
        setCompanies([]);
        setActiveCompanyState(null);
        setHasFinanceRole(false);
        setHasVibeAdminRole(false);
        setHasForwarderRole(false);
        setHasVendorRole(false);
        localStorage.removeItem(ACTIVE_COMPANY_KEY);
      }
    });

    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, handleAuthSession);
      subscription.unsubscribe();
    };
  }, []);

  const loadCompanies = async (sessionOverride?: Session | null, options?: { background?: boolean }) => {
    const requestId = ++loadRequestIdRef.current;

    const isCurrentRequest = () => requestId === loadRequestIdRef.current;

    try {
      if (!options?.background) setLoading(true);

      const session = sessionOverride ?? readStoredAuthSession();
      const user = session?.user;
      if (!user) {
        if (!isCurrentRequest()) return;
        backgroundRetryRef.current = 0;
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
      const userRoles = await fetchUserCompanyRolesViaRest(session);

      if (!isCurrentRequest()) return;
      backgroundRetryRef.current = 0;

      const roleSet = new Set((userRoles || []).map((ur: any) => String(ur.role)));
      setHasFinanceRole(roleSet.has("finance"));
      setHasVibeAdminRole(roleSet.has("vibe_admin"));
      setHasForwarderRole(roleSet.has("forwarder"));
      setHasVendorRole(roleSet.has("vendor"));

      // De-dupe by company_id and choose the highest-privilege role per company.
      const byCompanyId = new Map<string, Company>();

      (userRoles || [])
        .filter((ur: CompanyRoleRow) => ur.companies)
        .forEach((ur: CompanyRoleRow) => {
          const company = Array.isArray(ur.companies) ? ur.companies[0] : ur.companies;
          if (!company) return;

          const id = String(company.id);
          const name = String(company.name);
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
      if (!isCurrentRequest()) return;

      // Preserve prior state on timeout/network failure and retry in the
      // background so slow Wi-Fi does not trap users behind the global spinner.
      if (backgroundRetryRef.current < 2) {
        backgroundRetryRef.current += 1;
        window.setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            loadCompanies(readStoredAuthSession(), { background: true });
          }
        }, 3000);
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
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
