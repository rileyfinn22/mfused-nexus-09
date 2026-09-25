/** The little a vibe admin needs to recognise a vendor PO in a list or caption. */
export interface VendorPoOption {
  id: string;
  po_number: string;
  vendor_name: string | null;
  po_type?: string | null;
}

interface VendorPoRowLike {
  id: string;
  po_number: string;
  po_type?: string | null;
  vendor_name?: string | null;
  vendors?: { name?: string | null } | null;
}

/** Normalise a vendor_pos row (with or without the vendors embed) into a VendorPoOption. */
export const toVendorPoOption = (po: VendorPoRowLike): VendorPoOption => ({
  id: po.id,
  po_number: po.po_number,
  vendor_name: po.vendors?.name ?? po.vendor_name ?? null,
  po_type: po.po_type ?? null,
});

export const vendorPoLabel = (po: VendorPoOption | null | undefined) =>
  po ? `${po.po_number}${po.vendor_name ? ` · ${po.vendor_name}` : ""}` : "";

export interface CaseStickerEntry { orderNumber?: string; invoiceNumber?: string; customerPO?: string }

/** Plain-text label instruction listing the actual Order # / Customer PO # for the vendor email. */
export function caseStickerMessage(entries: CaseStickerEntry[]): string {
  if (!entries.length) {
    return "IMPORTANT: Each case label must include the Vibe Order # and Customer PO # shown on the attached PO. These references are required for our customer to receive the shipment.";
  }
  const lines = entries.map((e) => {
    const parts = [`Order # ${e.orderNumber || e.invoiceNumber || "—"}`];
    if (e.invoiceNumber && e.invoiceNumber !== e.orderNumber) parts.push(`Invoice # ${e.invoiceNumber}`);
    parts.push(`Customer PO # ${e.customerPO || "—"}`);
    return `- ${parts.join("  |  ")}`;
  });
  return `IMPORTANT: Please put the following on every case label. These references are required for our customer to receive the shipment:\n${lines.join("\n")}`;
}
