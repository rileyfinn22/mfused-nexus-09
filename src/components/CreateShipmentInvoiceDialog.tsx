import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CreateShipmentInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  onSuccess: () => void;
}

export function CreateShipmentInvoiceDialog({ open, onOpenChange, order, onSuccess }: CreateShipmentInvoiceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [shippingCost, setShippingCost] = useState("0");
  const [shipmentQuantities, setShipmentQuantities] = useState<{[itemId: string]: number}>({});
  const [availableInventory, setAvailableInventory] = useState<{[sku: string]: any[]}>({});
  const [existingInvoices, setExistingInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (open && order) {
      fetchExistingInvoices();
      fetchAvailableInventory();
      initializeQuantities();
    }
  }, [open, order]);

  const fetchExistingInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', order.id)
      .order('shipment_number');
    
    setExistingInvoices(data || []);
  };

  const fetchAvailableInventory = async () => {
    if (!order.order_items) return;

    const skus = order.order_items.map((item: any) => item.sku);
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .in('sku', skus)
      .eq('company_id', order.company_id)
      .gt('available', 0);
    
    const inventoryBySku: {[sku: string]: any[]} = {};
    data?.forEach(inv => {
      if (!inventoryBySku[inv.sku]) inventoryBySku[inv.sku] = [];
      inventoryBySku[inv.sku].push(inv);
    });
    
    setAvailableInventory(inventoryBySku);
  };

  const initializeQuantities = () => {
    const quantities: {[itemId: string]: number} = {};
    order.order_items?.forEach((item: any) => {
      quantities[item.id] = item.quantity - (item.shipped_quantity || 0);
    });
    setShipmentQuantities(quantities);
  };

  const handleQuantityChange = (itemId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    const item = order.order_items.find((i: any) => i.id === itemId);
    const maxQuantity = item.quantity - (item.shipped_quantity || 0);
    
    setShipmentQuantities(prev => ({
      ...prev,
      [itemId]: Math.min(Math.max(0, numValue), maxQuantity)
    }));
  };

  const handleCreateShipment = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate that at least one item has quantity > 0
      const hasQuantity = Object.values(shipmentQuantities).some(q => q > 0);
      if (!hasQuantity) {
        toast({
          title: "Error",
          description: "Please specify quantities to ship",
          variant: "destructive"
        });
        return;
      }

      // Calculate next shipment number
      const nextShipmentNumber = existingInvoices.length + 1;

      // Calculate invoice totals
      let subtotal = 0;
      const itemsToShip = order.order_items.filter((item: any) => shipmentQuantities[item.id] > 0);
      
      itemsToShip.forEach((item: any) => {
        const quantity = shipmentQuantities[item.id];
        subtotal += quantity * item.unit_price;
      });

      const tax = order.order_type === 'pull_ship' ? 0 : (subtotal * 0.0825); // 8.25% tax for non-pull_ship
      const shipping = parseFloat(shippingCost) || 0;
      const total = subtotal + tax + shipping;

      // Determine invoice type
      const totalShipped = itemsToShip.reduce((sum: number, item: any) => 
        sum + shipmentQuantities[item.id], 0
      );
      const totalOrdered = order.order_items.reduce((sum: number, item: any) => 
        sum + item.quantity, 0
      );
      const totalPreviouslyShipped = order.order_items.reduce((sum: number, item: any) => 
        sum + (item.shipped_quantity || 0), 0
      );
      
      const invoiceType = (totalShipped + totalPreviouslyShipped >= totalOrdered) ? 'final' : 'partial';
      const billedPercentage = ((totalShipped + totalPreviouslyShipped) / totalOrdered) * 100;

      // Create invoice
      const invoiceNumber = `INV-${order.order_number}-${nextShipmentNumber}`;
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: order.company_id,
          order_id: order.id,
          invoice_number: invoiceNumber,
          shipment_number: nextShipmentNumber,
          invoice_type: invoiceType,
          billed_percentage: billedPercentage,
          status: 'draft',
          subtotal,
          tax,
          shipping_cost: shipping,
          total,
          created_by: user.id
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create inventory allocations and update order items
      for (const item of itemsToShip) {
        const quantityToShip = shipmentQuantities[item.id];
        if (quantityToShip === 0) continue;

        // Update order_items shipped_quantity
        await supabase
          .from('order_items')
          .update({
            shipped_quantity: (item.shipped_quantity || 0) + quantityToShip
          })
          .eq('id', item.id);

        // Allocate from inventory (FIFO)
        let remainingToAllocate = quantityToShip;
        const inventoryLocations = availableInventory[item.sku] || [];
        
        for (const inv of inventoryLocations) {
          if (remainingToAllocate === 0) break;
          
          const allocateQty = Math.min(remainingToAllocate, inv.available);
          
          // Create allocation record
          await supabase
            .from('inventory_allocations')
            .insert({
              order_item_id: item.id,
              inventory_id: inv.id,
              invoice_id: invoice.id,
              quantity_allocated: allocateQty,
              allocated_by: user.id,
              status: 'allocated'
            });

          // Decrease inventory available
          await supabase
            .from('inventory')
            .update({
              available: inv.available - allocateQty
            })
            .eq('id', inv.id);

          remainingToAllocate -= allocateQty;
        }

        if (remainingToAllocate > 0) {
          toast({
            title: "Warning",
            description: `Insufficient inventory for ${item.name}. Allocated ${quantityToShip - remainingToAllocate} of ${quantityToShip}`,
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Shipment Created",
        description: `Invoice ${invoiceNumber} created successfully`
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating shipment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create shipment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment Invoice - {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {existingInvoices.length > 0 && (
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p className="font-medium">Previous Shipments: {existingInvoices.length}</p>
              {existingInvoices.map(inv => (
                <p key={inv.id} className="text-muted-foreground">
                  Shipment {inv.shipment_number}: {inv.invoice_number} - {inv.invoice_type}
                </p>
              ))}
            </div>
          )}

          <div>
            <Label>Items to Ship</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Shipped</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Ship Now</TableHead>
                  <TableHead className="text-right">Available Inv</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.order_items?.map((item: any) => {
                  const shipped = item.shipped_quantity || 0;
                  const remaining = item.quantity - shipped;
                  const availInv = availableInventory[item.sku]?.reduce((sum, inv) => sum + inv.available, 0) || 0;
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{shipped}</TableCell>
                      <TableCell className="text-right font-medium">{remaining}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          value={shipmentQuantities[item.id] || 0}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                          className="w-20 text-right"
                          disabled={remaining === 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={availInv < remaining ? "text-destructive font-medium" : ""}>
                          {availInv}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="shipping-cost">Shipping Cost</Label>
              <Input
                id="shipping-cost"
                type="number"
                step="0.01"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Tax Calculation</p>
              <p className="text-sm text-muted-foreground">
                {order.order_type === 'pull_ship' ? 'No tax (Pull & Ship)' : 'Tax will be calculated at 8.25%'}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreateShipment} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Shipment Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
