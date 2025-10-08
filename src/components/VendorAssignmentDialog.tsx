import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";

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
  assigned: boolean;
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
          assigned: true
        };
      }
    });
    setAssignments(existing);
  };

  const generatePONumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `VP-${timestamp}-${random}`;
  };

  const handleAssignSingle = async (itemId: string) => {
    const assignment = assignments[itemId];
    if (!assignment?.vendorId || !assignment?.vendorCost) {
      toast({
        title: "Missing Information",
        description: "Please select a vendor and enter a cost",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const item = orderItems.find(i => i.id === itemId);
      if (!item) throw new Error("Item not found");

      // Get order and company info
      const { data: order } = await supabase
        .from('orders')
        .select('company_id, order_number')
        .eq('id', orderId)
        .single();

      if (!order) throw new Error("Order not found");

      // Update order item with vendor info
      const { error: itemError } = await supabase
        .from('order_items')
        .update({
          vendor_id: assignment.vendorId,
          vendor_cost: parseFloat(assignment.vendorCost)
        })
        .eq('id', itemId);

      if (itemError) throw itemError;

      // Check if vendor PO exists for this vendor and order
      let vendorPO;
      const { data: existingPO } = await supabase
        .from('vendor_pos')
        .select('*')
        .eq('order_id', orderId)
        .eq('vendor_id', assignment.vendorId)
        .maybeSingle();

      if (existingPO) {
        vendorPO = existingPO;
        // Update total
        const newTotal = Number(existingPO.total) + (parseFloat(assignment.vendorCost) * item.quantity);
        await supabase
          .from('vendor_pos')
          .update({ total: newTotal })
          .eq('id', existingPO.id);
      } else {
        // Create new vendor PO
        const poNumber = generatePONumber();
        const { data: newPO, error: poError } = await supabase
          .from('vendor_pos')
          .insert({
            company_id: order.company_id,
            order_id: orderId,
            vendor_id: assignment.vendorId,
            po_number: poNumber,
            total: parseFloat(assignment.vendorCost) * item.quantity,
            status: 'draft'
          })
          .select()
          .single();

        if (poError) throw poError;
        vendorPO = newPO;
      }

      // Create vendor PO item
      await supabase
        .from('vendor_po_items')
        .insert({
          vendor_po_id: vendorPO.id,
          order_item_id: itemId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unit_cost: parseFloat(assignment.vendorCost),
          total: parseFloat(assignment.vendorCost) * item.quantity
        });

      // Update invoice if it exists
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (invoice) {
        // Recalculate invoice totals including vendor costs
        const { data: allItems } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        if (allItems) {
          const totalCOG = allItems.reduce((sum, i) => {
            return sum + (i.vendor_cost ? Number(i.vendor_cost) * i.quantity : 0);
          }, 0);
          
          await supabase
            .from('invoices')
            .update({ 
              subtotal: invoice.subtotal,
              total: invoice.total
            })
            .eq('id', invoice.id);
        }
      }

      // Mark as assigned
      setAssignments(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], assigned: true }
      }));

      toast({
        title: "Success",
        description: "Vendor assigned and PO created"
      });
    } catch (error: any) {
      console.error("Error assigning vendor:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign vendor",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    onSuccess();
    onOpenChange(false);
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
      <DialogContent className="max-w-7xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Assign Vendors & Costs</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select vendor and cost for each product. PO numbers will be auto-generated.
            </p>
            
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-sm">SKU</th>
                      <th className="text-left p-3 font-medium text-sm">Product</th>
                      <th className="text-center p-3 font-medium text-sm">Qty</th>
                      <th className="text-right p-3 font-medium text-sm">Sale Price</th>
                      <th className="text-left p-3 font-medium text-sm w-48">Vendor</th>
                      <th className="text-left p-3 font-medium text-sm w-32">Cost</th>
                      <th className="text-center p-3 font-medium text-sm w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-sm font-mono">{item.sku}</td>
                        <td className="p-3 text-sm">{item.name}</td>
                        <td className="p-3 text-sm text-center">{item.quantity}</td>
                        <td className="p-3 text-sm text-right">${item.unit_price}</td>
                        <td className="p-3">
                          <Select
                            value={assignments[item.id]?.vendorId || ''}
                            onValueChange={(value) => updateAssignment(item.id, 'vendorId', value)}
                            disabled={assignments[item.id]?.assigned}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {vendors.map((vendor) => (
                                <SelectItem key={vendor.id} value={vendor.id}>
                                  {vendor.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={assignments[item.id]?.vendorCost || ''}
                            onChange={(e) => updateAssignment(item.id, 'vendorCost', e.target.value)}
                            disabled={assignments[item.id]?.assigned}
                            className="h-9"
                          />
                        </td>
                        <td className="p-3 text-center">
                          {assignments[item.id]?.assigned ? (
                            <div className="flex items-center justify-center text-green-600">
                              <CheckCircle className="h-5 w-5" />
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleAssignSingle(item.id)}
                              disabled={saving || !assignments[item.id]?.vendorId || !assignments[item.id]?.vendorCost}
                              className="h-8 px-3"
                            >
                              Assign
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button 
                onClick={handleSaveAll}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};