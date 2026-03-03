import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Send, Check, Package, Mail, FileText,
  DollarSign, MapPin, Pencil, Plus, X, Download,
} from "lucide-react";
import { toast } from "sonner";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";

// Helper: blob to base64
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
  company_id: string;
}

interface PricingTier {
  id: string;
  product_type: string;
  material: string | null;
  min_quantity: number;
  max_quantity: number | null;
  unit_cost: number;
  description: string | null;
}

interface PoLineItem {
  printOrderId: string;
  templateName: string;
  material: string | null;
  quantity: number;
  unitCost: number;
  total: number;
  printTemplateId: string | null;
  canvasData: any;
  printFileUrl: string | null;
  autoPrice: number | null;
}

interface SendWorkshopToVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workshopOrder: any;
  lineItems: any[];
  onSent: () => void;
}

// Always BCC these team members
const INTERNAL_BCC = ["Justin@vibepkg.com", "Riley@vibepkg.com", "Carrie@vibepkg.com"];

export function SendWorkshopToVendorDialog({
  open, onOpenChange, workshopOrder, lineItems, onSent,
}: SendWorkshopToVendorDialogProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingVendors, setFetchingVendors] = useState(true);
  const [generateFiles, setGenerateFiles] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [activeTab, setActiveTab] = useState("po");

  // PO editable line items
  const [poLines, setPoLines] = useState<PoLineItem[]>([]);
  const [poNotes, setPoNotes] = useState("");

  // Email editable fields
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState("");

  useEffect(() => {
    if (open) {
      fetchVendors();
      fetchPricingTiers();
      setSteps([]);
      setActiveTab("po");
    }
  }, [open]);

  // Build PO lines whenever lineItems or pricing changes
  useEffect(() => {
    if (!open) return;
    const lines: PoLineItem[] = lineItems.map((item: any) => {
      const autoPrice = findTierPrice(item);
      const unitCost = autoPrice !== null ? autoPrice : (Number(item.price_per_unit) || 0);
      return {
        printOrderId: item.id,
        templateName: item.template_name,
        material: item.material || null,
        quantity: Number(item.quantity) || 0,
        unitCost,
        total: unitCost * (Number(item.quantity) || 0),
        printTemplateId: item.print_template_id,
        canvasData: item.canvas_data,
        printFileUrl: item.print_file_url,
        autoPrice,
      };
    });
    setPoLines(lines);
    setPoNotes("");
  }, [open, lineItems, pricingTiers]);

  // Update email defaults when vendor changes
  useEffect(() => {
    const vendor = vendors.find((v) => v.id === selectedVendorId);
    if (vendor) {
      const recipients: string[] = [];
      if (vendor.contact_email) recipients.push(vendor.contact_email);
      setEmailRecipients(recipients);
      setEmailSubject(`PO [auto] From VibePKG — ${workshopOrder.order_number}`);
      setEmailBody(
        `Dear ${vendor.name},\n\nPlease find attached the purchase order from VibePKG. ` +
        `Please confirm receipt of this order and provide an estimated delivery date.\n\n` +
        `Ship To:\n${workshopOrder.shipping_name || ""}\n${workshopOrder.shipping_street || ""}\n` +
        `${workshopOrder.shipping_city || ""}, ${workshopOrder.shipping_state || ""} ${workshopOrder.shipping_zip || ""}`
      );
    }
  }, [selectedVendorId, vendors, workshopOrder]);

  const fetchVendors = async () => {
    setFetchingVendors(true);
    const { data } = await supabase
      .from("vendors")
      .select("id, name, contact_email, company_id")
      .eq("is_active", true)
      .order("name");
    setVendors(data || []);
    setFetchingVendors(false);
  };

  const fetchPricingTiers = async () => {
    const { data } = await supabase
      .from("print_pricing_tiers")
      .select("*")
      .order("product_type")
      .order("min_quantity");
    setPricingTiers((data as PricingTier[]) || []);
  };

  const findTierPrice = (item: any): number | null => {
    const qty = Number(item.quantity) || 0;
    const match = pricingTiers.find((t) => {
      const qtyMatch = qty >= t.min_quantity && (t.max_quantity == null || qty <= t.max_quantity);
      return qtyMatch;
    });
    return match ? Number(match.unit_cost) : null;
  };

  const updateLineItem = (idx: number, field: "unitCost" | "quantity", value: number) => {
    setPoLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, total: field === "unitCost" ? value * next[idx].quantity : next[idx].unitCost * value };
      return next;
    });
  };

  const addRecipient = () => {
    const email = newRecipient.trim();
    if (!email || !email.includes("@")) return;
    if (!emailRecipients.includes(email)) {
      setEmailRecipients((prev) => [...prev, email]);
    }
    setNewRecipient("");
  };

  const removeRecipient = (email: string) => {
    setEmailRecipients((prev) => prev.filter((e) => e !== email));
  };

  const poTotal = useMemo(() => poLines.reduce((s, l) => s + l.total, 0), [poLines]);
  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  const markStep = (label: string) => {
    setSteps((prev) => [...prev, { label, done: true }]);
  };

  const handleSend = async () => {
    if (!selectedVendorId) {
      toast.error("Please select a vendor");
      return;
    }
    setLoading(true);
    setSteps([]);
    setActiveTab("po");

    try {
      const vendor = vendors.find((v) => v.id === selectedVendorId)!;
      const { data: { user } } = await supabase.auth.getUser();

      // Step 1: PO number
      markStep("Generating PO number...");
      const { data: lastPo } = await supabase
        .from("vendor_pos")
        .select("po_number")
        .order("po_number", { ascending: false })
        .limit(1)
        .single();
      const lastNum = lastPo?.po_number ? parseInt(lastPo.po_number, 10) : 3000;
      const nextPoNumber = String(Math.max(lastNum + 1, 3001));

      // Step 2: Create Vendor PO
      markStep("Creating Vendor PO...");
      const { data: vpoData, error: vpoError } = await supabase
        .from("vendor_pos")
        .insert({
          po_number: nextPoNumber,
          company_id: vendor.company_id,
          vendor_id: vendor.id,
          order_id: null,
          customer_company_id: workshopOrder.company_id,
          status: "sent",
          total: poTotal,
          po_type: "production",
          description: `Print Workshop Order ${workshopOrder.order_number}`,
          notes: poNotes || null,
          ship_to_name: workshopOrder.shipping_name || null,
          ship_to_street: workshopOrder.shipping_street || null,
          ship_to_city: workshopOrder.shipping_city || null,
          ship_to_state: workshopOrder.shipping_state || null,
          ship_to_zip: workshopOrder.shipping_zip || null,
        } as any)
        .select()
        .single();
      if (vpoError) throw vpoError;

      // Step 3: Line items + PDFs — generate files and collect base64 for email
      markStep("Processing line items & generating print files...");
      const additionalAttachments: { filename: string; content: string }[] = [];

      for (const line of poLines) {
        let printFileUrl: string | null = line.printFileUrl;

        if (generateFiles && line.canvasData && line.printTemplateId) {
          try {
            const { data: template } = await supabase
              .from("print_templates")
              .select("width_inches, height_inches, bleed_inches, source_pdf_path")
              .eq("id", line.printTemplateId)
              .single();

            if (template) {
              const blob = template.source_pdf_path
                ? await generatePrintReadyPdf({
                    sourcePdfPath: template.source_pdf_path,
                    canvasData: line.canvasData,
                    widthInches: Number(template.width_inches),
                    heightInches: Number(template.height_inches),
                    bleedInches: Number(template.bleed_inches),
                  })
                : await generateCanvasOnlyPdf({
                    canvasData: line.canvasData,
                    widthInches: Number(template.width_inches),
                    heightInches: Number(template.height_inches),
                    bleedInches: Number(template.bleed_inches),
                  });

              // Upload to storage
              const filePath = `vendor-po/${vpoData.id}/${crypto.randomUUID()}_${line.templateName.replace(/\s+/g, "_")}.pdf`;
              const { error: uploadErr } = await supabase.storage
                .from("print-files")
                .upload(filePath, blob, { contentType: "application/pdf" });
              if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(filePath);
                printFileUrl = urlData.publicUrl;
              }

              // Convert to base64 for email attachment
              const base64 = await blobToBase64(blob);
              additionalAttachments.push({
                filename: `${line.templateName.replace(/\s+/g, "_")}_print_ready.pdf`,
                content: base64,
              });
            }
          } catch (e) {
            console.warn("Could not generate print file for", line.templateName, e);
          }
        }

        await supabase.from("vendor_po_items").insert({
          vendor_po_id: vpoData.id,
          sku: line.templateName || "PRINT",
          name: line.templateName,
          description: `${line.material || "Standard"} - ${line.quantity?.toLocaleString()} units`,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          total: line.total,
          shipped_quantity: 0,
        } as any);

        if (printFileUrl && printFileUrl !== line.printFileUrl) {
          await supabase.from("print_orders").update({ print_file_url: printFileUrl }).eq("id", line.printOrderId);
        }
      }

      // Step 4: Update workshop order
      markStep("Updating order status...");
      await supabase
        .from("workshop_orders")
        .update({
          status: "approved",
          production_status: "pre_press",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", workshopOrder.id);

      // Step 5: Generate a simple PO summary PDF as base64 for the email
      markStep("Preparing PO document...");
      // We'll use a simple text-based approach for the PO PDF via jsPDF
      let poPdfBase64 = "";
      try {
        const { default: jsPDF } = await import("jspdf");
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("PURCHASE ORDER", 105, 20, { align: "center" });
        doc.setFontSize(11);
        doc.text(`PO #: ${nextPoNumber}`, 14, 35);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 42);
        doc.text(`Vendor: ${vendor.name}`, 14, 49);
        doc.text(`Order: ${workshopOrder.order_number}`, 14, 56);

        // Ship to
        doc.setFontSize(10);
        doc.text("Ship To:", 14, 68);
        const shipLines = [
          workshopOrder.shipping_name,
          workshopOrder.shipping_street,
          `${workshopOrder.shipping_city || ""}, ${workshopOrder.shipping_state || ""} ${workshopOrder.shipping_zip || ""}`,
        ].filter(Boolean);
        shipLines.forEach((l: string, i: number) => doc.text(l, 14, 74 + i * 6));

        // Line items
        let y = 74 + shipLines.length * 6 + 12;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Item", 14, y);
        doc.text("Qty", 110, y, { align: "right" });
        doc.text("Unit Cost", 145, y, { align: "right" });
        doc.text("Total", 185, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 7;
        for (const line of poLines) {
          doc.text(line.templateName, 14, y);
          doc.text(line.quantity.toLocaleString(), 110, y, { align: "right" });
          doc.text(`$${line.unitCost.toFixed(4)}`, 145, y, { align: "right" });
          doc.text(`$${line.total.toFixed(2)}`, 185, y, { align: "right" });
          y += 7;
        }
        y += 3;
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL:", 145, y, { align: "right" });
        doc.text(`$${poTotal.toFixed(2)}`, 185, y, { align: "right" });

        if (poNotes) {
          y += 12;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text("Notes: " + poNotes, 14, y, { maxWidth: 170 });
        }

        poPdfBase64 = doc.output("datauristring").split(",")[1] || "";
      } catch (e) {
        console.warn("Could not generate PO PDF:", e);
      }

      // Step 6: Send email
      if (sendEmail && emailRecipients.length > 0) {
        markStep("Sending email to vendor...");
        const actualSubject = emailSubject.replace("[auto]", nextPoNumber);

        try {
          await supabase.functions.invoke("send-vendor-po-email", {
            body: {
              poId: vpoData.id,
              recipientEmails: emailRecipients,
              senderName: "VibePKG",
              senderEmail: user?.email || "orders@vibepkgportal.com",
              customMessage: emailBody,
              pdfBase64: poPdfBase64,
              pdfFilename: `PO-${nextPoNumber}.pdf`,
              poNumber: nextPoNumber,
              orderDate: new Date().toISOString(),
              totalAmount: poTotal,
              vendorName: vendor.name,
              additionalAttachments,
            },
          });
        } catch (e) {
          console.warn("Email send failed (non-blocking):", e);
        }
      }

      markStep("Done!");
      toast.success(`PO #${nextPoNumber} created and sent to ${vendor.name}`);
      onSent();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send to vendor");
    } finally {
      setLoading(false);
    }
  };

  // Download PO preview
  const handleDownloadPO = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("PURCHASE ORDER — PREVIEW", 105, 20, { align: "center" });
      doc.setFontSize(11);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 35);
      doc.text(`Vendor: ${selectedVendor?.name || "TBD"}`, 14, 42);
      doc.text(`Order: ${workshopOrder.order_number}`, 14, 49);

      const shipLines = [
        workshopOrder.shipping_name,
        workshopOrder.shipping_street,
        `${workshopOrder.shipping_city || ""}, ${workshopOrder.shipping_state || ""} ${workshopOrder.shipping_zip || ""}`,
      ].filter(Boolean);
      doc.setFontSize(10);
      doc.text("Ship To:", 14, 61);
      shipLines.forEach((l: string, i: number) => doc.text(l, 14, 67 + i * 6));

      let y = 67 + shipLines.length * 6 + 12;
      doc.setFont("helvetica", "bold");
      doc.text("Item", 14, y);
      doc.text("Qty", 110, y, { align: "right" });
      doc.text("Unit Cost", 145, y, { align: "right" });
      doc.text("Total", 185, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 7;
      for (const line of poLines) {
        doc.text(line.templateName, 14, y);
        doc.text(line.quantity.toLocaleString(), 110, y, { align: "right" });
        doc.text(`$${line.unitCost.toFixed(4)}`, 145, y, { align: "right" });
        doc.text(`$${line.total.toFixed(2)}`, 185, y, { align: "right" });
        y += 7;
      }
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", 145, y, { align: "right" });
      doc.text(`$${poTotal.toFixed(2)}`, 185, y, { align: "right" });

      doc.save(`PO_Preview_${workshopOrder.order_number}.pdf`);
    } catch (e) {
      toast.error("Failed to generate PO preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send to Vendor — {workshopOrder.order_number}
          </DialogTitle>
        </DialogHeader>

        {/* Vendor Selection */}
        <div className="grid grid-cols-2 gap-4 pb-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Select Vendor</Label>
            {fetchingVendors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.contact_email && <span className="text-muted-foreground ml-1 text-xs">({v.contact_email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ship To</Label>
            <div className="text-xs text-muted-foreground leading-relaxed border border-border rounded-md p-2 bg-muted/30">
              <MapPin className="h-3 w-3 inline mr-1" />
              {workshopOrder.shipping_name && <span className="font-medium">{workshopOrder.shipping_name}</span>}
              {workshopOrder.shipping_street && <>, {workshopOrder.shipping_street}</>}
              {workshopOrder.shipping_city && <>, {workshopOrder.shipping_city}</>}
              {workshopOrder.shipping_state && <> {workshopOrder.shipping_state}</>}
              {workshopOrder.shipping_zip && <> {workshopOrder.shipping_zip}</>}
            </div>
          </div>
        </div>

        <Separator />

        {/* Tabs: PO Details | Email Preview */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="po" className="flex-1 gap-1.5">
              <FileText className="h-3.5 w-3.5" /> PO Details
            </TabsTrigger>
            <TabsTrigger value="email" className="flex-1 gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email Preview
            </TabsTrigger>
          </TabsList>

          {/* PO Details Tab */}
          <TabsContent value="po" className="mt-3 space-y-3">
            <ScrollArea className="max-h-[340px]">
              <div className="space-y-3">
                {/* Line Items Table */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Item</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Material</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-28">Unit Cost</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map((line, i) => (
                        <tr key={line.printOrderId} className={i > 0 ? "border-t border-border" : ""}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-sm">{line.templateName}</div>
                            {line.autoPrice != null && (
                              <Badge variant="secondary" className="text-[10px] mt-0.5 gap-0.5">
                                <DollarSign className="h-2.5 w-2.5" /> Auto-priced
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{line.material || "Standard"}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => updateLineItem(i, "quantity", Math.max(1, Number(e.target.value)))}
                              className="h-7 w-20 text-xs text-right ml-auto"
                              min={1}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={line.unitCost}
                              onChange={(e) => updateLineItem(i, "unitCost", Math.max(0, Number(e.target.value)))}
                              className="h-7 w-24 text-xs text-right ml-auto"
                              min={0}
                              step={0.001}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-sm">
                            ${line.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/50">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold text-sm">PO Total</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">${poTotal.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Download PO Preview */}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadPO}>
                  <Download className="h-3.5 w-3.5" /> Download PO Preview
                </Button>

                {/* Pricing Tiers Reference */}
                {pricingTiers.length > 0 && (
                  <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      Active Price Tiers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pricingTiers.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-[10px] font-mono">
                          {t.min_quantity.toLocaleString()}–{t.max_quantity?.toLocaleString() || "∞"}: ${Number(t.unit_cost).toFixed(4)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* PO Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs">PO Notes (optional)</Label>
                  <Textarea
                    placeholder="Special instructions, rush order info, etc."
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Options */}
                <div className="flex items-center gap-4 p-2 rounded-md bg-muted/30 border border-border">
                  <div className="flex items-center gap-2">
                    <Checkbox id="gen-files" checked={generateFiles} onCheckedChange={(v) => setGenerateFiles(!!v)} />
                    <label htmlFor="gen-files" className="text-xs cursor-pointer">Attach print-ready PDFs</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="send-email"
                      checked={sendEmail}
                      onCheckedChange={(v) => setSendEmail(!!v)}
                    />
                    <label htmlFor="send-email" className="text-xs cursor-pointer">Send email</label>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Email Preview Tab */}
          <TabsContent value="email" className="mt-3 space-y-3">
            <ScrollArea className="max-h-[340px]">
              <div className="space-y-3">
                {/* Recipients management */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipients</Label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {emailRecipients.map((email) => (
                      <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                        {email}
                        <button onClick={() => removeRecipient(email)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={newRecipient}
                      onChange={(e) => setNewRecipient(e.target.value)}
                      placeholder="Add email address..."
                      className="text-sm h-8 flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                    />
                    <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addRecipient}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    BCC: {INTERNAL_BCC.join(", ")} (always included)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="text-sm h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">[auto] will be replaced with the PO number</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email Body</Label>
                  <Textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={6}
                    className="text-sm"
                  />
                </div>

                {/* Email Preview Card */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-primary text-primary-foreground p-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">VibePKG</p>
                      <p className="text-[10px] opacity-80">Premium Packaging Solutions</p>
                    </div>
                    <Badge className="bg-primary-foreground/20 text-primary-foreground border-0 text-[10px]">PURCHASE ORDER</Badge>
                  </div>
                  <div className="p-4 text-xs text-muted-foreground whitespace-pre-line leading-relaxed bg-background">
                    {emailBody || "No message content"}
                  </div>
                  <div className="p-3 bg-muted/50 border-t border-border">
                    <p className="text-[10px] text-destructive font-medium">
                      ⚠️ Please do not reply to this email — this mailbox is not monitored.
                    </p>
                  </div>
                </div>

                {/* File attachments preview */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Attachments</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <FileText className="h-3 w-3" /> PO-[auto].pdf
                    </Badge>
                    {generateFiles && poLines.map((l) => (
                      <Badge key={l.printOrderId} variant="outline" className="text-[10px] gap-1">
                        <Package className="h-3 w-3" /> {l.templateName.replace(/\s+/g, "_")}_print_ready.pdf
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Progress steps */}
        {steps.length > 0 && (
          <div className="space-y-1 text-xs border-t border-border pt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-3 w-3 text-primary" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !selectedVendorId} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? "Processing..." : `Send PO · $${poTotal.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
