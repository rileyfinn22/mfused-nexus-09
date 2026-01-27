import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Plus, 
  Eye,
  FileCheck,
  Loader2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PackingListFile {
  id: string;
  invoice_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

interface InvoicePackingListSectionProps {
  invoiceId: string;
  invoice: any;
  order: any;
  editedItems: any[];
  isVibeAdmin: boolean;
  onRefresh: () => void;
}

export const InvoicePackingListSection = ({
  invoiceId,
  invoice,
  order,
  editedItems,
  isVibeAdmin,
  onRefresh
}: InvoicePackingListSectionProps) => {
  const [packingLists, setPackingLists] = useState<PackingListFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch packing lists on mount
  useEffect(() => {
    fetchPackingLists();
  }, [invoiceId]);

  const fetchPackingLists = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_packing_lists')
      .select('*')
      .eq('invoice_id', invoiceId)
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
    setShowUploadDialog(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file",
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
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upload to storage
      const fileName = `${invoiceId}/${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('packing-lists')
        .upload(fileName, selectedFile);

      if (uploadError) {
        // Check if bucket doesn't exist
        if (uploadError.message.includes('Bucket not found')) {
          toast({
            title: "Storage Not Configured",
            description: "Packing list storage bucket needs to be created",
            variant: "destructive"
          });
          return;
        }
        throw uploadError;
      }

      // Create database record
      const { error: dbError } = await supabase
        .from('invoice_packing_lists')
        .insert({
          invoice_id: invoiceId,
          file_name: selectedFile.name,
          file_path: fileName,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          source: 'uploaded',
          created_by: user?.id,
          notes: notes || null
        });

      if (dbError) throw dbError;

      toast({
        title: "Packing List Uploaded",
        description: "File uploaded successfully"
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

  const handleGeneratePackingList = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate the PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Colors
      const primaryGreen = [76, 175, 80];
      const darkGray = [51, 51, 51];
      const lightGray = [248, 248, 248];
      const mediumGray = [100, 100, 100];
      
      let yPos = 15;
      
      // Company header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('ArmorPak Inc. DBA Vibe Packaging', 14, yPos);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('1415 S 700 W', 14, yPos + 7);
      doc.text('Salt Lake City, UT 84104', 14, yPos + 12);
      doc.text('www.vibepkg.com', 14, yPos + 17);
      
      // Logo on right
      try {
        const logoResponse = await fetch('/images/vibe-logo.png');
        const logoBlob = await logoResponse.blob();
        const logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
      } catch (error) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
        doc.text('VIBE', pageWidth - 14, yPos + 8, { align: 'right' });
      }
      
      yPos += 28;
      
      // Divider
      doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);
      
      yPos += 12;
      
      // Title
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('Packing List', 14, yPos);
      
      yPos += 15;
      
      // Ship To and Details
      const leftColX = 14;
      const rightColX = pageWidth / 2 + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Ship to', leftColX, yPos);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order?.shipping_name || '', leftColX, yPos + 8);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      
      let shipY = yPos + 14;
      if (order?.shipping_street) {
        doc.text(order.shipping_street, leftColX, shipY);
        shipY += 5;
      }
      doc.text(`${order?.shipping_city || ''}, ${order?.shipping_state || ''} ${order?.shipping_zip || ''}`, leftColX, shipY);
      
      // Details on right
      const detailsStartY = yPos;
      doc.text('Invoice #:', rightColX, detailsStartY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Order #:', rightColX, detailsStartY + 7);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(order?.order_number || '', rightColX + 45, detailsStartY + 7);
      
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Date:', rightColX, detailsStartY + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(format(new Date(), 'MMM d, yyyy'), rightColX + 45, detailsStartY + 14);
      
      if (order?.po_number) {
        doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
        doc.text('PO #:', rightColX, detailsStartY + 21);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(order.po_number, rightColX + 45, detailsStartY + 21);
      }
      
      yPos += 40;
      
      // Items table
      const itemsForPacking = editedItems.length > 0 ? editedItems : (order?.order_items || []);
      const tableData = itemsForPacking.map((item: any) => [
        item.item_id || 'N/A',
        item.sku || '',
        item.name || '',
        (item.quantity || 0).toLocaleString()
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['ITEM ID', 'SKU', 'DESCRIPTION', 'QTY']],
        body: tableData,
        theme: 'plain',
        headStyles: { 
          fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          cellPadding: 4
        },
        bodyStyles: {
          fontSize: 9,
          cellPadding: 4,
          textColor: [darkGray[0], darkGray[1], darkGray[2]],
          lineWidth: 0
        },
        alternateRowStyles: {
          fillColor: [lightGray[0], lightGray[1], lightGray[2]]
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 40 },
          2: { cellWidth: 85 },
          3: { cellWidth: 25, halign: 'center' }
        },
        margin: { left: 14, right: 14 },
        showHead: 'firstPage',
        tableLineWidth: 0
      });
      
      // Summary
      const totalItems = itemsForPacking.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
      const tableEndY = (doc as any).lastAutoTable.finalY + 15;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(`Total Quantity: ${totalItems.toLocaleString()}`, 14, tableEndY);
      
      // Footer
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
      
      // Convert to blob and upload
      const pdfBlob = doc.output('blob');
      const fileName = `${invoiceId}/${Date.now()}-packing-list-${invoice.invoice_number}.pdf`;
      
      const { error: uploadError } = await supabase.storage
        .from('packing-lists')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          toast({
            title: "Storage Not Configured",
            description: "Packing list storage bucket needs to be created",
            variant: "destructive"
          });
          return;
        }
        throw uploadError;
      }

      // Create database record
      const { error: dbError } = await supabase
        .from('invoice_packing_lists')
        .insert({
          invoice_id: invoiceId,
          file_name: `packing-list-${invoice.invoice_number}.pdf`,
          file_path: fileName,
          file_size: pdfBlob.size,
          file_type: 'application/pdf',
          source: 'generated',
          created_by: user?.id,
          notes: 'Auto-generated packing list'
        });

      if (dbError) throw dbError;

      toast({
        title: "Packing List Generated",
        description: "Packing list created and saved successfully"
      });

      fetchPackingLists();
    } catch (error: any) {
      console.error('Generate error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate packing list",
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
        .from('invoice_packing_lists')
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

  return (
    <Card className="shadow-lg">
      <CardContent className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Packing Lists</h2>
            <p className="text-sm text-muted-foreground">
              Manage packing lists for this shipment
            </p>
          </div>
          
          {isVibeAdmin && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUploadClick}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              <Button 
                size="sm"
                onClick={handleGeneratePackingList}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Generate
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : packingLists.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No packing lists attached</p>
            {isVibeAdmin && (
              <p className="text-sm mt-1">
                Upload an existing packing list or generate one from invoice items
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {packingLists.map((pl) => (
              <div 
                key={pl.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{pl.file_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatFileSize(pl.file_size)}</span>
                      <span>•</span>
                      <span>{format(new Date(pl.created_at), 'MMM d, yyyy h:mm a')}</span>
                      <Badge variant="outline" className="text-xs">
                        {pl.source === 'generated' ? 'Generated' : 'Uploaded'}
                      </Badge>
                    </div>
                    {pl.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{pl.notes}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleView(pl)}
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(pl)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {isVibeAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(pl)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Packing List</DialogTitle>
            <DialogDescription>
              Upload an existing packing list PDF for this invoice
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">PDF File</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
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
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this packing list"
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
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
