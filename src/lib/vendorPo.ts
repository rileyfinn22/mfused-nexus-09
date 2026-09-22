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
