import { useCompany } from "@/contexts/CompanyContext";

/**
 * Hook to get the active company ID for data queries.
 * 
 * For multi-company users, this returns the currently selected company.
 * All data queries should filter by this company ID to ensure users
 * only see data for the company they're currently viewing.
 * 
 * Usage:
 * const { activeCompanyId, isMultiCompany } = useActiveCompany();
 * 
 * // In your query:
 * let query = supabase.from('orders').select('*');
 * if (activeCompanyId) {
 *   query = query.eq('company_id', activeCompanyId);
 * }
 */
export function useActiveCompany() {
  const { activeCompany, isMultiCompany, loading } = useCompany();

  return {
    activeCompanyId: activeCompany?.id || null,
    activeCompanyName: activeCompany?.name || null,
    activeCompanyRole: activeCompany?.role || null,
    isMultiCompany,
    loading,
    isVibeAdmin: activeCompany?.role === 'vibe_admin',
  };
}
