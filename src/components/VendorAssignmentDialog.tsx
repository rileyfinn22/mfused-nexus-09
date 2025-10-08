import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface VendorAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderItems: any[];
  onSuccess: () => void;
}

interface ItemAssignment {
  vendorId: string;
  vendorCost: string;
  vendorPO: string;
}

export const VendorAssignmentDialog = ({ 
  open, 
  onOpenChange, 
  orderId, 
  orderItems,
  onSuccess 
}: VendorAssignmentDialogProps) => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ItemAssignment>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVendors();
      loadExistingAssignments();
    }
  }, [open, orderItems]);

  const fetchVendors = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .order('name');
    
    if (data) {
      setVendors(data);
    }
    setLoading(false);
  };

  const loadExistingAssignments = () => {
    const existing: Record<string, ItemAssignment> = {};
    orderItems.forEach(item => {
      if (item.vendor_id) {
        existing[item.id] = {
          vendorId: item.vendor_id,
          vendorCost: item.vendor_cost?.toString() || '',
          vendorPO: item.vendor_po_number || ''
        };
      }
    });
    setAssignments(existing);
  };

  const handleSaveAssignments = async () => {
    setSaving(true);
    
    try {
      // Update each order item with vendor information
      for (const [itemId, assignment] of Object.entries(assignments)) {
        if (!assignment.vendorId) continue;

        const { error } = await supabase
          .from('order_items')
          .update({
            vendor_id: assignment.vendorId,
            vendor_cost: assignment.vendorCost ? parseFloat(assignment.vendorCost) : null,
            vendor_po_number: assignment.vendorPO || null
          })
          .eq('id', itemId);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Vendor assignments saved successfully"
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving vendor assignments:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save vendor assignments",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateAssignment = (itemId: string, field: keyof ItemAssignment, value: string) => {
    setAssignments(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Vendors & Costs to Products</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Assign vendor, cost, and PO number for each product in this order.
            </p>
            
            {orderItems.map((item) => (
              <div key={item.id} className="p-4 border rounded-lg space-y-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {item.sku} • Qty: {item.quantity} • Customer Price: ${item.unit_price}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Vendor</Label>
                    <Select
                      value={assignments[item.id]?.vendorId || ''}
                      onValueChange={(value) => updateAssignment(item.id, 'vendorId', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Vendor Cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={assignments[item.id]?.vendorCost || ''}
                      onChange={(e) => updateAssignment(item.id, 'vendorCost', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vendor PO#</Label>
                    <Input
                      placeholder="PO Number"
                      value={assignments[item.id]?.vendorPO || ''}
                      onChange={(e) => updateAssignment(item.id, 'vendorPO', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveAssignments}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Vendor Assignments
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};