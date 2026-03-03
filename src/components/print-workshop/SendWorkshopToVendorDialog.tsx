import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";

interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
  company_id: string;
}

interface SendWorkshopToVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workshopOrder: any;
  lineItems: any[];
  onSent: () => void;
}

export function SendWorkshopToVendorDialog({
  open, onOpenChange, workshopOrder, lineItems, onSent,
}: SendWorkshopToVendorDialogProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingVendors, setFetchingVendors] = useState(true);
  const [generateFiles, setGenerateFiles] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);

  useEffect(() => {
    if (open) {
      fetchVendors();
      setSteps([]);
      setNotes("");
    }
  }, [open]);

  const fetchVendors = async () => {
    setFetchingVendors(true);
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name, contact_email, company_id")
      .eq("is_active", true)
      .order("name");
    if (error) {
      toast.error(error.message);
    } else {
      setVendors(data || []);
    }
    setFetchingVendors(false);
  };

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

    try {
      const vendor = vendors.find((v) => v.id === selectedVendorId);
      if (!vendor) throw new Error("Vendor not found");

      const { data: { user } } = await supabase.auth.getUser();

      // Step 1: Determine next PO number
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
          order_id: null, // workshop orders aren't linked to regular orders
          customer_company_id: workshopOrder.company_id,
          status: "sent",
          total: Number(workshopOrder.total) || 0,
          po_type: "production",
          description: `Print Workshop Order ${workshopOrder.order_number}`,
          notes: notes || null,
          ship_to_name: workshopOrder.shipping_name || null,
          ship_to_street: workshopOrder.shipping_street || null,
          ship_to_city: workshopOrder.shipping_city || null,
          ship_to_state: workshopOrder.shipping_state || null,
          ship_to_zip: workshopOrder.shipping_zip || null,
        } as any)
        .select()
        .single();

      if (vpoError) throw vpoError;

      // Step 3: Create PO line items + generate/upload PDFs
      markStep("Processing line items & files...");
      const fileUrls: string[] = [];

      for (const item of lineItems) {
        // Generate print-ready PDF if requested
        let printFileUrl: string | null = item.print_file_url || null;

        if (generateFiles && item.canvas_data && item.print_template_id) {
          try {
            const { data: template } = await supabase
              .from("print_templates")
              .select("width_inches, height_inches, bleed_inches, source_pdf_path")
              .eq("id", item.print_template_id)
              .single();

            if (template) {
              const blob = template.source_pdf_path
                ? await generatePrintReadyPdf({
                    sourcePdfPath: template.source_pdf_path,
                    canvasData: item.canvas_data,
                    widthInches: Number(template.width_inches),
                    heightInches: Number(template.height_inches),
                    bleedInches: Number(template.bleed_inches),
                  })
                : await generateCanvasOnlyPdf({
                    canvasData: item.canvas_data,
                    widthInches: Number(template.width_inches),
                    heightInches: Number(template.height_inches),
                    bleedInches: Number(template.bleed_inches),
                  });

              const filePath = `vendor-po/${vpoData.id}/${crypto.randomUUID()}_${item.template_name.replace(/\s+/g, "_")}.pdf`;
              const { error: uploadErr } = await supabase.storage
                .from("print-files")
                .upload(filePath, blob, { contentType: "application/pdf" });

              if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(filePath);
                printFileUrl = urlData.publicUrl;
                fileUrls.push(printFileUrl);
              }
            }
          } catch (e) {
            console.warn("Could not generate print file for", item.template_name, e);
          }
        }

        // Create vendor PO line item
        await supabase.from("vendor_po_items").insert({
          vendor_po_id: vpoData.id,
          sku: item.template_name || "PRINT",
          name: item.template_name,
          description: `${item.material || "Standard"} - ${item.quantity?.toLocaleString()} units`,
          quantity: item.quantity,
          unit_cost: Number(item.price_per_unit) || 0,
          total: Number(item.total) || 0,
          shipped_quantity: 0,
        } as any);

        // Update print order with vendor PO reference
        if (printFileUrl && printFileUrl !== item.print_file_url) {
          await supabase.from("print_orders").update({
            print_file_url: printFileUrl,
          }).eq("id", item.id);
        }
      }

      // Step 4: Update workshop order status
      markStep("Updating order status...");
      await supabase
        .from("workshop_orders")
        .update({
          status: "approved",
          production_status: "pre_press",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", workshopOrder.id);

      // Step 5: Send email to vendor (if enabled and email exists)
      if (sendEmail && vendor.contact_email) {
        markStep("Sending email to vendor...");
        try {
          await supabase.functions.invoke("send-vendor-po-email", {
            body: {
              vendorPoId: vpoData.id,
              vendorEmail: vendor.contact_email,
              attachmentUrls: fileUrls,
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

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send to Vendor
          </DialogTitle>
          <DialogDescription>
            Create a Vendor PO, generate print files, and send everything to your vendor in one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Select Vendor</Label>
            {fetchingVendors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading vendors...
              </div>
            ) : (
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      <span>{vendor.name}</span>
                      {vendor.contact_email && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({vendor.contact_email})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes for Vendor (optional)</Label>
            <Textarea
              placeholder="Special instructions, rush order info, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Options</p>
            <div className="flex items-center gap-2">
              <Checkbox id="gen-files" checked={generateFiles} onCheckedChange={(v) => setGenerateFiles(!!v)} />
              <label htmlFor="gen-files" className="text-sm cursor-pointer">Generate & attach print-ready PDFs</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(!!v)}
                disabled={!selectedVendor?.contact_email}
              />
              <label htmlFor="send-email" className="text-sm cursor-pointer">
                Email PO to vendor
                {selectedVendor && !selectedVendor.contact_email && (
                  <span className="text-xs text-muted-foreground ml-1">(no email on file)</span>
                )}
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-medium">{workshopOrder.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Line items</span>
              <span>{lineItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">${Number(workshopOrder.total).toFixed(2)}</span>
            </div>
          </div>

          {/* Progress steps */}
          {steps.length > 0 && (
            <div className="space-y-1 text-xs">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-3 w-3 text-green-600" />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !selectedVendorId} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? "Processing..." : "Send to Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
