

# Rebrand Vendor Packing List PDF

## Problem
When you upload a vendor Excel/CSV, the system parses it and rebuilds a completely new PDF using jsPDF -- losing the original formatting, layout, and detail. You want to attach the vendor's actual packing list but with Vibe branding instead of the vendor's name/logo.

## Solution
Add a **"Upload & Rebrand PDF"** option that takes the vendor's original PDF, whites out the top header area (where vendor branding lives), and stamps Vibe Packaging branding on top. The rest of the document stays untouched.

## How It Works

1. **New button** in the packing list section: "Upload & Rebrand" (alongside existing Upload and Excel Import options)
2. User uploads the vendor's PDF directly
3. Client-side processing using `pdf-lib`:
   - Load the vendor PDF
   - On each page, draw a white rectangle over the top ~60px (configurable) to cover vendor name/logo
   - Embed Vibe Packaging text + logo in that same area
   - Optionally let the admin preview/adjust the cover height before saving
4. Save the rebranded PDF to storage with source = `rebranded`

## Technical Details

### Files to modify
- **`src/components/InvoicePackingListSection.tsx`** -- Add "Upload & Rebrand" button and dialog with:
  - PDF file picker (vendor PDF)
  - Slider or input for "header cover height" (default ~70pt) so admin can adjust how much of the top to white-out
  - Preview of page 1 before/after
  - Process using `pdf-lib` (already available in the project via npm) to overlay white rect + Vibe branding
  - Upload result to `packing-lists` bucket

### Processing flow (all client-side, no edge function needed)
```text
Vendor PDF  →  pdf-lib loads it
            →  For each page: draw white rect at top
            →  Embed Vibe logo + "ArmorPak Inc. DBA Vibe Packaging" text
            →  Save modified PDF bytes
            →  Upload to storage + create DB record
```

### Key advantage
The original table data, formatting, measurements, weights -- everything stays exactly as the vendor produced it. Only the header branding changes.

