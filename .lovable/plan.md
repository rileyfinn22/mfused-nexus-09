

# Fix Packing List PDF Formatting and Content

## Problems Identified

1. **PDF formatting overflow** -- The green summary box and "Thank you for your business!" text overlap or get cut off at the page bottom when there are many items. The PDF doesn't handle page overflow for the summary section.

2. **Shows PO Number instead of Customer Invoice Number** -- The ORDER DETAILS box on the Vendor PO packing list currently shows `PO Number: 3018` (internal vendor PO number). It should show the customer's invoice number (e.g., `10748`) instead.

3. **Delivery Address labeling** -- The "SHIP TO" box should be labeled "DELIVERY ADDRESS" to be clearer for the customer.

## Changes

### File: `src/components/VendorPOPackingListSection.tsx`

**A. Fix summary box overflow (line ~470-520)**
- Before drawing the summary box, check if `tableEndY + summaryBoxHeight + footer` would exceed the page height
- If so, add a new page before rendering the summary and footer
- This prevents the green summary bar and footer from being clipped

**B. Replace PO Number with Customer Invoice Number in ORDER DETAILS (line ~412)**
- Currently: `drawDetailRow('PO Number', vendorPO?.po_number || '', detailY)`
- Change to: `drawDetailRow('Invoice #', order?.order_number || '', detailY)` -- since the order number matches the invoice number for this customer
- Also need to fetch the related invoice number. Will query it from the `invoices` table or use the order number (which matches the invoice number in this system)

**C. Change "SHIP TO" label to "DELIVERY ADDRESS" (line ~365)**
- Update the header text from `'SHIP TO'` to `'DELIVERY ADDRESS'`

### File: `src/pages/InvoiceDetail.tsx` (handleDownloadPackingList, line ~835-890)

**D. Same fixes for the Invoice Detail packing list download:**
- Change "Ship to" label to "Delivery Address"  
- Replace `PO #` with `Invoice #` (the customer's invoice number, not internal PO)
- Add page overflow protection for the summary/footer section

### File: `src/components/InvoicePackingListSection.tsx` (both Excel-import and Generate flows)

**E. Same content fixes in both PDF generation paths (~line 340, 710):**
- Change "Ship to" to "Delivery Address"
- Replace `PO #` with customer invoice number
- Add page break logic before summary section if content overflows

## Technical Details

**Page overflow fix pattern:**
```text
const remainingSpace = pageHeight - tableEndY - 20;
const neededSpace = summaryBoxHeight + 30; // summary + footer
if (remainingSpace < neededSpace) {
  doc.addPage();
  // Reset Y position for new page
  tableEndY = 20;
}
```

**Invoice number retrieval for Vendor PO packing list:**
- The component already receives `order` as a prop with `order_number`
- In this system, `order_number` matches the blanket invoice number
- Will use `order?.order_number` as the customer-facing reference

