// Shared definition of the vendor-reported production status for a PO.
// Used by the vendor portal (list + detail) and the vibe-admin monitoring tab.
// Mirror of the vendor_pos.production_status check constraint + vendor_update_po_status RPC.

export type VendorPoStatus =
  | "not_started"
  | "in_production"
  | "quality_check"
  | "ready_to_ship"
  | "shipped";

export interface VendorPoStatusMeta {
  value: VendorPoStatus;
  label: string;
  /** Position in the production flow (for progress + ordering). */
  step: number;
  /** Semantic badge classes (no raw palette colors). */
  badgeClass: string;
}

export const VENDOR_PO_STATUSES: VendorPoStatusMeta[] = [
  { value: "not_started", label: "Not Started", step: 0, badgeClass: "bg-muted text-muted-foreground" },
  { value: "in_production", label: "In Production", step: 1, badgeClass: "bg-info/10 text-info" },
  { value: "quality_check", label: "Quality Check", step: 2, badgeClass: "bg-info/10 text-info" },
  { value: "ready_to_ship", label: "Ready to Ship", step: 3, badgeClass: "bg-primary/10 text-primary" },
  { value: "shipped", label: "Shipped", step: 4, badgeClass: "bg-success/10 text-success" },
];

export const VENDOR_PO_STATUS_COUNT = VENDOR_PO_STATUSES.length;

export function getVendorPoStatusMeta(status: string | null | undefined): VendorPoStatusMeta {
  return (
    VENDOR_PO_STATUSES.find((s) => s.value === status) ?? VENDOR_PO_STATUSES[0]
  );
}

/** 0-100 progress for a status, for progress bars. */
export function vendorPoStatusProgress(status: string | null | undefined): number {
  const meta = getVendorPoStatusMeta(status);
  return Math.round((meta.step / (VENDOR_PO_STATUS_COUNT - 1)) * 100);
}
