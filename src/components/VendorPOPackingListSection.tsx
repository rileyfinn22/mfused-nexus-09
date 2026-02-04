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
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      
      // Colors
      const primaryGreen: [number, number, number] = [76, 175, 80];
      const darkGray: [number, number, number] = [51, 51, 51];
      const lightGray: [number, number, number] = [245, 245, 245];
      const mediumGray: [number, number, number] = [100, 100, 100];
      const borderColor: [number, number, number] = [200, 200, 200];
      const headerBg: [number, number, number] = [240, 240, 240];
      
      let yPos = 15;
      
      // ===== HEADER SECTION =====
      // Logo on left
      try {
        const logoResponse = await fetch('/images/vibe-logo.png');
        const logoBlob = await logoResponse.blob();
        const logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoBase64, 'PNG', margin, yPos - 5, 35, 22);
      } catch (error) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
        doc.text('VIBE', margin, yPos + 10);
      }
      
      // Company info centered
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('ArmorPak Inc. DBA Vibe Packaging', pageWidth / 2, yPos, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('1415 S 700 W, Salt Lake City, UT 84104', pageWidth / 2, yPos + 6, { align: 'center' });
      doc.text('www.vibepkg.com', pageWidth / 2, yPos + 11, { align: 'center' });
      
      // Packing List title on right
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('PACKING LIST', pageWidth - margin, yPos + 8, { align: 'right' });
      
      yPos += 25;
      
      // Divider line
      doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.setLineWidth(1);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      
      yPos += 10;
      
      // ===== INFO GRID SECTION =====
      // Two-column info boxes
      const boxWidth = (pageWidth - margin * 2 - 10) / 2;
      const boxHeight = 38;
      const leftBoxX = margin;
      const rightBoxX = margin + boxWidth + 10;
      
      // Ship To Box
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.5);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(leftBoxX, yPos, boxWidth, boxHeight, 2, 2, 'FD');
      
      // Ship To header
      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(leftBoxX, yPos, boxWidth, 8, 'F');
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(leftBoxX, yPos + 8, leftBoxX + boxWidth, yPos + 8);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('SHIP TO', leftBoxX + 4, yPos + 5.5);
      
      // Ship To content
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(vendorPO?.ship_to_name || order?.shipping_name || '', leftBoxX + 4, yPos + 15);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      const street = vendorPO?.ship_to_street || order?.shipping_street || '';
      const city = vendorPO?.ship_to_city || order?.shipping_city || '';
      const state = vendorPO?.ship_to_state || order?.shipping_state || '';
      const zip = vendorPO?.ship_to_zip || order?.shipping_zip || '';
      if (street) doc.text(street, leftBoxX + 4, yPos + 22);
      doc.text(`${city}, ${state} ${zip}`.trim(), leftBoxX + 4, yPos + street ? 29 : 22);
      
      // Details Box
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(rightBoxX, yPos, boxWidth, boxHeight, 2, 2, 'FD');
      
      // Details header
      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(rightBoxX, yPos, boxWidth, 8, 'F');
      doc.line(rightBoxX, yPos + 8, rightBoxX + boxWidth, yPos + 8);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('ORDER DETAILS', rightBoxX + 4, yPos + 5.5);
      
      // Details content - grid layout
      const detailY = yPos + 14;
      const labelWidth = 32;
      
      const drawDetailRow = (label: string, value: string, rowY: number) => {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
        doc.text(label + ':', rightBoxX + 4, rowY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(value, rightBoxX + 4 + labelWidth, rowY);
      };
      
      drawDetailRow('PO Number', vendorPO?.po_number || '', detailY);
      drawDetailRow('Order', order?.order_number || vendorPO?.orders?.order_number || '', detailY + 7);
      drawDetailRow('Date', format(new Date(), 'MMM d, yyyy'), detailY + 14);
      drawDetailRow('Customer', order?.customer_name || vendorPO?.orders?.customer_name || '', detailY + 21);
      
      yPos += boxHeight + 12;
      
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
      
      autoTable(doc, {
        startY: yPos,
        head: [['Item Description', 'Cartons', 'Qty/Ctn', 'Total Qty', 'Gross Wt.', 'Net Wt.', 'CBM']],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: borderColor,
          lineWidth: 0.3,
        },
        headStyles: { 
          fillColor: primaryGreen, 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          cellPadding: 5,
          halign: 'center'
        },
        bodyStyles: {
          textColor: darkGray,
          valign: 'middle'
        },
        alternateRowStyles: {
          fillColor: lightGray
        },
        columnStyles: {
          0: { cellWidth: 'auto', halign: 'left', fontStyle: 'bold' },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' }
        },
        margin: { left: margin, right: margin },
        tableLineColor: borderColor,
        tableLineWidth: 0.3,
      });
      
      // ===== SUMMARY SECTION =====
      const tableEndY = (doc as any).lastAutoTable.finalY + 8;
      
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
      
      // Summary box
      const summaryBoxWidth = pageWidth - margin * 2;
      const summaryBoxHeight = 24;
      
      doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.roundedRect(margin, tableEndY, summaryBoxWidth, summaryBoxHeight, 2, 2, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      
      const summaryY = tableEndY + 15;
      const colWidth = summaryBoxWidth / 4;
      
      doc.text(`Total Cartons: ${totalCartons}`, margin + colWidth * 0.5, summaryY, { align: 'center' });
      doc.text(`Total Qty: ${totalQty.toLocaleString()}`, margin + colWidth * 1.5, summaryY, { align: 'center' });
      doc.text(`Gross Weight: ${totalGrossWeight.toFixed(1)} kg`, margin + colWidth * 2.5, summaryY, { align: 'center' });
      doc.text(`Total CBM: ${totalCBM.toFixed(2)}`, margin + colWidth * 3.5, summaryY, { align: 'center' });
      
      // ===== FOOTER =====
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 15, { align: 'center' });
      
      doc.setFontSize(8);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      
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
