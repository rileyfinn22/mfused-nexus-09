# Order 11145 recovery
- [ ] Investigate and fix repeat line loss on 11146; recover its lines from available evidence and verify a multi-product save.
- [x] Identify draft autosave omission, mismatched line IDs during edits, unchecked item writes, and missing invoice refresh after processing.
- [x] Add checked shared line persistence and processing safeguards; five regression tests passed, build OK, signed-in invoice navigation verified. Full save/processing with real order lines remains unverified.
- [ ] Recover order 11145 lines — blocked: no saved lines, PO attachment, notes, vendor PO, or recoverable source; user must supply products, quantities, prices or original PO.