

## Print Workshop: Cart & Duplication Workflow (Vibe Admin Only)

All new features gated behind `isVibeAdmin` for testing before client rollout.

### 1. Duplicate Template Action
- Add a **Copy** button on each template card in `PrintWorkshop.tsx`
- Clones the `print_templates` row with name `"(Copy) Original Name"`, new UUID, same `canvas_data`, dimensions, materials, price, `source_pdf_path`
- Refreshes the grid after insert

### 2. Client-Side Cart State
- Add `cartItems` state array to `PrintWorkshop.tsx`
- Interface: `{ id: string, templateId: string, templateName: string, canvasData: any, material: string, quantity: number, pricePerUnit: number | null, thumbnailUrl: string | null }`
- Pass `addToCart` callback down to `OrderPanel`

### 3. Refactor OrderPanel → "Add to Cart"
- Replace "Create Order" / "Request Quote" button with **"Add to Cart"**
- On click: push item into cart state, toast confirmation, navigate back to browse
- Keep "Download Print-Ready PDF" as secondary action
- Remove direct `print_orders` insert from this component

### 4. New Cart Drawer (`PrintCart.tsx`)
- Cart icon + badge count in the Print Workshop header bar
- Opens a `Sheet` (right drawer) listing all cart items:
  - Template name, material, quantity (editable inline), unit price, line total, remove button
  - Footer: total item count, grand total (or "Quote needed" label)
  - **"Place Order"** button
- On place order: batch-insert each item into `print_orders`, generate print PDFs where applicable, clear cart, toast success

### 5. Vibe Admin Gate
- Wrap the entire Print Workshop page route/content behind `isVibeAdmin` check from `useActiveCompany()`
- Non-admins see nothing or get redirected — this is temporary for testing

### Files
- **Modify**: `src/pages/PrintWorkshop.tsx` — cart state, duplicate handler, admin gate, cart trigger
- **Modify**: `src/components/print-workshop/OrderPanel.tsx` — switch to "Add to Cart" mode
- **Create**: `src/components/print-workshop/PrintCart.tsx` — cart drawer component

