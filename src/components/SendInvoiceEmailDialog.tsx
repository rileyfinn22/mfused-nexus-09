import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, Mail, Plus, Send, Loader2, Eye, FileText, Paperclip, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AdditionalAttachment {
  file: File;
  base64: string;
}

interface SendInvoiceEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  order: any;
  items: any[];
  senderName: string;
  senderEmail: string;
}

export function SendInvoiceEmailDialog({
  open,
  onOpenChange,
  invoice,
  order,
  items,
  senderName,
  senderEmail,
}: SendInvoiceEmailDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [additionalAttachments, setAdditionalAttachments] = useState<AdditionalAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatUnitPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount);
  };

  // Fetch email history on mount
  useEffect(() => {
    const fetchEmailHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's company
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (roleData?.company_id) {
        setCompanyId(roleData.company_id);
        
        // Fetch email history
        const { data: historyData } = await supabase
          .from('sent_email_history')
          .select('email')
          .eq('company_id', roleData.company_id)
          .order('last_used_at', { ascending: false })
          .limit(50);

        if (historyData) {
          setEmailHistory(historyData.map(h => h.email));
        }
      }
    };

    if (open) {
      fetchEmailHistory();
    }
  }, [open]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && invoice) {
      const defaultSubject = `Invoice ${invoice.invoice_number} from ${VIBE_COMPANY.name}`;
      const defaultMessage = `Dear ${order?.shipping_name || order?.customer_name || 'Customer'},

Please find attached invoice ${invoice.invoice_number} from ${VIBE_COMPANY.name}.

Invoice Number: ${invoice.invoice_number}
Invoice Date: ${new Date(invoice.invoice_date).toLocaleDateString()}
Amount Due: ${formatCurrency(invoice.total || 0)}
Due Date: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'Upon Receipt'}

Please remit payment at your earliest convenience.

Thank you for your business.`;

      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setEmails(order?.customer_email ? [order.customer_email] : []);
      setCurrentEmail("");
      setActiveTab("compose");
      setShowEmailSuggestions(false);
      setAdditionalAttachments([]);
    }
  }, [open, invoice, order]);

  // Save emails to history
  const saveEmailsToHistory = async (emailsToSave: string[]) => {
    if (!companyId) return;

    for (const email of emailsToSave) {
      // Upsert: insert or update use_count and last_used_at
      const { error } = await supabase
        .from('sent_email_history')
        .upsert(
          {
            company_id: companyId,
            email: email.toLowerCase(),
            last_used_at: new Date().toISOString(),
            use_count: 1,
          },
          {
            onConflict: 'company_id,email',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('Error saving email history:', error);
      }
    }

    // Update local state
    setEmailHistory(prev => {
      const newEmails = emailsToSave.filter(e => !prev.includes(e.toLowerCase()));
      return [...newEmails.map(e => e.toLowerCase()), ...prev];
    });
  };

  const addEmail = (emailToAdd?: string) => {
    const email = (emailToAdd || currentEmail).trim().toLowerCase();
    if (!email) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    
    if (emails.includes(email)) {
      toast({
        title: "Duplicate email",
        description: "This email has already been added",
        variant: "destructive",
      });
      return;
    }
    
    setEmails([...emails, email]);
    setCurrentEmail("");
    setShowEmailSuggestions(false);
  };

  const selectEmailFromHistory = (email: string) => {
    addEmail(email);
  };

  // Filter suggestions based on current input
  const filteredSuggestions = emailHistory.filter(
    email => 
      !emails.includes(email) && 
      (currentEmail.length === 0 || email.toLowerCase().includes(currentEmail.toLowerCase()))
  ).slice(0, 10);

  const removeEmail = (emailToRemove: string) => {
    setEmails(emails.filter((e) => e !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEmail();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
    const MAX_TOTAL_SIZE = 75 * 1024 * 1024; // 75MB total

    // Calculate current total size
    const currentTotalSize = additionalAttachments.reduce((sum, a) => sum + a.file.size, 0);

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 50MB limit`,
          variant: "destructive",
        });
        continue;
      }

      if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        toast({
          title: "Total size limit reached",
          description: "Total attachments cannot exceed 75MB",
          variant: "destructive",
        });
        break;
      }

      // Check for duplicates
      if (additionalAttachments.some(a => a.file.name === file.name)) {
        toast({
          title: "Duplicate file",
          description: `${file.name} is already attached`,
          variant: "destructive",
        });
        continue;
      }

      // Convert to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get just the base64
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.readAsDataURL(file);
      });

      setAdditionalAttachments(prev => [...prev, { file, base64 }]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (fileName: string) => {
    setAdditionalAttachments(prev => prev.filter(a => a.file.name !== fileName));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const generatePdfBase64 = async (): Promise<string> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors - matching the professional template
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
    
    // Logo on right side
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
    
    // ============ INVOICE TITLE ============
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Invoice', 14, yPos);
    
    yPos += 15;
    
    // ============ BILLED TO & INVOICE DETAILS SECTION ============
    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
    
    // Billed To section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Billed to', leftColX, yPos);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(invoice.companies?.name || order?.customer_name || '', leftColX, yPos + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    const billStreet = order?.billing_street || order?.shipping_street || '';
    const billCity = order?.billing_city || order?.shipping_city || '';
    const billState = order?.billing_state || order?.shipping_state || '';
    const billZip = order?.billing_zip || order?.shipping_zip || '';
    
    let billY = yPos + 14;
    if (billStreet) {
      doc.text(billStreet, leftColX, billY);
      billY += 5;
    }
    if (billCity) {
      doc.text(`${billCity}, ${billState} ${billZip}`, leftColX, billY);
      billY += 5;
    }
    if (order?.po_number) {
      doc.setFont('helvetica', 'bold');
      doc.text(`PO: ${order.po_number}`, leftColX, billY);
    }
    
    // Invoice details on right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    
    const detailsStartY = yPos;
    doc.text('Invoice #:', rightColX, detailsStartY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(invoice.invoice_number, rightColX + 45, detailsStartY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Date:', rightColX, detailsStartY + 7);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(new Date(invoice.invoice_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), rightColX + 45, detailsStartY + 7);
    
    if (invoice.due_date) {
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      doc.text('Due Date:', rightColX, detailsStartY + 14);
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text(new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), rightColX + 45, detailsStartY + 14);
    }
    
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('Order #:', rightColX, detailsStartY + 21);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order?.order_number || '', rightColX + 45, detailsStartY + 21);
    
    yPos += 40;
    
    // ============ ITEMS TABLE ============
    const tableData = items.map((item) => [
      item.sku || '',
      item.name || '',
      (item.quantity || item.shipped_quantity || 0).toLocaleString(),
      formatUnitPrice(item.unit_price || 0),
      formatCurrency((item.quantity || item.shipped_quantity || 0) * (item.unit_price || 0))
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
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
        0: { cellWidth: 35 },
        1: { cellWidth: 70 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0
    });
    
    // Get final Y position after table
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    
    // ============ TOTALS SECTION ============
    const totalsWidth = 85;
    const totalsX = pageWidth - totalsWidth - 14;
    
    const totalPaid = invoice.total_paid || 0;
    const balance = (invoice.total || 0) - totalPaid;
    const hasPayments = totalPaid > 0;
    const hasShipping = (invoice.shipping_cost || 0) > 0;
    
    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    let totalsY = finalY + 5;
    
    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;
    
    // Shipping (if applicable)
    if (hasShipping) {
      doc.text('Shipping', totalsX, totalsY);
      doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    
    // Less Deposit / Payments
    if (hasPayments) {
      doc.text('Less Deposit', totalsX, totalsY);
      doc.text(`(${formatCurrency(totalPaid)})`, totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    
    // Divider line before balance
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
    totalsY += 6;
    
    // Balance Due - emphasized
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('BALANCE DUE', totalsX, totalsY);
    doc.text(formatCurrency(hasPayments ? balance : (invoice.total || 0)), totalsX + totalsWidth, totalsY, { align: 'right' });
    
    // ============ TERMS/NOTES SECTION ============
    const termsY = totalsY + 20;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text('All remaining amounts are due on the agreed upon terms. Thank you for your business!', 14, termsY);
    
    // Additional notes if present
    if (invoice.notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('Notes:', 14, termsY + 10);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
      const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 28);
      doc.text(notesLines, 14, termsY + 16);
    }
    
    // ============ FOOTER ============
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    return pdfBase64;
  };

  const handleSend = async () => {
    if (emails.length === 0) {
      toast({
        title: "No recipients",
        description: "Please add at least one email address",
        variant: "destructive",
      });
      return;
    }
    
    setSending(true);
    
    try {
      const pdfBase64 = await generatePdfBase64();
      
      // Convert plain text message to HTML
      const htmlMessage = message
        .split('\n')
        .map(line => line.trim() === '' ? '<br/>' : `<p style="margin: 8px 0;">${line}</p>`)
        .join('');
      
      // Build additional attachments array
      const additionalAttachmentsData = additionalAttachments.map(a => ({
        filename: a.file.name,
        content: a.base64,
      }));

      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: invoice.id,
          recipientEmails: emails,
          senderName,
          senderEmail,
          subject,
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
          pdfFilename: `Invoice-${invoice.invoice_number}.pdf`,
          invoiceNumber: invoice.invoice_number,
          dueDate: invoice.due_date,
          totalAmount: invoice.total,
          customerName: order?.shipping_name || order?.customer_name,
          additionalAttachments: additionalAttachmentsData.length > 0 ? additionalAttachmentsData : undefined,
        },
      });
      
      if (error) throw error;
      
      // Save emails to history after successful send
      await saveEmailsToHistory(emails);
      
      toast({
        title: "Invoice sent!",
        description: `Invoice ${invoice.invoice_number} has been emailed to ${emails.length} recipient${emails.length > 1 ? "s" : ""}`,
      });
      
      setEmails([]);
      setMessage("");
      setAdditionalAttachments([]);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending invoice email:", error);
      toast({
        title: "Failed to send",
        description: error.message || "Could not send the invoice email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // Convert message to HTML for preview
  const messageToHtml = (text: string) => {
    return text
      .split('\n')
      .map(line => line.trim() === '' ? '<br/>' : `<p style="margin: 8px 0;">${line}</p>`)
      .join('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Invoice via Email
          </DialogTitle>
          <DialogDescription>
            Review and customize your email before sending invoice {invoice?.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4 mt-4">
            {/* Invoice Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice:</span>
                <span className="font-medium">{invoice?.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Due:</span>
                <span className="font-semibold text-primary">{formatCurrency(invoice?.total || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due Date:</span>
                <span className="font-medium">
                  {invoice?.due_date ? new Date(invoice.due_date).toLocaleDateString() : "Upon Receipt"}
                </span>
              </div>
            </div>
            
            {/* Recipients */}
            <div className="space-y-2">
              <Label>To</Label>
              <div className="flex gap-2 relative">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    type="email"
                    placeholder="Enter email address"
                    value={currentEmail}
                    onChange={(e) => {
                      setCurrentEmail(e.target.value);
                      setShowEmailSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setShowEmailSuggestions(currentEmail.length > 0 || emailHistory.length > 0)}
                    onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                    onKeyDown={handleKeyDown}
                  />
                  {showEmailSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                      {filteredSuggestions.map((email) => (
                        <button
                          key={email}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectEmailFromHistory(email);
                          }}
                        >
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="button" size="icon" variant="outline" onClick={() => addEmail()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {emails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 pr-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            
            {/* Message */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message..."
                rows={8}
                className="resize-none"
              />
            </div>
            
            {/* Attachments Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Attachments</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip"
                />
              </div>
              
              {/* Primary attachment - Invoice PDF */}
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">Invoice-{invoice?.invoice_number}.pdf</span>
                <Badge variant="outline">PDF</Badge>
              </div>
              
              {/* Additional attachments */}
              {additionalAttachments.map((attachment) => (
                <div key={attachment.file.name} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate" title={attachment.file.name}>
                    {attachment.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file.size)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAttachment(attachment.file.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {additionalAttachments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {additionalAttachments.length} additional file{additionalAttachments.length > 1 ? 's' : ''} • 
                  Total: {formatFileSize(additionalAttachments.reduce((sum, a) => sum + a.file.size, 0))}
                </p>
              )}
            </div>
            
            {/* Sender Info */}
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                This email will be sent from: <span className="font-medium text-foreground">{senderName} ({senderEmail})</span>
              </p>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <ScrollArea className="h-[400px] rounded-lg border bg-background">
              <div className="p-6">
                {/* Email Header Preview */}
                <div className="space-y-3 pb-4 border-b">
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">To:</span>
                    <div className="flex flex-wrap gap-1">
                      {emails.length > 0 ? (
                        emails.map((email) => (
                          <span key={email} className="text-sm font-medium">{email}</span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground italic">No recipients added</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">Subject:</span>
                    <span className="text-sm font-medium">{subject || "(No subject)"}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">Attach:</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3 w-3" />
                        <span className="text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
                      </div>
                      {additionalAttachments.map((attachment) => (
                        <div key={attachment.file.name} className="flex items-center gap-2">
                          <Paperclip className="h-3 w-3" />
                          <span className="text-sm">{attachment.file.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Email Body Preview */}
                <div className="pt-4">
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: messageToHtml(message) }}
                  />
                  <div className="mt-6 pt-4 border-t text-sm text-muted-foreground">
                    <p>{VIBE_COMPANY.name}</p>
                    <p>{VIBE_COMPANY.address.street}</p>
                    <p>{VIBE_COMPANY.address.city}, {VIBE_COMPANY.address.state} {VIBE_COMPANY.address.zip}</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Separator className="my-2" />
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || emails.length === 0}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Invoice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
