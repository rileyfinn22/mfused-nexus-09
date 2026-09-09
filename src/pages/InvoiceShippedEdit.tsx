import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, Upload, FileSpreadsheet, FileText, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatUnitPrice } from "@/lib/utils";
import { InvoicePackingListSection } from "@/components/InvoicePackingListSection";
import { blanketTotalItems, calculateInvoiceTotals } from "@/lib/invoiceTotals";

interface OrderItemRow {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  shipped_quantity: number | null;
  unit_price: number;
}

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const parseQty = (s: string) => {
  const m = String(s || "").match(/[\d,]+(\.\d+)?/);
  return m ? parseFloat(m[0].replace(/,/g, "")) : 0;
};

const InvoiceShippedEdit = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [shippedQtys, setShippedQtys] = useState<Record<string, string>>({});
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [relatedInvoices, setRelatedInvoices] = useState<any[]>([]);
  const [aiMatchInfo, setAiMatchInfo] = useState<{ matched: number; total: number } | null>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        setIsVibeAdmin((roles || []).some((r: any) => r.role === "vibe_admin"));
      }

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;
      setInvoice(inv);

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("*, order_items(id, name, sku, unit_price, quantity, shipped_quantity, line_number)")
        .eq("id", inv.order_id)
        .single();
      if (ordErr) throw ordErr;
      const sortedItems = [...(ord.order_items || [])].sort(
        (a: any, b: any) => (a.line_number || 0) - (b.line_number || 0)
      );
      setOrder({ ...ord, order_items: sortedItems });
      setItems(sortedItems);

      // A blank input is "not recorded yet" and stays null on save. This used to pre-fill every
      // unrecorded line with its ORDERED quantity and then save that as shipped, silently
      // marking lines that never left the warehouse as fully shipped.
      const initial: Record<string, string> = {};
      sortedItems.forEach((oi: any) => {
        initial[oi.id] =
          oi.shipped_quantity === null || oi.shipped_quantity === undefined
            ? ""
            : String(Number(oi.shipped_quantity));
      });
      setShippedQtys(initial);

      const { data: related } = await supabase
        .from("invoices")
        .select("id, parent_invoice_id, shipping_cost")
        .eq("order_id", inv.order_id)
        .is("deleted_at", null);
      setRelatedInvoices(related || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const isBlanket = invoice?.invoice_type === "full" || invoice?.invoice_type == null;

  const hasChildren = useMemo(
    () => (relatedInvoices || []).some((ri: any) => ri.parent_invoice_id === invoiceId),
    [relatedInvoices, invoiceId]
  );

  // Preview with the SAME rule the database applies (see invoiceTotals.ts), so the number shown
  // here is the number the trigger writes: a typed quantity bills what shipped, a blank line
  // bills as ordered until the blanket is finalised.
  const previewItems = useMemo(
    () =>
      items.map((oi) => {
        const raw = shippedQtys[oi.id];
        const shipped =
          raw === undefined ? oi.shipped_quantity : raw === "" ? null : Number(raw);
        return { ...oi, shipped_quantity: isFinite(Number(shipped)) || shipped === null ? shipped : null };
      }),
    [items, shippedQtys]
  );

  const previewLines = useMemo(() => blanketTotalItems(previewItems, hasChildren), [previewItems, hasChildren]);

  const childShipping = useMemo(
    () =>
      (relatedInvoices || [])
        .filter((ri: any) => ri.parent_invoice_id === invoiceId)
        .reduce((sum: number, ri: any) => sum + Number(ri.shipping_cost || 0), 0),
    [relatedInvoices, invoiceId]
  );

  // Freight is billed on the shipment that carried it; with no children the blanket keeps its own.
  const newShipping = hasChildren && childShipping > 0 ? childShipping : Number(invoice?.shipping_cost || 0);

  const { subtotal: newSubtotal, total: newTotal } = calculateInvoiceTotals(
    previewLines,
    Number(invoice?.tax || 0),
    newShipping
  );

  const handleAiAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";

    setAiAnalyzing(true);
    setAiMatchInfo(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileContent = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-vendor-packing-list", {
        body: { fileContent, fileName: file.name },
      });
      if (error) throw error;

      const parsed = (data?.items || []) as Array<{ description: string; total_qty: string }>;
      if (parsed.length === 0) {
        toast({ title: "No items found", description: "AI could not extract any line items.", variant: "destructive" });
        return;
      }

      let matched = 0;
      setShippedQtys((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          const itemSku = norm(item.sku);
          const itemName = norm(item.name);
          const found = parsed.find((p) => {
            const desc = norm(p.description);
            if (!desc) return false;
            if (itemSku && (desc.includes(itemSku) || itemSku.includes(desc))) return true;
            if (itemName && (desc.includes(itemName) || itemName.includes(desc))) return true;
            return false;
          });
          if (!found) return;
          const qty = parseQty(found.total_qty);
          if (!qty) return;
          matched++;
          next[item.id] = String(qty);
        });
        return next;
      });

      setAiMatchInfo({ matched, total: parsed.length });
      toast({
        title: "AI analysis complete",
        description: `Matched ${matched} of ${parsed.length} extracted lines to SKUs. Review and Save.`,
      });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message || "Could not parse file", variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!order?.order_items) return;
    setSaving(true);
    try {
      // Freight first, so the trigger fired by the item writes below folds it into the total.
      if (isBlanket && hasChildren && childShipping > 0) {
        const { error: shipErr } = await supabase
          .from("invoices")
          .update({ shipping_cost: childShipping })
          .eq("id", invoiceId);
        if (shipErr) throw shipErr;
      }

      for (const oi of items) {
        const raw = shippedQtys[oi.id];
        if (raw === undefined) continue;
        // Blank clears back to "not recorded"; anything typed, including 0, is a real value.
        const qty: number | null = raw === "" ? null : Number(raw);
        if (qty !== null && (!isFinite(qty) || qty < 0)) continue;
        const { error } = await supabase
          .from("order_items")
          .update({ shipped_quantity: qty })
          .eq("id", oi.id);
        if (error) throw error;
      }

      let written = newTotal;
      if (isBlanket) {
        // The blanket's subtotal/total are owned by recalc_blanket_invoices_for_order. The item
        // writes above already fired it; this call by id is the explicit edit that may move the
        // total either way. No client-side subtotal/total write: the one that used to be here
        // summed its own formula over the top of the trigger's.
        const { error: recalcErr } = await supabase.rpc("recalc_blanket_invoices_for_order", {
          p_order_id: order.id,
          p_include_closed: false,
          p_only_invoice_id: invoiceId,
        });
        if (recalcErr) throw recalcErr;

        const { data: after } = await supabase
          .from("invoices")
          .select("total")
          .eq("id", invoiceId)
          .maybeSingle();
        written = Number(after?.total ?? newTotal);
      }

      toast({ title: "Saved", description: `Blanket total: ${formatCurrency(written)}` });
      navigate(`/invoices/${invoiceId}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="p-6">Invoice not found</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoiceId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Invoice
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Package className="h-5 w-5" /> Edit Shipped Quantities
            </h1>
            <p className="text-sm text-muted-foreground">
              Invoice #{invoice.invoice_number} • Order {order?.order_number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/invoices/${invoiceId}`)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Shipped Quantities"
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI-Assisted Allocation
          </CardTitle>
          <CardDescription>
            Upload a packing list or quantity sheet (PDF, Excel, CSV) and AI will extract line items and
            auto-allocate quantities to the matching SKUs below. You can edit any quantity before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={aiFileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={handleAiAnalyze}
            />
            <Button
              variant="outline"
              onClick={() => aiFileInputRef.current?.click()}
              disabled={aiAnalyzing}
            >
              {aiAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Packing List / Qty Sheet
                </>
              )}
            </Button>
            {aiMatchInfo && (
              <Badge variant="secondary">
                Matched {aiMatchInfo.matched} of {aiMatchInfo.total} extracted lines
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Supported: vendor packing lists, qty sheets, manifests. Items match by SKU first, then name.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items — Shipped Quantities</CardTitle>
          <CardDescription>
            A line with a shipped quantity bills what shipped. Leave a line blank and it bills as ordered
            until the blanket is finalised; type 0 to bill nothing for it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="w-32 text-right">Shipped</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((oi, idx) => {
                const raw = shippedQtys[oi.id];
                const isPlaceholder = raw === undefined || raw === "";
                const billsQty = previewLines[idx]?.quantity ?? 0;
                const lineTotal = billsQty * Number(oi.unit_price || 0);
                return (
                  <TableRow key={oi.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{oi.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{oi.sku}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(oi.quantity || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatUnitPrice(Number(oi.unit_price || 0))}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className={`text-right ${isPlaceholder ? "text-muted-foreground/50 italic" : ""}`}
                        placeholder="not recorded"
                        title={isPlaceholder ? "Not recorded yet — bills as ordered until finalised. Type 0 to bill nothing." : ""}
                        value={shippedQtys[oi.id] ?? ""}
                        onChange={(e) =>
                          setShippedQtys((prev) => ({ ...prev, [oi.id]: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell className={`text-right text-sm ${isPlaceholder ? "text-muted-foreground italic" : ""}`}>
                      {billsQty.toLocaleString()}{isPlaceholder ? " (as ordered)" : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(lineTotal)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-4 border-t pt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(newSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{hasChildren && childShipping > 0 ? "Shipping (from shipments)" : "Shipping"}</span>
              <span>{formatCurrency(newShipping)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(Number(invoice.tax || 0))}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-2 border-t">
              <span>New Total</span>
              <span>{formatCurrency(newTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Packing Lists
          </CardTitle>
          <CardDescription>
            Attach packing lists or qty sheets to this invoice. Uploads are stored and visible on the invoice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoicePackingListSection
            invoiceId={invoiceId!}
            invoice={invoice}
            order={order}
            editedItems={items}
            isVibeAdmin={isVibeAdmin}
            onRefresh={fetchData}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoiceShippedEdit;
