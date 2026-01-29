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
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const ACTIVE_COMPANY_KEY = "activeCompanyId";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompanies();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        loadCompanies();
      } else if (event === "SIGNED_OUT") {
        setCompanies([]);
        setActiveCompanyState(null);
        localStorage.removeItem(ACTIVE_COMPANY_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadCompanies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch all companies the user has access to
      const { data: userRoles, error } = await supabase
        .from("user_roles")
        .select(`
          role,
          company_id,
          companies:company_id (
            id,
            name
          )
        `)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching user companies:", error);
        setLoading(false);
        return;
      }

      const companyList: Company[] = (userRoles || [])
        .filter((ur: any) => ur.companies)
        .map((ur: any) => ({
          id: ur.companies.id,
          name: ur.companies.name,
          role: ur.role,
        }));

      setCompanies(companyList);

      // Restore saved active company or use first one
      const savedCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
      const savedCompany = companyList.find((c) => c.id === savedCompanyId);
      
      if (savedCompany) {
        setActiveCompanyState(savedCompany);
      } else if (companyList.length > 0) {
        setActiveCompanyState(companyList[0]);
        localStorage.setItem(ACTIVE_COMPANY_KEY, companyList[0].id);
      }
    } catch (err) {
      console.error("Error loading companies:", err);
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
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
