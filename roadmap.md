# Order 11145 recovery
## Product to template conversion
## Best 365 customer catalog
- [x] Enable Best 365 brand/product creation with Labels, Tubes, Tinctures, Closures and Other; verified as Best 365 customer by creating a brand and Tube SKU and reading it back in the portal. Nine routing tests passed; temporary test records removed.

- [x] Add staff conversion from standalone product to template, preserving original SKU, artwork and historical references.
- [x] Verify signed-in conversion, original product fields/ID, exact cost and price, repeat-call safety, and adding a second SKU; temporary test data removed. Nine focused tests passed.

- [x] Identify live-site old ID/product-key mismatch and sequence collisions; replace preview staff saves with atomic line transaction. Six tests and signed-in four-line save/reorder/rollback/reload verified.
- [ ] Restore 11146 missing three lines — blocked: no PO or saved recovery copy; needs original product quantities/prices. Live site still needs publishing before the corrected save is available there.
- [x] Identify draft autosave omission, mismatched line IDs during edits, unchecked item writes, and missing invoice refresh after processing.
- [x] Add checked shared line persistence and processing safeguards; five regression tests passed, build OK, signed-in invoice navigation verified. Full save/processing with real order lines remains unverified.
- [ ] Recover order 11145 lines — blocked: no saved lines, PO attachment, notes, vendor PO, or recoverable source; user must supply products, quantities, prices or original PO.- [x] Partial saves after publish: traced 11146's 16:47 save to an old open tab running pre-fix code (one-by-one inserts). Added "portal was updated — reload" banner; fixed Add Items checkbox double-toggle. New 4-product order placed in preview saved all 4.
