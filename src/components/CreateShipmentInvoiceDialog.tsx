import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, Info, Package, Upload, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";
import { generateInvoiceNumber, generatePartialInvoiceNumber } from "@/lib/invoiceUtils";

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
  
  // Packing list upload states
  const [parsingPackingList, setParsingPackingList] = useState(false);
  const [packingListResult, setPackingListResult] = useState<{
    matched_items: Array<{
      order_item_id: string;
      shipped_quantity: number;
      packing_list_name: string;
      match_confidence: 'high' | 'medium' | 'low';
    }>;
    unmatched_items: Array<{ name: string; quantity: number }>;
    parsing_notes: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && order) {
      setInvoiceMode(initialMode);
      fetchExistingInvoices();
      fetchAvailableInventory();
      initializeQuantities();
      setPackingListResult(null); // Reset packing list result when dialog opens
    }
  }, [open, order, initialMode]);

  const handlePackingListUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Validate file type
    const validTypes = ['.csv', '.txt', '.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validTypes.some(t => fileExtension.includes(t.replace('.', '')))) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV, TXT, or Excel file",
        variant: "destructive"
      });
      return;
    }

    setParsingPackingList(true);
    setPackingListResult(null);

    try {
      // Read file content - handle binary files (Excel) differently
      let fileContent: string;
      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
      
      if (isExcel) {
        // For Excel files, read as base64
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileContent = btoa(binary);
      } else {
        // For text files (CSV, TXT), read as text
        fileContent = await file.text();
      }
      
      // Call the edge function to parse the packing list
      const { data, error } = await supabase.functions.invoke('parse-packing-list', {
        body: {
          fileContent,
          fileName: file.name,
          orderItems: order.order_items,
          isBase64: isExcel
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setPackingListResult(data);

      // Apply matched quantities
      if (data.matched_items && data.matched_items.length > 0) {
        const newQuantities: {[itemId: string]: number} = {};
        
        // Start with zeros
        order.order_items?.forEach((item: any) => {
          newQuantities[item.id] = 0;
        });
        
        // Apply matched quantities
        data.matched_items.forEach((match: any) => {
          newQuantities[match.order_item_id] = match.shipped_quantity;
        });
        
        setShipmentQuantities(newQuantities);

        toast({
          title: "Packing List Parsed",
          description: `Matched ${data.matched_items.length} items. ${data.unmatched_items?.length || 0} items could not be matched.`,
        });
      } else {
        toast({
          title: "No Matches Found",
          description: "Could not match any items from the packing list. Please check the file format.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error parsing packing list:', error);
      toast({
        title: "Error Parsing Packing List",
        description: error.message || "Failed to parse the packing list",
        variant: "destructive"
      });
    } finally {
      setParsingPackingList(false);
    }
  };

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
      quantities[item.id] = 0; // Always start at 0, user must specify qty to ship
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
        
        // Create the main blanket invoice using order number
        const blanketInvoiceNumber = generateInvoiceNumber(order.order_number, 1);
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
        // Deposit invoice - calculate % of blanket invoice total
        const depositPct = parseFloat(depositPercentage) / 100;
        console.log('Deposit calculation:', {
          depositPercentage,
          depositPct,
          blanketTotal: blanketInvoice.total,
          blanketTotalNumber: Number(blanketInvoice.total)
        });
        subtotal = Number(blanketInvoice.total) * depositPct;
        console.log('Calculated deposit subtotal:', subtotal);
        billedPercentage = parseFloat(depositPercentage);
        invoiceType = 'partial'; // Use 'partial' type for deposits (identified by billed_percentage)
        // Don't allocate any items for deposit invoice
      } else {
        // Shipment invoice - based on quantities
        itemsToShip = order.order_items.filter((item: any) => shipmentQuantities[item.id] > 0);
        
        // Calculate how much has already been billed (deposits and previous shipments, excluding blanket)
        const totalAlreadyBilled = existingInvoices
          .filter(inv => inv.invoice_type !== 'full') // Exclude blanket invoice
          .reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
        
        const blanketTotal = Number(blanketInvoice.total);
        const remainingBlanketAmount = Math.max(0, blanketTotal - totalAlreadyBilled);
        
        console.log('Blanket total:', blanketTotal);
        console.log('Total already billed (deposits + shipments):', totalAlreadyBilled);
        console.log('Remaining blanket amount:', remainingBlanketAmount);
        
        // Calculate billing for this shipment with proper handling of overs
        let baseSubtotal = 0; // Amount within original order (subject to blanket cap)
        let oversSubtotal = 0; // Amount for overs (always billed in full)
        
        itemsToShip.forEach((item: any) => {
          const shipQty = shipmentQuantities[item.id];
          const originalOrderQty = item.quantity;
          const previouslyShipped = item.shipped_quantity || 0;
          const totalWillBeShipped = previouslyShipped + shipQty;
          
          // Determine overs: quantities beyond original order
          const oversQty = Math.max(0, totalWillBeShipped - originalOrderQty);
          // Base quantities: within original order limits
          const baseQty = shipQty - oversQty;
          
          console.log(`Item ${item.sku}: shipQty=${shipQty}, originalQty=${originalOrderQty}, previousShipped=${previouslyShipped}, baseQty=${baseQty}, oversQty=${oversQty}`);
          
          // Overs are always billed in full
          oversSubtotal += oversQty * item.unit_price;
          // Base quantities are subject to blanket cap
          baseSubtotal += baseQty * item.unit_price;
        });
        
        console.log('Base subtotal (subject to cap):', baseSubtotal);
        console.log('Overs subtotal (always full):', oversSubtotal);
        
        // Apply blanket cap only to base quantities
        let billedBaseSubtotal = baseSubtotal;
        if (baseSubtotal > remainingBlanketAmount) {
          console.log(`Capping base subtotal from ${baseSubtotal} to ${remainingBlanketAmount}`);
          billedBaseSubtotal = remainingBlanketAmount;
        }
        
        // Total = capped base + full overs
        subtotal = billedBaseSubtotal + oversSubtotal;
        console.log('Final shipment subtotal (base + overs):', subtotal);


        // Calculate percentage for shipment based on dollar amount billed vs full value
        const fullShipmentValue = itemsToShip.reduce((sum: number, item: any) => 
          sum + (shipmentQuantities[item.id] * item.unit_price), 0
        );
        billedPercentage = fullShipmentValue > 0 ? (subtotal / fullShipmentValue) * 100 : 100;
        console.log('Billed percentage:', billedPercentage, '% (subtotal:', subtotal, '/ full value:', fullShipmentValue, ')');
        
        invoiceType = 'partial';
      }

      const tax = 0; // Tax removed - included in unit price
      const shipping = invoiceMode === 'deposit' ? 0 : (parseFloat(shippingCost) || 0);
      const total = subtotal + shipping;
      
      // Create child invoice linked to blanket invoice - use parent number with suffix
      // Partial invoices use format: {parent_invoice_number}-{shipment_number-1}
      // e.g., 10707-01, 10707-02, etc.
      const invoiceNumber = generatePartialInvoiceNumber(blanketInvoice.invoice_number, nextShipmentNumber);
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
        
        // Check if overs were shipped and update blanket invoice total if needed
        // Recalculate blanket total based on total shipped value across all items
        const { data: updatedOrderItems } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);
        
        if (updatedOrderItems) {
          // Calculate total shipped value
          const totalShippedValue = updatedOrderItems.reduce((sum: number, item: any) => {
            // Use the higher of: original order qty or shipped qty
            const billedQty = Math.max(item.quantity, item.shipped_quantity || 0);
            return sum + (billedQty * item.unit_price);
          }, 0);
          
          const currentBlanketTotal = Number(blanketInvoice.total);
          
          // If total shipped value exceeds blanket total, update the blanket
          if (totalShippedValue > currentBlanketTotal) {
            console.log(`Updating blanket invoice total from ${currentBlanketTotal} to ${totalShippedValue} due to overs`);
            
            await supabase
              .from('invoices')
              .update({
                subtotal: totalShippedValue,
                total: totalShippedValue
              })
              .eq('id', blanketInvoice.id);
            
            toast({
              title: "Blanket Invoice Updated",
              description: `Updated blanket total to reflect shipped overs`,
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
                  <span className="text-sm text-muted-foreground">% of blanket invoice total</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Blanket Invoice Total: {(() => {
                    const blanketInv = existingInvoices.find(inv => inv.invoice_type === 'full' && inv.shipment_number === 1);
                    const blanketTotal = blanketInv ? Number(blanketInv.total) : 0;
                    const depositAmount = blanketTotal * (parseFloat(depositPercentage) / 100);
                    return `$${blanketTotal.toFixed(2)} → Deposit: $${depositAmount.toFixed(2)}`;
                  })()}
                </p>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This invoice will bill {depositPercentage}% of the blanket invoice total as a deposit/upfront payment. 
                  No inventory will be allocated. No shipping cost should be added to deposits.
                </AlertDescription>
              </Alert>
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

                return null;
              })()}

              {existingInvoices.length > 0 && (
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4" />
                    <p className="font-medium text-sm">Existing Invoices ({existingInvoices.length})</p>
                  </div>
                  <div className="space-y-1">
                    {existingInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {inv.invoice_type === 'full' ? 'Blanket' : `Shipment ${inv.shipment_number}`}: {inv.invoice_number}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {inv.invoice_type === 'full' ? 'blanket' : inv.invoice_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Packing List Upload Section */}
              <div className="bg-secondary/30 p-4 rounded-lg border border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Upload Packing List</Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsingPackingList}
                  >
                    {parsingPackingList ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload File
                      </>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    onChange={handlePackingListUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a packing list (CSV, TXT, or Excel) to auto-fill shipped quantities based on product name matching.
                </p>
                
                {/* Packing List Results */}
                {packingListResult && (
                  <div className="mt-3 space-y-2">
                    {packingListResult.matched_items.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {packingListResult.matched_items.map((match, idx) => {
                          const orderItem = order.order_items?.find((item: any) => item.id === match.order_item_id);
                          return (
                            <Badge 
                              key={idx} 
                              variant={match.match_confidence === 'high' ? 'default' : 'secondary'}
                              className="text-xs flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {orderItem?.name || 'Unknown'}: {match.shipped_quantity}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    
                    {packingListResult.unmatched_items.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-destructive mb-1">Unmatched items from packing list:</p>
                        <div className="flex flex-wrap gap-2">
                          {packingListResult.unmatched_items.map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs flex items-center gap-1 border-destructive/50 text-destructive">
                              <XCircle className="h-3 w-3" />
                              {item.name}: {item.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {packingListResult.parsing_notes && (
                      <p className="text-xs text-muted-foreground italic mt-2">
                        {packingListResult.parsing_notes}
                      </p>
                    )}
                  </div>
                )}
              </div>

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
