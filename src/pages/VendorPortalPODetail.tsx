import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Package, Download } from "lucide-react";
import { parseISO } from "date-fns";
import { matchVendorPoStatus } from "@/lib/vendorPoStatus";
import { downloadVendorPoPdf } from "@/lib/vendorPoPdf";
import VendorProductionPanel from "@/components/vendor/VendorProductionPanel";

interface PoItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  shipped_quantity: number | null;
  unit_cost: number;
  total: number;
}

interface PoDetail {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  vendor_committed_ship_date: string | null;
  completion_date: string | null;
  production_status: string | null;
  production_percent: number;
  is_delayed: boolean;
  delay_reason: string | null;
  description: string | null;
  sheet_description: string | null;
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  shipping_cost: number | null;
  total: number;
  vendors: { name: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;
}

interface SheetInfo {
  po_id: string;
  cpo: string | null;
  order_number: string | null;
  order_description: string | null;
  company_name: string | null;
  invoice_numbers: string[];
}

const parseLocalDate = (s: string | null): Date | undefined => {
  if (!s) return undefined;
  const parts = s.split("T")[0].split("-");
  if (parts.length === 3) return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  try { return parseISO(s); } catch { return undefined; }
};
const fmtDate = (s: string | null): string => {
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};
const fmtMoney = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function VendorPortalPODetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [po, setPo] = useState<PoDetail | null>(null);
  const [items, setItems] = useState<PoItem[]>([]);
  const [info, setInfo] = useState<SheetInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (poId) load(poId);
  }, [poId]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const { data: poData, error: poErr } = await (supabase as any)
        .from("vendor_pos")
        .select(
          `id, po_number, order_date, expected_delivery_date, vendor_committed_ship_date, completion_date,
           production_status, production_percent, is_delayed, delay_reason, description, sheet_description,
           ship_to_name, ship_to_street, ship_to_city, ship_to_state, ship_to_zip, shipping_cost, total,
           vendors ( name, contact_name, contact_email, contact_phone )`
        )
        .eq("id", id)
        .maybeSingle();

      if (poErr) throw poErr;
      if (!poData) {
        toast({ title: "Not found", description: "This PO isn't available.", variant: "destructive" });
        navigate("/vendor-portal");
        return;
      }

      setPo(poData as PoDetail);

      // CPO / Vibe invoice / order number via the ownership-checked pipe.
      (supabase as any)
        .rpc("vendor_po_sheet_info", { p_po_ids: [id] })
        .then(({ data }: any) => setInfo((data?.[0] as SheetInfo) || null));

      const { data: itemData } = await (supabase as any)
        .from("vendor_po_items")
        .select("id, sku, name, description, quantity, shipped_quantity, unit_cost, total, item_type")
        .eq("vendor_po_id", id);

      setItems((itemData || []) as PoItem[]);
    } catch (error: any) {
      console.error("Error loading PO:", error);
      toast({ title: "Error", description: "Failed to load this PO", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!po) return null;

  const handleDownloadPdf = () =>
    downloadVendorPoPdf({
      poNumber: po.po_number,
      orderDate: po.order_date,
      expectedDeliveryDate: po.expected_delivery_date,
      orderNumber: info?.order_number || null,
      vendorName: po.vendors?.name || "",
      vendorContact: {
        name: po.vendors?.contact_name,
        email: po.vendors?.contact_email,
        phone: po.vendors?.contact_phone,
      },
      shipTo: {
        name: po.ship_to_name,
        street: po.ship_to_street,
        city: po.ship_to_city,
        state: po.ship_to_state,
        zip: po.ship_to_zip,
      },
      stickerInfo:
        (info?.invoice_numbers?.length
          ? info.invoice_numbers.map((inv) => ({
              orderNumber: info.order_number || undefined,
              invoiceNumber: inv,
              customerPO: info.cpo || undefined,
            }))
          : info?.cpo
            ? [{ orderNumber: info.order_number || undefined, customerPO: info.cpo }]
            : []),
      items,
      shippingCost: Number(po.shipping_cost || 0),
      total: po.total,
    });

  const statusMeta = matchVendorPoStatus(po.production_status || "");
  const itemsTotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const shippingCost = Number(po.shipping_cost || 0);
  const description = po.sheet_description || po.description;

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate("/vendor-portal")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to my POs
      </button>

      {/* Compact title row (full PO document is below the production sections) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          Vendor PO #{po.po_number}
          {po.production_status && statusMeta?.value !== "not_started" && (
            <span className="text-sm font-normal text-muted-foreground">
              {statusMeta ? statusMeta.label : po.production_status}
            </span>
          )}
        </h1>
        <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
          <Download className="h-4 w-4 mr-1.5" /> Download PDF
        </Button>
      </div>

      {/* Production progress + shipment documents (shared with the admin PO page) */}
      <VendorProductionPanel poId={po.id} />

      {/* PO document — same layout as the vibe-admin Vendor PO page */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b p-8">
            <div>
              <h2 className="text-xl font-bold mb-1">Purchase Order</h2>
              {info?.cpo && <p className="text-sm text-muted-foreground">Customer PO: {info.cpo}</p>}
              {(info?.invoice_numbers?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">Vibe Invoice: {info!.invoice_numbers.join(", ")}</p>
              )}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>

            {/* Dates and Ship To */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Order Date</div>
                  <p className="font-medium">{fmtDate(po.order_date)}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Requested Due Date</div>
                  <p className="font-medium">{fmtDate(po.expected_delivery_date)}</p>
                </div>
                {po.completion_date && (
                  <div>
                    <div className="text-xs text-muted-foreground">Completion Date</div>
                    <p className="font-medium">{po.completion_date}</p>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Ship To Address</div>
                <div className="text-sm">
                  {po.ship_to_name || po.ship_to_street ? (
                    <>
                      {po.ship_to_name && <p className="font-medium">{po.ship_to_name}</p>}
                      {po.ship_to_street && <p>{po.ship_to_street}</p>}
                      {(po.ship_to_city || po.ship_to_state || po.ship_to_zip) && (
                        <p>{[po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(", ")}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">Not set</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Line Items</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{it.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{it.name}</div>
                      {it.description && <div className="text-xs text-muted-foreground">{it.description}</div>}
                    </TableCell>
                    <TableCell className="text-center">{it.quantity?.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right">{`$${Number(it.unit_cost || 0).toFixed(3)}`}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(it.total)}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No line items on this PO.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex justify-end mt-6">
              <div className="w-72 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{fmtMoney(itemsTotal)}</span>
                </div>
                {shippingCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Shipping</span>
                    <span className="font-medium">{fmtMoney(shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-2xl font-bold">{fmtMoney(po.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
