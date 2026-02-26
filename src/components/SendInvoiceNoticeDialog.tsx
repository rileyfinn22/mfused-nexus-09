import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, Mail, Plus, Send, Loader2, Eye, FileText, Bell, AlertCircle, Paperclip, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VIBE_COMPANY } from "@/lib/pdfBranding";

interface AdditionalAttachment {
  file: File;
  base64: string;
}

interface SendInvoiceNoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noticeType: "billed" | "payment_due";
  invoice: any;
  order: any;
  items: any[];
  senderEmail: string;
}

export function SendInvoiceNoticeDialog({
  open,
  onOpenChange,
  noticeType,
  invoice,
  order,
  items,
  senderEmail,
}: SendInvoiceNoticeDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [attachPdf, setAttachPdf] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBilled = noticeType === "billed";
  const title = isBilled ? "Send Billed Notice" : "Send Payment Due Reminder";
  const icon = isBilled ? <Bell className="h-5 w-5 text-primary" /> : <AlertCircle className="h-5 w-5 text-destructive" />;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const formatUnitPrice = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(amount);

  // Fetch email history
  useEffect(() => {
    const fetchEmailHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from('user_roles').select('company_id').eq('user_id', user.id).single();
      if (roleData?.company_id) {
        setCompanyId(roleData.company_id);
        const { data: historyData } = await supabase.from('sent_email_history').select('email').eq('company_id', roleData.company_id).order('last_used_at', { ascending: false }).limit(50);
        if (historyData) setEmailHistory(historyData.map(h => h.email));
      }
    };
    if (open) fetchEmailHistory();
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (open && invoice) {
      setEmails(order?.customer_email ? [order.customer_email] : []);
      setCurrentEmail("");
      setActiveTab("compose");
      setShowEmailSuggestions(false);
      setAttachPdf(true);
    }
  }, [open, invoice, order]);

  const saveEmailsToHistory = async (emailsToSave: string[]) => {
    if (!companyId) return;
    for (const email of emailsToSave) {
      await supabase.from('sent_email_history').upsert(
        { company_id: companyId, email: email.toLowerCase(), last_used_at: new Date().toISOString(), use_count: 1 },
        { onConflict: 'company_id,email', ignoreDuplicates: false }
      );
    }
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
      toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (emails.includes(email)) {
      toast({ title: "Duplicate email", description: "This email has already been added", variant: "destructive" });
      return;
    }
    setEmails([...emails, email]);
    setCurrentEmail("");
    setShowEmailSuggestions(false);
  };

  const filteredSuggestions = emailHistory.filter(
    email => !emails.includes(email) && (currentEmail.length === 0 || email.toLowerCase().includes(currentEmail.toLowerCase()))
  ).slice(0, 10);

  const removeEmail = (emailToRemove: string) => setEmails(emails.filter(e => e !== emailToRemove));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addEmail(); }
  };

  const generatePdfBase64 = async (): Promise<string> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryGreen = [76, 175, 80];
    const darkGray = [51, 51, 51];
    const lightGray = [248, 248, 248];
    const mediumGray = [100, 100, 100];

    let yPos = 15;
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

    try {
      const logoResponse = await fetch('/images/vibe-logo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', pageWidth - 54, yPos - 5, 40, 25);
    } catch { }

    yPos += 28;
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, pageWidth - 14, yPos);
    yPos += 12;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text('Invoice', 14, yPos);
    yPos += 15;

    const leftColX = 14;
    const rightColX = pageWidth / 2 + 10;
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
    if (billStreet) { doc.text(billStreet, leftColX, billY); billY += 5; }
    if (billCity) { doc.text(`${billCity}, ${billState} ${billZip}`, leftColX, billY); billY += 5; }
    if (order?.po_number) { doc.setFont('helvetica', 'bold'); doc.text(`PO: ${order.po_number}`, leftColX, billY); }

    const detailsStartY = yPos;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
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
      headStyles: { fillColor: [primaryGreen[0], primaryGreen[1], primaryGreen[2]], textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 4 },
      bodyStyles: { fontSize: 9, cellPadding: 4, textColor: [darkGray[0], darkGray[1], darkGray[2]], lineWidth: 0 },
      alternateRowStyles: { fillColor: [lightGray[0], lightGray[1], lightGray[2]] },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 70 }, 2: { cellWidth: 25, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      showHead: 'firstPage',
      tableLineWidth: 0
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalsWidth = 85;
    const totalsX = pageWidth - totalsWidth - 14;
    const totalPaid = invoice.total_paid || 0;
    const balance = (invoice.total || 0) - totalPaid;
    const hasPayments = totalPaid > 0;
    const hasShipping = (invoice.shipping_cost || 0) > 0;

    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    let totalsY = finalY + 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(invoice.subtotal || invoice.total || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
    totalsY += 8;
    if (hasShipping) {
      doc.text('Shipping', totalsX, totalsY);
      doc.text(formatCurrency(invoice.shipping_cost || 0), totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    if (hasPayments) {
      doc.text('Less Deposit', totalsX, totalsY);
      doc.text(`(${formatCurrency(totalPaid)})`, totalsX + totalsWidth, totalsY, { align: 'right' });
      totalsY += 8;
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, totalsX + totalsWidth, totalsY);
    totalsY += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('BALANCE DUE', totalsX, totalsY);
    doc.text(formatCurrency(hasPayments ? balance : (invoice.total || 0)), totalsX + totalsWidth, totalsY, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });

    return doc.output("datauristring").split(",")[1];
  };

  const formattedDueDate = invoice?.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Upon Receipt";

  const formattedAmount = formatCurrency(invoice?.total || 0);

  const previewSubject = isBilled
    ? `Invoice ${invoice?.invoice_number} — ${formattedAmount} Due ${formattedDueDate}`
    : `⚠️ Payment Due — Invoice ${invoice?.invoice_number} (${formattedAmount})`;

  const handleSend = async () => {
    if (emails.length === 0) {
      toast({ title: "No recipients", description: "Please add at least one email address", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const origin = window.location.origin;
      const isPreview = origin.includes('lovable.app') || origin.includes('lovableproject.com');
      const portalBase = isPreview ? 'https://vibepkgportal.lovable.app' : origin;
      const portalUrl = `${portalBase}/invoices/${invoice.id}`;

      let pdfBase64: string | undefined;
      let pdfFilename: string | undefined;
      if (attachPdf) {
        pdfBase64 = await generatePdfBase64();
        pdfFilename = `Invoice-${invoice.invoice_number}.pdf`;
      }

      const { data, error } = await supabase.functions.invoke('send-invoice-notice', {
        body: {
          noticeType,
          recipientEmails: emails,
          senderEmail: senderEmail || 'info@vibepkg.com',
          invoiceNumber: invoice.invoice_number,
          dueDate: invoice.due_date,
          totalAmount: invoice.total || 0,
          customerName: order?.shipping_name || order?.customer_name || 'Customer',
          portalUrl,
          pdfBase64,
          pdfFilename,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await saveEmailsToHistory(emails);

      const label = isBilled ? "Billed Notice" : "Payment Due Reminder";
      toast({
        title: `${label} Sent`,
        description: `${label} sent to ${emails.length} recipient${emails.length > 1 ? "s" : ""}`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Failed to send",
        description: error.message || "Could not send the notice email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>
            {isBilled
              ? `Send a billed notice for invoice ${invoice?.invoice_number} with Net 30 terms from delivery date.`
              : `Send a payment due reminder for invoice ${invoice?.invoice_number}.`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recipients
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
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold text-primary">{formattedAmount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due Date:</span>
                <span className="font-medium">{formattedDueDate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Notice Type:</span>
                <Badge variant={isBilled ? "default" : "destructive"}>
                  {isBilled ? "Billed – Net 30" : "Payment Due"}
                </Badge>
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
                    onChange={(e) => { setCurrentEmail(e.target.value); setShowEmailSuggestions(e.target.value.length > 0); }}
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
                          onMouseDown={(e) => { e.preventDefault(); addEmail(email); }}
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
                      <button type="button" onClick={() => removeEmail(email)} className="ml-1 hover:bg-destructive/20 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Attachment toggle */}
            <div className="space-y-2">
              <Label>Attachment</Label>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">Invoice-{invoice?.invoice_number}.pdf</span>
                <Badge variant="outline">PDF</Badge>
                <Button
                  type="button"
                  variant={attachPdf ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAttachPdf(!attachPdf)}
                >
                  {attachPdf ? "Attached" : "Attach"}
                </Button>
              </div>
            </div>

            {/* Sender Info */}
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                Sent from: <span className="font-medium text-foreground">VibePKG &lt;invoices@vibepkgportal.com&gt;</span>
              </p>
              <p className="text-muted-foreground mt-1">
                Reply-to: <span className="font-medium text-foreground">{senderEmail}</span>
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
                    <span className="text-sm font-medium">{previewSubject}</span>
                  </div>
                  {attachPdf && (
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-muted-foreground w-16">Attach:</span>
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3 w-3" />
                        <span className="text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Email Body Preview */}
                <div className="pt-4">
                  {/* Header Banner */}
                  <div className={`rounded-t-lg p-6 text-center ${isBilled ? 'bg-blue-600' : 'bg-red-600'} text-white`}>
                    <h2 className="text-lg font-bold">
                      {isBilled ? "Invoice Ready for Payment" : "Payment Due Reminder"}
                    </h2>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-4 border-x">
                    {isBilled ? (
                      <>
                        <p className="text-sm">Dear {order?.shipping_name || order?.customer_name || 'Customer'},</p>
                        <p className="text-sm">
                          Your order has shipped and invoice <strong>{invoice?.invoice_number}</strong> is now ready for payment.
                          Per our Net 30 terms, payment is due by <strong>{formattedDueDate}</strong>.
                        </p>
                        <p className="text-sm">You can view the full invoice and make a payment through our portal.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">Dear {order?.shipping_name || order?.customer_name || 'Customer'},</p>
                        <p className="text-sm">
                          This is a friendly reminder that invoice <strong>{invoice?.invoice_number}</strong> for <strong>{formattedAmount}</strong> was
                          due on <strong>{formattedDueDate}</strong>.
                        </p>
                        <p className="text-sm">
                          If payment has already been sent, please disregard this notice. Otherwise, we kindly ask that you
                          arrange payment at your earliest convenience.
                        </p>
                        <p className="text-sm">You can view the invoice and make a payment through our secure portal below.</p>
                      </>
                    )}

                    {/* Invoice Card Preview */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Invoice Number</p>
                        <p className="font-semibold">{invoice?.invoice_number}</p>
                      </div>
                      <div className="flex justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Due Date</p>
                          <p className={`font-medium ${!isBilled ? 'text-destructive' : ''}`}>{formattedDueDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Amount Due</p>
                          <p className={`text-xl font-bold ${isBilled ? 'text-blue-600' : 'text-destructive'}`}>{formattedAmount}</p>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center py-2">
                      <span className={`inline-block px-6 py-3 rounded-lg text-white font-semibold ${isBilled ? 'bg-blue-600' : 'bg-red-600'}`}>
                        {isBilled ? "View Invoice & Pay" : "Pay Now"}
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-muted/50 rounded-b-lg p-4 border-x border-b space-y-2">
                    <p className="text-xs text-destructive font-semibold">⚠️ Please do not reply to this email — this mailbox is not monitored.</p>
                    <p className="text-sm text-muted-foreground">Questions? Contact us at <span className="text-primary">{senderEmail}</span></p>
                    <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} VibePKG. All rights reserved.</p>
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
                Send {isBilled ? "Billed Notice" : "Payment Reminder"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
