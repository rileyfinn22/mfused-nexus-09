

## Plan: Show Repeat vs New Status for Each PO Line Item

### Problem
When analyzing an uploaded PO, all extracted products are displayed the same way. There's no indication of whether a product already exists in the system (repeat) or is entirely new.

### Solution

**1. After AI extraction, check each product against the existing `products` table**

In `AnalyzePOProductsDialog.tsx`, after receiving the AI-extracted products, query the `products` table for the selected company and compare each extracted product by name (normalized) to identify matches.

Each `ExtractedProduct` gets a new field:
- `matchStatus`: `'existing'` | `'new'`
- `existingProductId`: the matched product's ID (if existing)

**2. Update the review UI to display status per line item**

- **Existing/Repeat items**: Show a green "Existing" badge next to the product name. These are products already in the system — importing them would create duplicates, so they default to `selected: false` with a note like "Already in catalog".
- **New items**: Show an orange "New" badge. These default to `selected: true`. For new items without a template match, show a small inline "Create Product" action that opens a quick-add form (name, description, state, cost pre-filled from the extraction) to create it as a standalone product.

**3. Inline new product creation**

For "new" items that the user wants to add but hasn't matched to a template, add an inline expandable section (or small dialog trigger) with pre-filled fields (name, description, state, cost, product_type) so the user can confirm/edit details before import. This replaces the current blind bulk insert.

### Technical Details

**File: `src/components/AnalyzePOProductsDialog.tsx`**

- Add `matchStatus` and `existingProductId` to the `ExtractedProduct` interface
- After `handleAnalyze` receives products, query `supabase.from('products').select('id, name').eq('company_id', companyId)` to get all existing products for the company
- Normalize and compare names (case-insensitive, trimmed) to flag each as existing or new
- Update the review card UI:
  - Add a Badge showing "Existing" (green) or "New" (orange)
  - Existing items: unselected by default, grayed styling, tooltip "Already in your catalog"
  - New items: selected by default, editable inline fields (name, state, cost) that can be tweaked before import
- Keep the current import flow but skip items flagged as existing (unless user explicitly re-selects them)

No backend/edge function changes needed — the matching is done client-side against the products table after extraction.

