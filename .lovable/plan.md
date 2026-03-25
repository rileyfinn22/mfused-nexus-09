

## Plan: Add Pricing Options/Variants to Quote Line Items

### Problem
Currently each quote line item is a single SKU + price. The user needs to quote multiple material/option variants under a single product line — e.g., ".018 SBS - $0.420 ea" and ".024 CNK - $0.535 ea" grouped under one product header.

### Approach
The `quote_items` table already has a `description` field (nullable text). The simplest and most flexible approach: **use the existing description field as a rich-text pricing note per line item**, and add a visible textarea in the Create/Edit Quote form for each item.

This avoids schema changes entirely. The description field can hold the multi-line pricing breakdown exactly as the user typed it (e.g., the ".018 SBS - $0.420 ea" list). It renders on the detail page and in the PDF.

### Changes

**1. `src/pages/CreateQuote.tsx`** — Add a collapsible "Description / Pricing Notes" textarea under each line item row in the items table. Pre-populate from `item.description`. This is where the user types variant pricing like:
```
.018 SBS - $0.420 ea
.018 CNK - $0.476 ea
.024 SBS - $0.486 ea
```

**2. `src/pages/QuoteDetail.tsx`** — Render item descriptions below each line item row in the items table (if present), preserving whitespace/line breaks.

**3. `src/lib/quoteUtils.ts`** — Include the description text below the item name/SKU in the PDF table rows so the pricing options appear on the exported PDF.

### No database changes needed
The `description` column already exists on `quote_items` and is already being saved. We just need to surface it in the UI and PDF.

