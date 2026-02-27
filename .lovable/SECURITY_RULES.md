# ⚠️ SECURITY RULES — READ BEFORE MAKING CHANGES

This document is the **definitive security reference** for the VibePKG portal. All collaborators (human and AI) must follow these rules. Violations can expose internal financial data to customers or cause data loss.

---

## 1. Role Hierarchy (3 Active Roles)

| Role | Description | Scope |
|------|-------------|-------|
| **vibe_admin** | Internal VibePKG staff | Full cross-company access to all data, all routes, all operations |
| **company** | Company portal users (contacts with login access) | Scoped to their own company's data only |
| **vendor** | External production vendors | Limited to production stages assigned to them |

> **Deprecated roles**: `admin` and `customer` still exist in the `app_role` enum and some RLS policies. No users have these roles. Do NOT assign them to new users. They are legacy dead code flagged for future cleanup.

---

## 2. Role Permissions Matrix

### 2a. Data Entity Visibility

| Entity | vibe_admin | company | vendor |
|--------|-----------|---------|--------|
| Orders | ✅ All companies | ✅ Own company only | ❌ |
| Order Items | ✅ All fields | ✅ Own company (excludes `vendor_cost`, `vendor_id`, `vendor_po_number`) | ❌ |
| Invoices | ✅ All companies | ✅ Own company only | ❌ |
| Payments (customer) | ✅ All companies | ✅ Own company only | ❌ |
| Products | ✅ All companies | ✅ Own company only | ❌ |
| Inventory | ✅ All companies | ✅ Own company only | ❌ |
| Artwork Files | ✅ All companies | ✅ Own company only | ❌ |
| Quotes | ✅ All companies | ✅ Own company only | ❌ |
| Shipment Legs | ✅ All | ✅ Own company (read-only) | ❌ |
| Production Stages | ✅ All | ✅ Own company (read-only) | ✅ Only stages where `vendor_id` matches |
| Production Comments | ✅ All | ✅ Own company | ✅ Own assigned orders |
| Vendor POs | ✅ All | ❌ **NEVER** | ❌ |
| Vendor PO Items | ✅ All | ❌ **NEVER** | ❌ |
| Vendor PO Payments | ✅ All | ❌ **NEVER** | ❌ |
| Vendors table | ✅ All | ❌ **NEVER** | ✅ Own record only (update) |
| Vibe Note Attachments | ✅ All | ❌ **NEVER** | ❌ |
| Company Invitations | ✅ All | ❌ | ❌ |
| QuickBooks Settings | ✅ All | ❌ | ❌ |
| Companies | ✅ All | ✅ Own company only | ❌ |
| Company Contacts | ✅ All | ✅ Own company only | ❌ |
| Company Emails | ✅ All | ✅ Own company (read-only) | ❌ |
| Customer Addresses | ✅ All | ✅ Own company only | ❌ |
| PO Submissions (My POs) | ✅ All | ✅ Own company only | ❌ |
| Notifications | ✅ Own | ✅ Own | ✅ Own |

### 2b. Restricted Fields (NEVER expose to company or vendor users)

| Field | Table | Why |
|-------|-------|-----|
| `vendor_cost` | `order_items` | Internal cost — reveals margin |
| `vendor_id` | `order_items` | Reveals vendor identity |
| `vendor_po_number` | `order_items` | Links to internal vendor PO |
| `vibenotes` | `orders` | Internal admin notes |
| `internal_notes` | `production_stages` | Internal production notes |
| `internal_notes` | `quotes` | Internal quote notes |
| `bank_*` fields | `vendors` | Sensitive financial data |
| `access_token`, `refresh_token` | `quickbooks_settings` | OAuth tokens |
| `fulfillment_vendor_id` | `orders` | Reveals vendor assignment |
| `cost` | `products` | Internal cost data |
| `cost` | `product_templates` | Internal cost data |

### 2c. Route Access

| Route | vibe_admin | company | vendor |
|-------|-----------|---------|--------|
| `/dashboard` | ✅ | ✅ | ❌ |
| `/orders` | ✅ | ✅ | ❌ |
| `/orders/:id` | ✅ | ✅ (own company) | ❌ |
| `/invoices` | ✅ | ✅ | ❌ |
| `/invoices/:id` | ✅ | ✅ (own company) | ❌ |
| `/products` | ✅ | ✅ | ❌ |
| `/products/:id/edit` | ✅ | ✅ (own company) | ❌ |
| `/inventory` | ✅ | ✅ | ❌ |
| `/artwork` | ✅ | ✅ | ❌ |
| `/quotes` | ✅ | ✅ | ❌ |
| `/quotes/:id` | ✅ | ✅ (own company) | ❌ |
| `/production` | ✅ | ✅ | ✅ (own assigned) |
| `/production/:id` | ✅ | ✅ (own company) | ✅ (own assigned) |
| `/pull-ship` | ✅ | ✅ | ❌ |
| `/pull-ship-orders` | ✅ | ❌ | ❌ |
| `/my-pos` | ❌ | ✅ | ❌ |
| `/projects` | ✅ | ❌ | ❌ |
| `/projects/:id` | ✅ | ❌ | ❌ |
| `/vendors` | ✅ | ❌ | ❌ |
| `/vendor-pos` | ✅ | ❌ | ❌ |
| `/vendor-pos/:id` | ✅ | ❌ | ❌ |
| `/customers` | ✅ | ❌ | ❌ |
| `/customers/:id` | ✅ | ❌ | ❌ |
| `/reports` | ✅ | ❌ | ❌ |
| `/settings` | ✅ | ✅ | ❌ |
| `/shipment-update/:token` | ✅ | ✅ | ✅ (public, no auth) |

---

## 3. Frontend Enforcement Rules

### 3a. Navigation Arrays (`AppSidebar.tsx`)

Three separate navigation arrays control sidebar visibility:

- **`vibeAdminNavigationItems`** — Full nav including Projects, Vendors, Vendor POs, Companies, Reports
- **`companyNavigationItems`** — Company-scoped nav (Dashboard, Products, Inventory, Orders, Production, Invoices, Quotes, Artwork, Pull & Ship, My POs, Settings)
- **`vendorNavigationItems`** — Minimal nav (My Production only)

**Rules:**
- ❌ NEVER add vendor/cost-related pages to `companyNavigationItems` or `vendorNavigationItems`
- ❌ NEVER add admin management pages to `companyNavigationItems`
- ✅ New pages must be added to the correct array based on role access

### 3b. `isVibeAdmin` Conditional Rendering

The pattern `isVibeAdmin` (or `activeCompany?.role === 'vibe_admin'`) is used in **37+ files** to conditionally hide:
- Vendor cost columns in order/invoice detail tables
- Vendor PO links and references
- Internal notes fields (`vibenotes`, `internal_notes`)
- P&L summaries and margin calculations
- Vendor assignment UI
- Administrative action buttons

**Rule: NEVER remove an `isVibeAdmin` check without explicit approval. These are security boundaries, not UI preferences.**

### 3c. Route Redirect Guards

Admin-only pages must redirect non-admin users:

```tsx
// Pattern used in VendorPOs.tsx, Vendors.tsx, VendorPODetail.tsx, etc.
const { isVibeAdmin } = useActiveCompany();
if (!isVibeAdmin) {
  navigate('/dashboard');
  return null;
}
```

**Rule: NEVER remove these redirect checks.**

### 3d. Field Filtering in Queries

When building queries visible to company users:
- ❌ NEVER use `.select('*')` and display all columns from `order_items` — filter out `vendor_cost`, `vendor_id`, `vendor_po_number`
- ❌ NEVER join `vendor_pos`, `vendor_po_items`, or `vendor_po_payments` in company-facing queries
- ❌ NEVER display `vibenotes` or `internal_notes` to non-admin users
- ❌ NEVER show `cost` field from `products` or `product_templates` to non-admin users

---

## 4. Backend Security (RLS Policies)

### 4a. Key Security-Definer Functions

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Check if user has a specific role anywhere |
| `user_has_company_access(user_id, company_id)` | Check if user has ANY role in that company |
| `get_user_company(user_id)` | Returns first company_id (legacy — prefer `user_has_company_access`) |

All three are `SECURITY DEFINER` to bypass RLS on `user_roles` and prevent recursive policy evaluation.

### 4b. RLS Policy Tiers

**Tier 1 — vibe_admin only (internal financial data):**
- `vendor_pos` — All CRUD
- `vendor_po_items` — All CRUD
- `vendor_po_payments` — All CRUD
- `vibe_note_attachments` — INSERT, SELECT, DELETE
- `company_invitations` — All CRUD

**Tier 2 — Company-scoped (user sees own company's data):**
- `orders`, `invoices`, `payments`, `products`, `inventory`, `artwork_files`, `order_items`, `quotes`
- Access enforced via `user_has_company_access(auth.uid(), company_id)` or `get_user_company(auth.uid())`
- vibe_admin has parallel policies granting full access

**Tier 3 — Vendor-scoped:**
- `production_stages` — Vendors see stages where `vendor_id` matches their vendor record
- `production_comments` — Vendors can read/write on their assigned orders
- `vendors` — Vendors can update their own record (`user_id = auth.uid()`)

### 4c. Rules for New Tables

Before creating any new table:
- [ ] Enable RLS: `ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;`
- [ ] Add SELECT policy scoped to `user_has_company_access` or `has_role`
- [ ] Add INSERT/UPDATE/DELETE policies appropriate to the role tier
- [ ] Never allow company users to see vendor cost data
- [ ] If the table contains internal-only data, restrict to `has_role(auth.uid(), 'vibe_admin'::app_role)`

### 4d. Rules for Modifying Queries

Before changing any existing query:
- [ ] Ensure `company_id` filtering is maintained
- [ ] Don't join vendor tables in company-facing queries
- [ ] Don't expose restricted fields (Section 2b) to non-admins

### 4e. Rules for Changing RLS Policies

- [ ] Understand the current policy before modifying
- [ ] Never make vendor/cost tables publicly readable
- [ ] Test that company users still can't see other companies' data
- [ ] Never drop a policy without adding its replacement in the same migration

---

## 5. Data Safety & Integrity Rules

### 5a. Soft-Delete Pattern

Financial records use soft-delete via `deleted_at` column:

| Table | Has `deleted_at` | Rule |
|-------|-----------------|------|
| `orders` | ✅ | NEVER hard-delete. Set `deleted_at = now()` |
| `invoices` | ✅ | NEVER hard-delete. Set `deleted_at = now()` |
| `order_items` | ❌ | Can be deleted (cascade from draft orders only) |
| `payments` | ❌ | Avoid deletion — use correction entries instead |
| `vendor_pos` | ❌ | Avoid deletion — archive by status change |

**Rule: NEVER use `.delete()` on `orders` or `invoices`. Always use `.update({ deleted_at: new Date().toISOString() })`.**

### 5b. Additive Migration Policy

- ✅ Adding new columns, tables, indexes, or functions: **always allowed**
- ⚠️ Renaming columns: **flag for approval** (may break existing queries)
- ❌ Dropping columns or tables: **NEVER without explicit approval**
- ❌ Changing column types destructively: **NEVER without explicit approval**
- ❌ `ALTER DATABASE postgres`: **NOT ALLOWED** (Lovable Cloud restriction)

### 5c. Sensitive Data Protection

| Data | Location | Protection |
|------|----------|------------|
| Bank account details | `vendors.bank_*` columns | RLS: vibe_admin only for SELECT on vendors |
| QuickBooks OAuth tokens | `quickbooks_settings.access_token`, `refresh_token` | RLS: vibe_admin only; tokens being migrated to Vault |
| User passwords | `auth.users` (managed by auth system) | Never accessible via public schema |
| Invitation tokens | `company_invitations.invitation_token`, `vendor_invitations.invitation_token` | Time-limited, single-use |

---

## 6. Legacy RLS Policy Cleanup (Future Work)

Many existing RLS policies reference the deprecated `admin` role:

```sql
-- Example of legacy policy (still functional but dead code)
has_role(auth.uid(), 'admin'::app_role)
```

**Affected tables:** `invoices`, `payments`, `vendors`, `quotes`, `order_items`, `product_states`, `order_production_updates`, `quickbooks_settings`, `vendor_invitations`, `artwork_files`

These policies are harmless (no users have the `admin` role) but should be cleaned up by:
1. Replacing `has_role(auth.uid(), 'admin'::app_role)` with `has_role(auth.uid(), 'vibe_admin'::app_role)` where the intent was admin access
2. Replacing with `user_has_company_access(auth.uid(), company_id)` where the intent was company-scoped access
3. Dropping the `admin` and `customer` values from the `app_role` enum after all references are removed

---

## 7. Common Mistakes to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Remove `isVibeAdmin` checks from UI | Keep role-based conditional rendering |
| Add vendor routes to company nav | Only add to `vibeAdminNavigationItems` |
| Use `.select('*')` on orders and show all columns | Filter out `vendor_cost`, `vendor_id` for non-admins |
| Create tables without RLS | Always enable RLS and add policies |
| Store roles in localStorage for auth checks | Use `useCompany()` context which reads from DB |
| Drop RLS policies to "fix" data not showing | Fix the policy or add a new one properly |
| Hard-delete orders or invoices | Use soft-delete with `deleted_at` |
| Drop columns without approval | Use additive migrations only |
| Expose `cost` fields to company users | Only show pricing (`price`), never cost |
| Join `vendors` table in company queries | Vendor data is internal only |
| Show `vibenotes` or `internal_notes` to non-admins | Gate behind `isVibeAdmin` check |

---

## 8. Testing Checklist

After any permission-related change:

1. [ ] Log in as a **company** user → verify they cannot see vendor/cost data
2. [ ] Log in as a **vibe_admin** → verify full access works
3. [ ] Check that switching companies in the header properly scopes data
4. [ ] Verify new routes are not accessible by typing the URL directly as a company user
5. [ ] Verify `deleted_at` records are excluded from list views but accessible in archive views
6. [ ] Confirm no vendor table joins leak data in company-facing API responses
7. [ ] Check that bank details and QuickBooks tokens are not visible in any non-admin response
