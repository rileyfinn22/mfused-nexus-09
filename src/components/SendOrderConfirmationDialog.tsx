import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, Mail, Plus, Send, Loader2, Eye, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VIBE_COMPANY } from "@/lib/pdfBranding";
import { generateOrderConfirmationPdf } from "@/lib/orderConfirmationPdf";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatDocDate } from "@/lib/utils";

interface SendOrderConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  items: any[];
  senderName: string;
  senderEmail: string;
}

export function SendOrderConfirmationDialog({
  open, onOpenChange, order, items, senderName, senderEmail,
}: SendOrderConfirmationDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [companyEmails, setCompanyEmails] = useState<{ email: string; label: string | null }[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch email history + company emails
  useEffect(() => {
    const fetchEmails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (roleData?.company_id) {
        setCompanyId(roleData.company_id);

        // Fetch email history
        const { data: historyData } = await supabase
          .from("sent_email_history")
          .select("email")
          .eq("company_id", roleData.company_id)
          .order("last_used_at", { ascending: false })
          .limit(50);

        if (historyData) {
          setEmailHistory(historyData.map((h) => h.email));
        }
      }

      // Fetch company emails for the order's company
      if (order?.company_id) {
        const { data: compEmails } = await supabase
          .from("company_emails")
          .select("email, label")
          .eq("company_id", order.company_id);

        if (compEmails) setCompanyEmails(compEmails);
      }
    };

    if (open) fetchEmails();
  }, [open, order?.company_id]);

  // Reset state
  useEffect(() => {
    if (open && order) {
      const defaultSubject = `Order Confirmation - ${order.order_number} from ${VIBE_COMPANY.name}`;
      const defaultMessage = `Dear ${order.shipping_name || order.customer_name || "Customer"},

Thank you for your order! Below is a summary of your order with ${VIBE_COMPANY.name}.

Order Number: ${order.order_number}
Order Date: ${formatDocDate(order.order_date, "numeric")}${order.po_number ? `\nPO Number: ${order.po_number}` : ""}

A detailed order confirmation is attached as a PDF.

Thank you for your business!`;

      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setEmails(order?.customer_email ? [order.customer_email] : []);
      setCurrentEmail("");
      setActiveTab("compose");
      setShowEmailSuggestions(false);
    }
  }, [open, order]);

  const saveEmailsToHistory = async (emailsToSave: string[]) => {
    if (!companyId) return;
    for (const email of emailsToSave) {
      await supabase
        .from("sent_email_history")
        .upsert(
          { company_id: companyId, email: email.toLowerCase(), last_used_at: new Date().toISOString(), use_count: 1 },
          { onConflict: "company_id,email", ignoreDuplicates: false }
        );
    }
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

  const removeEmail = (e: string) => setEmails(emails.filter((em) => em !== e));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addEmail(); }
  };

  // All suggestions: company emails + history, de-duped
  const allSuggestions = (() => {
    const set = new Set<string>();
    const result: { email: string; label?: string }[] = [];
    for (const ce of companyEmails) {
      if (!emails.includes(ce.email.toLowerCase()) && (currentEmail.length === 0 || ce.email.toLowerCase().includes(currentEmail.toLowerCase()))) {
        set.add(ce.email.toLowerCase());
        result.push({ email: ce.email, label: ce.label || undefined });
      }
    }
    for (const h of emailHistory) {
      if (!set.has(h) && !emails.includes(h) && (currentEmail.length === 0 || h.includes(currentEmail.toLowerCase()))) {
        result.push({ email: h });
      }
    }
    return result.slice(0, 10);
  })();

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const { blob } = await generateOrderConfirmationPdf(order, items);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.order_number}_confirmation.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSend = async () => {
    if (emails.length === 0) {
      toast({ title: "No recipients", description: "Please add at least one email address", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { base64: pdfBase64 } = await generateOrderConfirmationPdf(order, items);

      const htmlMessage = message
        .split("\n")
        .map((line) => (line.trim() === "" ? "<br/>" : `<p style="margin: 8px 0;">${line}</p>`))
        .join("");

      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: order.id,
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
              <p style="color: #ef4444; font-size: 11px; margin-top: 12px; font-weight: bold;">
                âš ï¸ This email was sent from an unmonitored mailbox. Please do not reply directly to this email.
              </p>
            </div>
          `,
          pdfBase64,
          pdfFilename: `${order.order_number}_confirmation.pdf`,
          invoiceNumber: order.order_number,
          dueDate: null,
          totalAmount: 0,
          customerName: order.customer_name,
        },
      });

      if (error) throw error;

      await saveEmailsToHistory(emails);

      toast({ title: "Confirmation sent!", description: `Sent to ${emails.length} recipient(s)` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Order Confirmation
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="preview">Preview Items</TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4 mt-4">
            {/* Recipients */}
            <div>
              <Label>Recipients</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {emails.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 pr-1">
                    {email}
                    <button onClick={() => removeEmail(email)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Popover open={showEmailSuggestions} onOpenChange={setShowEmailSuggestions}>
                <PopoverTrigger asChild>
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={currentEmail}
                      onChange={(e) => {
                        setCurrentEmail(e.target.value);
                        setShowEmailSuggestions(true);
                      }}
                      onFocus={() => setShowEmailSuggestions(true)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter email address..."
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => addEmail()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </PopoverTrigger>
                {allSuggestions.length > 0 && (
                  <PopoverContent className="p-0 w-[400px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <Command>
                      <CommandList>
                        {companyEmails.length > 0 && (
                          <CommandGroup heading="Company Emails">
                            {allSuggestions
                              .filter((s) => s.label)
                              .map((s) => (
                                <CommandItem key={s.email} onSelect={() => addEmail(s.email)} className="cursor-pointer">
                                  <Mail className="h-3 w-3 mr-2 text-muted-foreground" />
                                  <span>{s.email}</span>
                                  <Badge variant="outline" className="ml-auto text-xs">{s.label}</Badge>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        )}
                        <CommandGroup heading="Recent">
                          {allSuggestions
                            .filter((s) => !s.label)
                            .map((s) => (
                              <CommandItem key={s.email} onSelect={() => addEmail(s.email)} className="cursor-pointer">
                                <Mail className="h-3 w-3 mr-2 text-muted-foreground" />
                                <span>{s.email}</span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                )}
              </Popover>
            </div>

            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div>
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                <FileIcon className="h-3 w-3" />
                {order?.order_number}_confirmation.pdf
              </Badge>
              <span>will be attached automatically</span>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Order #{order?.order_number}</h3>
                  <p className="text-sm text-muted-foreground">{order?.customer_name}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                  {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                  Download PDF
                </Button>
              </div>

              <Separator />

              <ScrollArea className="max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs text-center">Qty</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => (
                      <TableRow key={item.id || i}>
                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm font-mono">{item.sku}</TableCell>
                        <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.description || "â€”"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="text-sm font-medium text-right">
                Total Items: {items.length} | Total Qty: {items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || emails.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Confirmation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small file icon
function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
