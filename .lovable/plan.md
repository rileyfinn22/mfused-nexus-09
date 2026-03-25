

## Plan: Dual-Mode Quote Line Items (Standard vs. Description-Only)

### Problem
Right now every line item forces a quantity + unit price. But sometimes you're quoting **multiple material/option variants** under one product (e.g., ".018 SBS - $0.420 ea") where there's no single qty/price — just a list of options for the customer to choose from.

### Solution
Add a **per-item toggle** between two modes:

- **Standard** — current behavior: qty, unit price, total columns visible
- **Options/Description** — qty & unit price columns are hidden/greyed out; a larger description textarea is shown inline where you type the pricing options free-form

### How it works
- A new boolean field `pricing_mode` on each item in state (values: `"standard"` or `"description"`)
- No database changes — we store the mode using the existing `description` field (if description-mode, the description IS the pricing content) and set `quantity = 0`, `unit_price = 0`, `total = 0` so it doesn't affect totals
- A small toggle button (e.g., "Standard / Options") appears in the expanded section or inline next to the item name

### Changes

**1. `src/pages/CreateQuote.tsx`**
- Add `pricing_mode: 'standard' | 'description'` to the `QuoteItem` interface (client-side only, defaults to `'standard'`)
- Add a toggle button per line item (next to the item name or in the expanded section) to switch modes
- When mode is `'description'`: hide the qty/unit price/total inputs for that row, show a larger inline textarea instead
- When saving: description-mode items save with `quantity: 0, unit_price: 0, total: 0` and the typed text in `description`
- On load (edit mode): detect items where `quantity === 0 && description` is present → auto-set to description mode

**2. `src/pages/QuoteDetail.tsx`**
- For items where qty is 0 and description exists, render the description spanning the qty/price/total columns with `whitespace-pre-wrap`
- Skip those items from the subtotal calculation display

**3. `src/lib/quoteUtils.ts`**
- In PDF generation: for description-mode items, render a full-width row with the item name + description text instead of the standard qty/price/total columns
- Already partially handled by the `descLine` logic; just need to handle the case where qty=0 means "show description only"

### No database migration needed
The existing `quote_items` columns (`description`, `quantity`, `unit_price`, `total`) accommodate both modes. Description-mode items simply have `quantity=0` and the pricing info lives in `description`.

