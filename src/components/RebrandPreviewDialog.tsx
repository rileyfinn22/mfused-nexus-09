import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  Upload,
  Check,
  X,
  Sparkles,
  FileText,
  RotateCcw,
  Download,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

type Step = "pick" | "processing" | "preview" | "ai-edit";

interface RebrandPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoice: any;
  order: any;
  editedItems: any[];
  onSuccess: () => void;
}

export const RebrandPreviewDialog = ({
  open,
  onOpenChange,
  invoiceId,
  invoice,
  order,
  editedItems,
  onSuccess,
}: RebrandPreviewDialogProps) => {
  const [step, setStep] = useState<Step>("pick");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [rebrandCoverHeight, setRebrandCoverHeight] = useState(70);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep("pick");
      setSelectedFile(null);
      setNotes("");
      setPdfBlob(null);
      setAiPrompt("");
      setStatusText("");
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  }, [open]);

  const isExcelFile = (file: File) => {
    const name = file.name.toLowerCase();
    return name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isExcel = isExcelFile(file);
    if (!isPdf && !isExcel) {
      toast({ title: "Invalid File Type", description: "Please upload a PDF, Excel, or CSV file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Maximum file size is 10MB", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = async () => {
    if (!selectedFile) return;
    setStep("processing");

    try {
      let resultBlob: Blob;

      if (isExcelFile(selectedFile)) {
        setStatusText("Parsing vendor file…");
        resultBlob = await processExcelFile(selectedFile);
      } else {
        // For PDFs: render to image, extract data with AI, then generate branded PDF
        setStatusText("Rendering vendor PDF…");
        const imageBase64 = await renderPdfToImage(selectedFile);
        setStatusText("AI is extracting packing list data…");
        resultBlob = await processPdfViaAI(selectedFile, imageBase64);
      }

      const url = URL.createObjectURL(resultBlob);
      setPdfBlob(resultBlob);
      setPreviewBlobUrl(url);
      setStep("preview");
    } catch (error: any) {
      console.error("Processing error:", error);
      toast({ title: "Processing Failed", description: error.message || "Failed to process file", variant: "destructive" });
      setStep("pick");
    }
  };

  const renderPdfToImage = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuf = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
    
    // Render all pages into one tall image for better extraction
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      canvases.push(canvas);
    }

    // If single page, just return it
    if (canvases.length === 1) {
      return canvases[0].toDataURL("image/jpeg", 0.8).split(",")[1];
    }

    // Stitch multiple pages vertically
    const totalH = canvases.reduce((s, c) => s + c.height, 0);
    const maxW = Math.max(...canvases.map(c => c.width));
    const stitched = document.createElement("canvas");
    stitched.width = maxW;
    stitched.height = totalH;
    const sCtx = stitched.getContext("2d")!;
    let yOff = 0;
    for (const c of canvases) {
      sCtx.drawImage(c, 0, yOff);
      yOff += c.height;
    }
    return stitched.toDataURL("image/jpeg", 0.7).split(",")[1];
  };

  const processPdfViaAI = async (file: File, imageBase64: string): Promise<Blob> => {
    // Send the rendered image to parse-packing-list for extraction
    const orderItems = (order?.order_items || editedItems).map((item: any) => ({
      id: item.id, name: item.name, sku: item.sku,
      quantity: item.quantity, shipped_quantity: item.shipped_quantity || 0,
    }));

    const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-packing-list", {
      body: { fileContent: imageBase64, orderItems, fileName: file.name, isBase64: true },
    });

    if (parseError) throw parseError;
    if (parseResult?.error) throw new Error(parseResult.error);

    setStatusText("Generating branded PDF…");
    return generateBrandedPdf(parseResult);
  };

  const processExcelFile = async (file: File): Promise<Blob> => {
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const orderItems = (order?.order_items || editedItems).map((item: any) => ({
      id: item.id, name: item.name, sku: item.sku,
      quantity: item.quantity, shipped_quantity: item.shipped_quantity || 0,
    }));

    setStatusText("AI is extracting packing list data…");

    const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-packing-list", {
      body: { fileContent, orderItems, fileName: file.name, isBase64: true },
    });

    if (parseError) throw parseError;
    if (parseResult?.error) throw new Error(parseResult.error);

    setStatusText("Generating branded PDF…");
    return generateBrandedPdf(parseResult);
  };

  const generateBrandedPdf = async (parseResult: any): Promise<Blob> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const lightGray = [248, 248, 248];
    const mediumGray = [100, 100, 100];

    let yPos = 15;

    // Company header
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
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    yPos += 12;

    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("Packing List", 14, yPos);
    yPos += 15;

    // Ship To
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Delivery Address", leftColX, yPos);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order?.shipping_name || "", leftColX, yPos + 8);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    let shipY = yPos + 14;
    if (order?.shipping_street) {
      doc.text(order.shipping_street, leftColX, shipY);
      shipY += 5;
    }
    doc.text(`${order?.shipping_city || ""}, ${order?.shipping_state || ""} ${order?.shipping_zip || ""}`, leftColX, shipY);

    // Details on right
    const detailsStartY = yPos;
    doc.text("Invoice #:", rightColX, detailsStartY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Order #:", rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order?.order_number || "", rightColX + 45, detailsStartY + 7);

    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Date:", rightColX, detailsStartY + 14);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(format(new Date(), "MMM d, yyyy"), rightColX + 45, detailsStartY + 14);

    if (order?.po_number) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text("PO #:", rightColX, detailsStartY + 21);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order.po_number, rightColX + 45, detailsStartY + 21);
    }

    yPos += 40;

    // Build table data
    const matchedItems = parseResult?.matched_items || [];
    const unmatchedItems = parseResult?.unmatched_items || [];
    const shippingSummary = parseResult?.shipping_summary || {};
    const orderItemsMap = new Map((order?.order_items || editedItems).map((item: any) => [item.id, item]));

    let tableData: (string | number)[][] = [];
    let usedUnmatched = false;

    if (matchedItems.length > 0) {
      tableData = matchedItems.map((match: any, index: number) => {
        const orderItem = orderItemsMap.get(match.order_item_id) as any;
        return [String(index + 1), "-", orderItem?.name || match.packing_list_name || "", "-",
          (match.shipped_quantity || 0).toLocaleString(), "-"];
      });
    } else if (unmatchedItems.length > 0) {
      usedUnmatched = true;
      tableData = unmatchedItems.map((item: any, index: number) => {
        const row: (string | number)[] = [
          String(index + 1),
          item.carton_numbers || "-",
          item.name || "Unknown Item",
          item.num_cartons || "-",
          (item.quantity || 0).toLocaleString(),
        ];
        row.push(item.gross_weight_kg ? `${item.gross_weight_kg} kg` : "-");
        return row;
      });
    }

    if (tableData.length === 0) {
      throw new Error("Could not extract any items from the file");
    }

    autoTable(doc, {
      startY: yPos,
      head: [["#", "CTN NO.", "DESCRIPTION", "CTNS", "QTY", "G.W."]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]],
        textColor: 255, fontStyle: "bold", fontSize: 8, cellPadding: 3,
        halign: "center", lineWidth: 0.5,
        lineColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]],
      },
      bodyStyles: {
        fontSize: 8, cellPadding: 3,
        textColor: [darkGray[0], darkGray[1], darkGray[2]],
        lineWidth: 0.25, lineColor: [200, 200, 200],
      },
      alternateRowStyles: { fillColor: [lightGray[0], lightGray[1], lightGray[2]] },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 25, halign: "center" },
        2: { cellWidth: 80 },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 25, halign: "center" },
        5: { cellWidth: 22, halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });

    // Summary
    let tableEndY = (doc as any).lastAutoTable.finalY + 10;
    if (tableEndY + 68 > pageHeight - 10) {
      doc.addPage();
      tableEndY = 20;
    }

    const totalQty = usedUnmatched
      ? unmatchedItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0)
      : matchedItems.reduce((s: number, i: any) => s + (i.shipped_quantity || 0), 0);
    const totalCartons = shippingSummary.total_cartons || unmatchedItems.reduce((s: number, i: any) => s + (i.num_cartons || 0), 0);
    const totalGrossWeight = shippingSummary.total_gross_weight_kg || unmatchedItems.reduce((s: number, i: any) => s + (i.gross_weight_kg || 0), 0);
    const totalNetWeight = shippingSummary.total_net_weight_kg || unmatchedItems.reduce((s: number, i: any) => s + (i.net_weight_kg || 0), 0);
    const totalCbm = shippingSummary.total_cbm || unmatchedItems.reduce((s: number, i: any) => s + (i.cbm || 0), 0);

    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, tableEndY, pageWidth - 28, 28, 2, 2, "S");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("SHIPPING SUMMARY", 20, tableEndY + 7);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);

    const summaryY = tableEndY + 15;
    const colWidth = (pageWidth - 28) / 5;
    const summaryItems = [
      { label: "Total Qty:", value: totalQty.toLocaleString() },
      { label: "Total Cartons:", value: totalCartons > 0 ? totalCartons.toLocaleString() : "-" },
      { label: "Gross Weight:", value: totalGrossWeight > 0 ? `${totalGrossWeight.toFixed(1)} kg` : "-" },
      { label: "Net Weight:", value: totalNetWeight > 0 ? `${totalNetWeight.toFixed(1)} kg` : "-" },
      { label: "Volume (CBM):", value: totalCbm > 0 ? totalCbm.toFixed(3) : "-" },
    ];

    summaryItems.forEach((item, idx) => {
      const xPos = 20 + idx * colWidth;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text(item.label, xPos, summaryY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(item.value, xPos, summaryY + 6);
    });

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 12, { align: "center" });

    return doc.output("blob");
  };

  const handleApprove = async () => {
    if (!pdfBlob || !selectedFile) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const isExcel = isExcelFile(selectedFile);
      const source = isExcel ? "excel-import" : "rebranded";
      const fileName = `${invoiceId}/${Date.now()}-rebranded-${selectedFile.name.replace(/\.\w+$/, ".pdf")}`;

      const { error: uploadError } = await supabase.storage
        .from("packing-lists")
        .upload(fileName, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("invoice_packing_lists")
        .insert({
          invoice_id: invoiceId,
          file_name: `rebranded-${selectedFile.name.replace(/\.\w+$/, ".pdf")}`,
          file_path: fileName,
          file_size: pdfBlob.size,
          file_type: "application/pdf",
          source,
          created_by: user?.id,
          notes: notes || `Rebranded from: ${selectedFile.name}`,
        });

      if (dbError) throw dbError;

      toast({ title: "Packing List Uploaded", description: "Rebranded packing list saved successfully" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload Failed", description: error.message || "Failed to upload packing list", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAiEdit = async () => {
    if (!pdfBlob || !aiPrompt.trim()) return;
    setAiProcessing(true);
    setStep("processing");
    setStatusText("AI is editing the document…");

    try {
      // Convert PDF to image for AI analysis
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuf = await pdfBlob.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

      // Call AI to get edit instructions
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("ai-edit-packing-list", {
        body: { imageBase64, prompt: aiPrompt, currentPdfBase64: btoa(String.fromCharCode(...new Uint8Array(arrayBuf))) },
      });

      if (aiError) throw aiError;

      // For now, show a message that AI editing is processing
      // The AI would need to return instructions about what to change
      toast({
        title: "AI Edit",
        description: aiResult?.message || "AI editing is not yet fully implemented for PDFs. Try uploading a different file or adjusting manually.",
      });

      // Go back to preview
      setStep("preview");
    } catch (error: any) {
      console.error("AI edit error:", error);
      toast({
        title: "AI Edit Note",
        description: "AI PDF editing is coming soon. For now, you can reject and re-upload a corrected file.",
      });
      setStep("preview");
    } finally {
      setAiProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === "preview" ? "max-w-4xl max-h-[90vh]" : "max-w-xl"}>
        <DialogHeader>
          <DialogTitle>
            {step === "pick" && "Upload & Rebrand Packing List"}
            {step === "processing" && "Processing…"}
            {step === "preview" && "Preview Rebranded Packing List"}
            {step === "ai-edit" && "Edit with AI"}
          </DialogTitle>
          <DialogDescription>
            {step === "pick" && "Upload a vendor packing list (PDF or Excel). The file will be rebranded with Vibe Packaging branding."}
            {step === "processing" && statusText}
            {step === "preview" && "Review the rebranded packing list below. Approve to save, or reject to start over."}
            {step === "ai-edit" && "Describe what you'd like to change about the document."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Pick file */}
        {step === "pick" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="rebrandFile">Vendor File</Label>
              <Input
                id="rebrandFile"
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="mt-1"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="rebrandNotes">Notes (optional)</Label>
              <Input
                id="rebrandNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this packing list"
                className="mt-1"
              />
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>PDF:</strong> Vendor header auto-detected & replaced with Vibe branding</li>
                <li><strong>Excel/CSV:</strong> Data extracted and a branded PDF is generated</li>
                <li>You'll preview the result before it's saved</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && previewBlobUrl && (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden bg-muted/30" style={{ height: "50vh" }}>
              <object
                data={previewBlobUrl}
                type="application/pdf"
                className="w-full h-full"
              >
                <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">PDF preview is blocked by your browser. Use the Download button below to view the file.</p>
                </div>
              </object>
            </div>
          </div>
        )}

        {/* Step 4: AI Edit */}
        {step === "ai-edit" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="aiPrompt">What should AI change?</Label>
              <Textarea
                id="aiPrompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Remove the second row, fix the date format, add a column for dimensions…"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "pick" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={processFile} disabled={!selectedFile}>
                <FileText className="h-4 w-4 mr-2" />
                Process & Preview
              </Button>
            </>
          )}

          {step === "processing" && (
            <Button variant="outline" onClick={() => setStep("pick")}>Cancel</Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setStep("pick"); setPdfBlob(null); if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Start Over
              </Button>
              <Button variant="outline" onClick={() => {
                if (!pdfBlob) return;
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `rebranded-packing-list-${invoice?.invoice_number || "draft"}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" onClick={() => setStep("ai-edit")}>
                <Sparkles className="h-4 w-4 mr-2" />
                Edit with AI
              </Button>
              <Button onClick={handleApprove} disabled={uploading}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" />Approve & Upload</>
                )}
              </Button>
            </>
          )}

          {step === "ai-edit" && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")}>
                Back to Preview
              </Button>
              <Button onClick={handleAiEdit} disabled={!aiPrompt.trim() || aiProcessing}>
                {aiProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Apply AI Edit</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
