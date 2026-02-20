

# Multi-Leg Shipping Tracker for Production

## Overview
Replace the basic "In Transit" and "Delivered" stages with a detailed multi-leg shipping tracker that reflects your real-world flow: overseas shipment via freight forwarder, customs clearance, then domestic delivery to final destination. Each leg has its own carrier, tracking number, and status.

## Database Changes

### New table: `shipment_legs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| order_id | uuid | FK to orders |
| company_id | uuid | For RLS |
| leg_number | integer | 1, 2, 3... (sequence) |
| leg_type | text | `international`, `customs`, `domestic` |
| label | text | e.g. "China to US Port", "Customs Clearance", "US Port to Customer" |
| carrier | text | e.g. "MSC", "DHL", "UPS", "FedEx" |
| tracking_number | text | Nullable (customs won't have one) |
| tracking_url | text | Auto-generated link |
| origin | text | e.g. "Shanghai, China" |
| destination | text | e.g. "Los Angeles, CA" |
| shipped_date | timestamptz | When this leg started |
| estimated_arrival | timestamptz | ETA for this leg |
| actual_arrival | timestamptz | When it actually arrived |
| status | text | `pending`, `in_transit`, `customs_hold`, `cleared`, `out_for_delivery`, `delivered` |
| notes | text | Optional |
| created_by | uuid | Who added it |
| created_at | timestamptz | Default now() |

RLS policies:
- Vibe admins: full CRUD
- Company users (customers): SELECT only for their company's orders

### Typical 3-leg flow

```text
Leg 1: International Freight
  Origin: Shanghai, China --> Destination: Los Angeles, CA
  Carrier: MSC Shipping | Tracking: MSCU1234567
  Status: Delivered (arrived at port)

Leg 2: Customs Clearance
  Location: Los Angeles, CA
  Status: Cleared
  Notes: Cleared customs 2/18

Leg 3: Domestic Delivery
  Origin: Los Angeles, CA --> Destination: Dallas, TX
  Carrier: FedEx Freight | Tracking: 7489201234
  Status: In Transit | ETA: Feb 22
```

## UI Changes

### A. Production Detail Page -- New "Shipment Tracking" Section

Add a dedicated section between the Production Stages timeline and the existing Fulfillment Status table. It will show:

1. **Visual leg-by-leg timeline** -- A horizontal or vertical chain of cards, one per leg, connected by lines/arrows
2. **Each leg card shows**:
   - Leg type icon (Ship for international, Shield/Flag for customs, Truck for domestic)
   - Origin and destination
   - Carrier name and clickable tracking number (auto-generated URL)
   - Status badge (color-coded: gray=pending, blue=in transit, amber=customs hold, green=delivered/cleared)
   - Dates: shipped, ETA, actual arrival
   - Notes
3. **Overall shipping progress bar** at the top summarizing all legs

### B. Admin: "Add Shipping Leg" Dialog

Vibe admins get a button to add legs with a form:
- Leg type dropdown (International, Customs, Domestic)
- Pre-filled label based on type selection
- Carrier (dropdown with common options: MSC, Maersk, CMA CGM, FedEx, UPS, USPS, DHL, Other)
- Tracking number
- Origin / Destination fields
- Shipped date, Estimated arrival
- Notes

Admins can also update status and actual arrival date on each existing leg via inline controls.

### C. Carrier Tracking URL Auto-Generation

```text
Utility: getTrackingUrl(carrier, trackingNumber)
  UPS      -> https://www.ups.com/track?tracknum={num}
  FedEx    -> https://www.fedex.com/fedextrack/?trknbr={num}
  USPS     -> https://tools.usps.com/go/TrackConfirmAction?tLabels={num}
  DHL      -> https://www.dhl.com/us-en/home/tracking.html?tracking-id={num}
  MSC      -> https://www.msc.com/en/track-a-shipment?trackingNumber={num}
  Maersk   -> https://www.maersk.com/tracking/{num}
  CMA CGM  -> https://www.cma-cgm.com/ebusiness/tracking/search?SearchId={num}
  Fallback -> Google search
```

### D. Customer View

Customers see the same leg-by-leg timeline but without admin controls. They get:
- Read-only view of each leg's status, carrier, tracking link, and dates
- A prominent overall status summary: "Your order is currently: In Transit (Domestic Delivery)"
- Clickable tracking numbers open the carrier's tracking page in a new tab

### E. Integration with Existing "In Transit" Stage

When an admin adds shipping legs:
- The "In Transit" production stage automatically shows a summary badge: "3 legs | Leg 2: Customs"
- Clicking the "In Transit" stage card expands to show the full leg timeline inline
- When all legs reach "delivered" status, the "In Transit" stage auto-completes

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/trackingUtils.ts` | **New** -- carrier URL helper |
| `src/components/ShipmentTracker.tsx` | **New** -- leg-by-leg timeline UI component |
| `src/components/AddShipmentLegDialog.tsx` | **New** -- admin dialog to add/edit legs |
| `src/pages/ProductionDetail.tsx` | **Modify** -- fetch shipment legs, render ShipmentTracker section |
| `src/components/ProductionStageTimeline.tsx` | **Modify** -- show tracking summary on "In Transit" stage card |

## Technical Details

### Database migration summary
- Create `shipment_legs` table with RLS
- Vibe admin policies for full CRUD
- Company user SELECT policy via order's company_id

### Data fetching in ProductionDetail
- New query: `supabase.from('shipment_legs').select('*').eq('order_id', orderId).order('leg_number')`
- Pass legs data to the new ShipmentTracker component

### Status flow per leg
```text
pending --> in_transit --> delivered        (for international/domestic)
pending --> in_transit --> customs_hold --> cleared  (for customs)
```

