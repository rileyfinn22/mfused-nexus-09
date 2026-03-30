

# Allow Finance Users to Add Financed Orders

## Summary
Finance role users will get an "Add Financed Order" button on the Financing page. Their version of the dialog won't show the Vendor PO picker — they'll just enter amount, exchange rate, description, date, and notes. The record is created with `created_by_role = 'finance'` and no `vendor_po_id`. Vibe admins can link it to a PO later (existing `needsPOLink` logic already handles this).

## Changes

### 1. Financing page (`src/pages/Financing.tsx`)
- Add an "Add" button for finance users in the header (currently only vibe_admin sees the button)
- The button opens the same `AddFinancedInvoiceDialog` but in a "finance mode"

### 2. AddFinancedInvoiceDialog (`src/components/AddFinancedInvoiceDialog.tsx`)
- Add a `mode` prop: `"admin"` (default, current behavior with PO picker) vs `"finance"` (no PO picker)
- In finance mode:
  - Hide the Vendor PO search entirely
  - Show a "Description" text field instead (maps to `description` column)
  - Submit button says "Add Financed Order" instead of "Submit for Financing"
  - On submit: insert with `vendor_po_id: null`, `created_by_role: 'finance'`, `finance_status: 'active'` (finance user is adding their own record, so it's already active from their side)
  - Remove the `selectedPO` requirement from the submit validation
  - Skip the notification checkbox (no need to notify themselves)

### 3. No database changes needed
- `vendor_po_id` is already nullable
- `description` and `created_by_role` columns already exist
- RLS policies already allow finance role to insert

## Technical Details
- The existing `needsPOLink` indicator in `renderActiveRow` already flags records where `!inv.vendor_po_id && inv.created_by_role === "finance"` with an amber warning for vibe admins
- Finance-created records will appear in the Active tab immediately since `finance_status` will be `'active'`

