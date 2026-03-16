## Financing Workflow: 3-Stage Pipeline ✅ IMPLEMENTED

### Workflow
```
Pending → Active/Financed → Completed
```

- **Pending**: Vibe submits PO for financing, finance company reviews
- **Active**: Finance accepts & processes, aging/fees begin
- **Completed**: Fully repaid, auto-moves when balance = 0

### Changes Made
- Added `finance_status` column (`pending`, `active`, `completed`) to `financed_invoices`
- Financing.tsx: 3 tabs with counts (Pending/Active/Completed)
- AddFinancedInvoiceDialog: inserts as `pending`, no auto vendor PO payment
- AcceptFinanceRequestDialog: finance user accepts pending → active, records vendor PO payment
- RecordFinanceRepaymentDialog: auto-sets `completed` when fully repaid
- Summary cards only count active entries
- Shared view function updated to include `finance_status`
- Finance users can ONLY activate from pending (no standalone "Add" button)
- Detail page shows Accept banner for finance users viewing pending items

## Repayment Ledger ✅ IMPLEMENTED
- `finance_repayments` table tracks individual payments with date, method, reference, notes
- DB trigger auto-updates `financed_invoices.paid_back_amount` and auto-completes when fully repaid
- Detail page shows full repayment history table
- Repayment dialog now captures payment date, method, and reference number

## Export & Filters ✅ IMPLEMENTED
- Search across PO numbers, descriptions, customers, invoice numbers, notes
- Date range filters (from/to)
- CSV export per tab with all relevant columns
- Clear filters button

## Email Notifications 🔲 PENDING
- Needs email domain setup first
- Plan: notify finance company on new pending request, notify Vibe on acceptance
