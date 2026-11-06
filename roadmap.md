# Roadmap

## Incorrect order numbering
- [ ] Restore the shared counter and prevent timestamp-sized numbers from advancing it.
- [ ] Remove browser numbering from the order editor.
- [ ] Correct the three affected orders and their unsynced invoice numbers; verify the displayed result.

## Customer art + product flow (approved plan 2026-11-03) — DONE
- [x] Customer upload: art attaches to a product (existing or quick-created); optional Specs/notes box (reused Description field, relabeled)
- [x] Staff view: customer spec notes shown on product art pages (proofs + customer art tabs)
- [x] Email: "Customer art submitted" alert now includes product specs (Carrie + admin list already subscribed)
- [x] Products page: "Customer added" badge for staff (products.created_by)
- [x] EditProduct: SKU change via rekey_product_sku RPC — one transaction, company-scoped, duplicate-safe (verified live)
- [x] "Notify customer" button on proofs view → send-proof-notification edge function emails company users, records proof_notified_at
- [x] Migration 0019_customer_product_flow applied; functions deployed
- [x] Verified: RPC happy path + duplicate rejection via REST; Playwright staff view shows specs card + button (did not click Notify — would email real customers)
