

## Financing Workflow Redesign: 3-Stage Pipeline

### The Problem
Currently, everything lands in one flat table. There's no handoff workflow between Vibe (requesting financing) and the finance company (processing it).

### Recommended Workflow

```text
┌─────────────┐      ┌──────────────────┐      ┌───────────────┐
│   PENDING    │ ──►  │  ACTIVE/FINANCED  │ ──►  │   COMPLETED   │
│ (Vibe adds)  │      │ (Finance pays)    │      │ (Fully repaid) │
└─────────────┘      └──────────────────┘      └───────────────┘
```

**Pending Requests** — Vibe Admin submits a Vendor PO that needs financing. Finance company sees it as a new request to review and fund. No aging/fees calculated yet.

**Active / Financed** — Finance company accepts the request, confirms the amount, sets the financed date (when they actually paid). Aging and fees start from this date. This is the current "open" status behavior.

**Completed** — Fully repaid (balance = 0). Moves here automatically or manually. Read-only archive.

### What Each Side Sees

**Vibe Admin:**
- Tabs: Pending | Active | Completed
- "Submit for Financing" button (replaces "Add Vendor PO") — creates a pending request with PO link, amount, notes
- Pending tab shows requests awaiting finance action, with a "Waiting" badge
- Active tab is today's main table (aging, fees, repay button)
- Completed tab is a read-only archive of fully repaid entries
- Can still record repayments on active entries

**Finance Company:**
- Tabs: Pending Requests | Financed Invoices | Completed
- Pending tab shows new requests from Vibe with amount, description, and an "Accept & Process" button
- Clicking "Accept" lets them confirm amount, set the actual financed date, add their invoice number, notes, attachments
- Once accepted, it moves to "Financed Invoices" (the active table with aging/fees)
- Can still manually add entries via "Add Invoice Payment" (these skip pending, go straight to active with the "Needs PO" cue for admins)
- Completed tab shows fully repaid entries as read-only

### Technical Changes

**1. Database: Add `finance_status` column**
- Add `finance_status` text column to `financed_invoices` with values: `pending`, `active`, `completed`
- Default to `active` so existing records are unaffected
- Keep the existing `status` field (`open`/`paid`) for repayment tracking; `finance_status` controls the pipeline stage

**2. UI: Tabs component on Financing.tsx**
- Add `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` (already exists in `src/components/ui/tabs.tsx`)
- Filter invoices by `finance_status` into three tab panels
- Each tab renders its own version of the table (pending has less columns, completed is read-only)

**3. Pending Request Flow (Vibe Admin)**
- Modify "Add Vendor PO" dialog: new entries insert with `finance_status = 'pending'`
- Pending table shows: Vendor PO, Description, Amount, Date Submitted, Status badge
- No aging/fee columns (not financed yet)

**4. Accept & Process Flow (Finance Company)**
- Pending tab rows get an "Accept" button
- Clicking opens a dialog to confirm/adjust amount, set financed date, add invoice number, notes, attachments
- On submit: updates `finance_status` to `active` and sets `financed_date`

**5. Auto-Complete Logic**
- When `paid_back_amount >= financed_amount + fee`, automatically set `finance_status = 'completed'`
- Or allow manual move to completed via the repayment dialog

**6. Summary Cards Update**
- Pending count badge on the Pending tab
- Summary cards only count `active` entries (not pending or completed)

**7. Tab counts**
- Show counts in tab labels: "Pending (3)" / "Active (5)" / "Completed (12)"

