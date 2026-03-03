

# Plan: Move Payment from Blanket Invoice 10737 to Child Invoice 10737-01

## What happened
The $3,700 payment (ID `1368166f`) was manually recorded against blanket invoice `10737` (no QuickBooks ID). The actual synced invoice is `10737-01` (QuickBooks ID `24413`). This prevents the payment from syncing to QuickBooks.

## What we will do

**Single data operation** — move the payment record to the correct invoice:

```sql
UPDATE payments 
SET invoice_id = '70dc161d-62ab-4c50-bf89-8c5eea00f99f'
WHERE id = '1368166f-e661-4d7f-8c55-4997fdcafc7d';
```

This will:
1. Re-link the payment to invoice `10737-01`
2. The existing `update_invoice_payment_status` trigger will automatically:
   - Set `10737-01.total_paid = 3700` and `status = paid` (since total = 3700)
   - Set `10737.total_paid = 0` and `status = open`
3. The `quickbooks-push-pending-payments` cron (runs every 5 min) will then find this payment (pending sync, invoice has `quickbooks_id`), and push it to QuickBooks against invoice 24413

**No code changes needed.** No file modifications.

## Expected result after execution
| Invoice | Total | Paid | Status | QBO Synced |
|---------|-------|------|--------|------------|
| 10737 (blanket) | $7,659 | $0 | open | no |
| 10737-01 (child) | $3,700 | $3,700 | paid | yes, payment pushed by cron |

