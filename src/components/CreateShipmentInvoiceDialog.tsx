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
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";
import { generateInvoiceNumber } from "@/lib/invoiceUtils";

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
  const [invoiceMode, setInvoiceMode] = useState<'deposit' | 'shipment'>('shipment');
  const [depositPercentage, setDepositPercentage] = useState("30");
  const { syncInvoice, checkConnection } = useQuickBooksAutoSync();

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
    
    setShipmentQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, numValue)
    }));
  };

  const handleCreateShipment = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (invoiceMode === 'shipment') {
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
      } else {
        // Validate deposit percentage
        const depositPct = parseFloat(depositPercentage);
        if (isNaN(depositPct) || depositPct <= 0 || depositPct > 100) {
          toast({
            title: "Error",
            description: "Please enter a valid deposit percentage (1-100)",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
      }

      // Calculate next shipment number
      const nextShipmentNumber = existingInvoices.length + 1;

      let subtotal = 0;
      let itemsToShip: any[] = [];
      let invoiceType = 'partial';
      let billedPercentage = 0;

      if (invoiceMode === 'deposit') {
        // Deposit invoice - calculate % of order total
        const orderSubtotal = order.order_items.reduce((sum: number, item: any) => 
          sum + (item.quantity * item.unit_price), 0
        );
        const depositPct = parseFloat(depositPercentage) / 100;
        subtotal = orderSubtotal * depositPct;
        billedPercentage = parseFloat(depositPercentage);
        // Don't allocate any items for deposit invoice
      } else {
        // Shipment invoice - based on quantities
        itemsToShip = order.order_items.filter((item: any) => shipmentQuantities[item.id] > 0);
        
        itemsToShip.forEach((item: any) => {
          const quantity = shipmentQuantities[item.id];
          subtotal += quantity * item.unit_price;
        });

        // Calculate percentage for shipment
        const totalShipped = itemsToShip.reduce((sum: number, item: any) => 
          sum + shipmentQuantities[item.id], 0
        );
        const totalOrdered = order.order_items.reduce((sum: number, item: any) => 
          sum + item.quantity, 0
        );
        billedPercentage = totalOrdered > 0 ? (totalShipped / totalOrdered) * 100 : 0;
        
        const totalPreviouslyShipped = order.order_items.reduce((sum: number, item: any) => 
          sum + (item.shipped_quantity || 0), 0
        );
        invoiceType = (totalShipped + totalPreviouslyShipped >= totalOrdered) ? 'final' : 'partial';

        // Deduct any deposit invoices from the shipment total
        const depositInvoices = existingInvoices.filter(inv => inv.invoice_type === 'deposit');
        console.log('Found deposit invoices:', depositInvoices);
        
        const totalDepositAmount = depositInvoices.reduce((sum, inv) => {
          // For deposit invoices, use the actual amount paid (total)
          const depositAmt = parseFloat(inv.total || 0);
          console.log(`Deposit invoice ${inv.invoice_number}: $${depositAmt}`);
          return sum + depositAmt;
        }, 0);
        
        console.log('Total deposit amount to deduct:', totalDepositAmount);
        console.log('Shipment subtotal before deduction:', subtotal);
        
        // Calculate what percentage of the order this shipment represents
        const orderSubtotal = order.order_items.reduce((sum: number, item: any) => 
          sum + (item.quantity * item.unit_price), 0
        );
        const shipmentPercentOfOrder = orderSubtotal > 0 ? subtotal / orderSubtotal : 0;
        
        // Deduct the proportional amount of deposits that applies to this shipment
        const depositToDeduct = totalDepositAmount * shipmentPercentOfOrder;
        console.log(`Shipment is ${(shipmentPercentOfOrder * 100).toFixed(1)}% of order, deducting ${depositToDeduct} from deposits`);
        
        // Subtract proportional deposit from this shipment
        subtotal = Math.max(0, subtotal - depositToDeduct);
        console.log('Shipment subtotal after deposit deduction:', subtotal);
      }

      const tax = 0; // Tax removed - included in unit price
      const shipping = parseFloat(shippingCost) || 0;
      const total = subtotal + shipping;

      // Find deposit invoice to link shipment invoices to
      const depositInvoice = existingInvoices.find(inv => inv.invoice_type === 'deposit');
      
      // Create invoice with QB-compliant number
      const invoiceNumber = generateInvoiceNumber(nextShipmentNumber);
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: order.company_id,
          order_id: order.id,
          invoice_number: invoiceNumber,
          shipment_number: nextShipmentNumber,
          invoice_type: invoiceMode === 'deposit' ? 'deposit' : invoiceType,
          billed_percentage: billedPercentage,
          parent_invoice_id: invoiceMode === 'shipment' && depositInvoice ? depositInvoice.id : null,
          status: 'open',
          subtotal,
          tax,
          shipping_cost: shipping,
          total,
          created_by: user.id,
          notes: invoiceMode === 'deposit' ? `${depositPercentage}% deposit payment` : null
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Only allocate inventory for shipment invoices, not deposit invoices
      if (invoiceMode === 'shipment') {
        // Update order items shipped quantities
        for (const item of itemsToShip) {
          const quantityToShip = shipmentQuantities[item.id];
          if (quantityToShip === 0) continue;

          await supabase
            .from('order_items')
            .update({
              shipped_quantity: (item.shipped_quantity || 0) + quantityToShip
            })
            .eq('id', item.id);

          // Try to allocate from inventory if available (FIFO)
          const inventoryLocations = availableInventory[item.sku] || [];
          let remainingToAllocate = quantityToShip;
          
          for (const inv of inventoryLocations) {
            if (remainingToAllocate === 0) break;
            
            const allocateQty = Math.min(remainingToAllocate, inv.available);
            if (allocateQty <= 0) continue;
            
            // Create allocation record with inventory
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
          
          // For direct ship scenarios (no inventory), create allocation records without inventory_id
          if (remainingToAllocate > 0) {
            await supabase
              .from('inventory_allocations')
              .insert({
                order_item_id: item.id,
                inventory_id: null, // Direct ship - no inventory tracked
                invoice_id: invoice.id,
                quantity_allocated: remainingToAllocate,
                allocated_by: user.id,
                status: 'allocated'
              });
          }
        }
      }

      toast({
        title: invoiceMode === 'deposit' ? "Deposit Invoice Created" : "Shipment Invoice Created",
        description: `Invoice ${invoiceNumber} created successfully`
      });

      // Note: Invoice will sync to QuickBooks when vibe_admin approves and sends to production
      // Not auto-syncing on creation since approval is required first

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
          <DialogTitle>Create Invoice - {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Mode Selection */}
          <div className="flex gap-4 p-4 bg-secondary/20 rounded-lg">
            <Button
              type="button"
              variant={invoiceMode === 'deposit' ? 'default' : 'outline'}
              onClick={() => setInvoiceMode('deposit')}
              className="flex-1"
            >
              Deposit/Upfront Payment
            </Button>
            <Button
              type="button"
              variant={invoiceMode === 'shipment' ? 'default' : 'outline'}
              onClick={() => setInvoiceMode('shipment')}
              className="flex-1"
            >
              Shipment Invoice
            </Button>
          </div>

          {invoiceMode === 'deposit' ? (
            <>
              {/* Deposit Percentage Input */}
              <div className="space-y-2">
                <Label>Deposit Percentage</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={depositPercentage}
                    onChange={(e) => setDepositPercentage(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">% of order total</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Order Total: {(() => {
                    const orderSubtotal = order.order_items?.reduce((sum: number, item: any) => 
                      sum + (item.quantity * item.unit_price), 0) || 0;
                    const depositAmount = orderSubtotal * (parseFloat(depositPercentage) / 100);
                    return `$${orderSubtotal.toFixed(2)} → Deposit: $${depositAmount.toFixed(2)}`;
                  })()}
                </p>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This invoice will bill {depositPercentage}% of the order total as a deposit/upfront payment. 
                  No inventory will be allocated. Create additional shipment invoices as items are pulled/shipped.
                </AlertDescription>
              </Alert>

              <div>
                <Label htmlFor="shipping-cost">Shipping Cost (Optional)</Label>
                <Input
                  id="shipping-cost"
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </>
          ) : (
            <>
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

                // Calculate deposit deduction
                const depositInvoices = existingInvoices.filter(inv => inv.invoice_type === 'deposit');
                const totalDepositPaid = depositInvoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);

                return (
                  <>
                    {totalDepositPaid > 0 && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="ml-2">
                          <strong>Deposit Credit Applied:</strong> ${totalDepositPaid.toFixed(2)} will be deducted proportionally from this shipment.
                        </AlertDescription>
                      </Alert>
                    )}

                    {inventoryIssues.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="ml-2">
                          <strong>Low/No Inventory:</strong> {inventoryIssues.length} item(s) don't have inventory. 
                          Invoice will be created for direct ship (inventory allocation skipped).
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
                      <TableHead className="text-right">Ship Now</TableHead>
                      <TableHead className="text-right">Inv Available</TableHead>
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
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={shipmentQuantities[item.id] ?? remaining}
                              onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                              className="w-20 text-right"
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
                  {(() => {
                    const itemsToShip = order.order_items?.filter((item: any) => shipmentQuantities[item.id] > 0) || [];
                    const subtotal = itemsToShip.reduce((sum: number, item: any) => 
                      sum + (shipmentQuantities[item.id] * item.unit_price), 0
                    );
                    const shipping = parseFloat(shippingCost) || 0;
                    const total = subtotal + shipping;
                    
                    return subtotal > 0 ? (
                      <div className="text-sm space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal:</span>
                          <span className="font-medium">${subtotal.toFixed(2)}</span>
                        </div>
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
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreateShipment} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {invoiceMode === 'deposit' ? 'Create Deposit Invoice' : 'Create Shipment Invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
