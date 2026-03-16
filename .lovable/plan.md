

# PO Financing Tracker

## Overview

A dedicated financing dashboard that tracks invoices sent to your PO financing company, calculates aging-based fees, and shows deposit requirements. Two access modes: (1) Vibe Admin sees it as a sidebar page in the portal (USD/English), (2) the finance company accesses a standalone token-based shared page (RMB/Chinese) — similar to how ShipmentUpdate works with share links.

## Fee Structure (codified)

- Days 0–60: 5% flat fee on financed amount
- Days 61–90: 7% flat fee on financed amount  
- Days 90+: 7% + 0.05% per day beyond 90 on unpaid balance
- Deposit requirement: 10% of total financed amount must be maintained

## Database Schema

**New table: `financed_invoices`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| invoice_id | uuid FK → invoices | Link to portal invoice |
| financed_amount | numeric | Amount in USD sent to finance co |
| financed_amount_rmb | numeric | Amount in RMB |
| exchange_rate | numeric | USD→RMB rate used |
| financed_date | timestamptz | Date funds were received |
| paid_back_date | timestamptz | Date fully repaid (null if open) |
| paid_back_amount | numeric | Amount repaid so far |
| status | text | 'open', 'paid', 'overdue' |
| notes | text | |
| created_at / updated_at | timestamptz | |

**New table: `finance_share_links`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| token | text UNIQUE | Share token |
| label | text | e.g. "Q1 2026 Financing" |
| is_active | boolean | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

**New table: `finance_deposits`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| amount | numeric | Deposit payment amount |
| payment_date | timestamptz | |
| notes | text | |
| created_at | timestamptz | |

**RLS**: All three tables — vibe_admin only. No company/vendor access. The public finance view uses a security-definer function (like shipment updates) to bypass RLS via token validation.

## Pages & Components

### 1. `/financing` — Vibe Admin Dashboard (English/USD)
- Added to `vibeAdminNavigationItems` only
- Redirect guard for non-admins
- **Summary cards**: Total Financed, Total Outstanding, Required Deposit (10%), Current Deposit Balance, Deposit Shortfall
- **Table**: Each financed invoice with order number, customer, financed amount, date, days aging, calculated fee tier, fee amount, amount repaid, balance, status
- **Actions**: Add invoice to financing, record repayment, manage deposit, generate share link
- Color-coded aging: green (0-60), amber (61-90), red (90+)

### 2. `/finance-view?token=xxx` — Finance Company View (Chinese/RMB, no auth)
- Standalone page (no DashboardLayout, no sidebar) — same pattern as ShipmentUpdate
- Token-validated via security-definer function
- All labels in Chinese, amounts in RMB (¥)
- Same table structure: invoice ref, financed amount (RMB), date, aging days, fee tier, fee amount, repaid, balance, status
- Summary cards with deposit info
- Read-only view (no edit actions)

### 3. Security-definer functions
- `get_finance_data_by_token(p_token text)` — returns all financed invoices + deposit summary for a valid token
- Fee calculation done in frontend (simple date math)

## Key Implementation Details

- Exchange rate stored per invoice so historical amounts are stable
- Fee calculation is pure frontend math based on `financed_date` vs today
- Deposit requirement = SUM(financed_amount WHERE status='open') × 10%
- Actual deposit = SUM(finance_deposits.amount)
- The finance company link works exactly like shipment share links — no login needed, token in URL
- Invoices on the Vibe Admin side link to the portal invoice detail page
- No trace of financing data appears in company/vendor navigation, queries, or UI

## Files to Create/Modify

1. **Migration**: Create `financed_invoices`, `finance_share_links`, `finance_deposits` tables with RLS
2. **Migration**: Create `get_finance_data_by_token` security-definer function
3. **`src/pages/Financing.tsx`** — Admin dashboard
4. **`src/pages/FinanceView.tsx`** — Public Chinese/RMB view
5. **`src/components/AddFinancedInvoiceDialog.tsx`** — Dialog to add invoice to financing
6. **`src/components/RecordFinanceRepaymentDialog.tsx`** — Record repayment
7. **`src/components/GenerateFinanceLinkDialog.tsx`** — Generate share token
8. **`src/components/RecordFinanceDepositDialog.tsx`** — Record deposit payment
9. **`src/App.tsx`** — Add routes
10. **`src/components/AppSidebar.tsx`** — Add to vibeAdminNavigationItems only

