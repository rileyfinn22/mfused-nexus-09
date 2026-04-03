
# Rebrand Upload with Preview & Approval

## Problem
Currently the rebrand flow for Excel files just routes through the old Excel import (loses formatting, no preview). User wants to see the result before committing.

## Solution

### Flow
1. User picks file (PDF or Excel) in rebrand dialog
2. Clicks "Process" → file is rebranded/converted client-side
3. Dialog expands to show a **live PDF preview** (embedded `<iframe>` with blob URL)
4. User sees 3 options:
   - ✅ **Approve & Upload** — saves to storage + creates DB record
   - ❌ **Reject** — discards and goes back to file picker
   - 🤖 **Edit with AI** — opens a prompt input, sends the PDF + prompt to AI to adjust (e.g. "remove the second row", "fix the date format")

### For PDF files (existing flow)
- White-out header with AI-detected height + stamp Vibe branding
- Show result in preview before upload

### For Excel/CSV files  
- Parse via `parse-vendor-packing-list` edge function (already exists)
- Generate a branded PDF client-side using jsPDF+autoTable with all extracted data
- Show result in preview before upload

### Files to modify
- `src/components/InvoicePackingListSection.tsx` — refactor rebrand dialog into a multi-step flow (pick file → preview → approve)
- Potentially a new `RebrandPreviewDialog.tsx` component to keep file size manageable

### Key UX details
- Preview renders inline in the dialog (not a new window — more reliable cross-browser)
- Dialog grows to `max-w-4xl` during preview step
- Loading spinner with status text during processing
