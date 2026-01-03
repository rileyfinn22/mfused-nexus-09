import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Mail, Plus, Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const addEmail = () => {
    const email = currentEmail.trim().toLowerCase();
    if (!email) return;
    
    // Basic email validation
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
    
    // Header
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235);
    doc.text("VibePKG", 20, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text("Premium Packaging Solutions", 20, 32);
    
    // Invoice title
    doc.setFontSize(20);
    doc.setTextColor(17, 24, 39);
    doc.text("INVOICE", 150, 25);
    
    // Invoice details
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 150, 35);
    doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, 150, 42);
    if (invoice.due_date) {
      doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, 150, 49);
    }
    
    // Customer info
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("Bill To:", 20, 55);
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(order?.shipping_name || "Customer", 20, 62);
    doc.text(order?.shipping_street || "", 20, 69);
    doc.text(`${order?.shipping_city || ""}, ${order?.shipping_state || ""} ${order?.shipping_zip || ""}`, 20, 76);
    
    // Items table
    const tableData = items.map((item) => [
      item.sku,
      item.name,
      item.quantity || item.shipped_quantity || 0,
      formatCurrency(item.unit_price || 0),
      formatCurrency((item.quantity || item.shipped_quantity || 0) * (item.unit_price || 0)),
    ]);
    
    autoTable(doc, {
      startY: 90,
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
    
    // Totals
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
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont(undefined, "normal");
    doc.text("Thank you for your business!", 105, 280, { align: "center" });
    doc.text("VibePKG - app.vibepkg.com", 105, 286, { align: "center" });
    
    // Convert to base64
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
      // Generate PDF
      const pdfBase64 = await generatePdfBase64();
      
      // Send via edge function
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: invoice.id,
          recipientEmails: emails,
          senderName,
          senderEmail,
          customMessage: customMessage.trim() || undefined,
          pdfBase64,
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
      
      // Reset and close
      setEmails([]);
      setCustomMessage("");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Invoice via Email
          </DialogTitle>
          <DialogDescription>
            Send invoice {invoice?.invoice_number} to your customer
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
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
          
          {/* Email Recipients */}
          <div className="space-y-2">
            <Label>Send to</Label>
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
          
          {/* Custom Message */}
          <div className="space-y-2">
            <Label>Custom message (optional)</Label>
            <Textarea
              placeholder="Add a personal note to include in the email..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
            />
          </div>
          
          {/* Sender Info */}
          <div className="bg-muted/30 rounded-lg p-3 text-sm">
            <p className="text-muted-foreground">
              This email will be sent from: <span className="font-medium text-foreground">{senderName} ({senderEmail})</span>
            </p>
          </div>
        </div>
        
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
