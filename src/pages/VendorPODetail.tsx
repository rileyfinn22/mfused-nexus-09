import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Edit, Save, X, Plus, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

const VendorPODetail = () => {
  const { poId } = useParams();
  const navigate = useNavigate();
  
  // Get returnTo parameter from URL to navigate back properly
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = searchParams.get('returnTo') || '/vendor-pos';
  const [po, setPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPO, setEditedPO] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    if (poId) {
      fetchPODetails();
    }
  }, [poId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      const role = data?.role as string;
      setIsAdmin(role === 'admin' || role === 'vibe_admin');
    }
  };

  const fetchPODetails = async () => {
    setLoading(true);
    
    // Fetch PO
    const { data: poData, error: poError } = await supabase
      .from('vendor_pos')
      .select('*, orders(order_number, customer_name)')
      .eq('id', poId)
      .single();

    if (poError || !poData) {
      toast({
        title: "Error",
        description: "Failed to load vendor PO",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    setPO(poData);
    setEditedPO(poData);

    // Fetch vendor
    const { data: vendorData } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', poData.vendor_id)
      .single();

    if (vendorData) {
      setVendor(vendorData);
    }

    // Fetch PO items
    const { data: itemsData } = await supabase
      .from('vendor_po_items')
      .select('*')
      .eq('vendor_po_id', poId)
      .order('created_at', { ascending: true });

    if (itemsData) {
      setPOItems(itemsData);
    }

    setLoading(false);
  };

  const handleSavePO = async () => {
    if (!isAdmin) return;

    try {
      // Update existing items with edited quantities
      for (const item of poItems) {
        if (!item.isNew) {
          // Update existing items - use quantity for PO total calculations (not shipped_quantity)
          const newTotal = Number(item.quantity) * Number(item.unit_cost);
          
          const { error: updateError } = await supabase
            .from('vendor_po_items')
            .update({
              quantity: item.quantity,
              shipped_quantity: item.shipped_quantity,
              total: newTotal
            })
            .eq('id', item.id);

          if (updateError) {
            console.error('Update error:', updateError);
            throw new Error(`Failed to update item: ${updateError.message}`);
          }
        } else {
          // Insert new custom line items
          if (!item.sku || !item.name || item.quantity <= 0) {
            throw new Error('Please fill in all required fields for custom line items');
          }

          const { error: insertError } = await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: poId,
              order_item_id: null,
              sku: item.sku,
              name: item.name,
              description: item.description || null,
              quantity: item.quantity,
              shipped_quantity: item.quantity,
              unit_cost: item.unit_cost,
              total: item.total
            } as any);

          if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error(`Failed to add custom line item: ${insertError.message}`);
          }
        }
      }

      // Calculate new total from all items
      const newTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);

      // Update the PO
      const { error: poError } = await supabase
        .from('vendor_pos')
        .update({
          status: editedPO.status,
          expected_delivery_date: editedPO.expected_delivery_date,
          ship_to_name: editedPO.ship_to_name,
          ship_to_street: editedPO.ship_to_street,
          ship_to_city: editedPO.ship_to_city,
          ship_to_state: editedPO.ship_to_state,
          ship_to_zip: editedPO.ship_to_zip,
          total: newTotal
        })
        .eq('id', poId);

      if (poError) throw poError;

      toast({
        title: "PO Updated",
        description: "Purchase order updated successfully"
      });
      setIsEditMode(false);
      fetchPODetails();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase order",
        variant: "destructive"
      });
    }
  };

  const handleDownloadPDF = async () => {
    if (!po || !vendor) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const lightGray = [248, 248, 248];
    const mediumGray = [100, 100, 100];
    
    // ============ HEADER SECTION ============
    let yPos = 15;
    
    // Company name and address on left
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
    
    // Divider line
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    
    yPos += 12;
    
    // ============ PO TITLE ============
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Purchase Order', 14, yPos);
    
    yPos += 15;
    
    // ============ VENDOR & PO DETAILS SECTION ============
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
    
    // Vendor section (left)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Vendor', leftColX, yPos);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(vendor.name, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    let vendorY = yPos + 14;
    if (vendor.contact_name) {
      doc.text(vendor.contact_name, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_email) {
      doc.text(vendor.contact_email, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_phone) {
      doc.text(vendor.contact_phone, leftColX, vendorY);
    }
    
    // PO details on right
    const detailsStartY = yPos;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    doc.text('PO #:', rightColX, detailsStartY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.po_number, rightColX + 45, detailsStartY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Date:', rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(new Date(po.order_date).toLocaleDateString(), rightColX + 45, detailsStartY + 7);
    
    if (po.expected_delivery_date) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Due Date:', rightColX, detailsStartY + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(new Date(po.expected_delivery_date).toLocaleDateString(), rightColX + 45, detailsStartY + 14);
    }
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.orders?.order_number || 'N/A', rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // Ship To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Ship To', leftColX, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let shipY = yPos + 7;
    if (po.ship_to_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(po.ship_to_name, leftColX, shipY);
      doc.setFont('helvetica', 'normal');
      shipY += 5;
    }
    if (po.ship_to_street) {
      doc.text(po.ship_to_street, leftColX, shipY);
      shipY += 5;
    }
    const cityStateZip = [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ');
    if (cityStateZip) {
      doc.text(cityStateZip, leftColX, shipY);
    }
    
    yPos += 28;
    
    // ============ ITEMS TABLE ============
    const tableData = poItems.map(item => [
      item.sku,
      item.name,
      item.quantity.toLocaleString(),
      `$${Number(item.unit_cost).toFixed(3)}`,
      `$${Number(item.total).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT COST', 'AMOUNT']],
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
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0,
      tableWidth: 'auto'
    });

    // ============ TOTALS SECTION ============
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    
    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - 14;
    
    // Divider line before total
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, finalY, pageWidth - 14, finalY);
    
    // Total - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('TOTAL', totalsX, finalY + 8);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, finalY + 8, { align: 'right' });

    // ============ FOOTER ============
    // Only add footer if there's enough space, otherwise it will overlap with table
    const footerY = Math.max(finalY + 30, pageHeight - 20);
    if (footerY < pageHeight - 10) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    }

    doc.save(`vendor-po-${po.po_number}.pdf`);
    
    toast({
      title: "PDF Downloaded",
      description: "Vendor PO has been downloaded"
    });
  };

  const generatePdfBase64 = async (): Promise<string> => {
    if (!po || !vendor) return '';

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const lightGray = [248, 248, 248];
    const mediumGray = [100, 100, 100];
    
    // ============ HEADER SECTION ============
    let yPos = 15;
    
    // Company name and address on left
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
    
    // Divider line
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    
    yPos += 12;
    
    // ============ PO TITLE ============
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Purchase Order', 14, yPos);
    
    yPos += 15;
    
    // ============ VENDOR & PO DETAILS SECTION ============
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
    
    // Vendor section (left)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Vendor', leftColX, yPos);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(vendor.name, leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    let vendorY = yPos + 14;
    if (vendor.contact_name) {
      doc.text(vendor.contact_name, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_email) {
      doc.text(vendor.contact_email, leftColX, vendorY);
      vendorY += 5;
    }
    if (vendor.contact_phone) {
      doc.text(vendor.contact_phone, leftColX, vendorY);
    }
    
    // PO details on right
    const detailsStartY = yPos;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    doc.text('PO #:', rightColX, detailsStartY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.po_number, rightColX + 45, detailsStartY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Date:', rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(new Date(po.order_date).toLocaleDateString(), rightColX + 45, detailsStartY + 7);
    
    if (po.expected_delivery_date) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Due Date:', rightColX, detailsStartY + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(new Date(po.expected_delivery_date).toLocaleDateString(), rightColX + 45, detailsStartY + 14);
    }
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(po.orders?.order_number || 'N/A', rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // Ship To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Ship To', leftColX, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let shipY = yPos + 7;
    if (po.ship_to_name) {
      doc.setFont('helvetica', 'bold');
      doc.text(po.ship_to_name, leftColX, shipY);
      doc.setFont('helvetica', 'normal');
      shipY += 5;
    }
    if (po.ship_to_street) {
      doc.text(po.ship_to_street, leftColX, shipY);
      shipY += 5;
    }
    const cityStateZip = [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ');
    if (cityStateZip) {
      doc.text(cityStateZip, leftColX, shipY);
    }
    
    yPos += 28;
    
    // ============ ITEMS TABLE ============
    const tableData = poItems.map(item => [
      item.sku,
      item.name,
      item.quantity.toLocaleString(),
      `$${Number(item.unit_cost).toFixed(3)}`,
      `$${Number(item.total).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT COST', 'AMOUNT']],
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
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0,
      tableWidth: 'auto'
    });

    // ============ TOTALS SECTION ============
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    
    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - 14;
    
    // Divider line before total
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, finalY, pageWidth - 14, finalY);
    
    // Total - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('TOTAL', totalsX, finalY + 8);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - 14, finalY + 8, { align: 'right' });

    // ============ FOOTER ============
    const footerY = Math.max(finalY + 30, pageHeight - 20);
    if (footerY < pageHeight - 10) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    }

    return doc.output('datauristring').split(',')[1];
  };

  const handleSendEmail = async (data: { to: string[]; subject: string; message: string }) => {
    setSendingEmail(true);
    try {
      const pdfBase64 = await generatePdfBase64();
      
      // Convert plain text message to HTML
      const htmlMessage = data.message
        .split('\n')
        .map(line => line.trim() === '' ? '<br/>' : `<p style="margin: 8px 0;">${line}</p>`)
        .join('');
      
      const response = await supabase.functions.invoke('send-invoice-email', {
        body: {
          to: data.to[0], // Primary recipient
          recipientEmails: data.to,
          subject: data.subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              ${htmlMessage}
              <br/>
              <p style="color: #666; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee;">
                ${VIBE_COMPANY.name}<br/>
                ${VIBE_COMPANY.address.street}<br/>
                ${VIBE_COMPANY.address.city}, ${VIBE_COMPANY.address.state} ${VIBE_COMPANY.address.zip}
              </p>
            </div>
          `,
          pdfBase64,
          pdfFilename: `PO-${po.po_number}.pdf`
        }
      });

      if (response.error) throw response.error;

      // Update PO status to submitted
      await supabase
        .from('vendor_pos')
        .update({ status: 'submitted' })
        .eq('id', poId);

      toast({
        title: "PO Sent",
        description: `Purchase order sent to ${data.to.join(', ')}`
      });

      setShowEmailPreview(false);
      fetchPODetails();
    } catch (error: any) {
      console.error('Send error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getDefaultEmailMessage = () => {
    if (!po || !vendor) return '';
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    return `Dear ${vendor.contact_name || vendor.name},

Please find attached the purchase order from ${VIBE_COMPANY.name}.

PO Number: ${po.po_number}
Order Date: ${new Date(po.order_date).toLocaleDateString()}
Total Amount: $${totalAmount.toFixed(2)}

Please confirm receipt of this order and provide an estimated delivery date.

Thank you for your business.`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading vendor PO...</p>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Vendor PO not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditMode(false);
                    setEditedPO(po);
                  }}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSavePO}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit PO
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          {vendor?.contact_email && (
            <Button onClick={() => setShowEmailPreview(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send to Vendor
            </Button>
          )}
        </div>
      </div>

      {/* PO Details Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2">Vendor PO #{po.po_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Customer Order: {po.orders?.order_number || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Customer: {po.orders?.customer_name || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                {isEditMode ? (
                  <Select
                    value={editedPO.status}
                    onValueChange={(value) => setEditedPO({...editedPO, status: value})}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {po.status === 'draft' ? (
                        <>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="submitted">Submitted</SelectItem>
                        </>
                      ) : (
                        <SelectItem value="submitted">Submitted</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary capitalize">
                    {po.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>

            {/* Dates and Ship To */}
            <div className="grid grid-cols-2 gap-6 mt-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Order Date</Label>
                  <p className="font-medium">{new Date(po.order_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Requested Due Date</Label>
                  {isEditMode ? (
                    <Input
                      type="date"
                      value={editedPO.expected_delivery_date || ''}
                      onChange={(e) => setEditedPO({...editedPO, expected_delivery_date: e.target.value})}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium">
                      {po.expected_delivery_date 
                        ? new Date(po.expected_delivery_date).toLocaleDateString()
                        : 'Not set'
                      }
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Ship To Address</Label>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Name / Company"
                      value={editedPO.ship_to_name || ''}
                      onChange={(e) => setEditedPO({...editedPO, ship_to_name: e.target.value})}
                    />
                    <Input
                      placeholder="Street Address"
                      value={editedPO.ship_to_street || ''}
                      onChange={(e) => setEditedPO({...editedPO, ship_to_street: e.target.value})}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="City"
                        value={editedPO.ship_to_city || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_city: e.target.value})}
                      />
                      <Input
                        placeholder="State"
                        value={editedPO.ship_to_state || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_state: e.target.value})}
                      />
                      <Input
                        placeholder="ZIP"
                        value={editedPO.ship_to_zip || ''}
                        onChange={(e) => setEditedPO({...editedPO, ship_to_zip: e.target.value})}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm">
                    {po.ship_to_name || po.ship_to_street ? (
                      <>
                        {po.ship_to_name && <p className="font-medium">{po.ship_to_name}</p>}
                        {po.ship_to_street && <p>{po.ship_to_street}</p>}
                        {(po.ship_to_city || po.ship_to_state || po.ship_to_zip) && (
                          <p>{[po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(', ')}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">Not set</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Vendor Info */}
          <div className="p-8 border-b">
            <h2 className="text-lg font-semibold mb-4">Vendor Information</h2>
            {vendor ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Name</Label>
                  <p className="font-medium">{vendor.name}</p>
                </div>
                {vendor.contact_name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Person</Label>
                    <p className="font-medium">{vendor.contact_name}</p>
                  </div>
                )}
                {vendor.contact_email && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium">{vendor.contact_email}</p>
                  </div>
                )}
                {vendor.contact_phone && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="font-medium">{vendor.contact_phone}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Vendor information not available</p>
            )}
          </div>

          {/* Items Table */}
          <div className="p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Order Items</h2>
              {isAdmin && isEditMode && (
                <Button
                  size="sm"
                  onClick={() => {
                    const newItem = {
                      id: `temp-${Date.now()}`,
                      sku: '',
                      name: '',
                      quantity: 1,
                      shipped_quantity: 0,
                      unit_cost: 0,
                      total: 0,
                      isNew: true
                    };
                    setPOItems([...poItems, newItem]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Line
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">Shipped</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {isAdmin && isEditMode && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {poItems.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.sku}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].sku = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="SKU"
                          className="font-mono"
                        />
                      ) : (
                        <span className="font-mono">{item.sku}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].name = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="Product name"
                        />
                      ) : (
                        item.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.description || ''}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].description = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="Description (optional)"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{item.description || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditMode ? (
                        <Input
                          type="number"
                          min="0"
                          value={item.shipped_quantity}
                          onChange={(e) => {
                            const updated = [...poItems];
                            const newQuantity = parseInt(e.target.value) || 0;
                            updated[index].shipped_quantity = newQuantity;
                            // For new items, also update the ordered quantity
                            if (updated[index].isNew) {
                              updated[index].quantity = newQuantity;
                            }
                            // Calculate total based on ordered quantity, not shipped
                            updated[index].total = updated[index].quantity * Number(updated[index].unit_cost);
                            setPOItems(updated);
                          }}
                          className="w-24 text-center"
                        />
                      ) : (
                        item.shipped_quantity
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditMode && item.isNew ? (
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.unit_cost}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].unit_cost = parseFloat(e.target.value) || 0;
                            updated[index].total = updated[index].shipped_quantity * updated[index].unit_cost;
                            setPOItems(updated);
                          }}
                          className="w-28 text-right"
                        />
                      ) : (
                        `$${Number(item.unit_cost).toFixed(3)}`
                      )}
                    </TableCell>
                    <TableCell className="text-right">${Number(item.total).toFixed(2)}</TableCell>
                    {isAdmin && isEditMode && (
                      <TableCell className="text-center">
                        {item.isNew && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = poItems.filter((_, i) => i !== index);
                              setPOItems(updated);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Total */}
            <div className="flex justify-end mt-6 pt-6 border-t">
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
                <p className="text-2xl font-bold">${poItems.reduce((sum, item) => sum + Number(item.total), 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        open={showEmailPreview}
        onOpenChange={setShowEmailPreview}
        title="Send Purchase Order to Vendor"
        defaultTo={vendor?.contact_email || ''}
        defaultSubject={`Purchase Order ${po?.po_number} from ${VIBE_COMPANY.name}`}
        defaultMessage={getDefaultEmailMessage()}
        attachmentName={`PO-${po?.po_number}.pdf`}
        onSend={handleSendEmail}
        sending={sendingEmail}
      />
    </div>
  );
};

export default VendorPODetail;