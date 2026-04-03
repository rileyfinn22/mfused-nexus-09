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
import { rebrandSpreadsheetToPdf } from "@/lib/rebrandSpreadsheetPdf";

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
        setStatusText("Converting spreadsheet to rebranded PDF…");
        resultBlob = await processExcelFile(selectedFile);
      } else {
        setStatusText("Detecting vendor header…");
        const coverH = await detectHeaderHeight(selectedFile);
        setStatusText("Rebranding PDF…");
        resultBlob = await rebrandPdf(selectedFile, coverH);
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

  const detectHeaderHeight = async (file: File): Promise<number> => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuf = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

      const imageBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      const pdfPageHeight = page.getViewport({ scale: 1 }).height;

      const { data: aiResult } = await supabase.functions.invoke("analyze-header-height", {
        body: { imageBase64, pdfPageHeight },
      });

      if (aiResult?.headerHeight && typeof aiResult.headerHeight === "number") {
        return Math.round(Math.min(Math.max(aiResult.headerHeight, 30), 150));
      }
    } catch (err) {
      console.warn("AI header detection failed, using default:", err);
    }
    return 70;
  };

  const rebrandPdf = async (file: File, coverH: number): Promise<Blob> => {
    const fileBytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(fileBytes);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let logoImage: any = null;
    try {
      const logoResponse = await fetch("/images/vibe-logo.png");
      const logoBytes = await logoResponse.arrayBuffer();
      logoImage = await pdfDoc.embedPng(new Uint8Array(logoBytes));
    } catch {
      console.warn("Could not embed logo");
    }

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 0, y: height - coverH, width, height: coverH, color: rgb(1, 1, 1) });

      const brandY = height - 25;
      page.drawText("ArmorPak Inc. DBA Vibe Packaging", {
        x: 20, y: brandY, size: 12, font: helveticaBold,
        color: rgb(0.298, 0.686, 0.314),
      });
      page.drawText("1415 S 700 W", {
        x: 20, y: brandY - 14, size: 8, font: helvetica,
        color: rgb(0.39, 0.39, 0.39),
      });
      page.drawText("Salt Lake City, UT 84104", {
        x: 20, y: brandY - 23, size: 8, font: helvetica,
        color: rgb(0.39, 0.39, 0.39),
      });
      page.drawText("www.vibepkg.com", {
        x: 20, y: brandY - 32, size: 8, font: helvetica,
        color: rgb(0.39, 0.39, 0.39),
      });

      if (logoImage) {
        const logoW = 50;
        const logoH = (logoImage.height / logoImage.width) * logoW;
        page.drawImage(logoImage, {
          x: width - logoW - 20, y: height - logoH - 10,
          width: logoW, height: logoH,
        });
      }
    }

    const modifiedBytes = await pdfDoc.save();
    return new Blob([modifiedBytes as unknown as ArrayBuffer], { type: "application/pdf" });
  };

  const processExcelFile = async (file: File): Promise<Blob> => {
    return rebrandSpreadsheetToPdf(file, {
      sourceFileName: file.name,
      invoiceNumber: invoice?.invoice_number,
      orderNumber: order?.order_number,
    });
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
                <li><strong>Excel/CSV:</strong> Original spreadsheet content is converted directly into a branded PDF</li>
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
