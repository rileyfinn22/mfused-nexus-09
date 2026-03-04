import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Loader2,
  FileSpreadsheet,
  Package
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
  const [processingExcel, setProcessingExcel] = useState(false);
  const [applyShippedQty, setApplyShippedQty] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showExcelUploadDialog, setShowExcelUploadDialog] = useState(false);
  const [showManualShippedDialog, setShowManualShippedDialog] = useState(false);
  const [manualShippedItems, setManualShippedItems] = useState<any[]>([]);
  const [savingManualShipped, setSavingManualShipped] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedExcelFile, setSelectedExcelFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExcelUploadClick = () => {
    setSelectedExcelFile(null);
    setNotes("");
    setShowExcelUploadDialog(true);
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

  const handleExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const hasValidExtension = validExtensions.some(ext => 
        file.name.toLowerCase().endsWith(ext)
      );
      
      if (!validTypes.includes(file.type) && !hasValidExtension) {
        toast({
          title: "Invalid File Type",
          description: "Please upload an Excel (.xlsx, .xls) or CSV file",
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
      setSelectedExcelFile(file);
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

  const handleExcelUpload = async () => {
    if (!selectedExcelFile) return;

    setProcessingExcel(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Read file as base64
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedExcelFile);
      });

      // Get order items for matching
      const orderItems = (order?.order_items || editedItems).map((item: any) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        shipped_quantity: item.shipped_quantity || 0
      }));

      // Call parse-packing-list edge function
      const { data: parseResult, error: parseError } = await supabase.functions.invoke('parse-packing-list', {
        body: {
          fileContent,
          orderItems,
          fileName: selectedExcelFile.name,
          isBase64: true
        }
      });

      if (parseError) throw parseError;
      if (parseResult?.error) throw new Error(parseResult.error);

      console.log('Parse result:', parseResult);

      // Generate PDF from parsed data
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
      
      // No source file note shown to customers
      
      yPos += 15;
      
      // Ship To and Details
      const leftColX = 14;
      const rightColX = pageWidth / 2 + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Delivery Address', leftColX, yPos);
      
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
      
      // Build items table - use matched items if available, otherwise use extracted unmatched items
      const matchedItems = parseResult?.matched_items || [];
      const unmatchedItems = parseResult?.unmatched_items || [];
      const shippingSummary = parseResult?.shipping_summary || {};
      const orderItemsMap = new Map<string, any>((order?.order_items || editedItems).map((item: any) => [item.id, item]));
      
      let tableData: (string | number)[][] = [];
      let usedUnmatched = false;
      let hasCartonInfo = false;
      let hasWeightInfo = false;
      
      // Check if we have carton/weight data in unmatched items
      if (unmatchedItems.length > 0) {
        hasCartonInfo = unmatchedItems.some((item: any) => item.carton_numbers || item.num_cartons);
        hasWeightInfo = unmatchedItems.some((item: any) => item.gross_weight_kg || item.net_weight_kg);
      }
      
      if (matchedItems.length > 0) {
        // Use matched items (simpler format)
        tableData = matchedItems.map((match: any, index: number) => {
          const orderItem = orderItemsMap.get(match.order_item_id) as any;
          return [
            String(index + 1),
            orderItem?.sku || '',
            orderItem?.name || match.packing_list_name || '',
            (match.shipped_quantity || 0).toLocaleString()
          ];
        });
      } else if (unmatchedItems.length > 0) {
        // Fallback: use unmatched/extracted items directly from the packing list with full details
        usedUnmatched = true;
        
        if (hasCartonInfo || hasWeightInfo) {
          // Rich packing list format with cartons, weights, etc.
          tableData = unmatchedItems.map((item: any, index: number) => {
            const row: (string | number)[] = [
              String(index + 1),
              item.carton_numbers || '-',
              item.name || 'Unknown Item',
              item.num_cartons || '-',
              (item.quantity || 0).toLocaleString(),
            ];
            if (hasWeightInfo) {
              row.push(item.gross_weight_kg ? `${item.gross_weight_kg} kg` : '-');
            }
            return row;
          });
        } else {
          // Simple format
          tableData = unmatchedItems.map((item: any, index: number) => [
            String(index + 1),
            '-',
            item.name || 'Unknown Item',
            '-',
            (item.quantity || 0).toLocaleString(),
            '-'
          ]);
        }
      }
      
      if (tableData.length === 0) {
        toast({
          title: "No Items Found",
          description: "Could not extract any items from the Excel file. Please check the file format.",
          variant: "destructive"
        });
        return;
      }
      
      // Dynamic headers based on data available
      const headers = usedUnmatched && (hasCartonInfo || hasWeightInfo)
        ? hasWeightInfo 
          ? [['#', 'CTN NO.', 'DESCRIPTION', 'CTNS', 'QTY', 'G.W.']]
          : [['#', 'CTN NO.', 'DESCRIPTION', 'CTNS', 'QTY', 'G.W.']]
        : [['#', 'CTN NO.', 'DESCRIPTION', 'CTNS', 'QTY', 'G.W.']];
      
      // Reformat matched items to include placeholder columns for consistency
      if (matchedItems.length > 0) {
        tableData = matchedItems.map((match: any, index: number) => {
          const orderItem = orderItemsMap.get(match.order_item_id) as any;
          return [
            String(index + 1),
            '-',
            orderItem?.name || match.packing_list_name || '',
            '-',
            (match.shipped_quantity || 0).toLocaleString(),
            '-'
          ];
        });
      }
      
      autoTable(doc, {
        startY: yPos,
        head: headers,
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 3,
          halign: 'center',
          lineWidth: 0.5,
          lineColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]]
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: [darkGray[0], darkGray[1], darkGray[2]],
          lineWidth: 0.25,
          lineColor: [200, 200, 200]
        },
        alternateRowStyles: {
          fillColor: [lightGray[0], lightGray[1], lightGray[2]]
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },  // #
          1: { cellWidth: 25, halign: 'center' },  // CTN NO.
          2: { cellWidth: 80 },                     // DESCRIPTION
          3: { cellWidth: 18, halign: 'center' },  // CTNS
          4: { cellWidth: 25, halign: 'center' },  // QTY
          5: { cellWidth: 22, halign: 'center' }   // G.W.
        },
        margin: { left: 14, right: 14 },
        showHead: 'firstPage',
        tableLineWidth: 0.25,
        tableLineColor: [200, 200, 200]
      });
      
      // Summary section with shipping totals
      let tableEndY = (doc as any).lastAutoTable.finalY + 10;
      
      // Check if summary + footer will overflow the page
      const summaryNeededSpace = 28 + 40; // summary box + notes + footer
      if (tableEndY + summaryNeededSpace > pageHeight - 10) {
        doc.addPage();
        tableEndY = 20;
      }
      
      // Calculate totals from data
      const totalQty = usedUnmatched 
        ? unmatchedItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
        : matchedItems.reduce((sum: number, item: any) => sum + (item.shipped_quantity || 0), 0);
      const totalCartons = shippingSummary.total_cartons || 
        unmatchedItems.reduce((sum: number, item: any) => sum + (item.num_cartons || 0), 0);
      const totalGrossWeight = shippingSummary.total_gross_weight_kg ||
        unmatchedItems.reduce((sum: number, item: any) => sum + (item.gross_weight_kg || 0), 0);
      const totalNetWeight = shippingSummary.total_net_weight_kg ||
        unmatchedItems.reduce((sum: number, item: any) => sum + (item.net_weight_kg || 0), 0);
      const totalCbm = shippingSummary.total_cbm ||
        unmatchedItems.reduce((sum: number, item: any) => sum + (item.cbm || 0), 0);
      
      // Draw summary box
      doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, tableEndY, pageWidth - 28, 28, 2, 2, 'S');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('SHIPPING SUMMARY', 20, tableEndY + 7);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      
      const summaryY = tableEndY + 15;
      const colWidth = (pageWidth - 28) / 5;
      
      // Summary items
      const summaryItems = [
        { label: 'Total Qty:', value: totalQty.toLocaleString() },
        { label: 'Total Cartons:', value: totalCartons > 0 ? totalCartons.toLocaleString() : '-' },
        { label: 'Gross Weight:', value: totalGrossWeight > 0 ? `${totalGrossWeight.toFixed(1)} kg` : '-' },
        { label: 'Net Weight:', value: totalNetWeight > 0 ? `${totalNetWeight.toFixed(1)} kg` : '-' },
        { label: 'Volume (CBM):', value: totalCbm > 0 ? totalCbm.toFixed(3) : '-' },
      ];
      
      summaryItems.forEach((item, idx) => {
        const xPos = 20 + (idx * colWidth);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
        doc.text(item.label, xPos, summaryY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(item.value, xPos, summaryY + 6);
      });
      
      // No vendor source note in customer-facing PDF
      
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
          source: 'excel-import',
          created_by: user?.id,
          notes: notes || `Generated from: ${selectedExcelFile.name}`
        });

      if (dbError) throw dbError;

      const successMsg = usedUnmatched 
        ? `Created packing list with ${tableData.length} items extracted from vendor file.`
        : `Successfully created packing list. ${matchedItems.length} items matched.`;
      
      toast({
        title: "Packing List Created",
        description: successMsg
      });

      // After creating packing list, optionally update shipped quantities
      if (applyShippedQty && matchedItems.length > 0) {
        await applyShippedQuantities(matchedItems);
      }

      setShowExcelUploadDialog(false);
      fetchPackingLists();
    } catch (error: any) {
      console.error('Excel processing error:', error);
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process Excel file",
        variant: "destructive"
      });
    } finally {
      setProcessingExcel(false);
    }
  };

  const applyShippedQuantities = async (matchedItems: any[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const match of matchedItems) {
        const shippedQty = match.shipped_quantity || 0;
        if (shippedQty <= 0) continue;

        // Update order_item shipped_quantity
        const { data: currentItem } = await supabase
          .from('order_items')
          .select('shipped_quantity')
          .eq('id', match.order_item_id)
          .single();

        if (currentItem) {
          await supabase
            .from('order_items')
            .update({ shipped_quantity: shippedQty })
            .eq('id', match.order_item_id);
        }

        // Upsert inventory allocation for this invoice
        const { data: existingAlloc } = await supabase
          .from('inventory_allocations')
          .select('id')
          .eq('invoice_id', invoiceId)
          .eq('order_item_id', match.order_item_id)
          .single();

        if (existingAlloc) {
          await supabase
            .from('inventory_allocations')
            .update({ quantity_allocated: shippedQty })
            .eq('id', existingAlloc.id);
        } else {
          await supabase
            .from('inventory_allocations')
            .insert({
              invoice_id: invoiceId,
              order_item_id: match.order_item_id,
              quantity_allocated: shippedQty,
              allocated_by: user?.id,
              status: 'allocated'
            });
        }
      }

      // Recalculate invoice subtotal based on ALL order items, not just matched ones
      const allOrderItems = order?.order_items || editedItems;
      const isBlanketInvoice = invoice.invoice_type === 'full';
      
      // Build a map of updated shipped quantities from matched items
      const shippedMap = new Map<string, number>();
      for (const match of matchedItems) {
        shippedMap.set(match.order_item_id, match.shipped_quantity || 0);
      }
      
      // Fetch all current allocations for this invoice to include unmatched items too
      const { data: allAllocations } = await supabase
        .from('inventory_allocations')
        .select('order_item_id, quantity_allocated')
        .eq('invoice_id', invoiceId);
      
      let newSubtotal = 0;
      if (isBlanketInvoice) {
        // Blanket invoices: subtotal = sum of shipped qty × unit price for ALL items
        newSubtotal = allOrderItems.reduce((sum: number, oi: any) => 
          sum + Number(oi.shipped_quantity || 0) * Number(oi.unit_price || 0), 0);
        // Update with latest shipped quantities from matched items
        for (const match of matchedItems) {
          const orderItem = allOrderItems.find((oi: any) => oi.id === match.order_item_id);
          if (orderItem) {
            // Remove old value, add new
            newSubtotal -= Number(orderItem.shipped_quantity || 0) * Number(orderItem.unit_price || 0);
            newSubtotal += Number(match.shipped_quantity || 0) * Number(orderItem.unit_price || 0);
          }
        }
      } else {
        // Partial/shipment invoices: subtotal = sum of allocated qty × unit price for ALL allocated items
        const allocMap = new Map<string, number>();
        // Start with existing allocations
        if (allAllocations) {
          for (const alloc of allAllocations) {
            allocMap.set(alloc.order_item_id, alloc.quantity_allocated);
          }
        }
        // Override with newly matched quantities
        for (const [itemId, qty] of shippedMap) {
          allocMap.set(itemId, qty);
        }
        for (const [itemId, qty] of allocMap) {
          const orderItem = allOrderItems.find((oi: any) => oi.id === itemId);
          if (orderItem) {
            newSubtotal += qty * Number(orderItem.unit_price || 0);
          }
        }
      }

      if (newSubtotal > 0) {
        const shippingCost = Number(invoice.shipping_cost || 0);
        const newTotal = newSubtotal + Number(invoice.tax || 0) + shippingCost;
        
        await supabase
          .from('invoices')
          .update({ subtotal: newSubtotal, total: newTotal })
          .eq('id', invoiceId);
      }

      toast({
        title: "Shipped Quantities Updated",
        description: `Updated ${matchedItems.length} item(s) with shipped quantities from packing list`
      });

      onRefresh();
    } catch (error: any) {
      console.error('Error applying shipped quantities:', error);
      toast({
        title: "Warning",
        description: "Packing list created but failed to update shipped quantities: " + (error.message || ''),
        variant: "destructive"
      });
    }
  };

  const handleOpenManualShipped = () => {
    const items = (order?.order_items || editedItems).map((item: any) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      shipped_quantity: item.shipped_quantity || 0,
      unit_price: item.unit_price
    }));
    setManualShippedItems(items);
    setShowManualShippedDialog(true);
  };

  const handleSaveManualShipped = async () => {
    setSavingManualShipped(true);
    try {
      const matchedItems = manualShippedItems
        .filter(item => item.shipped_quantity > 0)
        .map(item => ({
          order_item_id: item.id,
          shipped_quantity: item.shipped_quantity
        }));

      if (matchedItems.length === 0) {
        toast({ title: "No quantities", description: "Please enter at least one shipped quantity", variant: "destructive" });
        return;
      }

      await applyShippedQuantities(matchedItems);
      setShowManualShippedDialog(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" });
    } finally {
      setSavingManualShipped(false);
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
      doc.text('Delivery Address', leftColX, yPos);
      
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
      
      // Items table - always prioritize shipped quantities for this invoice
      const { data: allocationItems, error: allocationError } = await supabase
        .from('inventory_allocations')
        .select(`
          quantity_allocated,
          order_items(item_id, sku, name, id)
        `)
        .eq('invoice_id', invoiceId)
        .gt('quantity_allocated', 0);

      if (allocationError) {
        console.error('Error loading allocation items for packing list:', allocationError);
      }

      const allocatedPackingItems = (allocationItems || [])
        .filter((alloc: any) => alloc.order_items)
        .map((alloc: any) => ({
          item_id: alloc.order_items.item_id,
          sku: alloc.order_items.sku,
          name: alloc.order_items.name,
          quantity: Number(alloc.quantity_allocated || 0),
        }))
        .filter((item: any) => item.quantity > 0);

      const fallbackShippedItems = (editedItems.length > 0 ? editedItems : (order?.order_items || []))
        .map((item: any) => ({
          item_id: item.item_id,
          sku: item.sku,
          name: item.name,
          quantity: Number(item.shipped_quantity ?? item.quantity ?? 0),
        }))
        .filter((item: any) => item.quantity > 0);

      const itemsForPacking = allocatedPackingItems.length > 0 ? allocatedPackingItems : fallbackShippedItems;
      const tableData = itemsForPacking.map((item: any) => [
        item.item_id || 'N/A',
        item.sku || '',
        item.name || '',
        item.quantity.toLocaleString()
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
      let tableEndY = (doc as any).lastAutoTable.finalY + 15;
      
      // Check if summary + footer will overflow the page
      if (tableEndY + 30 > pageHeight - 10) {
        doc.addPage();
        tableEndY = 20;
      }
      
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
            <h2 className="text-lg font-semibold">Packing Lists & Shipped Quantities</h2>
            <p className="text-sm text-muted-foreground">
              Manage packing lists and update shipped quantities
            </p>
          </div>
          
          {isVibeAdmin && (
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleOpenManualShipped}
              >
                <Package className="h-4 w-4 mr-2" />
                Input Shipped Qty
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUploadClick}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExcelUploadClick}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                From Excel
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
                      {isVibeAdmin && (
                        <Badge variant="outline" className="text-xs">
                          {pl.source === 'generated' ? 'Generated' : pl.source === 'excel-import' ? 'From Vendor File' : 'Uploaded'}
                        </Badge>
                      )}
                    </div>
                    {isVibeAdmin && pl.notes && (
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

      {/* Excel Upload Dialog */}
      <Dialog open={showExcelUploadDialog} onOpenChange={setShowExcelUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Packing List from Excel</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to create a branded packing list. Items will be matched to order items automatically.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="excelFile">Excel/CSV File</Label>
              <Input
                id="excelFile"
                type="file"
                accept=".xlsx,.xls,.csv"
                ref={excelFileInputRef}
                onChange={handleExcelFileSelect}
                className="mt-1"
              />
              {selectedExcelFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {selectedExcelFile.name} ({formatFileSize(selectedExcelFile.size)})
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="excelNotes">Notes (optional)</Label>
              <Input
                id="excelNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this packing list"
                className="mt-1"
              />
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Upload your vendor's packing list (Excel or CSV)</li>
                <li>Items are automatically matched to order items by SKU and name</li>
                <li>A branded VibePKG PDF is generated for your customer</li>
              </ul>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="applyShippedQty"
                checked={applyShippedQty}
                onCheckedChange={(checked) => setApplyShippedQty(!!checked)}
              />
              <Label htmlFor="applyShippedQty" className="text-sm font-medium cursor-pointer">
                Also update shipped quantities on the invoice from matched items
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExcelUploadDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExcelUpload} 
              disabled={!selectedExcelFile || processingExcel}
            >
              {processingExcel ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Create Packing List
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Shipped Quantity Dialog */}
      <Dialog open={showManualShippedDialog} onOpenChange={setShowManualShippedDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Shipped Quantities</DialogTitle>
            <DialogDescription>
              Enter the shipped quantity for each item on this invoice. This will update inventory allocations and invoice totals.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_2fr_80px_80px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-2 border-b">
              <span>SKU</span>
              <span>Product</span>
              <span className="text-center">Ordered</span>
              <span className="text-center">Shipped</span>
            </div>
            {manualShippedItems.map((item, idx) => (
              <div key={item.id} className="grid grid-cols-[1fr_2fr_80px_80px] gap-2 items-center py-2 border-b border-border/50">
                <span className="font-mono text-xs truncate">{item.sku}</span>
                <span className="text-sm truncate">{item.name}</span>
                <span className="text-center text-sm text-muted-foreground">{item.quantity}</span>
                <Input
                  type="number"
                  min="0"
                  max={item.quantity}
                  value={item.shipped_quantity}
                  onChange={(e) => {
                    const newItems = [...manualShippedItems];
                    newItems[idx] = { ...newItems[idx], shipped_quantity: parseInt(e.target.value) || 0 };
                    setManualShippedItems(newItems);
                  }}
                  className="h-8 text-center"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm pt-2">
            <span className="text-muted-foreground">
              Total shipped: {manualShippedItems.reduce((sum, i) => sum + (i.shipped_quantity || 0), 0)} / {manualShippedItems.reduce((sum, i) => sum + i.quantity, 0)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setManualShippedItems(items => items.map(i => ({ ...i, shipped_quantity: i.quantity })));
              }}
            >
              Ship All
            </Button>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualShippedDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveManualShipped} 
              disabled={savingManualShipped}
            >
              {savingManualShipped ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Save Shipped Quantities
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
