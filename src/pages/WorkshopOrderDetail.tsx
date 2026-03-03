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
  ArrowLeft, Package, FileText, ExternalLink, Truck,
  Loader2, Save, Printer, Download, Eye, Trash2, Send
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
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", orderId!);

    if (error) toast.error("Failed to save");
    else toast.success("Order updated");
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
      <div className="space-y-6">
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
          <Badge variant="outline" className={`ml-auto ${STATUS_COLORS[order.status] || ""}`}>
            {formatLabel(order.status)}
          </Badge>
        </div>

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
        {order.tracking_number && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Shipment Tracking</p>
                  <p className="text-xs text-muted-foreground">{order.tracking_carrier?.toUpperCase()} · {order.tracking_number}</p>
                </div>
                {order.tracking_url && (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    Track <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Line Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Item</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Material</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item: any, i: number) => (
                    <tr key={item.id} className={i > 0 ? "border-t border-border" : ""}>
                      <td className="px-3 py-2 font-medium">{item.template_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.material || "—"}</td>
                      <td className="px-3 py-2 text-right">{item.quantity?.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {item.total != null && item.total > 0 ? `$${Number(item.total).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {Number(order.total) > 0 && (
                  <tfoot className="border-t border-border">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">
                        ${Number(order.total).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
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
          {/* Send to Vendor - primary action */}
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

        {/* Right: Status, Production, Tracking */}
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
