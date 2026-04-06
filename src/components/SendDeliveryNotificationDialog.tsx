import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, X, Plus, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LegInfo {
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  leg_type: string | null;
  origin: string | null;
  destination: string | null;
  actual_arrival: string | null;
}

interface SendDeliveryNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  companyId: string;
  leg: LegInfo;
}

export function SendDeliveryNotificationDialog({
  open,
  onOpenChange,
  orderNumber,
  customerName,
  customerEmail,
  companyId,
  leg,
}: SendDeliveryNotificationDialogProps) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Pre-populate defaults
    setSubject(`✅ Order ${orderNumber} — Shipment Delivered`);

    const arrivalStr = leg.actual_arrival
      ? new Date(leg.actual_arrival).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "recently";

    setBody(
      `Dear ${customerName},\n\nGreat news! Your shipment for order ${orderNumber} has been delivered${leg.actual_arrival ? ` on ${arrivalStr}` : ""}.\n\nIf you have any questions about your delivery, please don't hesitate to reach out.`
    );

    // Pre-fill recipients
    const initialEmails: string[] = [];
    if (customerEmail) initialEmails.push(customerEmail);
    setRecipients(initialEmails);

    // Also fetch company emails
    if (companyId) {
      supabase
        .from("company_emails")
        .select("email")
        .eq("company_id", companyId)
        .then(({ data }) => {
          if (data) {
            const emails = data.map((e) => e.email).filter((e) => !initialEmails.includes(e));
            if (emails.length > 0) {
              setRecipients((prev) => [...new Set([...prev, ...emails])]);
            }
          }
        });
    }
  }, [open, orderNumber, customerName, customerEmail, companyId, leg]);

  const addRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (!recipients.includes(email)) {
      setRecipients((prev) => [...prev, email]);
    }
    setNewRecipient("");
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
  };

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast({ title: "Add at least one recipient", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-delivery-notification",
        {
          body: {
            recipientEmails: recipients,
            senderEmail: "accounting@vibepkg.com",
            orderNumber,
            customerName,
            carrier: leg.carrier,
            trackingNumber: leg.tracking_number,
            trackingUrl: leg.tracking_url,
            legType: leg.leg_type,
            origin: leg.origin,
            destination: leg.destination,
            arrivalDate: leg.actual_arrival,
            customSubject: subject,
            customBody: body,
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Delivery notification sent!" });
      onOpenChange(false);
    } catch (err: any) {
      console.error("Send delivery notification error:", err);
      toast({
        title: "Failed to send notification",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-green-600" />
            Send Delivery Notification
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipients */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recipients.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button onClick={() => removeRecipient(email)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add email..."
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={addRecipient}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tracking info summary */}
          {(leg.carrier || leg.tracking_number) && (
            <div className="rounded-lg border border-green-200 bg-green-50/50 dark:bg-green-950/20 p-3 space-y-1 text-sm">
              <p className="font-medium text-green-700 dark:text-green-400 text-xs uppercase tracking-wider">
                Tracking Info (auto-included in email)
              </p>
              {leg.carrier && <p className="text-foreground">Carrier: <strong>{leg.carrier}</strong></p>}
              {leg.tracking_number && <p className="text-foreground font-mono text-xs">{leg.tracking_number}</p>}
              {(leg.origin || leg.destination) && (
                <p className="text-muted-foreground">{leg.origin || "—"} → {leg.destination || "—"}</p>
              )}
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
