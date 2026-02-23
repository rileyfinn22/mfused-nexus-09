

# Public Vendor Shipment Update Link

## Overview
Create a shareable, no-login-required link that vendors/forwarders can open to view and update shipment leg details in a simple spreadsheet-style table. Admins generate the link from the Production page, and vendors fill in carrier, PRO/tracking numbers, ETAs, and notes directly.

## How It Works

1. **Admin generates a link** from the Production page (or Production Detail page) by selecting orders
2. The link contains a secure token (e.g. `https://vibepkgportal.lovable.app/shipment-update?token=abc123`)
3. Vendor opens the link -- no login needed -- and sees a simple editable table
4. Vendor fills in carrier, tracking number, ETA, notes per leg and clicks Save
5. Data updates directly in the `shipment_legs` table

## Database Changes

### New table: `shipment_share_links`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| token | text | Unique, random hex token (64 chars) |
| company_id | uuid | For scoping |
| created_by | uuid | Admin who created the link |
| order_ids | uuid[] | Array of order IDs included in this link |
| expires_at | timestamptz | Optional expiration (default 30 days) |
| is_active | boolean | Can be deactivated by admin |
| label | text | Optional name (e.g. "Feb Shipment - Factory A") |
| created_at | timestamptz | Default now() |

**RLS Policies:**
- Vibe admins: full CRUD
- Anonymous/public SELECT by token (for the public page to validate and load data)

### New RLS policy on `shipment_legs`
- Allow anonymous UPDATE on specific columns (carrier, tracking_number, tracking_url, estimated_arrival, notes) when the leg's order_id is in an active, non-expired share link. This will be done via a security-definer RPC function instead, to keep things secure.

### New RPC function: `update_shipment_leg_public`
A `SECURITY DEFINER` function that:
- Accepts: token, leg_id, carrier, tracking_number, estimated_arrival, notes
- Validates the token is active and not expired
- Validates the leg belongs to an order in that token's order_ids
- Updates only the allowed columns (carrier, tracking_number, tracking_url, estimated_arrival, notes)
- Returns success/error

### New RPC function: `get_shipment_legs_by_token`
A `SECURITY DEFINER` function that:
- Accepts: token
- Validates token is active and not expired
- Returns shipment legs joined with order_number for all orders in the link
- No auth required

## New Pages and Components

### `/shipment-update` page (public, no DashboardLayout)
- Reads `token` from URL query params
- Calls `get_shipment_legs_by_token` RPC to load data
- Renders a clean, minimal spreadsheet-style table with VibePKG branding
- Columns: Order #, Leg #, Type, Origin, Destination, Carrier (editable), Tracking # (editable), ETA (editable), Notes (editable), Status (read-only)
- Editable cells use inline inputs
- "Save All Changes" button at top that calls `update_shipment_leg_public` for each modified row
- Shows success/error toast feedback

### "Generate Share Link" button on Production page
- Appears when orders are selected (in the existing bulk action bar)
- Opens a small dialog to set an optional label and expiration
- Creates a `shipment_share_links` record
- Displays the generated link with a copy button

## Technical Details

### Files to create
| File | Purpose |
|------|---------|
| `src/pages/ShipmentUpdate.tsx` | Public spreadsheet page |
| `src/components/GenerateShipmentLinkDialog.tsx` | Dialog for creating share links |

### Files to modify
| File | Change |
|------|--------|
| `src/App.tsx` | Add `/shipment-update` route (no DashboardLayout) |
| `src/pages/Production.tsx` | Add "Share Link" button to bulk action bar |

### Database migrations
1. Create `shipment_share_links` table with RLS
2. Create `get_shipment_legs_by_token` RPC function
3. Create `update_shipment_leg_public` RPC function

### Security considerations
- Tokens are 64-char random hex (cryptographically secure)
- Links expire after 30 days by default
- Admins can deactivate links at any time
- Vendors can only update logistics fields (carrier, tracking, ETA, notes) -- not status, dates, or leg structure
- No authentication bypass; all access goes through security-definer functions that validate the token

### Spreadsheet UI layout
```text
+----------+-----+--------------------+---------------+---------------+-----------+---------------+------------+-------+----------+
| Order #  | Leg | Type               | Origin        | Destination   | Carrier   | Tracking #    | ETA        | Notes | Status   |
+----------+-----+--------------------+---------------+---------------+-----------+---------------+------------+-------+----------+
| ORD-1001 |  1  | International      | Shanghai, CN  | LA, CA        | [input]   | [input]       | [date]     | [txt] | Pending  |
| ORD-1001 |  2  | Customs            | LA, CA        | LA, CA        |    --     |     --        | [date]     | [txt] | Pending  |
| ORD-1001 |  3  | Domestic           | LA, CA        | Dallas, TX    | [input]   | [input]       | [date]     | [txt] | Pending  |
| ORD-1022 |  1  | International      | Shenzhen, CN  | Long Beach    | [input]   | [input]       | [date]     | [txt] | Pending  |
+----------+-----+--------------------+---------------+---------------+-----------+---------------+------------+-------+----------+
                                                                    [ Save All Changes ]
```

