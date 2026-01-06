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
import { X, Mail, Plus, Send, Loader2, Eye, FileText, Paperclip } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const generatePdfBase64 = async (): Promise<string> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors - matching the branded invoice
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const lightGray = [245, 245, 245];
    
    // ============ HEADER SECTION ============
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.rect(0, 0, pageWidth, 38, 'F');
    
    // Logo on left side of header
    try {
      const logoResponse = await fetch('/images/vibe-logo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', 14, 6, 0, 26);
    } catch (error) {
      // Fallback text logo
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Vibe Packaging', 14, 24);
    }
    
    // INVOICE title on right side of header
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('INVOICE', pageWidth - 14, 24, { align: 'right' });
    
    let yPos = 52;
    
    // ============ INVOICE INFO & BILL TO SECTION ============
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(14, yPos - 5, 85, 45, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('INVOICE DETAILS', 18, yPos + 2);
    
    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice #:', 18, yPos + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.invoice_number, 50, yPos + 12);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 18, yPos + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.invoice_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 50, yPos + 20);
    
    if (invoice.due_date) {
      doc.setFont('helvetica', 'bold');
      doc.text('Due Date:', 18, yPos + 28);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 50, yPos + 28);
    }
    
    doc.setFont('helvetica', 'bold');
    doc.text('Order #:', 18, yPos + 36);
    doc.setFont('helvetica', 'normal');
    doc.text(order?.order_number || '', 50, yPos + 36);
    
    // Right side - Bill To
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(105, yPos - 5, 90, 45, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('BILL TO', 109, yPos + 2);
    
    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.companies?.name || order?.customer_name || '', 109, yPos + 12);
    doc.setFont('helvetica', 'normal');
    
    const billStreet = order?.billing_street || order?.shipping_street || '';
    const billCity = order?.billing_city || order?.shipping_city || '';
    const billState = order?.billing_state || order?.shipping_state || '';
    const billZip = order?.billing_zip || order?.shipping_zip || '';
    
    if (billStreet) doc.text(billStreet, 109, yPos + 20);
    if (billCity) doc.text(`${billCity}, ${billState} ${billZip}`, 109, yPos + 28);
    if (order?.po_number) {
      doc.setFont('helvetica', 'bold');
      doc.text('PO #: ', 109, yPos + 36);
      doc.setFont('helvetica', 'normal');
      doc.text(order.po_number, 122, yPos + 36);
    }
    
    yPos += 55;
    
    // ============ ITEMS TABLE ============
    const tableData = items.map((item) => [
      item.sku || '',
      item.name || '',
      (item.quantity || item.shipped_quantity || 0).toString(),
      formatUnitPrice(item.unit_price || 0),
      formatCurrency((item.quantity || item.shipped_quantity || 0) * (item.unit_price || 0))
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['SKU', 'Description', 'Qty', 'Unit Price', 'Amount']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], 
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 5
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 5,
        textColor: [darkGray[0], darkGray[1], darkGray[2]],
        lineWidth: 0
      },
      alternateRowStyles: {
        fillColor: [235, 235, 235]
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 75 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0
    });
    
    // Get final Y position after table
    let finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // ============ TOTALS SECTION ============
    const totalsWidth = 80;
    const totalsX = pageWidth - totalsWidth - 14;
    
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    
    const totalPaid = invoice.total_paid || 0;
    const balance = (invoice.total || 0) - totalPaid;
    const hasPayments = totalPaid > 0;
    
    const totalsHeight = hasPayments ? 50 : 35;
    doc.roundedRect(totalsX, finalY, totalsWidth, totalsHeight, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    
    doc.text('Subtotal:', totalsX + 5, finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth - 5, finalY + 10, { align: 'right' });
    
    if ((invoice.shipping_cost || 0) > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Shipping:', totalsX + 5, finalY + 18);
      doc.setFont('helvetica', 'normal');
      doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth - 5, finalY + 18, { align: 'right' });
    }
    
    // Total line with green background
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.roundedRect(totalsX, finalY + 22, totalsWidth, 12, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL:', totalsX + 5, finalY + 30);
    doc.text(formatCurrency(invoice.total || 0), totalsX + totalsWidth - 5, finalY + 30, { align: 'right' });
    
    if (hasPayments) {
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFont('helvetica', 'normal');
      doc.text('Paid:', totalsX + 5, finalY + 42);
      doc.text(formatCurrency(totalPaid), totalsX + totalsWidth - 5, finalY + 42, { align: 'right' });
      
      doc.setFont('helvetica', 'bold');
      doc.text('Balance:', totalsX + 5, finalY + 50);
      doc.text(formatCurrency(balance), totalsX + totalsWidth - 5, finalY + 50, { align: 'right' });
    }
    
    // ============ NOTES SECTION ============
    if (invoice.notes) {
      const notesY = finalY + totalsHeight + 15;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text('NOTES', 14, notesY);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 28);
      doc.text(notesLines, 14, notesY + 8);
    }
    
    // ============ FOOTER ============
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 15, { align: 'center' });
    doc.text('Vibe Packaging LLC • hello@vibepackaging.com', pageWidth / 2, pageHeight - 10, { align: 'center' });
    
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
            
            {/* Attachment indicator */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
              <Badge variant="outline" className="ml-auto">PDF</Badge>
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
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3 w-3" />
                      <span className="text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
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
