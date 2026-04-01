## Order Confirmation Feature

### What it does
A "Send Order Confirmation" button on the Order Detail page opens a dialog where you can:
- Preview the confirmation content (order #, ship-to, itemized products with SKU & qty — **no pricing**)
- Add recipients manually or pick from the company's saved emails
- Optionally attach a branded PDF version
- Send the email

### Implementation Steps

1. **Create Order Confirmation PDF utility** (`src/lib/orderConfirmationPdf.ts`)
   - Vibe-branded PDF with logo, order details, ship-to address, itemized product list (name, SKU, qty — no prices)
   - Reuses existing `pdfBranding.ts` helpers

2. **Create Send Order Confirmation Dialog** (`src/components/SendOrderConfirmationDialog.tsx`)
   - Email recipient input with add/remove
   - Auto-suggest company emails from `company_emails` table
   - Preview of order items
   - Option to attach the PDF
   - Sends via the existing `send-invoice-email` edge function (or a lightweight new one)

3. **Add button to Order Detail page** (`src/pages/OrderDetail.tsx`)
   - "Send Confirmation" button in the header actions area

### What's NOT included
- No auto-send on order creation
- No pricing/totals — this is a confirmation of items ordered, not an invoice
