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
import { ArrowLeft, Save, Upload, Trash2, ExternalLink, FileText, Pencil, X, History, CheckCircle2, AlertTriangle, Clock, Link2, Search } from "lucide-react";
import { calculateFinanceFee, formatUSD } from "@/lib/financeUtils";
import { AcceptFinanceRequestDialog } from "@/components/AcceptFinanceRequestDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [linkPOOpen, setLinkPOOpen] = useState(false);
  const [poSearchQuery, setPOSearchQuery] = useState("");
  const [poSearchResults, setPOSearchResults] = useState<any[]>([]);
  const [poSearching, setPOSearching] = useState(false);
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
    setIsVibeAdmin(hasVibeAdmin);
    setIsFinanceUser(!hasVibeAdmin && roles.includes("finance"));
    fetchRecord();
    fetchDocuments();
    fetchEditLogs();
    fetchRepayments();
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

  const fetchRepayments = async () => {
    const { data } = await supabase
      .from("finance_repayments")
      .select("*")
      .eq("financed_invoice_id", id!)
      .order("payment_date", { ascending: false });
    setRepayments(data || []);
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

  const searchVendorPOs = async (query: string) => {
    setPOSearchQuery(query);
    if (query.length < 1) { setPOSearchResults([]); return; }
    setPOSearching(true);
    const { data } = await supabase
      .from("vendor_pos")
      .select("id, po_number, description, total, vendors(name)")
      .or(`po_number.ilike.%${query}%,description.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    setPOSearchResults(data || []);
    setPOSearching(false);
  };

  const handleLinkPO = async (vendorPOId: string) => {
    const { error } = await supabase
      .from("financed_invoices")
      .update({ vendor_po_id: vendorPOId })
      .eq("id", id!);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vendor PO linked" });
      setLinkPOOpen(false);
      setPOSearchQuery("");
      setPOSearchResults([]);
      fetchRecord();
    }
  };

  const handleUnlinkPO = async () => {
    const { error } = await supabase
      .from("financed_invoices")
      .update({ vendor_po_id: null })
      .eq("id", id!);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vendor PO unlinked" });
      fetchRecord();
    }
  };

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

      {/* Pending banner for finance users */}
      {record.finance_status === "pending" && isFinanceUser && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">This request is pending your review</p>
              <p className="text-xs text-muted-foreground">Review the documents and notes below, then accept to activate financing.</p>
            </div>
            <Button onClick={() => setAcceptOpen(true)} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Accept & Activate
            </Button>
          </CardContent>
        </Card>
      )}

      {record.finance_status === "pending" && isVibeAdmin && !isFinanceUser && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-amber-600">Pending — awaiting finance company review</p>
              <p className="text-xs text-muted-foreground">As admin, you can manually activate this request with the existing amounts.</p>
            </div>
            <Button onClick={async () => {
              const { error } = await supabase.from("financed_invoices").update({ finance_status: "active" }).eq("id", record.id);
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else { toast({ title: "Activated" }); fetchRecord(); fetchEditLogs(); }
            }} variant="outline" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Activate
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Linked PO section - admin only */}
      {isVibeAdmin && (
        <Card>
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Linked Vendor PO:</span>
              {vendorPO ? (
                <span className="text-sm">
                  PO #{vendorPO.po_number} — {vendorPO.description || "No description"} ({formatUSD(vendorPO.total || 0)})
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">None</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setLinkPOOpen(true); setPOSearchQuery(""); setPOSearchResults([]); }}>
                <Link2 className="mr-1 h-3 w-3" />
                {vendorPO ? "Change PO" : "Link PO"}
              </Button>
              {vendorPO && (
                <Button size="sm" variant="ghost" onClick={handleUnlinkPO}>
                  <X className="mr-1 h-3 w-3" />
                  Unlink
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Repayment Ledger */}
      {(record.finance_status === "active" || record.finance_status === "completed") && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">Repayment History</CardTitle>
            <Badge variant="secondary" className="text-[10px]">{repayments.length} payment{repayments.length !== 1 ? "s" : ""}</Badge>
          </CardHeader>
          <CardContent>
            {repayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No repayments recorded yet</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                 <thead>
                  <tr className="border-b-2 border-border bg-muted">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Method</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Reference</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Notes</th>
                    <th className="px-2 py-2 text-center font-medium text-muted-foreground">Confirmation</th>
                  </tr>
                </thead>
                <tbody>
                  {repayments.map((r, idx) => (
                    <tr key={r.id} className={`border-b border-border ${idx % 2 === 1 ? "bg-muted/50" : ""} ${r.confirmation_status === "disputed" ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.payment_date + "T00:00:00").toLocaleDateString()}</td>
                      <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{formatUSD(r.amount)}</td>
                      <td className="px-2 py-1.5 capitalize">{r.payment_method || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.reference_number || "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[200px] truncate">{r.notes || "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.confirmation_status === "confirmed" ? (
                          <Badge variant="success" className="text-[10px] px-1.5 py-0 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Confirmed</Badge>
                        ) : r.confirmation_status === "disputed" ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge variant="danger" className="text-[10px] px-1.5 py-0 gap-1"><AlertTriangle className="h-2.5 w-2.5" />Disputed</Badge>
                            {r.dispute_note && <span className="text-[10px] text-destructive">{r.dispute_note}</span>}
                          </div>
                        ) : (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0 gap-1"><Clock className="h-2.5 w-2.5" />Pending</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted">
                    <td className="px-2 py-1.5 font-semibold">Total</td>
                    <td className="px-2 py-1.5 text-right font-bold">{formatUSD(repayments.reduce((s: number, r: any) => s + (r.amount || 0), 0))}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Accept dialog for finance users and vibe admins */}
      {(isFinanceUser || isVibeAdmin) && (
        <AcceptFinanceRequestDialog
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          onSuccess={() => { fetchRecord(); fetchEditLogs(); }}
          invoice={record}
        />
      )}

      {/* Link PO Dialog */}
      <Dialog open={linkPOOpen} onOpenChange={setLinkPOOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Vendor PO</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by PO number or description..."
                value={poSearchQuery}
                onChange={(e) => searchVendorPOs(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {poSearching && <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>}
              {!poSearching && poSearchQuery && poSearchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No POs found</p>
              )}
              {poSearchResults.map((po: any) => (
                <button
                  key={po.id}
                  onClick={() => handleLinkPO(po.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">PO #{po.po_number}</span>
                    <span className="text-xs text-muted-foreground">{formatUSD(po.total || 0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {po.description || "No description"}
                    {po.vendors?.name && ` • ${po.vendors.name}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

