

## Simplify Roles to 3: vibe_admin, company, vendor

### Current State
- 5 roles defined: `vibe_admin`, `admin`, `company`, `vendor`, `customer`
- Actual DB usage: `vibe_admin` (4), `company` (19), `customer` (3), no `admin` or `vendor`
- The 3 `customer` users are just company contacts who should be `company`

### Plan

**1. Database migration**
- Update the 3 `customer` role records to `company`
- Remove `admin` and `customer` from the `app_role` enum (if enum-based) or just leave unused

**2. Update `.lovable/SECURITY_RULES.md`**
- Simplify role hierarchy to 3 roles:
  - `vibe_admin` — Internal VibePKG staff, full access
  - `company` — Company users (contacts with portal access, scoped to their company)
  - `vendor` — External vendors with limited production access
- Remove all references to `admin` and `customer` roles

**3. Update `CompanyContext.tsx`**
- Remove `admin` and `customer` from `ROLE_PRECEDENCE` array

**4. Update `AppSidebar.tsx`**
- Remove any `customer`-specific logic (currently `customerNavigationItems` serves both `company` and `customer` — just rename/clarify)

**5. Update `useActiveCompany.ts`**
- No changes needed (already just checks for `vibe_admin`)

