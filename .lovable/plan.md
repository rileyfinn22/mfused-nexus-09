
## Forwarder Portal Plan

### 1. Database Changes (Migration)
- **Add `forwarder` to `app_role` enum** — new role type
- **Add ocean freight fields to `shipment_legs`** table:
  - `bl_number` (text) — Bill of Lading number
  - `vessel_voyage` (text) — Vessel & Voyage info
  - `etd` (timestamptz) — Estimated Time of Departure
  - `ctns` (integer) — number of cartons
  - `pcs_per_ctn` (integer) — pieces per carton
  - `qty_pcs` (integer) — total quantity pieces
  - `ddp_method` (text) — delivery method (sea freight, air, etc.)
- **RLS policies** for forwarder role to read orders/items and manage shipment legs
- **Forwarder invitation table** or reuse `company_invitations` with forwarder role

### 2. Forwarder Invite (Vibe Admin)
- Add "Invite Forwarder" option in Settings or a new management area
- Reuse existing `company_invitations` flow with `role = 'forwarder'`

### 3. Forwarder Pages
- **`/forwarder/orders`** — Table view showing:
  - Order number, PO number, description, customer name, financed invoice # (if linked)
  - Click into each order
- **`/forwarder/orders/:id`** — Detail view showing:
  - Order items (product name, qty, SKU — no pricing)
  - Ship-to address
  - Shipping details table (like screenshot): Batch, Product name, CTNS, PCS/CTN, QTY PCS, DDP, B/L NO, Vessel & Voyage, ETA, ETD
  - Ability to add/edit shipping legs with these fields
  - Upload packing lists and shipping documents

### 4. Routing & Auth
- Add forwarder routes in `App.tsx`
- Update `DashboardLayout` to handle forwarder role (redirect to forwarder portal)
- Forwarder sidebar with minimal navigation (just Orders)

### 5. Customer View Updates
- Display the new ocean freight fields (B/L NO, Vessel & Voyage, ETD) on existing shipment tracker when available
- No breaking changes to existing shipment leg flow
