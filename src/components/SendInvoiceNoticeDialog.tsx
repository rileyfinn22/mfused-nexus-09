import { useState, useEffect, useRef } from "react";
import { pdfItemDescription } from "@/lib/pdfItemText";
import { Textarea } from "@/components/ui/textarea";
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
import { formatDocDate } from "@/lib/utils";
import {
  DOC,
  DOC_COLORS,
  docTableStyles,
  drawDetailRows,
  drawDocumentTitle,
  drawFooter,
  drawMasthead,
  drawPartyBlock,
  drawTotals,
  ensureRoom,
  type TotalsRow,
} from "@/lib/pdfDocument";

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
  const [editableSubject, setEditableSubject] = useState("");
  const [editableBody, setEditableBody] = useState("");
  const [additionalAttachments, setAdditionalAttachments] = useState<AdditionalAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBilled = noticeType === "billed";
  const title = isBilled ? "Send Billed Notice" : "Send Payment Due Reminder";
  const icon = isBilled ? <Bell className="h-5 w-5 text-primary" /> : <AlertCircle className="h-5 w-5 text-destructive" />;

  // Derive the proper company/customer name (not shipping_name which may include state prefix)
  const customerDisplayName = invoice?.companies?.name || order?.customer_name || "Customer";

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
      setAdditionalAttachments([]);

      const dueDate = invoice?.due_date
        ? formatDocDate(invoice.due_date, "long")
        : "Upon Receipt";
      const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(invoice?.total || 0);

      if (isBilled) {
        setEditableSubject(`Invoice ${invoice?.invoice_number} â€” ${amount} Due ${dueDate}`);
        setEditableBody(`Dear ${customerDisplayName},\n\nYour order has shipped and invoice ${invoice?.invoice_number} is now ready for payment. Per our Net 30 terms, payment is due by ${dueDate}.\n\nYou can view the full invoice and make a payment through our portal.`);
      } else {
        setEditableSubject(`âš ï¸ Payment Due â€” Invoice ${invoice?.invoice_number} (${amount})`);
        setEditableBody(`Dear ${customerDisplayName},\n\nThis is a friendly reminder that invoice ${invoice?.invoice_number} for ${amount} was due on ${dueDate}.\n\nIf payment has already been sent, please disregard this notice. Otherwise, we kindly ask that you arrange payment at your earliest convenience.\n\nYou can view the invoice and make a payment through our secure portal below.`);
      }
    }
  }, [open, invoice, order, noticeType]);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const MAX_FILE_SIZE = 30 * 1024 * 1024;
    const MAX_TOTAL_SIZE = 40 * 1024 * 1024;
    let runningTotalSize = additionalAttachments.reduce((sum, attachment) => sum + attachment.file.size, 0);
    const newAttachments: AdditionalAttachment[] = [];

    for (const file of files) {
      const isDuplicate = additionalAttachments.some((attachment) => attachment.file.name === file.name)
        || newAttachments.some((attachment) => attachment.file.name === file.name);

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 30MB limit`,
          variant: "destructive",
        });
        continue;
      }

      if (runningTotalSize + file.size > MAX_TOTAL_SIZE) {
        toast({
          title: "Total size limit reached",
          description: "Total attachments cannot exceed 40MB",
          variant: "destructive",
        });
        break;
      }

      if (isDuplicate) {
        toast({
          title: "Duplicate file",
          description: `${file.name} is already attached`,
          variant: "destructive",
        });
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.readAsDataURL(file);
      });

      newAttachments.push({ file, base64 });
      runningTotalSize += file.size;
    }

    if (newAttachments.length > 0) {
      setAdditionalAttachments((prev) => [...prev, ...newAttachments]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (fileName: string) => {
    setAdditionalAttachments((prev) => prev.filter((attachment) => attachment.file.name !== fileName));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const generatePdfBase64 = async (): Promise<string> => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    await drawMasthead(doc);

    let yPos = drawDocumentTitle(doc, {
      label: 'INVOICE',
      value: invoice.invoice_number,
      metaLabel: 'Issued',
      metaValue: formatDocDate(invoice.invoice_date, 'long'),
    });

    const leftColX = DOC.MARGIN;
    const rightColX = pageWidth / 2 + 4;
    const detailsStartY = yPos;

    const billStreet = order?.billing_street || order?.shipping_street || '';
    const billCity = order?.billing_city || order?.shipping_city || '';
    const billState = order?.billing_state || order?.shipping_state || '';
    const billZip = order?.billing_zip || order?.shipping_zip || '';

    const billY = drawPartyBlock(doc, leftColX, yPos, {
      label: 'BILLED TO',
      name: invoice.companies?.name || order?.customer_name || '',
      lines: [
        billStreet || null,
        billCity ? `${billCity}, ${billState} ${billZip}` : null,
      ],
    });

    const detailRows: Array<[string, string]> = [];
    if (invoice.due_date) {
      detailRows.push(['Due Date', formatDocDate(invoice.due_date, 'medium')]);
    }
    detailRows.push(['Order #', order?.order_number || '']);
    if (order?.po_number) detailRows.push(['PO #', order.po_number]);

    const detY = drawDetailRows(doc, rightColX, detailsStartY, detailRows, { valueOffset: 30 });

    yPos = Math.max(billY + 8, detY + 10);

    const tableData = items.map((item) => [
      item.sku || '',
      pdfItemDescription(item),
      (item.quantity || item.shipped_quantity || 0).toLocaleString(),
      formatUnitPrice(item.unit_price || 0),
      formatCurrency((item.quantity || item.shipped_quantity || 0) * (item.unit_price || 0))
    ]);

    const tableInnerWidth = pageWidth - DOC.MARGIN * 2;
    autoTable(doc, {
      ...docTableStyles(),
      startY: yPos,
      head: [['SKU', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
      body: tableData,
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold', textColor: DOC_COLORS.ink },
        1: { cellWidth: tableInnerWidth - 40 - 20 - 26 - 30 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: DOC_COLORS.ink }
      },
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalPaid = invoice.total_paid || 0;
    const balance = (invoice.total || 0) - totalPaid;
    const hasPayments = totalPaid > 0;
    const hasShipping = (invoice.shipping_cost || 0) > 0;

    const totalsRows: TotalsRow[] = [
      { label: 'Subtotal', value: formatCurrency(invoice.subtotal || invoice.total || 0) },
    ];
    if (hasShipping) {
      totalsRows.push({ label: 'Shipping', value: formatCurrency(invoice.shipping_cost || 0) });
    }
    if (hasPayments) {
      totalsRows.push({ label: 'Less Deposit', value: `(${formatCurrency(totalPaid)})` });
    }

    finalY = ensureRoom(doc, finalY, totalsRows.length * 9 + 16);
    drawTotals(doc, finalY + 5, {
      rows: totalsRows,
      grandLabel: 'BALANCE DUE',
      grandValue: formatCurrency(hasPayments ? balance : (invoice.total || 0)),
      width: 85,
    });

    drawFooter(doc);

    return doc.output("datauristring").split(",")[1];
  };

  const formattedDueDate = invoice?.due_date
    ? formatDocDate(invoice.due_date, "long")
    : "Upon Receipt";

  const formattedAmount = formatCurrency(invoice?.total || 0);


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

      const additionalAttachmentsData = additionalAttachments.map((attachment) => ({
        filename: attachment.file.name,
        content: attachment.base64,
      }));

      const { data, error } = await supabase.functions.invoke('send-invoice-notice', {
        body: {
          noticeType,
          recipientEmails: emails,
          senderEmail: senderEmail || 'info@vibepkg.com',
          invoiceNumber: invoice.invoice_number,
          dueDate: invoice.due_date,
          totalAmount: invoice.total || 0,
          customerName: customerDisplayName,
          portalUrl,
          pdfBase64,
          pdfFilename,
          customSubject: editableSubject,
          customBody: editableBody,
          additionalAttachments: additionalAttachmentsData.length > 0 ? additionalAttachmentsData : undefined,
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
      <DialogContent className="flex max-h-[90vh] w-[min(700px,calc(100vw-2rem))] flex-col overflow-y-auto p-0 sm:max-w-[700px]">
        <DialogHeader className="px-6 pt-6">
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col px-6 pb-4">
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

          <TabsContent value="compose" className="mt-4 pr-1">
            <div className="space-y-4 pb-2">
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
                  {isBilled ? "Billed â€“ Net 30" : "Payment Due"}
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

            {/* Editable Subject */}
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={editableSubject}
                onChange={(e) => setEditableSubject(e.target.value)}
                placeholder="Email subject line"
              />
            </div>

            {/* Editable Body */}
              <div className="space-y-2">
              <Label>Email Body</Label>
              <Textarea
                value={editableBody}
                onChange={(e) => setEditableBody(e.target.value)}
                placeholder="Email body text"
                  className="min-h-[320px] resize-y"
              />
              <p className="text-xs text-muted-foreground">The invoice details card, &quot;View in Portal&quot; button, and footer will be included automatically below your message.</p>
            </div>

            {/* Attachments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Attachments</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
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

              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
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

                {additionalAttachments.map((attachment) => (
                  <div key={attachment.file.name} className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm" title={attachment.file.name}>
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
              </div>

              <p className="text-xs text-muted-foreground">
                {attachPdf ? 'Invoice PDF will be included.' : 'Invoice PDF is currently excluded.'}
                {additionalAttachments.length > 0 ? ` ${additionalAttachments.length} extra file${additionalAttachments.length > 1 ? 's' : ''} added â€¢ Total ${formatFileSize(additionalAttachments.reduce((sum, attachment) => sum + attachment.file.size, 0))}` : ' Add extra files if needed.'}
              </p>
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
              </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-background">
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
                    <span className="text-sm font-medium">{editableSubject}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">Attach:</span>
                    <div className="flex flex-col gap-1">
                      {attachPdf && (
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-3 w-3" />
                          <span className="text-sm">Invoice-{invoice?.invoice_number}.pdf</span>
                        </div>
                      )}
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
                  {/* Header Banner */}
                  <div className={`rounded-t-lg p-6 text-center ${isBilled ? 'bg-blue-600' : 'bg-red-600'} text-white`}>
                    <h2 className="text-lg font-bold">
                      {isBilled ? "Invoice Ready for Payment" : "Payment Due Reminder"}
                    </h2>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-4 border-x">
                    {editableBody.split('\n').map((line, i) => (
                      <p key={i} className="text-sm">{line || '\u00A0'}</p>
                    ))}

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
                    <p className="text-xs text-destructive font-semibold">âš ï¸ Please do not reply to this email â€” this mailbox is not monitored.</p>
                    <p className="text-sm text-muted-foreground">Questions? Contact us at <span className="text-primary">{senderEmail}</span></p>
                    <p className="text-xs text-muted-foreground">Â© {new Date().getFullYear()} VibePKG. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Separator className="mt-2" />

        <DialogFooter className="px-6 py-4">
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
