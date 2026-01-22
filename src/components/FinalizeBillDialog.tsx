import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Package, Truck } from "lucide-react";

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
}

interface FinalizeBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorPO: any;
  poItems: POItem[];
  onSuccess: () => void;
}

export function FinalizeBillDialog({ open, onOpenChange, vendorPO, poItems, onSuccess }: FinalizeBillDialogProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<(POItem & { editedQty: number; editedCost: number })[]>([]);
  const [shippingCost, setShippingCost] = useState<string>("");

  useEffect(() => {
    if (open && poItems) {
      setItems(poItems.map(item => ({
        ...item,
        editedQty: item.final_quantity ?? item.shipped_quantity ?? item.quantity,
        editedCost: item.final_unit_cost ?? item.unit_cost
      })));
      // Check for existing shipping line item
      const existingShipping = poItems.find(item => item.sku === 'SHIPPING');
      if (existingShipping) {
        setShippingCost(String(existingShipping.total || 0));
      } else {
        setShippingCost("");
      }
    }
  }, [open, poItems]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const updateItem = (itemId: string, field: 'editedQty' | 'editedCost', value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: parseFloat(value) || 0 };
      }
      return item;
    }));
  };

  // Calculate totals
  const productItems = items.filter(item => item.sku !== 'SHIPPING');
  const subtotal = productItems.reduce((sum, item) => sum + (item.editedQty * item.editedCost), 0);
  const shippingAmount = parseFloat(shippingCost) || 0;
  const finalTotal = subtotal + shippingAmount;

  // Compare to original
  const originalTotal = vendorPO?.total || 0;
  const difference = finalTotal - originalTotal;

  const handleFinalize = async () => {
    try {
      setLoading(true);

      // Update each item with final values
      for (const item of productItems) {
        const { error } = await supabase
          .from('vendor_po_items')
          .update({
            final_quantity: item.editedQty,
            final_unit_cost: item.editedCost
          })
          .eq('id', item.id);

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
        title: "Bill Finalized",
        description: `Final bill amount: ${formatCurrency(finalTotal)}`
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error finalizing bill:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to finalize bill",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!vendorPO) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Finalize Bill - {vendorPO.po_number}
          </DialogTitle>
          <DialogDescription>
            Update shipped quantities and actual costs to create the final bill amount.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Items Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Original Qty</TableHead>
                  <TableHead className="text-center">Shipped Qty</TableHead>
                  <TableHead className="text-right">Original Cost</TableHead>
                  <TableHead className="text-right">Final Cost</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.name}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {item.quantity}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={item.editedQty}
                        onChange={(e) => updateItem(item.id, 'editedQty', e.target.value)}
                        className="w-20 text-center mx-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ${Number(item.unit_cost).toFixed(3)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={item.editedCost}
                        onChange={(e) => updateItem(item.id, 'editedCost', e.target.value)}
                        className="w-24 text-right ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.editedQty * item.editedCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
              <span className="font-semibold">Final Bill Total</span>
              <span className="text-xl font-bold">{formatCurrency(finalTotal)}</span>
            </div>
            {difference !== 0 && (
              <div className={`flex justify-between text-sm pt-2 ${difference > 0 ? 'text-destructive' : 'text-success'}`}>
                <span>Difference from Original</span>
                <span>{difference > 0 ? '+' : ''}{formatCurrency(difference)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleFinalize} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finalize Bill
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
