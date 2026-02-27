# ⚠️ SECURITY RULES — READ BEFORE MAKING CHANGES

This document outlines critical security boundaries that **must not be broken** when editing this codebase. All collaborators (human and AI) must follow these rules.

---

## 1. Role Hierarchy

Roles in order of privilege (highest → lowest):
1. **vibe_admin** — Full system access across all companies (internal VibePKG staff)
2. **admin** — Company-level admin (rarely used)
3. **company** — Standard company user (customer portal)
4. **vendor** — External vendor with limited production access
5. **customer** — End customer with read-only invoice/order access

## 2. What Customers Can See (company/customer roles)

✅ **ALLOWED:**
- Their own company's orders, invoices, payments, products, inventory, artwork, quotes
- Shipment tracking for their orders
- Pull & Ship orders they created

❌ **NEVER VISIBLE TO CUSTOMERS:**
- Vendor POs, Bills, or Vendor Payments (internal cost data)
- Vendor names, costs, or margins on order items (`vendor_cost`, `vendor_id`, `vendor_po_number` fields)
- Other companies' data (enforced by RLS + `company_id` filtering)
- Vibe Admin management pages
- The `/vendors`, `/vendor-pos` routes
- Production stage internal notes (`internal_notes` field)
- Vibe Notes on orders (`vibenotes` field, `vibe_note_attachments` table)

## 3. What Vendors Can See (vendor role)

✅ **ALLOWED:**
- `/production` page — only orders assigned to them via `production_stages.vendor_id`
- Public shipment update links (token-based, no login required)

❌ **NEVER VISIBLE TO VENDORS:**
- Customer pricing, invoice amounts, or payment data
- Other vendors' data
- Any admin/company management pages

## 4. Frontend Guardrails

### Navigation Filtering
- `AppSidebar.tsx` shows different nav items based on role
- **DO NOT** add vendor/cost-related pages to `customerNavigationItems` or `vendorNavigationItems`

### Route Protection
- Pages like `VendorPOs`, `Vendors`, `VendorPODetail` redirect non-admins to `/dashboard`
- **DO NOT** remove these redirect checks

### Conditional UI Rendering
- Order Detail, Project Detail, and Invoice Detail hide vendor cost columns for non-admins
- **DO NOT** remove `isVibeAdmin` checks that gate financial data display

## 5. Backend Guardrails (RLS Policies)

### Tables restricted to vibe_admin only:
- `vendor_pos` — All CRUD
- `vendor_po_items` — All CRUD  
- `vendor_po_payments` — All CRUD
- `vibe_note_attachments` — All CRUD
- `company_invitations` — All CRUD

### Tables with company-scoped access:
- `orders`, `invoices`, `payments`, `products`, `inventory`, `artwork_files`, `order_items`
- Access enforced via `user_has_company_access(auth.uid(), company_id)` or `get_user_company(auth.uid())`

### Key RLS functions:
- `user_has_company_access(user_id, company_id)` — Checks if user has ANY role in that company
- `has_role(user_id, role)` — Checks if user has a specific role anywhere
- `get_user_company(user_id)` — Returns first company_id (legacy, prefer `user_has_company_access`)

## 6. Rules for Code Changes

### Before adding a new page/route:
- [ ] Determine which roles should access it
- [ ] Add role check in the page component (redirect if unauthorized)
- [ ] Only add to the correct navigation array in `AppSidebar.tsx`

### Before adding a new database table:
- [ ] Enable RLS on the table
- [ ] Add SELECT policy scoped to `user_has_company_access` or `has_role`
- [ ] Add INSERT/UPDATE/DELETE policies appropriate to the role
- [ ] Never allow customers to see vendor cost data

### Before modifying an existing query:
- [ ] Ensure `company_id` filtering is maintained
- [ ] Don't join vendor tables in customer-facing queries
- [ ] Don't expose `vendor_cost`, `vendor_id`, or `vendor_po_number` to non-admins

### Before changing RLS policies:
- [ ] Understand the current policy before modifying
- [ ] Never make vendor/cost tables publicly readable
- [ ] Test that customers still can't see other companies' data

## 7. Common Mistakes to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Remove `isVibeAdmin` checks from UI | Keep role-based conditional rendering |
| Add vendor routes to customer nav | Only add to `vibeAdminNavigationItems` |
| Use `.select('*')` on orders and show all columns | Filter out `vendor_cost`, `vendor_id` for non-admins |
| Create tables without RLS | Always enable RLS and add policies |
| Store roles in localStorage for auth checks | Use `useCompany()` context which reads from DB |
| Drop RLS policies to "fix" data not showing | Fix the policy or add a new one properly |

## 8. Testing Checklist

After any permission-related change:
1. Log in as a **customer** user and verify they cannot see vendor/cost data
2. Log in as a **vibe_admin** and verify full access works
3. Check that switching companies in the header properly scopes data
4. Verify new routes are not accessible by typing the URL directly as a customer
