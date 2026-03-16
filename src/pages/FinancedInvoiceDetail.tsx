import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Upload, Trash2, ExternalLink, FileText, Pencil, X, History, CheckCircle2 } from "lucide-react";
import { calculateFinanceFee, formatUSD } from "@/lib/financeUtils";
import { AcceptFinanceRequestDialog } from "@/components/AcceptFinanceRequestDialog";

export default function FinancedInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isFinanceUser, setIsFinanceUser] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editLogs, setEditLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Editable fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [financedAmount, setFinancedAmount] = useState("");
  const [rmbAmount, setRmbAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [financedDate, setFinancedDate] = useState("");
  const [paidBackAmount, setPaidBackAmount] = useState("");
  const [status, setStatus] = useState("open");

  useEffect(() => {
    checkAdminAndFetch();
  }, [id]);

  const checkAdminAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["vibe_admin", "finance"]);
    if (!data || data.length === 0) { navigate("/dashboard"); return; }
    const roles = data.map((r: any) => r.role);
    const hasVibeAdmin = roles.includes("vibe_admin");
    setIsFinanceUser(!hasVibeAdmin && roles.includes("finance"));
    fetchRecord();
    fetchDocuments();
    fetchEditLogs();
  };

  const fetchRecord = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financed_invoices")
      .select("*, invoices(invoice_number, total, orders(order_number, customer_name, description)), vendor_pos(po_number, description, total, orders(order_number, customer_name, description), vendors(name))")
      .eq("id", id!)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Not found", variant: "destructive" });
      navigate("/financing");
      return;
    }
    setRecord(data);
    setInvoiceNumber(data.invoice_number || "");
    setNotes(data.notes || "");
    setCarrier(data.carrier || "");
    setTrackingNumber(data.tracking_number || "");
    setTrackingUrl(data.tracking_url || "");
    setShipmentNotes(data.shipment_notes || "");
    setFinancedAmount(String(data.financed_amount || ""));
    setRmbAmount(String(data.financed_amount_rmb || ""));
    setExchangeRate(String(data.exchange_rate || "7.2"));
    setFinancedDate(data.financed_date?.split("T")[0] || "");
    setPaidBackAmount(String(data.paid_back_amount || "0"));
    setStatus(data.status || "open");
    setLoading(false);
  };

  const fetchDocuments = async () => {
    const { data } = await supabase
      .from("financed_invoice_documents")
      .select("*")
      .eq("financed_invoice_id", id!)
      .order("created_at", { ascending: false });
    setDocuments(data || []);
  };

  const fetchEditLogs = async () => {
    const { data } = await supabase
      .from("financed_invoice_edit_log")
      .select("*")
      .eq("financed_invoice_id", id!)
      .order("changed_at", { ascending: false });
    setEditLogs(data || []);
  };

  const handleSave = async () => {
    setSaving(true);
    let finalTrackingUrl = trackingUrl;
    if (!finalTrackingUrl && carrier && trackingNumber) {
      const carrierLower = carrier.toLowerCase().trim();
      const urlMap: Record<string, string> = {
        ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
        fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
        usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
        dhl: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`,
      };
      finalTrackingUrl = urlMap[carrierLower] || "";
    }

    const newValues: Record<string, any> = {
      invoice_number: invoiceNumber || null,
      notes: notes || null,
      carrier: carrier || null,
      tracking_number: trackingNumber || null,
      tracking_url: finalTrackingUrl || null,
      shipment_notes: shipmentNotes || null,
      financed_amount: parseFloat(financedAmount) || 0,
      financed_amount_rmb: parseFloat(rmbAmount) || 0,
      exchange_rate: parseFloat(exchangeRate) || 7.2,
      financed_date: financedDate || record.financed_date,
      paid_back_amount: parseFloat(paidBackAmount) || 0,
      status,
    };

    // Diff changes against current record
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(newValues)) {
      const oldVal = record[key];
      const newVal = newValues[key];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }

    const { error } = await supabase
      .from("financed_invoices")
      .update(newValues)
      .eq("id", id!);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      // Log changes if any
      if (Object.keys(changes).length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("financed_invoice_edit_log").insert({
          financed_invoice_id: id!,
          changed_by: user?.id || null,
          changes,
        });
        fetchEditLogs();
      }
      toast({ title: "Saved successfully" });
      setTrackingUrl(finalTrackingUrl);
      fetchRecord();
    }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      const filePath = `financed/${id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("po-documents").upload(filePath, file);
      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        continue;
      }
      await supabase.from("financed_invoice_documents").insert({
        financed_invoice_id: id!,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        created_by: user?.id || null,
      });
    }
    toast({ title: "Documents uploaded" });
    fetchDocuments();
    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteDocument = async (docId: string, filePath: string) => {
    await supabase.storage.from("po-documents").remove([filePath]);
    await supabase.from("financed_invoice_documents").delete().eq("id", docId);
    toast({ title: "Document removed" });
    fetchDocuments();
  };

  const handleViewDocument = async (filePath: string) => {
    const { data } = await supabase.storage.from("po-documents").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!record) return null;

  const vendorPO = record.vendor_pos as any;
  const invoice = record.invoices as any;
  const poOrder = vendorPO?.orders as any;
  const currentFinanced = parseFloat(financedAmount) || 0;
  const currentPaidBack = parseFloat(paidBackAmount) || 0;
  const fee = calculateFinanceFee(currentFinanced, financedDate || record.financed_date, currentPaidBack);
  const balance = currentFinanced + fee.feeAmount - currentPaidBack;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/financing")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isFinanceUser
              ? `Financed Entry`
              : `Financed ${vendorPO?.po_number ? `PO #${vendorPO.po_number}` : `Entry`}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isFinanceUser
              ? (record.description || "—")
              : (vendorPO?.description || poOrder?.description || poOrder?.customer_name || "—")}
            {!isFinanceUser && vendorPO?.vendors?.name && ` • ${vendorPO.vendors.name}`}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : (
            <>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
              >
                <option value="open">Open</option>
                <option value="paid">Paid</option>
              </select>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); fetchRecord(); }}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={() => { handleSave().then(() => setEditing(false)); }} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Editable financial fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Financial Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Financed Amount (USD)</Label>
              {editing ? (
                <Input
                  type="number"
                  step="0.01"
                  value={financedAmount}
                  onChange={(e) => {
                    setFinancedAmount(e.target.value);
                    const usd = parseFloat(e.target.value) || 0;
                    const rate = parseFloat(exchangeRate) || 7.2;
                    setRmbAmount((usd * rate).toFixed(2));
                  }}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="h-8 flex items-center text-sm font-medium">{formatUSD(currentFinanced)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">RMB Amount</Label>
              {editing ? (
                <Input
                  type="number"
                  step="0.01"
                  value={rmbAmount}
                  onChange={(e) => {
                    setRmbAmount(e.target.value);
                    const rmb = parseFloat(e.target.value) || 0;
                    const rate = parseFloat(exchangeRate) || 7.2;
                    setFinancedAmount((rmb / rate).toFixed(2));
                  }}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="h-8 flex items-center text-sm font-medium">¥{parseFloat(rmbAmount || "0").toLocaleString()}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Exchange Rate</Label>
              {editing ? (
                <Input
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => {
                    setExchangeRate(e.target.value);
                    const rate = parseFloat(e.target.value) || 7.2;
                    const usd = parseFloat(financedAmount) || 0;
                    setRmbAmount((usd * rate).toFixed(2));
                  }}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="h-8 flex items-center text-sm font-medium">{exchangeRate}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Financed Date</Label>
              {editing ? (
                <Input
                  type="date"
                  value={financedDate}
                  onChange={(e) => setFinancedDate(e.target.value)}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="h-8 flex items-center text-sm font-medium">{financedDate ? new Date(financedDate + "T00:00:00").toLocaleDateString() : "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Paid Back</Label>
              {editing ? (
                <Input
                  type="number"
                  step="0.01"
                  value={paidBackAmount}
                  onChange={(e) => setPaidBackAmount(e.target.value)}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="h-8 flex items-center text-sm font-medium">{formatUSD(currentPaidBack)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Aging / Fee / Balance</Label>
              <div className="h-8 flex items-center text-sm gap-2">
                <span className="font-medium">{fee.daysAging}d</span>
                <span className={`font-bold ${fee.daysAging <= 60 ? "text-yellow-500" : "text-orange-600"}`}>{formatUSD(fee.feeAmount)}</span>
                <span className="font-bold">{formatUSD(balance)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice & Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invoice & Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Invoice Number</Label>
              {editing ? (
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Enter invoice number..."
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm font-medium py-1">{invoiceNumber || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              {editing ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="min-h-[80px] text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-1 whitespace-pre-wrap">{notes || "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tracking & Shipment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Tracking & Shipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Carrier</Label>
                {editing ? (
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="UPS, FedEx, DHL..."
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium py-1">{carrier || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Tracking Number</Label>
                {editing ? (
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Tracking #"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium py-1">{trackingNumber || "—"}</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Tracking URL</Label>
              {editing ? (
                <div className="flex gap-2">
                  <Input
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                    placeholder="Auto-generated or paste URL..."
                    className="h-8 text-sm"
                  />
                  {trackingUrl && (
                    <Button size="sm" variant="outline" className="h-8 px-2" asChild>
                      <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                trackingUrl ? (
                  <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline py-1 inline-flex items-center gap-1">
                    {trackingUrl.length > 50 ? trackingUrl.slice(0, 50) + "…" : trackingUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground py-1">—</p>
                )
              )}
            </div>
            <div>
              <Label className="text-xs">Shipment Notes</Label>
              {editing ? (
                <Textarea
                  value={shipmentNotes}
                  onChange={(e) => setShipmentNotes(e.target.value)}
                  placeholder="Shipment details, ETA, special instructions..."
                  className="min-h-[60px] text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-1 whitespace-pre-wrap">{shipmentNotes || "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Documents</CardTitle>
          <div>
            <input
              type="file"
              id="doc-upload"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => document.getElementById("doc-upload")?.click()} disabled={uploading}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No documents attached</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""} • {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleViewDocument(doc.file_path)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDeleteDocument(doc.id, doc.file_path)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subtle edit log indicator */}
      {editLogs.length > 0 && (
        <div className="pt-2 pb-6">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <History className="h-3 w-3" />
            {editLogs.length} edit{editLogs.length !== 1 ? "s" : ""}
          </button>
          {showLogs && (
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {editLogs.map((log) => {
                const changes = log.changes as Record<string, { from: any; to: any }>;
                const fieldNames = Object.keys(changes);
                return (
                  <div key={log.id} className="text-[10px] text-muted-foreground/60 flex gap-2">
                    <span className="whitespace-nowrap shrink-0">
                      {new Date(log.changed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="truncate">
                      {fieldNames.map((f) => {
                        const label = f.replace(/_/g, " ");
                        const c = changes[f];
                        return `${label}: ${c.from ?? "—"} → ${c.to ?? "—"}`;
                      }).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
