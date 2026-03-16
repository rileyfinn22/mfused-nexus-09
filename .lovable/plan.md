

## Plan: Payment Confirmation Workflow + Document Upload for Finance Users

### Overview
Two features: (1) A confirmation system where finance users verify repayments and deposits recorded by Vibe, and (2) document upload capability already partially built -- just needs to ensure finance users can use it.

---

### 1. Database Changes

**Add confirmation columns to existing tables:**

```sql
-- finance_repayments: add confirmation status
ALTER TABLE finance_repayments 
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN dispute_note text;

-- finance_deposits: add confirmation status  
ALTER TABLE finance_deposits
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN dispute_note text;
```

**RLS policies** for finance users to update confirmation fields on both tables.

---

### 2. Confirmations Tab on Financing Page

Add a **4th tab: "Confirmations"** (visible to finance users, also visible to Vibe admins) in `Financing.tsx`.

Contents:
- Two sections: **Repayments** and **Deposits**, each showing items with `confirmation_status = 'pending'` at the top
- Each row shows: date, amount, method, reference, linked record description, and **Confirm / Dispute** buttons
- Disputed items show a text input for the dispute reason
- Confirmed items show a green checkmark with timestamp
- Counts badge on the tab showing pending confirmations
- Vibe admins see the confirmation status (read-only) so they know what's been verified and what's disputed

**Data fetching**: Query `finance_repayments` joined with `financed_invoices` for context, and `finance_deposits` separately. Both ordered by payment_date desc.

---

### 3. Confirmation Status Visibility Everywhere

- **Active tab rows**: Add a small indicator (checkmark or clock icon) next to repayment amounts showing confirmation status
- **Detail page** (`FinancedInvoiceDetail.tsx`): In the repayment history table, add a "Status" column showing pending/confirmed/disputed with appropriate badge colors
- Disputed items highlighted in red with the dispute note visible

---

### 4. Document Upload (Already Built)

The document upload in `FinancedInvoiceDetail.tsx` already works with the `financed_invoice_documents` table and `po-documents` bucket. Need to verify:
- Finance users have RLS access to insert/select on `financed_invoice_documents`
- Finance users can upload to the `po-documents` storage bucket
- If not, add appropriate RLS policies

---

### Files to Create/Modify

| File | Change |
|------|--------|
| **Migration SQL** | Add 4 columns each to `finance_repayments` and `finance_deposits`, plus RLS policies |
| `src/pages/Financing.tsx` | Add "Confirmations" tab with pending count badge, fetch repayments/deposits, render confirmation UI |
| `src/pages/FinancedInvoiceDetail.tsx` | Add confirmation_status column to repayment history table |
| `src/components/RecordFinanceRepaymentDialog.tsx` | No changes needed (inserts default to 'pending') |
| `src/components/RecordFinanceDepositDialog.tsx` | No changes needed (inserts default to 'pending') |

