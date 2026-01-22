import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Package, Truck, Plus, Trash2 } from "lucide-react";

interface POItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  total: number;
  shipped_quantity?: number;
  final_quantity?: number | null;
  final_unit_cost?: number | null;
  isNew?: boolean;
}

interface UpdateBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorPO: any;
  poItems: POItem[];
  onSuccess: () => void;
}

interface EditableItem extends POItem {
  editedQty: number;
  editedCost: number;
  editedSku: string;
  editedName: string;
  isNew?: boolean;
  tempId?: string;
}

export function UpdateBillDialog({ open, onOpenChange, vendorPO, poItems, onSuccess }: UpdateBillDialogProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [shippingCost, setShippingCost] = useState<string>("");
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  useEffect(() => {
    if (open && poItems) {
      setItems(poItems.map(item => ({
        ...item,
        editedQty: item.final_quantity ?? item.shipped_quantity ?? item.quantity,
        editedCost: item.final_unit_cost ?? item.unit_cost,
        editedSku: item.sku,
        editedName: item.name
      })));
      // Check for existing shipping line item
      const existingShipping = poItems.find(item => item.sku === 'SHIPPING');
      if (existingShipping) {
        setShippingCost(String(existingShipping.total || 0));
      } else {
        setShippingCost("");
      }
      setDeletedItemIds([]);
    }
  }, [open, poItems]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const updateItem = (itemId: string, field: keyof EditableItem, value: string | number) => {
    setItems(prev => prev.map(item => {
      const idMatch = item.isNew ? item.tempId === itemId : item.id === itemId;
      if (idMatch) {
        return { ...item, [field]: typeof value === 'string' ? value : parseFloat(String(value)) || 0 };
      }
      return item;
    }));
  };

  const addNewItem = () => {
    const tempId = `new-${Date.now()}`;
    setItems(prev => [...prev, {
      id: '',
      tempId,
      sku: '',
      name: '',
      quantity: 0,
      unit_cost: 0,
      total: 0,
      editedQty: 1,
      editedCost: 0,
      editedSku: '',
      editedName: '',
      isNew: true
    }]);
  };

  const removeItem = (itemId: string, isNew?: boolean) => {
    if (isNew) {
      setItems(prev => prev.filter(item => item.tempId !== itemId));
    } else {
      setItems(prev => prev.filter(item => item.id !== itemId));
      setDeletedItemIds(prev => [...prev, itemId]);
    }
  };

  // Calculate totals
  const productItems = items.filter(item => item.editedSku !== 'SHIPPING' && item.sku !== 'SHIPPING');
  const subtotal = productItems.reduce((sum, item) => sum + (item.editedQty * item.editedCost), 0);
  const shippingAmount = parseFloat(shippingCost) || 0;
  const finalTotal = subtotal + shippingAmount;

  // Compare to original
  const originalTotal = vendorPO?.total || 0;
  const difference = finalTotal - originalTotal;

  const handleSave = async () => {
    try {
      setLoading(true);

      // Delete removed items
      for (const itemId of deletedItemIds) {
        await supabase
          .from('vendor_po_items')
          .delete()
          .eq('id', itemId);
      }

      // Update existing items with final values
      for (const item of productItems.filter(i => !i.isNew)) {
        const { error } = await supabase
          .from('vendor_po_items')
          .update({
            sku: item.editedSku,
            name: item.editedName,
            quantity: item.editedQty,
            unit_cost: item.editedCost,
            total: item.editedQty * item.editedCost,
            final_quantity: item.editedQty,
            final_unit_cost: item.editedCost
          })
          .eq('id', item.id);

        if (error) throw error;
      }

      // Insert new items
      const newItems = productItems.filter(i => i.isNew && i.editedSku.trim());
      for (const item of newItems) {
        const { error } = await supabase
          .from('vendor_po_items')
          .insert({
            vendor_po_id: vendorPO.id,
            sku: item.editedSku,
            name: item.editedName,
            quantity: item.editedQty,
            unit_cost: item.editedCost,
            total: item.editedQty * item.editedCost,
            shipped_quantity: item.editedQty,
            final_quantity: item.editedQty,
            final_unit_cost: item.editedCost
          });

        if (error) throw error;
      }

      // Handle shipping cost
      const existingShipping = poItems.find(item => item.sku === 'SHIPPING');
      
      if (shippingAmount > 0) {
        if (existingShipping) {
          // Update existing shipping line
          await supabase
            .from('vendor_po_items')
            .update({
              quantity: 1,
              unit_cost: shippingAmount,
              total: shippingAmount,
              final_quantity: 1,
              final_unit_cost: shippingAmount
            })
            .eq('id', existingShipping.id);
        } else {
          // Create new shipping line item
          await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: vendorPO.id,
              sku: 'SHIPPING',
              name: 'Shipping & Freight',
              quantity: 1,
              unit_cost: shippingAmount,
              total: shippingAmount,
              shipped_quantity: 1,
              final_quantity: 1,
              final_unit_cost: shippingAmount,
              item_type: 'shipping'
            });
        }
      } else if (existingShipping && shippingAmount === 0) {
        // Remove shipping if zeroed out
        await supabase
          .from('vendor_po_items')
          .delete()
          .eq('id', existingShipping.id);
      }

      // Update vendor PO with final total
      const { error: poError } = await supabase
        .from('vendor_pos')
        .update({
          final_total: finalTotal,
          status: vendorPO.status === 'draft' ? 'unpaid' : vendorPO.status
        })
        .eq('id', vendorPO.id);

      if (poError) throw poError;

      toast({
        title: "Bill Updated",
        description: `Bill total: ${formatCurrency(finalTotal)}`
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating bill:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update bill",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!vendorPO) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Update Bill - {vendorPO.po_number}
          </DialogTitle>
          <DialogDescription>
            Edit line items, add new products, and update costs for the bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Items Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center w-[100px]">Qty</TableHead>
                  <TableHead className="text-right w-[120px]">Unit Cost</TableHead>
                  <TableHead className="text-right w-[120px]">Line Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productItems.map((item) => {
                  const itemKey = item.isNew ? item.tempId! : item.id;
                  return (
                    <TableRow key={itemKey}>
                      <TableCell>
                        <Input
                          value={item.editedSku}
                          onChange={(e) => updateItem(itemKey, 'editedSku', e.target.value)}
                          placeholder="SKU"
                          className="font-mono text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.editedName}
                          onChange={(e) => updateItem(itemKey, 'editedName', e.target.value)}
                          placeholder="Description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.editedQty}
                          onChange={(e) => updateItem(itemKey, 'editedQty', e.target.value)}
                          className="w-20 text-center mx-auto"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.editedCost}
                          onChange={(e) => updateItem(itemKey, 'editedCost', e.target.value)}
                          className="w-24 text-right ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.editedQty * item.editedCost)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeItem(itemKey, item.isNew)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {productItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No line items. Click "Add Line Item" to add products.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Add Item Button */}
          <Button variant="outline" onClick={addNewItem} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Line Item
          </Button>

          {/* Shipping Cost */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="shipping" className="font-medium">Shipping & Freight</Label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                id="shipping"
                type="number"
                step="0.01"
                min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0.00"
                className="w-32 text-right"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="space-y-2 p-4 bg-secondary/20 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal (Products)</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping & Freight</span>
              <span>{formatCurrency(shippingAmount)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="font-semibold">Bill Total</span>
              <span className="text-xl font-bold">{formatCurrency(finalTotal)}</span>
            </div>
            {difference !== 0 && (
              <div className={`flex justify-between text-sm pt-2 ${difference > 0 ? 'text-destructive' : 'text-success'}`}>
                <span>Difference from Original PO</span>
                <span>{difference > 0 ? '+' : ''}{formatCurrency(difference)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Bill
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
