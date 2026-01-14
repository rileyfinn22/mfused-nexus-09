import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface BulkPriceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderItems: any[];
  onSuccess: () => void;
}

interface ItemPrice {
  unitPrice: string;
  updated: boolean;
  originalPrice: number;
}

export const BulkPriceEditDialog = ({
  open,
  onOpenChange,
  orderId,
  orderItems,
  onSuccess
}: BulkPriceEditDialogProps) => {
  const [prices, setPrices] = useState<Record<string, ItemPrice>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState<string>("");
  const [freshOrderItems, setFreshOrderItems] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      refetchOrderItems();
    }
  }, [open]);

  const refetchOrderItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('line_number', { ascending: true, nullsFirst: false });

    if (data) {
      // Sort to match the original orderItems order
      const sortedData = data.sort((a, b) => {
        const indexA = orderItems.findIndex(item => item.id === a.id);
        const indexB = orderItems.findIndex(item => item.id === b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });

      setFreshOrderItems(sortedData);
      loadExistingPrices(sortedData);
    }
    setLoading(false);
  };

  const loadExistingPrices = (items: any[]) => {
    const existing: Record<string, ItemPrice> = {};
    items.forEach(item => {
      existing[item.id] = {
        unitPrice: item.unit_price?.toString() || '0',
        updated: false,
        originalPrice: item.unit_price || 0
      };
    });
    setPrices(existing);
  };

  const handleUpdateSingle = async (itemId: string) => {
    const itemPrice = prices[itemId];
    if (!itemPrice?.unitPrice) {
      toast({
        title: "Missing Price",
        description: "Please enter a price",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error("Item not found");

      const newPrice = parseFloat(itemPrice.unitPrice);
      const newTotal = item.quantity * newPrice;

      // Update order item
      const { error } = await supabase
        .from('order_items')
        .update({
          unit_price: newPrice,
          total: newTotal
        })
        .eq('id', itemId);

      if (error) throw error;

      // Recalculate order totals
      await recalculateOrderTotals();

      setPrices(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], updated: true, originalPrice: newPrice }
      }));

      toast({
        title: "Success",
        description: "Price updated successfully"
      });
    } catch (error: any) {
      console.error("Error updating price:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update price",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one product",
        variant: "destructive"
      });
      return;
    }

    if (!bulkPrice) {
      toast({
        title: "Missing Price",
        description: "Please enter a price",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;
      const newPrice = parseFloat(bulkPrice);

      for (const itemId of Array.from(selectedItems)) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;

        const newTotal = item.quantity * newPrice;

        await supabase
          .from('order_items')
          .update({
            unit_price: newPrice,
            total: newTotal
          })
          .eq('id', itemId);

        setPrices(prev => ({
          ...prev,
          [itemId]: { unitPrice: bulkPrice, updated: true, originalPrice: newPrice }
        }));
      }

      // Recalculate order totals
      await recalculateOrderTotals();

      // Refetch to update UI
      await refetchOrderItems();

      toast({
        title: "Success",
        description: `Updated prices for ${selectedItems.size} item(s)`
      });

      setSelectedItems(new Set());
      setBulkPrice("");
    } catch (error: any) {
      console.error("Error bulk updating prices:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update prices",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const recalculateOrderTotals = async () => {
    // Fetch fresh order items to calculate totals
    const { data: freshItems } = await supabase
      .from('order_items')
      .select('quantity, unit_price')
      .eq('order_id', orderId);

    if (freshItems) {
      const newSubtotal = freshItems.reduce(
        (sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)),
        0
      );

      // Get current order for tax
      const { data: order } = await supabase
        .from('orders')
        .select('tax, shipping_cost')
        .eq('id', orderId)
        .single();

      const newTotal = newSubtotal + Number(order?.tax || 0);

      await supabase
        .from('orders')
        .update({
          subtotal: newSubtotal,
          total: newTotal
        })
        .eq('id', orderId);

      // Update blanket invoice if exists
      const { data: blanketInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .eq('invoice_type', 'blanket')
        .is('deleted_at', null)
        .maybeSingle();

      if (blanketInvoice) {
        await supabase
          .from('invoices')
          .update({
            subtotal: newSubtotal,
            total: newTotal + Number(order?.shipping_cost || 0)
          })
          .eq('id', blanketInvoice.id);
      }
    }
  };

  const updatePrice = (itemId: string, value: string) => {
    setPrices(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        unitPrice: value,
        updated: false
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

  const handleDone = () => {
    onSuccess();
    onOpenChange(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const items = freshOrderItems.length > 0 ? freshOrderItems : orderItems;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Edit Customer Prices</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk Update Section */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="font-medium mb-3">Bulk Price Update</h3>
              <div className="flex items-end gap-3">
                <div className="w-48">
                  <label className="text-sm font-medium mb-1.5 block">Unit Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleBulkUpdate}
                  disabled={saving || selectedItems.size === 0 || !bulkPrice}
                  className="px-8"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Update ${selectedItems.size} Selected`}
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
                          checked={selectedItems.size === items.length && items.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left p-3 font-medium text-sm">SKU</th>
                      <th className="text-left p-3 font-medium text-sm">Product</th>
                      <th className="text-center p-3 font-medium text-sm">Qty</th>
                      <th className="text-right p-3 font-medium text-sm">Original Price</th>
                      <th className="text-left p-3 font-medium text-sm w-40">New Price</th>
                      <th className="text-right p-3 font-medium text-sm">New Total</th>
                      <th className="text-center p-3 font-medium text-sm w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const currentPrice = prices[item.id]?.unitPrice || '0';
                      const newTotal = item.quantity * parseFloat(currentPrice || '0');
                      const hasChanged = parseFloat(currentPrice) !== prices[item.id]?.originalPrice;

                      return (
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
                          <td className="p-3 text-sm text-right text-muted-foreground">
                            {formatCurrency(prices[item.id]?.originalPrice || 0)}
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={currentPrice}
                              onChange={(e) => updatePrice(item.id, e.target.value)}
                              className="h-9"
                            />
                          </td>
                          <td className="p-3 text-sm text-right font-medium">
                            {formatCurrency(newTotal)}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateSingle(item.id)}
                              disabled={saving || !hasChanged}
                              className="h-8 px-3"
                              variant={hasChanged ? "default" : "secondary"}
                            >
                              {prices[item.id]?.updated && !hasChanged ? "Updated" : "Update"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
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
                onClick={handleDone}
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
