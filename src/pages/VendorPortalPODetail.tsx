import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, MapPin, Package, Paperclip, Send, X, Download } from "lucide-react";
import { parseISO } from "date-fns";
import { matchVendorPoStatus } from "@/lib/vendorPoStatus";
import { downloadVendorPoPdf } from "@/lib/vendorPoPdf";
import { cn } from "@/lib/utils";

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

interface ProductionUpdate {
  id: string;
  kind: string;
  note: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  percent_at_time: number | null;
  created_at: string;
  signedUrl?: string;
}

const DOC_KINDS = [
  { kind: "packing_list", label: "Packing List", hint: "The packing list for this shipment" },
  { kind: "proof", label: "Order Proofs", hint: "Proofs for the order (photos or PDFs)" },
  { kind: "shipped_qty_sheet", label: "Shipped Qty Sheet", hint: "Sheet of quantities shipped per SKU" },
] as const;

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
const isImage = (name: string | null) => !!name && /\.(png|jpe?g|gif|webp)$/i.test(name);

export default function VendorPortalPODetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [po, setPo] = useState<PoDetail | null>(null);
  const [items, setItems] = useState<PoItem[]>([]);
  const [updates, setUpdates] = useState<ProductionUpdate[]>([]);
  const [info, setInfo] = useState<SheetInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [percent, setPercent] = useState(0);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const pendingDocKindRef = useRef<string | null>(null);

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
      setPercent(poData.production_percent ?? 0);

      // CPO / Vibe invoice / order number via the ownership-checked pipe.
      (supabase as any)
        .rpc("vendor_po_sheet_info", { p_po_ids: [id] })
        .then(({ data }: any) => setInfo((data?.[0] as SheetInfo) || null));

      const [{ data: itemData }, { data: updateData }] = await Promise.all([
        (supabase as any)
          .from("vendor_po_items")
          .select("id, sku, name, description, quantity, shipped_quantity, unit_cost, total")
          .eq("vendor_po_id", id),
        (supabase as any)
          .from("vendor_po_production_updates")
          .select("id, kind, note, attachment_url, attachment_name, percent_at_time, created_at")
          .eq("vendor_po_id", id)
          .order("created_at", { ascending: false }),
      ]);

      setItems((itemData || []) as PoItem[]);

      // Attachments live in the private po-documents bucket — sign for display.
      const rows = (updateData || []) as ProductionUpdate[];
      const paths = rows.filter((u) => u.attachment_url).map((u) => u.attachment_url as string);
      if (paths.length > 0) {
        const { data: signed } = await (supabase as any).storage
          .from("po-documents")
          .createSignedUrls(paths, 60 * 60);
        const byPath = new Map<string, string>(
          (signed || []).filter((s: any) => s.signedUrl).map((s: any) => [s.path, s.signedUrl])
        );
        rows.forEach((u) => {
          if (u.attachment_url) u.signedUrl = byPath.get(u.attachment_url);
        });
      }
      setUpdates(rows);
    } catch (error: any) {
      console.error("Error loading PO:", error);
      toast({ title: "Error", description: "Failed to load this PO", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const savePercent = async (value: number) => {
    if (!po) return;
    const { data, error } = await (supabase as any).rpc("vendor_update_po_details", {
      p_po_id: po.id,
      p_production_percent: value,
    });
    if (error || data?.success === false) {
      console.error("Error saving percent:", error || data?.error);
      toast({ title: "Change didn't save", description: error?.message || data?.error || "Try again", variant: "destructive" });
      setPercent(po.production_percent ?? 0);
    } else {
      setPo({ ...po, production_percent: value });
    }
  };

  const uploadAttachment = async (f: File): Promise<{ path: string; name: string }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/vendor-updates/${po!.id}/${Date.now()}_${safeName}`;
    const { error: upErr } = await (supabase as any).storage.from("po-documents").upload(path, f);
    if (upErr) throw upErr;
    return { path, name: f.name };
  };

  const postUpdate = async () => {
    if (!po) return;
    if (!note.trim() && !file) return;
    setPosting(true);
    try {
      let attachment: { path: string; name: string } | null = null;
      if (file) attachment = await uploadAttachment(file);

      const { error: insErr } = await (supabase as any)
        .from("vendor_po_production_updates")
        .insert({
          vendor_po_id: po.id,
          kind: "update",
          note: note.trim() || null,
          attachment_url: attachment?.path || null,
          attachment_name: attachment?.name || null,
          percent_at_time: percent,
        });
      if (insErr) throw insErr;

      setNote("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load(po.id);
    } catch (error: any) {
      console.error("Error posting update:", error);
      toast({ title: "Update didn't post", description: error.message || "Try again", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const uploadDoc = async (kind: string, f: File) => {
    if (!po) return;
    setUploadingKind(kind);
    try {
      const attachment = await uploadAttachment(f);
      const { error: insErr } = await (supabase as any)
        .from("vendor_po_production_updates")
        .insert({
          vendor_po_id: po.id,
          kind,
          attachment_url: attachment.path,
          attachment_name: attachment.name,
        });
      if (insErr) throw insErr;
      await load(po.id);
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast({ title: "Upload failed", description: error.message || "Try again", variant: "destructive" });
    } finally {
      setUploadingKind(null);
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
  const shipToLines = [
    po.ship_to_name,
    po.ship_to_street,
    [po.ship_to_city, [po.ship_to_state, po.ship_to_zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];
  const itemsTotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const shippingCost = Number(po.shipping_cost || 0);
  const description = po.sheet_description || po.description;
  const updateFeed = updates.filter((u) => u.kind === "update");
  const docsOfKind = (kind: string) => updates.filter((u) => u.kind === kind && u.attachment_url);

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
          {statusMeta && statusMeta.value !== "not_started" ? (
            <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
          ) : !statusMeta && po.production_status ? (
            <Badge variant="secondary">{po.production_status}</Badge>
          ) : null}
        </h1>
        <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
          <Download className="h-4 w-4 mr-1.5" /> Download PDF
        </Button>
      </div>

      {/* Production progress & notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Production progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              onMouseUp={() => savePercent(percent)}
              onTouchEnd={() => savePercent(percent)}
              onKeyUp={() => savePercent(percent)}
              className="flex-1 accent-primary cursor-pointer"
            />
            <div className={cn("text-2xl font-semibold w-20 text-right", percent === 100 && "text-success")}>
              {percent}%
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", percent === 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Post a production note / attachment */}
          <div className="space-y-2 pt-1">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a production note for the team…"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-1.5" /> Attach file
              </Button>
              {file && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              <div className="flex-1" />
              <Button size="sm" onClick={postUpdate} disabled={posting || (!note.trim() && !file)}>
                {posting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Post update
              </Button>
            </div>
          </div>

          {/* Updates feed */}
          {updateFeed.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-border">
              {updateFeed.map((u) => (
                <div key={u.id} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(u.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      {u.percent_at_time != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{u.percent_at_time}%</Badge>}
                    </div>
                    {u.note && <p className="mt-0.5 whitespace-pre-wrap">{u.note}</p>}
                    {u.signedUrl && (
                      isImage(u.attachment_name) ? (
                        <a href={u.signedUrl} target="_blank" rel="noreferrer" className="block mt-2">
                          <img src={u.signedUrl} alt={u.attachment_name || "attachment"} className="max-h-40 rounded-md border border-border" />
                        </a>
                      ) : (
                        <a
                          href={u.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 mt-1 text-primary hover:underline text-xs"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {u.attachment_name || "Attachment"}
                        </a>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shipment documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shipment documents</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={docInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const kind = pendingDocKindRef.current;
              if (f && kind) uploadDoc(kind, f);
              pendingDocKindRef.current = null;
              if (docInputRef.current) docInputRef.current.value = "";
            }}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {DOC_KINDS.map((dk) => {
              const docs = docsOfKind(dk.kind);
              return (
                <div key={dk.kind} className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <div className="text-sm font-medium">{dk.label}</div>
                    <div className="text-xs text-muted-foreground">{dk.hint}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={uploadingKind === dk.kind}
                    onClick={() => { pendingDocKindRef.current = dk.kind; docInputRef.current?.click(); }}
                  >
                    {uploadingKind === dk.kind
                      ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      : <Paperclip className="h-4 w-4 mr-1.5" />}
                    Upload
                  </Button>
                  {docs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60">Nothing uploaded yet</p>
                  ) : (
                    <div className="space-y-1">
                      {docs.map((d) => (
                        <a
                          key={d.id}
                          href={d.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline min-w-0"
                        >
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="truncate">{d.attachment_name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
