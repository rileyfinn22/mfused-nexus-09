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
  initialMode?: 'deposit' | 'shipment';
}

export function CreateShipmentInvoiceDialog({ open, onOpenChange, order, onSuccess, initialMode = 'shipment' }: CreateShipmentInvoiceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [shippingCost, setShippingCost] = useState("0");
  const [shipmentQuantities, setShipmentQuantities] = useState<{[itemId: string]: number}>({});
  const [availableInventory, setAvailableInventory] = useState<{[sku: string]: any[]}>({});
  const [existingInvoices, setExistingInvoices] = useState<any[]>([]);
  const [invoiceMode, setInvoiceMode] = useState<'deposit' | 'shipment'>(initialMode);
  const [depositPercentage, setDepositPercentage] = useState("30");
  const { syncInvoice, checkConnection } = useQuickBooksAutoSync();

  useEffect(() => {
    if (open && order) {
      setInvoiceMode(initialMode);
      fetchExistingInvoices();
      fetchAvailableInventory();
      initializeQuantities();
    }
  }, [open, order, initialMode]);

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

      // First, ensure a blanket invoice exists for this order
      let blanketInvoice = existingInvoices.find(inv => inv.invoice_type === 'full' && inv.shipment_number === 1);
      
      if (!blanketInvoice) {
        console.log('Creating main blanket invoice first...');
        
        // Calculate full order total
        const orderSubtotal = order.order_items.reduce((sum: number, item: any) => 
          sum + (item.quantity * item.unit_price), 0
        );
        const orderTotal = orderSubtotal; // No tax, included in unit price
        
        // Create the main blanket invoice
        const blanketInvoiceNumber = generateInvoiceNumber(1);
        const { data: newBlanketInvoice, error: blanketError } = await supabase
          .from('invoices')
          .insert({
            company_id: order.company_id,
            order_id: order.id,
            invoice_number: blanketInvoiceNumber,
            shipment_number: 1,
            invoice_type: 'full',
            billed_percentage: 100,
            parent_invoice_id: null,
            status: 'open',
            subtotal: orderSubtotal,
            tax: 0,
            shipping_cost: 0,
            total: orderTotal,
            created_by: user.id,
            notes: 'Main blanket invoice for full order'
          })
          .select()
          .single();
        
        if (blanketError) throw blanketError;
        blanketInvoice = newBlanketInvoice;
        
        // Refresh existing invoices list
        await fetchExistingInvoices();
        
        toast({
          title: "Blanket Invoice Created",
          description: `Main invoice ${blanketInvoiceNumber} created for full order`,
        });
      }

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

      // Calculate next shipment number (blanket is always 1, so child invoices start at 2)
      const childInvoices = existingInvoices.filter(inv => inv.shipment_number > 1);
      const nextShipmentNumber = childInvoices.length > 0 
        ? Math.max(...childInvoices.map(inv => inv.shipment_number)) + 1 
        : 2;

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
        invoiceType = 'deposit';
        // Don't allocate any items for deposit invoice
      } else {
        // Shipment invoice - based on quantities
        itemsToShip = order.order_items.filter((item: any) => shipmentQuantities[item.id] > 0);
        
        // Calculate shipment value
        itemsToShip.forEach((item: any) => {
          const quantity = shipmentQuantities[item.id];
          subtotal += quantity * item.unit_price;
        });

        // Calculate the TOTAL SHIPPED value (including this shipment and previous shipments)
        const totalShippedValue = order.order_items.reduce((sum: number, item: any) => {
          const previouslyShipped = item.shipped_quantity || 0;
          const thisShipment = shipmentQuantities[item.id] || 0;
          const totalShipped = previouslyShipped + thisShipment;
          return sum + (totalShipped * item.unit_price);
        }, 0);
        
        // Calculate how much has already been billed (deposits and previous shipments, excluding blanket)
        const totalAlreadyBilled = existingInvoices
          .filter(inv => inv.invoice_type !== 'full') // Exclude blanket invoice
          .reduce((sum, inv) => {
            if (inv.invoice_type === 'deposit') {
              // For deposits, use the full total
              return sum + parseFloat(inv.total || 0);
            }
            // For shipment invoices, use the full total
            return sum + parseFloat(inv.total || 0);
          }, 0);
        
        console.log('Total shipped value (incl. this shipment):', totalShippedValue);
        console.log('Total already billed (excl. blanket):', totalAlreadyBilled);
        console.log('Shipment value before cap:', subtotal);
        
        // Calculate remaining billable amount (can't exceed total shipped value)
        const remainingBillable = Math.max(0, totalShippedValue - totalAlreadyBilled);
        
        // Cap the shipment invoice at the remaining billable amount
        if (remainingBillable === 0) {
          console.log('100% of shipped qty already billed - creating $0 shipment invoice');
          subtotal = 0;
        } else if (subtotal > remainingBillable) {
          console.log(`Capping shipment at remaining billable: ${remainingBillable}`);
          subtotal = remainingBillable;
        }
        
        console.log('Final shipment subtotal:', subtotal);

        // Calculate percentage for shipment
        const totalShipped = itemsToShip.reduce((sum: number, item: any) => 
          sum + shipmentQuantities[item.id], 0
        );
        const totalOrdered = order.order_items.reduce((sum: number, item: any) => 
          sum + item.quantity, 0
        );
        billedPercentage = totalOrdered > 0 ? (totalShipped / totalOrdered) * 100 : 0;
        
        invoiceType = 'partial';
      }

      const tax = 0; // Tax removed - included in unit price
      const shipping = parseFloat(shippingCost) || 0;
      const total = subtotal + shipping;
      
      // Create child invoice linked to blanket invoice
      const invoiceNumber = generateInvoiceNumber(nextShipmentNumber);
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: order.company_id,
          order_id: order.id,
          invoice_number: invoiceNumber,
          shipment_number: nextShipmentNumber,
          invoice_type: invoiceType,
          billed_percentage: billedPercentage,
          parent_invoice_id: blanketInvoice.id, // Always link to blanket invoice
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
        // Update order items shipped quantities FIRST
        for (const item of itemsToShip) {
          const quantityToShip = shipmentQuantities[item.id];
          if (quantityToShip === 0) continue;

          const newShippedQty = (item.shipped_quantity || 0) + quantityToShip;
          console.log(`Updating shipped_quantity for item ${item.id}: ${item.shipped_quantity || 0} + ${quantityToShip} = ${newShippedQty}`);
          
          const { error: updateError } = await supabase
            .from('order_items')
            .update({
              shipped_quantity: newShippedQty
            })
            .eq('id', item.id);

          if (updateError) {
            console.error('Error updating shipped_quantity:', updateError);
            throw updateError;
          }

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

                // Calculate total shipped value vs billed
                const totalShippedValue = order.order_items?.reduce((sum: number, item: any) => {
                  const totalShipped = (item.shipped_quantity || 0) + (shipmentQuantities[item.id] || 0);
                  return sum + (totalShipped * item.unit_price);
                }, 0) || 0;
                
                const totalAlreadyBilled = existingInvoices.reduce((sum, inv) => {
                  // Check for deposit by billed_percentage, not just invoice_type
                  if (inv.billed_percentage && inv.billed_percentage < 100) {
                    const depositAmt = parseFloat(inv.total || 0) * (parseFloat(inv.billed_percentage) / 100);
                    return sum + depositAmt;
                  }
                  return sum + parseFloat(inv.total || 0);
                }, 0);

                const remainingBillable = Math.max(0, totalShippedValue - totalAlreadyBilled);
                const billedPercentageOfShipped = totalShippedValue > 0 ? (totalAlreadyBilled / totalShippedValue) * 100 : 0;

                // Calculate this shipment value
                const shipmentValue = order.order_items?.reduce((sum: number, item: any) => {
                  const qty = shipmentQuantities[item.id] || 0;
                  return sum + (qty * item.unit_price);
                }, 0) || 0;

                return (
                  <>
                    {billedPercentageOfShipped >= 100 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="ml-2">
                          <strong>100% of Shipped Qty Billed:</strong> ${totalAlreadyBilled.toFixed(2)} of ${totalShippedValue.toFixed(2)} shipped value already billed. 
                          This shipment will be created with $0.00 invoice amount.
                        </AlertDescription>
                      </Alert>
                    )}

                    {billedPercentageOfShipped < 100 && remainingBillable < shipmentValue && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="ml-2">
                          <strong>Billing Cap:</strong> Only ${remainingBillable.toFixed(2)} remaining to bill 
                          (${totalAlreadyBilled.toFixed(2)} / ${totalShippedValue.toFixed(2)} of shipped value already billed). 
                          Invoice will be capped at this amount.
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
                              <strong>This will be a PARTIAL invoice</strong> 
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
