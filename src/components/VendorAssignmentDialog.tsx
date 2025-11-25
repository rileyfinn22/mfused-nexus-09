import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";

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
  vendorPoId?: string;
  vendorPoNumber?: string;
}

export const VendorAssignmentDialog = ({ 
  open, 
  onOpenChange, 
  orderId, 
  orderItems,
  onSuccess 
}: VendorAssignmentDialogProps) => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ItemAssignment>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkVendorId, setBulkVendorId] = useState<string>("");
  const [bulkCost, setBulkCost] = useState<string>("");
  const [freshOrderItems, setFreshOrderItems] = useState<any[]>([]);
  const { syncVendorPO, checkConnection } = useQuickBooksAutoSync();

  useEffect(() => {
    if (open) {
      fetchVendors();
      // Reload order items from database to get fresh vendor assignments
      refetchOrderItems();
    }
  }, [open]);

  const refetchOrderItems = async () => {
    console.log('Refetching order items for order:', orderId);
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }); // Maintain consistent order by creation time
    
    console.log('Fetched order items:', data);
    console.log('Fetch error:', error);
    
    if (data) {
      // Sort to match the original orderItems order to prevent scrambling
      const sortedData = data.sort((a, b) => {
        const indexA = orderItems.findIndex(item => item.id === a.id);
        const indexB = orderItems.findIndex(item => item.id === b.id);
        // If both found in original orderItems, use that order
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // If only one found, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // Otherwise maintain database order
        return 0;
      });
      
      setFreshOrderItems(sortedData);
      loadExistingAssignments(sortedData);
    }
  };

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

  const loadExistingAssignments = async (items: any[]) => {
    console.log('Loading existing assignments from items:', items);
    const existing: Record<string, ItemAssignment> = {};
    
    // Fetch vendor POs for this order
    const { data: vendorPOs } = await supabase
      .from('vendor_pos')
      .select('id, po_number, vendor_id')
      .eq('order_id', orderId);
    
    items.forEach(item => {
      console.log('Processing item:', item.id, 'vendor_id:', item.vendor_id, 'vendor_cost:', item.vendor_cost);
      if (item.vendor_id) {
        // Find the vendor PO for this vendor
        const vendorPO = vendorPOs?.find(po => po.vendor_id === item.vendor_id);
        
        existing[item.id] = {
          vendorId: item.vendor_id,
          vendorCost: item.vendor_cost?.toString() || '',
          assigned: true,
          vendorPoId: vendorPO?.id,
          vendorPoNumber: vendorPO?.po_number
        };
      }
    });
    console.log('Final assignments state:', existing);
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
      const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error("Item not found");

      // Get order and company info
      const { data: order } = await supabase
        .from('orders')
        .select('company_id, order_number')
        .eq('id', orderId)
        .single();

      if (!order) throw new Error("Order not found");

      // Check if item was previously assigned to a different vendor
      const oldVendorId = item.vendor_id;
      const isVendorChange = oldVendorId && oldVendorId !== assignment.vendorId;

      // Remove from old vendor's PO if vendor changed
      if (isVendorChange) {
        // Find and delete old vendor PO item
        const { data: oldPOItem } = await supabase
          .from('vendor_po_items')
          .select('id, vendor_po_id, total')
          .eq('order_item_id', itemId)
          .maybeSingle();

        if (oldPOItem) {
          // Delete the old PO item
          await supabase
            .from('vendor_po_items')
            .delete()
            .eq('id', oldPOItem.id);

          // Update old vendor PO total
          const { data: oldPO } = await supabase
            .from('vendor_pos')
            .select('total')
            .eq('id', oldPOItem.vendor_po_id)
            .single();

          if (oldPO) {
            const newOldTotal = Number(oldPO.total) - Number(oldPOItem.total);
            await supabase
              .from('vendor_pos')
              .update({ total: Math.max(0, newOldTotal) })
              .eq('id', oldPOItem.vendor_po_id);
          }
        }
      }

      // Update order item with new vendor info
      const { error: itemError } = await supabase
        .from('order_items')
        .update({
          vendor_id: assignment.vendorId,
          vendor_cost: parseFloat(assignment.vendorCost)
        })
        .eq('id', itemId);

      if (itemError) {
        console.error('Error updating order item:', itemError);
        throw itemError;
      }

      // Check if vendor PO exists for this vendor and order
      let vendorPO;
      const { data: existingPO } = await supabase
        .from('vendor_pos')
        .select('*')
        .eq('order_id', orderId)
        .eq('vendor_id', assignment.vendorId)
        .maybeSingle();

      const newItemTotal = parseFloat(assignment.vendorCost) * item.quantity;

      if (existingPO) {
        vendorPO = existingPO;
        
        // Check if this item already has a vendor PO item entry for this vendor
        const { data: existingPOItem } = await supabase
          .from('vendor_po_items')
          .select('*')
          .eq('vendor_po_id', existingPO.id)
          .eq('order_item_id', itemId)
          .maybeSingle();

        if (existingPOItem) {
          // Update existing item - recalculate adjustment
          const oldItemTotal = Number(existingPOItem.total);
          const totalAdjustment = newItemTotal - oldItemTotal;
          
          await supabase
            .from('vendor_po_items')
            .update({
              unit_cost: parseFloat(assignment.vendorCost),
              total: newItemTotal
            })
            .eq('id', existingPOItem.id);

          // Update PO total
          const newTotal = Number(existingPO.total) + totalAdjustment;
          await supabase
            .from('vendor_pos')
            .update({ total: newTotal })
            .eq('id', existingPO.id);
        } else {
          // Create new PO item for this vendor
          await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: vendorPO.id,
              order_item_id: itemId,
              sku: item.sku,
              name: item.name,
              description: item.description || null,
              quantity: item.quantity,
              shipped_quantity: item.quantity,
              unit_cost: parseFloat(assignment.vendorCost),
              total: newItemTotal
            } as any);

          // Update PO total
          const newTotal = Number(existingPO.total) + newItemTotal;
          await supabase
            .from('vendor_pos')
            .update({ total: newTotal })
            .eq('id', existingPO.id);
        }
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
            total: newItemTotal,
            status: 'draft'
          })
          .select()
          .single();

        if (poError) throw poError;
        vendorPO = newPO;

        // Create vendor PO item
        await supabase
          .from('vendor_po_items')
          .insert({
            vendor_po_id: vendorPO.id,
            order_item_id: itemId,
            sku: item.sku,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            shipped_quantity: item.quantity,
            unit_cost: parseFloat(assignment.vendorCost),
            total: newItemTotal
          } as any);
      }


      // Mark as assigned and save PO info
      setAssignments(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId], 
          assigned: true,
          vendorPoId: vendorPO.id,
          vendorPoNumber: vendorPO.po_number
        }
      }));

      // Refetch order items to show updated vendor assignments
      await refetchOrderItems();

      toast({
        title: "Success",
        description: "Vendor assigned and PO updated"
      });

      // Auto-sync to QuickBooks if connected
      const isConnected = await checkConnection();
      if (isConnected) {
        await syncVendorPO(vendorPO.id);
      }
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

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one product",
        variant: "destructive"
      });
      return;
    }

    if (!bulkVendorId || !bulkCost) {
      toast({
        title: "Missing Information",
        description: "Please select a vendor and enter a cost",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Get order and company info
      const { data: order } = await supabase
        .from('orders')
        .select('company_id, order_number')
        .eq('id', orderId)
        .single();

      if (!order) throw new Error("Order not found");

      // Process each selected item
      const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;
      for (const itemId of Array.from(selectedItems)) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;

        // Check if item was previously assigned to a different vendor
        const oldVendorId = item.vendor_id;
        const isVendorChange = oldVendorId && oldVendorId !== bulkVendorId;

        // Remove from old vendor's PO if vendor changed
        if (isVendorChange) {
          const { data: oldPOItem } = await supabase
            .from('vendor_po_items')
            .select('id, vendor_po_id, total')
            .eq('order_item_id', itemId)
            .maybeSingle();

          if (oldPOItem) {
            await supabase
              .from('vendor_po_items')
              .delete()
              .eq('id', oldPOItem.id);

            const { data: oldPO } = await supabase
              .from('vendor_pos')
              .select('total')
              .eq('id', oldPOItem.vendor_po_id)
              .single();

            if (oldPO) {
              const newOldTotal = Number(oldPO.total) - Number(oldPOItem.total);
              await supabase
                .from('vendor_pos')
                .update({ total: Math.max(0, newOldTotal) })
                .eq('id', oldPOItem.vendor_po_id);
            }
          }
        }

        // Update order item with vendor info
        await supabase
          .from('order_items')
          .update({
            vendor_id: bulkVendorId,
            vendor_cost: parseFloat(bulkCost)
          })
          .eq('id', itemId);

        // Check if vendor PO exists for this vendor and order
        let vendorPO;
        const { data: existingPO } = await supabase
          .from('vendor_pos')
          .select('*')
          .eq('order_id', orderId)
          .eq('vendor_id', bulkVendorId)
          .maybeSingle();

        const newItemTotal = parseFloat(bulkCost) * item.quantity;

        if (existingPO) {
          vendorPO = existingPO;
          
          // Check if this item already has a PO item for this vendor
          const { data: existingPOItem } = await supabase
            .from('vendor_po_items')
            .select('*')
            .eq('vendor_po_id', existingPO.id)
            .eq('order_item_id', itemId)
            .maybeSingle();

          if (existingPOItem) {
            // Update existing item
            const oldItemTotal = Number(existingPOItem.total);
            const totalAdjustment = newItemTotal - oldItemTotal;
            
            await supabase
              .from('vendor_po_items')
              .update({
                unit_cost: parseFloat(bulkCost),
                total: newItemTotal
              })
              .eq('id', existingPOItem.id);

            const newTotal = Number(existingPO.total) + totalAdjustment;
            await supabase
              .from('vendor_pos')
              .update({ total: newTotal })
              .eq('id', existingPO.id);
          } else {
            // Create new PO item
            await supabase
              .from('vendor_po_items')
              .insert({
                vendor_po_id: vendorPO.id,
                order_item_id: itemId,
                sku: item.sku,
                name: item.name,
                description: item.description || null,
                quantity: item.quantity,
                shipped_quantity: item.quantity,
                unit_cost: parseFloat(bulkCost),
                total: newItemTotal
              } as any);

            const newTotal = Number(existingPO.total) + newItemTotal;
            await supabase
              .from('vendor_pos')
              .update({ total: newTotal })
              .eq('id', existingPO.id);
          }
        } else {
          // Create new vendor PO
          const poNumber = generatePONumber();
          const { data: newPO, error: poError } = await supabase
            .from('vendor_pos')
            .insert({
              company_id: order.company_id,
              order_id: orderId,
              vendor_id: bulkVendorId,
              po_number: poNumber,
              total: newItemTotal,
              status: 'draft'
            })
            .select()
            .single();

          if (poError) throw poError;
          vendorPO = newPO;

          // Create vendor PO item
          await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: vendorPO.id,
              order_item_id: itemId,
              sku: item.sku,
              name: item.name,
              description: item.description || null,
              quantity: item.quantity,
              shipped_quantity: item.quantity,
              unit_cost: parseFloat(bulkCost),
              total: newItemTotal
            } as any);
        }

        // Mark as assigned
        setAssignments(prev => ({
          ...prev,
          [itemId]: { 
            vendorId: bulkVendorId,
            vendorCost: bulkCost,
            assigned: true,
            vendorPoId: vendorPO.id,
            vendorPoNumber: vendorPO.po_number
          }
        }));
      }

      // Refetch order items to show updated vendor assignments
      await refetchOrderItems();

      // Clear selections and bulk fields
      setSelectedItems(new Set());
      setBulkVendorId("");
      setBulkCost("");

      toast({
        title: "Success",
        description: `Assigned vendor to ${selectedItems.size} product(s) and updated POs`
      });
    } catch (error: any) {
      console.error("Error bulk assigning vendor:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign vendor",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
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
            {/* Bulk Assignment Section */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="font-medium mb-3">Bulk Assignment</h3>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block">Vendor</label>
                  <Select value={bulkVendorId} onValueChange={setBulkVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor..." />
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
                <div className="w-40">
                  <label className="text-sm font-medium mb-1.5 block">Cost per Unit</label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={bulkCost}
                    onChange={(e) => setBulkCost(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleBulkAssign}
                  disabled={saving || selectedItems.size === 0 || !bulkVendorId || !bulkCost}
                  className="px-8"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Assign to ${selectedItems.size} Selected`}
                </Button>
              </div>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr className="border-b">
                      <th className="text-center p-3 font-medium text-sm w-12">
                        <Checkbox
                          checked={selectedItems.size === (freshOrderItems.length > 0 ? freshOrderItems : orderItems).length && (freshOrderItems.length > 0 ? freshOrderItems : orderItems).length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left p-3 font-medium text-sm">SKU</th>
                      <th className="text-left p-3 font-medium text-sm">Product</th>
                      <th className="text-center p-3 font-medium text-sm">Qty</th>
                      <th className="text-right p-3 font-medium text-sm">Sale Price</th>
                      <th className="text-left p-3 font-medium text-sm w-48">Vendor</th>
                      <th className="text-left p-3 font-medium text-sm w-32">Cost</th>
                      <th className="text-left p-3 font-medium text-sm w-32">Vendor PO</th>
                      <th className="text-center p-3 font-medium text-sm w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(freshOrderItems.length > 0 ? freshOrderItems : orderItems).map((item) => (
                      <tr key={item.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-center">
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                          />
                        </td>
                        <td className="p-3 text-sm font-mono">{item.sku}</td>
                        <td className="p-3 text-sm">{item.name}</td>
                        <td className="p-3 text-sm text-center">{item.quantity}</td>
                        <td className="p-3 text-sm text-right">${item.unit_price}</td>
                        <td className="p-3">
                          <Select
                            value={assignments[item.id]?.vendorId || ''}
                            onValueChange={(value) => {
                              updateAssignment(item.id, 'vendorId', value);
                              // Reset assigned status when vendor changes
                              if (assignments[item.id]?.assigned) {
                                setAssignments(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], assigned: false }
                                }));
                              }
                            }}
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
                            step="0.001"
                            placeholder="0.000"
                            value={assignments[item.id]?.vendorCost || ''}
                            onChange={(e) => {
                              updateAssignment(item.id, 'vendorCost', e.target.value);
                              // Reset assigned status when cost changes
                              if (assignments[item.id]?.assigned) {
                                setAssignments(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], assigned: false }
                                }));
                              }
                            }}
                            className="h-9"
                          />
                        </td>
                        <td className="p-3">
                          {assignments[item.id]?.vendorPoNumber ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => navigate(`/vendor-pos/${assignments[item.id]?.vendorPoId}`)}
                            >
                              {assignments[item.id]?.vendorPoNumber}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => handleAssignSingle(item.id)}
                            disabled={saving || !assignments[item.id]?.vendorId || !assignments[item.id]?.vendorCost}
                            className="h-8 px-3"
                            variant={assignments[item.id]?.assigned ? "secondary" : "default"}
                          >
                            {assignments[item.id]?.assigned ? "Update" : "Assign"}
                          </Button>
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