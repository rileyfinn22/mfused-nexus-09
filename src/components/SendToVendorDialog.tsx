import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
}

interface SendToVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  onSent: () => void;
}

export function SendToVendorDialog({ open, onOpenChange, quoteId, onSent }: SendToVendorDialogProps) {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingVendors, setFetchingVendors] = useState(true);

  useEffect(() => {
    if (open) {
      fetchVendors();
    }
  }, [open]);

  const fetchVendors = async () => {
    setFetchingVendors(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, contact_email')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFetchingVendors(false);
    }
  };

  const handleSend = async () => {
    if (!selectedVendorId) {
      toast({
        title: "Error",
        description: "Please select a vendor",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({
          vendor_id: selectedVendorId,
          vendor_sent_at: new Date().toISOString(),
          vendor_quote_notes: notes || null,
          status: 'vendor_pending'
        })
        .eq('id', quoteId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Quote sent to vendor for pricing",
      });

      onSent();
      onOpenChange(false);
      setSelectedVendorId("");
      setNotes("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to Vendor for Quote</DialogTitle>
          <DialogDescription>
            Select a vendor to request pricing for this quote. The vendor will receive the quote details and can provide their pricing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Vendor</Label>
            {fetchingVendors ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading vendors...
              </div>
            ) : (
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                      {vendor.contact_email && (
                        <span className="text-muted-foreground ml-2 text-sm">
                          ({vendor.contact_email})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes for Vendor (optional)</Label>
            <Textarea
              placeholder="Add any special instructions or notes for the vendor..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !selectedVendorId}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to Vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
