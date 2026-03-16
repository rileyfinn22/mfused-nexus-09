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
