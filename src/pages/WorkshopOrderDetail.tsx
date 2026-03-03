import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Package, FileText, ExternalLink, Truck,
  Loader2, Save, Printer, Download, Eye, Trash2, Send, MapPin, Pencil, Image
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { CARRIERS, getTrackingUrl } from "@/lib/trackingUtils";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { SendWorkshopToVendorDialog } from "@/components/print-workshop/SendWorkshopToVendorDialog";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In Production" },
  { value: "completed", label: "Completed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const PRODUCTION_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "pre_press", label: "Pre-Press" },
  { value: "printing", label: "Printing" },
  { value: "cutting", label: "Cutting / Finishing" },
  { value: "quality_check", label: "Quality Check" },
  { value: "packing", label: "Packing" },
  { value: "complete", label: "Complete" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  approved: "bg-green-500/10 text-green-700 border-green-200",
  in_production: "bg-purple-500/10 text-purple-700 border-purple-200",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-500/10 text-blue-700 border-blue-200",
  delivered: "bg-green-500/10 text-green-700 border-green-200",
  cancelled: "bg-red-500/10 text-red-700 border-red-200",
};

export default function WorkshopOrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { isVibeAdmin } = useActiveCompany();
  const [order, setOrder] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingFileId, setGeneratingFileId] = useState<string | null>(null);
  const [sendToVendorOpen, setSendToVendorOpen] = useState(false);

  // Editable fields
  const [status, setStatus] = useState("pending");
  const [productionStatus, setProductionStatus] = useState("pending");
  const [productionProgress, setProductionProgress] = useState(0);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [notes, setNotes] = useState("");

  // Editable shipping address
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingName, setShippingName] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingZip, setShippingZip] = useState("");

  useEffect(() => {
    if (orderId) fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from("workshop_orders").select("*").eq("id", orderId!).single(),
      supabase.from("print_orders").select("*").eq("workshop_order_id", orderId!).order("created_at"),
    ]);

    if (orderRes.error) {
      toast.error("Order not found");
      navigate("/print-workshop");
      return;
    }

    const o = orderRes.data;
    setOrder(o);
    setLineItems((itemsRes.data as any[]) || []);
    setStatus(o.status);
    setProductionStatus(o.production_status || "pending");
    setProductionProgress(o.production_progress || 0);
    setTrackingNumber(o.tracking_number || "");
    setTrackingCarrier(o.tracking_carrier || "");
    setNotes(o.notes || "");
    setShippingName(o.shipping_name || "");
    setShippingStreet(o.shipping_street || "");
    setShippingCity(o.shipping_city || "");
    setShippingState(o.shipping_state || "");
    setShippingZip(o.shipping_zip || "");
    setEditingShipping(false);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const trackingUrl = trackingCarrier && trackingNumber
      ? getTrackingUrl(trackingCarrier, trackingNumber)
      : null;

    const { error } = await supabase
      .from("workshop_orders")
      .update({
        status,
        production_status: productionStatus,
        production_progress: productionProgress,
        tracking_number: trackingNumber || null,
        tracking_carrier: trackingCarrier || null,
        tracking_url: trackingUrl,
        notes: notes || null,
        shipping_name: shippingName || null,
        shipping_street: shippingStreet || null,
        shipping_city: shippingCity || null,
        shipping_state: shippingState || null,
        shipping_zip: shippingZip || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", orderId!);

    if (error) toast.error("Failed to save");
    else {
      toast.success("Order updated");
      // Update local order object so dialog sees latest shipping
      setOrder((prev: any) => ({
        ...prev,
        shipping_name: shippingName || null,
        shipping_street: shippingStreet || null,
        shipping_city: shippingCity || null,
        shipping_state: shippingState || null,
        shipping_zip: shippingZip || null,
      }));
      setEditingShipping(false);
    }
    setSaving(false);
  };

  const buildLineItemPdf = async (item: any) => {
    if (!item.print_template_id) throw new Error("Template reference missing on line item");
    const { data: template, error } = await supabase
      .from("print_templates")
      .select("width_inches, height_inches, bleed_inches, source_pdf_path")
      .eq("id", item.print_template_id)
      .single();
    if (error || !template) throw new Error("Could not load template dimensions");

    if (template.source_pdf_path) {
      return generatePrintReadyPdf({
        sourcePdfPath: template.source_pdf_path,
        canvasData: item.canvas_data,
        widthInches: Number(template.width_inches),
        heightInches: Number(template.height_inches),
        bleedInches: Number(template.bleed_inches),
      });
    }
    return generateCanvasOnlyPdf({
      canvasData: item.canvas_data,
      widthInches: Number(template.width_inches),
      heightInches: Number(template.height_inches),
      bleedInches: Number(template.bleed_inches),
    });
  };

  const previewLineItemPdf = async (item: any) => {
    setGeneratingFileId(item.id);
    try {
      const blob = await buildLineItemPdf(item);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to preview PDF");
    } finally {
      setGeneratingFileId(null);
    }
  };

  const downloadLineItemPdf = async (item: any) => {
    setGeneratingFileId(item.id);
    try {
      const blob = await buildLineItemPdf(item);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(item.template_name || "print_file").replace(/\s+/g, "_")}_print_ready.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download PDF");
    } finally {
      setGeneratingFileId(null);
    }
  };

  const formatLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading...
      </div>
    );
  }

  if (!order) return null;

  const effectiveProgress = ["completed", "shipped", "delivered"].includes(status)
    ? 100
    : productionProgress;

  // Customer read-only view
  if (!isVibeAdmin) {
    return (
      <CustomerOrderView
        order={order}
        lineItems={lineItems}
        effectiveProgress={effectiveProgress}
        formatLabel={formatLabel}
      />
    );
  }

  // Admin full view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/print-workshop")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Printer className="h-6 w-6" /> {order.order_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_COLORS[status] || ""}>
            {formatLabel(status)}
          </Badge>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            onClick={() => setSendToVendorOpen(true)}
          >
            <Send className="h-4 w-4" /> Send to Vendor
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Workshop Order</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete order <strong>{order.order_number}</strong> and all its line items. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await supabase.from("print_orders").delete().eq("workshop_order_id", orderId!);
                    const { error } = await supabase.from("workshop_orders").delete().eq("id", orderId!);
                    if (error) toast.error("Failed to delete order");
                    else {
                      toast.success("Order deleted");
                      navigate("/print-workshop");
                    }
                  }}
                >
                  Delete Order
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Line Items + Files */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Item</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Material</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Unit Price</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item: any, i: number) => (
                      <tr key={item.id} className={i > 0 ? "border-t border-border" : ""}>
                        <td className="px-3 py-2 font-medium">{item.template_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.material || "—"}</td>
                        <td className="px-3 py-2 text-right">{item.quantity?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          {item.price_per_unit != null ? `$${Number(item.price_per_unit).toFixed(4)}` : "TBD"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {item.total != null && item.total > 0 ? `$${Number(item.total).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold">Order Total</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">
                        ${Number(order.total).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Print Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items found</p>
              ) : (
                <div className="space-y-2">
                  {lineItems.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.template_name}</p>
                        <p className="text-xs text-muted-foreground">Edited print-ready file</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Preview" disabled={generatingFileId === item.id} onClick={() => previewLineItemPdf(item)}>
                          {generatingFileId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download" disabled={generatingFileId === item.id} onClick={() => downloadLineItemPdf(item)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {item.print_file_url && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Open stored file" onClick={() => window.open(item.print_file_url, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Status, Shipping, Production, Tracking */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Shipping Address
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 w-7 p-0"
                  onClick={() => setEditingShipping(!editingShipping)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingShipping ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input value={shippingName} onChange={(e) => setShippingName(e.target.value)} placeholder="Recipient name" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Street</Label>
                    <Input value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Street address" className="h-8 text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">City</Label>
                      <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">State</Label>
                      <Input value={shippingState} onChange={(e) => setShippingState(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ZIP</Label>
                      <Input value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Click "Save Changes" above to persist</p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {shippingName && <p className="font-medium text-foreground">{shippingName}</p>}
                  {shippingStreet && <p>{shippingStreet}</p>}
                  {(shippingCity || shippingState || shippingZip) && (
                    <p>{[shippingCity, shippingState].filter(Boolean).join(", ")} {shippingZip}</p>
                  )}
                  {!shippingName && !shippingStreet && <p className="italic">No shipping address set</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Production
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Production Stage</Label>
                <Select value={productionStatus} onValueChange={setProductionStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCTION_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Progress</Label>
                  <span className="text-sm font-medium">{effectiveProgress}%</span>
                </div>
                <Progress value={effectiveProgress} className="h-2" />
                <Slider
                  value={[productionProgress]}
                  onValueChange={([v]) => setProductionProgress(v)}
                  min={0} max={100} step={1}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" /> Shipping & Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Select value={trackingCarrier} onValueChange={setTrackingCarrier}>
                  <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tracking Number</Label>
                <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter tracking number" />
              </div>
              {trackingCarrier && trackingNumber && (
                <a href={getTrackingUrl(trackingCarrier, trackingNumber)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Track Shipment
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send to Vendor Dialog */}
      <SendWorkshopToVendorDialog
        open={sendToVendorOpen}
        onOpenChange={setSendToVendorOpen}
        workshopOrder={order}
        lineItems={lineItems}
        onSent={() => fetchOrder()}
      />
    </div>
  );
}

/* ───────────────────────── Customer Order View ───────────────────────── */

function CustomerOrderView({
  order,
  lineItems,
  effectiveProgress,
  formatLabel,
}: {
  order: any;
  lineItems: any[];
  effectiveProgress: number;
  formatLabel: (s: string) => string;
}) {
  const navigate = useNavigate();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingFileId, setGeneratingFileId] = useState<string | null>(null);

  const buildLineItemPdf = async (item: any) => {
    if (!item.print_template_id) throw new Error("Template reference missing");
    const { data: template, error } = await supabase
      .from("print_templates")
      .select("width_inches, height_inches, bleed_inches, source_pdf_path")
      .eq("id", item.print_template_id)
      .single();
    if (error || !template) throw new Error("Could not load template");

    if (template.source_pdf_path) {
      return generatePrintReadyPdf({
        sourcePdfPath: template.source_pdf_path,
        canvasData: item.canvas_data,
        widthInches: Number(template.width_inches),
        heightInches: Number(template.height_inches),
        bleedInches: Number(template.bleed_inches),
      });
    }
    return generateCanvasOnlyPdf({
      canvasData: item.canvas_data,
      widthInches: Number(template.width_inches),
      heightInches: Number(template.height_inches),
      bleedInches: Number(template.bleed_inches),
    });
  };

  const downloadLineItemPdf = async (item: any) => {
    setGeneratingFileId(item.id);
    try {
      // Try stored file first
      if (item.print_file_url) {
        const a = document.createElement("a");
        a.href = item.print_file_url;
        a.download = `${(item.template_name || "print_file").replace(/\s+/g, "_")}_print_ready.pdf`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      // Fallback: regenerate from canvas data
      const blob = await buildLineItemPdf(item);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(item.template_name || "print_file").replace(/\s+/g, "_")}_print_ready.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download PDF");
    } finally {
      setGeneratingFileId(null);
    }
  };

  const previewLineItemPdf = async (item: any) => {
    setGeneratingFileId(item.id);
    try {
      if (item.print_file_url) {
        window.open(item.print_file_url, "_blank");
        return;
      }
      const blob = await buildLineItemPdf(item);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to preview PDF");
    } finally {
      setGeneratingFileId(null);
    }
  };

  const buildOrderPdf = async () => {
    setGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF(); // default mm units, a4-ish
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const primaryGreen = [76, 175, 80];
      const darkGray = [51, 51, 51];
      const mediumGray = [100, 100, 100];

      // ============ HEADER ============
      let yPos = 15;

      // Company name + address on left (matches invoice PDF)
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text("ArmorPak Inc. DBA Vibe Packaging", 14, yPos);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("1415 S 700 W", 14, yPos + 7);
      doc.text("Salt Lake City, UT 84104", 14, yPos + 12);
      doc.text("www.vibepkg.com", 14, yPos + 17);

      // Logo on right (same size as invoice PDF: 40×25)
      try {
        const logoResponse = await fetch("/images/vibe-logo.png");
        const logoBlob = await logoResponse.blob();
        const logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoBase64, "PNG", pageWidth - 54, yPos - 5, 40, 25);
      } catch {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
        doc.text("VIBE", pageWidth - 14, yPos + 8, { align: "right" });
      }

      yPos += 28;

      // Green divider
      doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);

      yPos += 12;

      // ============ TITLE ============
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text("Order Confirmation", 14, yPos);

      yPos += 15;

      // ============ SHIP TO & ORDER DETAILS (two columns) ============
      const leftColX = 14;
      const rightColX = pageWidth / 2 + 10;

      // Ship To label
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("Ship to", leftColX, yPos);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order.shipping_name || "", leftColX, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      let shipY = yPos + 14;
      if (order.shipping_street) { doc.text(order.shipping_street, leftColX, shipY); shipY += 5; }
      const cityLine = [order.shipping_city, order.shipping_state].filter(Boolean).join(", ") + (order.shipping_zip ? ` ${order.shipping_zip}` : "");
      if (cityLine.trim()) { doc.text(cityLine, leftColX, shipY); }

      // Order details on right
      const detailsY = yPos;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);

      doc.text("Order #:", rightColX, detailsY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order.order_number, rightColX + 45, detailsY);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("Date:", rightColX, detailsY + 7);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(format(new Date(order.created_at), "MMM d, yyyy"), rightColX + 45, detailsY + 7);

      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("Status:", rightColX, detailsY + 14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text(formatLabel(order.status), rightColX + 45, detailsY + 14);

      yPos += 30;

      // ============ ITEMS TABLE ============
      autoTable(doc, {
        startY: yPos,
        head: [["Item", "Material", "Qty", "Unit Price", "Total"]],
        body: lineItems.map((item: any) => [
          item.template_name,
          item.material || "—",
          item.quantity?.toLocaleString(),
          item.price_per_unit != null ? `$${Number(item.price_per_unit).toFixed(4)}` : "TBD",
          item.total != null && item.total > 0 ? `$${Number(item.total).toFixed(2)}` : "—",
        ]),
        foot: Number(order.total) > 0 ? [["", "", "", "Total", `$${Number(order.total).toFixed(2)}`]] : undefined,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [41, 41, 41], textColor: 255 },
        footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
        margin: { left: 14, right: 14 },
      });

      // ============ FOOTER ============
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(128, 128, 128);
      doc.text("Thank you for your order!", pageWidth / 2, pageHeight - 15, { align: "center" });
      doc.text(
        "ArmorPak Inc. DBA Vibe Packaging | 1415 S 700 W, Salt Lake City, UT 84104",
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );

      doc.save(`${order.order_number}_confirmation.pdf`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate order document");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/print-workshop")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Printer className="h-6 w-6" /> {order.order_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              Placed {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`${STATUS_COLORS[order.status] || ""}`}>
            {formatLabel(order.status)}
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={buildOrderPdf} disabled={generatingPdf}>
            {generatingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Order PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Production Progress</span>
                <span className="text-muted-foreground">{effectiveProgress}%</span>
              </div>
              <Progress value={effectiveProgress} className="h-2.5" />
              {order.production_status && order.production_status !== "pending" && (
                <p className="text-sm text-muted-foreground">
                  Current stage: <span className="font-medium text-foreground">{formatLabel(order.production_status)}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tracking */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" /> Shipment Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.tracking_number ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <Truck className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {order.tracking_carrier ? order.tracking_carrier.toUpperCase() : "Carrier"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{order.tracking_number}</p>
                    </div>
                    {order.tracking_url && (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Track Package <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {["shipped", "delivered"].includes(order.status) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Package className="h-3.5 w-3.5" />
                      <span>
                        Status: <span className="font-medium text-foreground">{formatLabel(order.status)}</span>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Truck className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Tracking not yet available</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Tracking information will appear here once your order ships.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Items with Thumbnails */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {lineItems.map((item: any, idx: number) => (
                <div key={item.id}>
                  {idx > 0 && <Separator />}
                  <div className="p-4 flex gap-4">
                    {/* Thumbnail */}
                    <button
                      className="shrink-0 w-20 h-20 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                      onClick={() => setPreviewItem(item)}
                      title="Click to preview"
                    >
                      {item.thumbnail_url || item.print_file_url ? (
                        <img
                          src={item.thumbnail_url || item.print_file_url}
                          alt={item.template_name}
                          className="w-full h-full object-contain p-1"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Image className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </button>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm">{item.template_name}</h3>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Preview PDF"
                            disabled={generatingFileId === item.id}
                            onClick={() => previewLineItemPdf(item)}
                          >
                            {generatingFileId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Download PDF"
                            disabled={generatingFileId === item.id}
                            onClick={() => downloadLineItemPdf(item)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.material && (
                          <Badge variant="outline" className="text-xs">{item.material}</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          Qty: {item.quantity?.toLocaleString()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground">
                          {item.price_per_unit != null ? `$${Number(item.price_per_unit).toFixed(4)}/ea` : "Quote pending"}
                        </span>
                        <span className="text-sm font-medium">
                          {item.total != null && item.total > 0 ? `$${Number(item.total).toFixed(2)}` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {Number(order.total) > 0 && (
                <>
                  <Separator />
                  <div className="p-4 flex justify-between items-center">
                    <span className="font-semibold text-sm">Order Total</span>
                    <span className="font-semibold text-primary">${Number(order.total).toFixed(2)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Shipping + Order Info */}
        <div className="space-y-6">
          {/* Shipping Address */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed">
                {order.shipping_name && <p className="font-medium">{order.shipping_name}</p>}
                {order.shipping_street && <p className="text-muted-foreground">{order.shipping_street}</p>}
                {(order.shipping_city || order.shipping_state || order.shipping_zip) && (
                  <p className="text-muted-foreground">
                    {[order.shipping_city, order.shipping_state].filter(Boolean).join(", ")} {order.shipping_zip}
                  </p>
                )}
                {!order.shipping_name && !order.shipping_street && (
                  <p className="text-muted-foreground italic">No shipping address provided</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Document Download */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={buildOrderPdf}
                disabled={generatingPdf}
              >
                {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download Order Confirmation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Thumbnail Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewItem?.template_name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4 min-h-[300px]">
            {previewItem?.thumbnail_url || previewItem?.print_file_url ? (
              <img
                src={previewItem.thumbnail_url || previewItem.print_file_url}
                alt={previewItem.template_name}
                className="max-w-full max-h-[400px] object-contain"
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <Image className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No preview available</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2 flex-wrap">
              {previewItem?.material && <Badge variant="outline">{previewItem.material}</Badge>}
              <Badge variant="secondary">Qty: {previewItem?.quantity?.toLocaleString()}</Badge>
            </div>
            <div className="flex items-center gap-2">
              {previewItem && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={generatingFileId === previewItem?.id}
                  onClick={() => previewItem && downloadLineItemPdf(previewItem)}
                >
                  {generatingFileId === previewItem?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download PDF
                </Button>
              )}
              {previewItem?.total != null && previewItem.total > 0 && (
                <span className="font-medium">${Number(previewItem.total).toFixed(2)}</span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
