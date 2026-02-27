

## Knowledge Base Security & Permissions Document

### What I'll Create
A comprehensive `.lovable/SECURITY_RULES.md` rewrite that serves as the definitive knowledge base entry, covering three areas:

### 1. Role Permissions Matrix (vibe_admin, company, vendor)
- Detailed per-role visibility for every data entity (orders, invoices, vendor POs, products, artwork, etc.)
- Explicit field-level restrictions (e.g., `vendor_cost`, `vendor_id`, `vendor_po_number` hidden from company users)
- Route access table showing which URLs each role can access

### 2. Frontend Enforcement Rules
- Navigation arrays in `AppSidebar.tsx` — which items belong to which role
- `isVibeAdmin` conditional rendering pattern (used in 37+ files) — must never be removed
- Route redirect guards on admin-only pages
- Field filtering: never expose vendor cost fields in company-facing queries

### 3. Data Safety & Integrity Rules
- **Soft-delete pattern**: Orders and invoices use `deleted_at` column — never hard-delete financial records
- **RLS enforcement**: Every new table must have RLS enabled with appropriate policies
- **Key RLS functions**: `has_role()`, `user_has_company_access()`, `get_user_company()`
- **Additive migrations only**: No dropping columns/tables without explicit approval
- **Deprecated roles**: `admin` and `customer` still exist in the enum and some RLS policies — treat as legacy, do not use for new code
- **Sensitive fields**: Bank details on vendors table, QuickBooks tokens — never exposed via public queries

### 4. Legacy RLS Policy Cleanup Note
Document that many existing RLS policies still reference `has_role(auth.uid(), 'admin'::app_role)` — these are from when `admin` was an active role. They still function but are effectively dead code since no users have the `admin` role. Flag for future cleanup.

### Implementation
Single file update: `.lovable/SECURITY_RULES.md` — complete rewrite with all sections above, formatted for easy scanning and copy-paste into the Knowledge settings.

