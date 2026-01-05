import { useState, useEffect } from "react";
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
import { addPdfBrandingSync, addPdfFooter, VIBE_COMPANY } from "@/lib/pdfBranding";

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
    }
  }, [open, invoice, order]);

  const addEmail = () => {
    const email = currentEmail.trim().toLowerCase();
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
  };

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
    
    const headerY = addPdfBrandingSync(doc, { documentTitle: 'INVOICE' });
    
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(`Invoice #: ${invoice.invoice_number}`, pageWidth - 14, headerY - 15, { align: 'right' });
    doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, pageWidth - 14, headerY - 8, { align: 'right' });
    if (invoice.due_date) {
      doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, pageWidth - 14, headerY - 1, { align: 'right' });
    }
    
    let yPos = headerY + 10;
    
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("Ship To:", 14, yPos);
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(order?.shipping_name || "Customer", 14, yPos + 7);
    doc.text(order?.shipping_street || "", 14, yPos + 14);
    doc.text(`${order?.shipping_city || ""}, ${order?.shipping_state || ""} ${order?.shipping_zip || ""}`, 14, yPos + 21);
    
    if (order?.billing_name) {
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text("Bill To:", 110, yPos);
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text(order?.billing_name || "", 110, yPos + 7);
      doc.text(order?.billing_street || "", 110, yPos + 14);
      doc.text(`${order?.billing_city || ""}, ${order?.billing_state || ""} ${order?.billing_zip || ""}`, 110, yPos + 21);
    }
    
    const tableData = items.map((item) => [
      item.sku,
      item.name,
      item.quantity || item.shipped_quantity || 0,
      formatUnitPrice(item.unit_price || 0),
      formatCurrency((item.quantity || item.shipped_quantity || 0) * (item.unit_price || 0)),
    ]);
    
    autoTable(doc, {
      startY: yPos + 35,
      head: [["SKU", "Description", "Qty", "Unit Price", "Total"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 70 },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 30, halign: "right" },
        4: { cellWidth: 30, halign: "right" },
      },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.text("Subtotal:", 140, finalY);
    doc.text(formatCurrency(invoice.subtotal || 0), 180, finalY, { align: "right" });
    
    if (invoice.tax > 0) {
      doc.text("Tax:", 140, finalY + 7);
      doc.text(formatCurrency(invoice.tax || 0), 180, finalY + 7, { align: "right" });
    }
    
    if (invoice.shipping_cost > 0) {
      doc.text("Shipping:", 140, finalY + 14);
      doc.text(formatCurrency(invoice.shipping_cost || 0), 180, finalY + 14, { align: "right" });
    }
    
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.setFont(undefined, "bold");
    const totalY = finalY + (invoice.tax > 0 ? 24 : invoice.shipping_cost > 0 ? 24 : 14);
    doc.text("Total Due:", 140, totalY);
    doc.text(formatCurrency(invoice.total || 0), 180, totalY, { align: "right" });
    
    addPdfFooter(doc);
    
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
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={currentEmail}
                  onChange={(e) => setCurrentEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button type="button" size="icon" variant="outline" onClick={addEmail}>
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
