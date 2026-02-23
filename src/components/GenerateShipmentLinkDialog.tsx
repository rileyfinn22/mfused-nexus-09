import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";

interface GenerateShipmentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderIds: string[];
  companyId: string;
}

export function GenerateShipmentLinkDialog({
  open,
  onOpenChange,
  orderIds,
  companyId,
}: GenerateShipmentLinkDialogProps) {
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("shipment_share_links")
        .insert({
          company_id: companyId,
          created_by: user.id,
          order_ids: orderIds,
          label: label.trim() || null,
          expires_at: new Date(expiresAt + "T23:59:59Z").toISOString(),
        })
        .select("token")
        .single();

      if (error) throw error;

      const link = `https://vibepkgportal.lovable.app/shipment-update?token=${data.token}`;
      setGeneratedLink(link);
      toast({ title: "Link Generated", description: "Share this link with your vendor." });
    } catch (err: any) {
      console.error("Error generating link:", err);
      toast({ title: "Error", description: "Failed to generate link", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast({ title: "Copied!", description: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setLabel("");
      setExpiresAt(format(addDays(new Date(), 30), "yyyy-MM-dd"));
      setGeneratedLink(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Generate Shipment Update Link
          </DialogTitle>
          <DialogDescription>
            Create a shareable link for {orderIds.length} order{orderIds.length > 1 ? "s" : ""}. Vendors can update carrier, tracking, and ETA without logging in.
          </DialogDescription>
        </DialogHeader>

        {!generatedLink ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  placeholder="e.g. Feb Shipment - Factory A"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Generate Link
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Input value={generatedLink} readOnly className="text-xs" />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link expires on {format(new Date(expiresAt), "MMM d, yyyy")}. You can deactivate it anytime.
            </p>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
