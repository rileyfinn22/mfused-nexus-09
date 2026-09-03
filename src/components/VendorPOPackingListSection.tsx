import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Eye,
  FileCheck,
  Loader2,
  Sparkles,
  Package
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import jsPDF from "jspdf";
import {
  DOC,
  DOC_COLORS,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMasthead,
  drawPartyBlock,
  ensureRoom,
} from "@/lib/pdfDocument";
import autoTable from "jspdf-autotable";

interface PackingListFile {
  id: string;
  vendor_po_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  source: string;
  original_packing_list_id: string | null;
  parsed_data: any;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

interface ParsedPackingItem {
  description: string;
  cartons: string;
  qty_per_carton: string;
  total_qty: string;
  gross_weight: string;
  net_weight: string;
  measurement: string;
  shipping_date?: string;
}

interface VendorPOPackingListSectionProps {
  vendorPOId: string;
  vendorPO: any;
  order: any;
  poItems: any[];
  isAdmin: boolean;
  onRefresh: () => void;
}

export const VendorPOPackingListSection = ({
  vendorPOId,
  vendorPO,
  order,
  poItems,
  isAdmin,
  onRefresh
}: VendorPOPackingListSectionProps) => {
  const [packingLists, setPackingLists] = useState<PackingListFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedPackingItem[]>([]);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewPackingList, setPreviewPackingList] = useState<PackingListFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPackingLists();
  }, [vendorPOId]);

  const fetchPackingLists = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_po_packing_lists')
      .select('*')
      .eq('vendor_po_id', vendorPOId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching packing lists:', error);
    } else {
      setPackingLists(data || []);
    }
    setLoading(false);
  };

  const handleUploadClick = () => {
    setSelectedFile(null);
    setNotes("");
    setParsedItems([]);
    setShowUploadDialog(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['.xlsx', '.xls', '.csv', '.pdf'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(fileExt)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel (.xlsx, .xls), CSV, or PDF file",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
    
    // Auto-parse Excel/CSV files
    if (fileExt === '.xlsx' || fileExt === '.xls' || fileExt === '.csv') {
      await parsePackingList(file);
    }
  };

  const parsePackingList = async (file: File) => {
    setParsing(true);
    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke('parse-vendor-packing-list', {
        body: {
          fileContent: base64,
          fileName: file.name
        }
      });

      if (error) throw error;

      if (data?.items && data.items.length > 0) {
        setParsedItems(data.items);
        toast({
          title: "Packing List Parsed",
          description: `Found ${data.items.length} items`
        });
      } else {
        toast({
          title: "No Items Found",
          description: "Could not extract items from the packing list",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Parse error:', error);
      toast({
        title: "Parse Failed",
        description: error.message || "Failed to parse packing list",
        variant: "destructive"
      });
    } finally {
      setParsing(false);
    }
  };

  // Sanitize filename for storage - remove special characters
  const sanitizeFileName = (name: string): string => {
    // Get extension
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot > 0 ? name.slice(lastDot) : '';
    const baseName = lastDot > 0 ? name.slice(0, lastDot) : name;
    
    // Replace special characters with underscores, keep only alphanumeric, hyphens, and underscores
    const sanitized = baseName
      .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
      .replace(/\s+/g, '_')     // Replace spaces with underscores
      .replace(/_+/g, '_')      // Collapse multiple underscores
      .slice(0, 100);           // Limit length
    
    return sanitized + ext.toLowerCase();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upload original file to storage with sanitized filename
      const sanitizedName = sanitizeFileName(selectedFile.name);
      const fileName = `${vendorPOId}/original-${Date.now()}-${sanitizedName}`;
      const { error: uploadError } = await supabase.storage
        .from('packing-lists')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Create database record for original
      const { data: originalRecord, error: dbError } = await supabase
        .from('vendor_po_packing_lists')
        .insert({
          vendor_po_id: vendorPOId,
          file_name: selectedFile.name,
          file_path: fileName,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          source: 'uploaded',
          parsed_data: parsedItems.length > 0 ? { items: parsedItems } : null,
          created_by: user?.id,
          notes: notes || null
        } as any)
        .select()
        .single();

      if (dbError) throw dbError;

      // If we have parsed items, auto-generate branded version
      if (parsedItems.length > 0 && originalRecord) {
        await generateBrandedPackingList(parsedItems, originalRecord.id);
      }

      toast({
        title: "Packing List Uploaded",
        description: parsedItems.length > 0 
          ? "Original uploaded and branded version generated!" 
          : "File uploaded successfully"
      });

      setShowUploadDialog(false);
      fetchPackingLists();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload packing list",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const generateBrandedPackingList = async (items: ParsedPackingItem[], originalId?: string) => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = DOC.MARGIN;

      // ===== HEADER SECTION =====
      await drawMasthead(doc);

      let yPos = drawDocumentTitle(doc, {
        label: 'PACKING LIST',
        value: vendorPO?.po_number || order?.order_number || '',
        metaLabel: 'Packed',
        metaValue: format(new Date(), 'MMMM d, yyyy'),
      });

      // ===== DELIVERY ADDRESS + ORDER DETAILS =====
      const detailsStartY = yPos;
      const street = vendorPO?.ship_to_street || order?.shipping_street || '';
      const city = vendorPO?.ship_to_city || order?.shipping_city || '';
      const state = vendorPO?.ship_to_state || order?.shipping_state || '';
      const zip = vendorPO?.ship_to_zip || order?.shipping_zip || '';

      // The old layout computed this line`s y as `yPos + street ? 29 : 22`, which
      // concatenates before it tests, so the address always landed at an absolute
      // y of 29 rather than below the name.
      const shipY = drawPartyBlock(doc, margin, yPos, {
        label: 'DELIVERY ADDRESS',
        name: vendorPO?.ship_to_name || order?.shipping_name || '',
        lines: [street || null, `${city}, ${state} ${zip}`.trim() || null],
      });

      const detY = drawDetailRows(
        doc,
        pageWidth / 2 + 4,
        detailsStartY,
        [
          ['Order #', order?.order_number || vendorPO?.orders?.order_number || ''],
          ['Customer', order?.customer_name || vendorPO?.orders?.customer_name || ''],
        ],
        { label: 'ORDER DETAILS', valueOffset: 30 }
      );

      yPos = Math.max(shipY + 8, detY + 10);

      // ===== ITEMS TABLE =====
      const tableData = items.map((item) => [
        item.description || '-',
        item.cartons || '-',
        item.qty_per_carton || '-',
        item.total_qty || '-',
        item.gross_weight || '-',
        item.net_weight || '-',
        item.measurement || '-'
      ]);

      // A shipping manifest earns its ruled grid -- seven numeric columns read
      // better boxed than on hairlines. It uses the house palette, not the
      // green-on-white it had.
      autoTable(doc, {
        startY: yPos,
        head: [['ITEM DESCRIPTION', 'CARTONS', 'QTY/CTN', 'TOTAL QTY', 'GROSS WT.', 'NET WT.', 'CBM']],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: DOC_COLORS.rule,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: DOC_COLORS.headerBg,
          textColor: DOC_COLORS.muted,
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 4,
          halign: 'center'
        },
        bodyStyles: {
          textColor: DOC_COLORS.body,
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 'auto', halign: 'left', fontStyle: 'bold', textColor: DOC_COLORS.ink },
          1: { cellWidth: 22, halign: 'right' },
          2: { cellWidth: 22, halign: 'right' },
          3: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: DOC_COLORS.ink },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' }
        },
        margin: { left: margin, right: margin, bottom: DOC.FOOTER_RESERVE },
        tableLineColor: DOC_COLORS.rule,
        tableLineWidth: 0.2,
      });

      // ===== SUMMARY SECTION =====
      const summaryBoxHeight = 20;
      const tableEndY = ensureRoom(doc, (doc as any).lastAutoTable.finalY + 10, summaryBoxHeight + 10);

      // Calculate totals
      const totalCartons = items.reduce((sum, item) => {
        const num = parseInt(item.cartons?.replace(/[^\d]/g, '') || '0');
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

      const totalQty = items.reduce((sum, item) => {
        const num = parseInt(item.total_qty?.replace(/[^\d]/g, '') || '0');
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

      const totalGrossWeight = items.reduce((sum, item) => {
        const num = parseFloat(item.gross_weight?.replace(/[^\d.]/g, '') || '0');
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

      const totalCBM = items.reduce((sum, item) => {
        const num = parseFloat(item.measurement?.replace(/[^\d.]/g, '') || '0');
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

      // Summary band -- charcoal, echoing the masthead.
      const summaryBoxWidth = pageWidth - margin * 2;
      doc.setFillColor(...DOC_COLORS.ink);
      doc.rect(margin, tableEndY, summaryBoxWidth, summaryBoxHeight, 'F');

      const colWidth = summaryBoxWidth / 4;
      const summaryLabelY = tableEndY + 8;
      const summaryValueY = tableEndY + 15;
      const summary: Array<[string, string]> = [
        ['CARTONS', `${totalCartons}`],
        ['TOTAL QTY', totalQty.toLocaleString()],
        ['GROSS WEIGHT', `${totalGrossWeight.toFixed(1)} kg`],
        ['CBM', totalCBM.toFixed(2)],
      ];

      summary.forEach(([label, value], i) => {
        const cx = margin + colWidth * (i + 0.5);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...DOC_COLORS.onInkMuted);
        doc.text(label, cx, summaryLabelY, { align: 'center' });
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(value, cx, summaryValueY, { align: 'center' });
      });

      // ===== FOOTER =====
      drawFooter(doc, `Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`);

      // Convert to blob and upload
      const pdfBlob = doc.output('blob');
      const fileName = `${vendorPOId}/${Date.now()}-branded-packing-list-${vendorPO?.po_number || 'PO'}.pdf`;
      
      const { error: uploadError } = await supabase.storage
        .from('packing-lists')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from('vendor_po_packing_lists')
        .insert({
          vendor_po_id: vendorPOId,
          file_name: `packing-list-${vendorPO?.po_number || 'PO'}.pdf`,
          file_path: fileName,
          file_size: pdfBlob.size,
          file_type: 'application/pdf',
          source: 'generated',
          original_packing_list_id: originalId || null,
          parsed_data: { items },
          created_by: user?.id,
          notes: 'Branded packing list generated from vendor document'
        } as any);

      if (dbError) throw dbError;

      if (!originalId) {
        toast({
          title: "Packing List Generated",
          description: "Branded packing list created successfully"
        });
        fetchPackingLists();
      }
    } catch (error: any) {
      console.error('Generate error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate branded packing list",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleView = async (packingList: PackingListFile) => {
    const { data } = await supabase.storage
      .from('packing-lists')
      .createSignedUrl(packingList.file_path, 3600);

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    } else {
      toast({
        title: "Error",
        description: "Failed to open file",
        variant: "destructive"
      });
    }
  };

  const handleDownload = async (packingList: PackingListFile) => {
    const { data } = await supabase.storage
      .from('packing-lists')
      .createSignedUrl(packingList.file_path, 3600, { download: packingList.file_name });

    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
    } else {
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (packingList: PackingListFile) => {
    if (!confirm('Are you sure you want to delete this packing list?')) return;

    try {
      // Delete from storage
      await supabase.storage
        .from('packing-lists')
        .remove([packingList.file_path]);

      // Delete from database
      const { error } = await supabase
        .from('vendor_po_packing_lists')
        .delete()
        .eq('id', packingList.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Packing list deleted successfully"
      });

      fetchPackingLists();
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete packing list",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Separate generated (branded) from original uploads
  const brandedLists = packingLists.filter(pl => pl.source === 'generated');
  const originalLists = packingLists.filter(pl => pl.source === 'uploaded');

  return (
    <Card className="shadow-lg mt-6">
      <CardContent className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5" />
              Packing Lists
            </h2>
            <p className="text-sm text-muted-foreground">
              Upload vendor packing lists to generate branded VibePKG documents for customers
            </p>
          </div>
          
          {isAdmin && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleUploadClick}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Vendor Packing List
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : packingLists.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No packing lists uploaded yet</p>
            {isAdmin && (
              <p className="text-sm mt-1">
                Upload a vendor packing list to create a branded version
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Branded/Generated Packing Lists - Customer Visible */}
            {brandedLists.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  VibePKG Branded Packing Lists
                </h3>
                <div className="space-y-2">
                  {brandedLists.map((packingList) => (
                    <div 
                      key={packingList.id} 
                      className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileCheck className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-medium">{packingList.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Generated {format(new Date(packingList.created_at), 'MMM d, yyyy h:mm a')} • {formatFileSize(packingList.file_size)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="ml-2">
                          Customer Visible
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(packingList)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(packingList)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(packingList)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Original Vendor Packing Lists - Admin Only */}
            {isAdmin && originalLists.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Original Vendor Documents (Admin Only)
                </h3>
                <div className="space-y-2">
                  {originalLists.map((packingList) => (
                    <div 
                      key={packingList.id} 
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{packingList.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {format(new Date(packingList.created_at), 'MMM d, yyyy h:mm a')} • {formatFileSize(packingList.file_size)}
                          </p>
                          {packingList.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{packingList.notes}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="ml-2">
                          Original
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(packingList)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(packingList)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {packingList.parsed_data?.items && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateBrandedPackingList(packingList.parsed_data.items, packingList.id)}
                            disabled={generating}
                          >
                            {generating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(packingList)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Vendor Packing List</DialogTitle>
              <DialogDescription>
                Upload an Excel or CSV packing list from your vendor. We'll automatically parse it and generate a branded VibePKG version.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="packing-file">Packing List File</Label>
                <Input
                  id="packing-file"
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={handleFileSelect}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts Excel (.xlsx, .xls), CSV, or PDF files up to 10MB
                </p>
              </div>

              {parsing && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Parsing packing list...</span>
                </div>
              )}

              {parsedItems.length > 0 && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-green-500" />
                    Parsed {parsedItems.length} Items
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
                    {parsedItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-1 border-b last:border-0">
                        <span>{item.description}</span>
                        <span className="text-muted-foreground">{item.total_qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this packing list..."
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={!selectedFile || uploading || parsing}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
