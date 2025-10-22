import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, Info, Package } from "lucide-react";

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
      const totalToShip = Object.values(shipmentQuantities).reduce((sum, q) => sum + q, 0);
      if (totalToShip === 0) {
        toast({
          title: "Error",
          description: "Please specify quantities to ship",
          variant: "destructive"
        });
        setLoading(false);
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
          {/* Invoice Type Preview */}
          {(() => {
            const totalToShip = Object.values(shipmentQuantities).reduce((sum, q) => sum + q, 0);
            const totalOrdered = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
            const totalPreviouslyShipped = order.order_items?.reduce((sum: number, item: any) => sum + (item.shipped_quantity || 0), 0) || 0;
            const afterThisShipment = totalPreviouslyShipped + totalToShip;
            const willBeFinal = afterThisShipment >= totalOrdered;
            const nextShipmentNumber = existingInvoices.length + 1;
            const projectedPercentage = totalOrdered > 0 ? ((afterThisShipment / totalOrdered) * 100).toFixed(1) : '0.0';
            
            // Check for inventory issues
            const inventoryIssues = order.order_items?.filter((item: any) => {
              const availInv = availableInventory[item.sku]?.reduce((sum, inv) => sum + inv.available, 0) || 0;
              const remaining = item.quantity - (item.shipped_quantity || 0);
              const toShip = shipmentQuantities[item.id] || 0;
              return toShip > 0 && availInv < toShip;
            }) || [];

            return (
              <>
                {inventoryIssues.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">
                      <strong>Insufficient Inventory:</strong> {inventoryIssues.length} item(s) don't have enough inventory. 
                      The system will allocate what's available.
                    </AlertDescription>
                  </Alert>
                )}

                {totalToShip > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="ml-2">
                      <div className="space-y-1">
                        <p>
                          <strong>This will be a {willBeFinal ? 'FINAL' : 'PARTIAL'} invoice</strong> 
                          {' '}(Shipment #{nextShipmentNumber})
                        </p>
                        <p className="text-sm">
                          Shipping {totalToShip} units ({projectedPercentage}% of order total) • 
                          {' '}{afterThisShipment} of {totalOrdered} units will be shipped after this shipment
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            );
          })()}

          {existingInvoices.length > 0 && (
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4" />
                <p className="font-medium text-sm">Previous Shipments ({existingInvoices.length})</p>
              </div>
              <div className="space-y-1">
                {existingInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Shipment {inv.shipment_number}: {inv.invoice_number}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {inv.invoice_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-base">Items to Ship</Label>
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
                        <div className="flex items-center justify-end gap-1">
                          {availInv < (shipmentQuantities[item.id] || 0) && (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                          <span className={
                            availInv < (shipmentQuantities[item.id] || 0) ? "text-destructive font-bold" :
                            availInv < remaining ? "text-warning font-medium" : 
                            "text-success"
                          }>
                            {availInv}
                          </span>
                        </div>
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
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium">Tax Calculation</p>
                <p className="text-xs text-muted-foreground">
                  {order.order_type === 'pull_ship' ? 'No tax (Pull & Ship)' : 'Tax will be calculated at 8.25%'}
                </p>
              </div>
              {(() => {
                const itemsToShip = order.order_items?.filter((item: any) => shipmentQuantities[item.id] > 0) || [];
                const subtotal = itemsToShip.reduce((sum: number, item: any) => 
                  sum + (shipmentQuantities[item.id] * item.unit_price), 0
                );
                const tax = order.order_type === 'pull_ship' ? 0 : (subtotal * 0.0825);
                const shipping = parseFloat(shippingCost) || 0;
                const total = subtotal + tax + shipping;
                
                return subtotal > 0 ? (
                  <div className="text-sm space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">${subtotal.toFixed(2)}</span>
                    </div>
                    {tax > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax:</span>
                        <span className="font-medium">${tax.toFixed(2)}</span>
                      </div>
                    )}
                    {shipping > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping:</span>
                        <span className="font-medium">${shipping.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold">${total.toFixed(2)}</span>
                    </div>
                  </div>
                ) : null;
              })()}
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
