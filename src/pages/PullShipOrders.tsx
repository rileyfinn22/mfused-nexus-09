import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Search, Eye, CheckCircle, Clock, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generateInvoiceNumber } from "@/lib/invoiceUtils";

const PullShipOrders = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchOrders();
    }
  }, [isVibeAdmin, statusFilter]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return;
    }

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
    
    if (userRole?.role !== 'vibe_admin') {
      navigate('/orders');
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*, order_items(*), companies(name), vendors!orders_fulfillment_vendor_id_fkey(name), parent_order:parent_order_id(id, order_number)')
      .eq('order_type', 'pull_ship')
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    
    if (!error && data) {
      setOrders(data);
    } else if (error) {
      console.error('Error fetching orders:', error);
    }
    setLoading(false);
  };

  const getApprovalBadge = (order: any) => {
    if (order.vibe_approved) {
      return (
        <Badge className="bg-green-500 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
        <Clock className="h-3 w-3 mr-1" />
        Pending Approval
      </Badge>
    );
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (order.companies?.name && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "pending" && !order.vibe_approved) ||
      (statusFilter === "approved" && order.vibe_approved);
    
    return matchesSearch && matchesStatus;
  });

  const handleApproveOrder = async (orderId: string, orderNumber: string, order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if fulfillment vendor is assigned
    if (!order.fulfillment_vendor_id) {
      toast({
        title: "Cannot Approve",
        description: "Please open the order and assign a fulfillment vendor first",
        variant: "destructive",
      });
      navigate(`/pull-ship-orders/${orderId}`);
      return;
    }
    
    if (!confirm(`Approve order ${orderNumber}? This will send it to fulfillment.`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Approve the pull & ship order
      const { error: approveError } = await supabase
        .from('orders')
        .update({
          vibe_approved: true,
          vibe_approved_by: user.id,
          vibe_approved_at: new Date().toISOString(),
          status: 'picked'
        })
        .eq('id', orderId);

      if (approveError) throw approveError;

      // If there's a parent order (blanket order), create an invoice for it
      if (order.parent_order_id) {
        // Get parent order and its existing invoices
        const { data: parentOrder, error: parentError } = await supabase
          .from('orders')
          .select('order_number, subtotal, total, order_items(*)')
          .eq('id', order.parent_order_id)
          .single();

        if (parentError) throw parentError;

        // Get existing invoices for the parent order to determine next shipment number
        const { data: existingInvoices, error: invoicesError } = await supabase
          .from('invoices')
          .select('id, invoice_number, shipment_number, billed_percentage, invoice_type')
          .eq('order_id', order.parent_order_id)
          .order('shipment_number', { ascending: false });

        if (invoicesError) throw invoicesError;

        const isFirstInvoice = !existingInvoices || existingInvoices.length === 0;
        const nextShipmentNumber = existingInvoices && existingInvoices.length > 0 
          ? (existingInvoices[0].shipment_number || 0) + 1 
          : 1;

        // Generate invoice number based on parent order number and shipment number
        const invoiceNumber = generateInvoiceNumber(parentOrder.order_number, nextShipmentNumber);

        // Calculate percentage of order
        const pullShipTotal = order.total || 0;
        const blanketTotal = parentOrder.total || 1;
        const percentageOfOrder = (pullShipTotal / blanketTotal) * 100;

        // First invoice for blanket order should be type "full" (represents the master contract)
        // Subsequent invoices are "partial" (individual shipments)
        const invoiceType = isFirstInvoice ? 'full' : 'partial';

        // Create invoice for this shipment
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            order_id: order.parent_order_id,
            company_id: order.company_id,
            invoice_number: invoiceNumber,
            invoice_type: invoiceType,
            invoice_date: new Date().toISOString(),
            subtotal: order.subtotal || 0,
            tax: order.tax || 0,
            total: pullShipTotal,
            shipping_cost: order.shipping_cost || 0,
            shipment_number: nextShipmentNumber,
            billed_percentage: Number(percentageOfOrder.toFixed(2)),
            status: 'open',
            notes: `Pull & Ship Order: ${orderNumber}`,
            created_by: user.id
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('Invoice creation error:', invoiceError);
          throw invoiceError;
        }

        // Update order items shipped_quantity based on pull & ship order items
        if (order.order_items && order.order_items.length > 0) {
          for (const pullItem of order.order_items) {
            // Find matching item in parent order by SKU
            const parentItem = parentOrder.order_items?.find(
              (pi: any) => pi.sku === pullItem.sku
            );

            if (parentItem) {
              // Increment the parent order's shipped_quantity by this pull & ship quantity
              const currentShipped = Number(parentItem.shipped_quantity || 0);
              const pullQuantity = Number(pullItem.quantity || 0);
              const newShippedQty = currentShipped + pullQuantity;

              await supabase
                .from('order_items')
                .update({ shipped_quantity: newShippedQty })
                .eq('id', parentItem.id);
            }
          }

          // Create inventory allocations for this pull
          for (const pullItem of order.order_items) {
            const { data: inventory } = await supabase
              .from('inventory')
              .select('*')
              .eq('sku', pullItem.sku)
              .eq('company_id', order.company_id)
              .eq('state', order.shipping_state)
              .maybeSingle();

            if (inventory) {
              await supabase
                .from('inventory_allocations')
                .insert({
                  inventory_id: inventory.id,
                  order_item_id: pullItem.id,
                  invoice_id: invoiceData.id,
                  quantity_allocated: pullItem.quantity,
                  allocated_by: user.id,
                  status: 'allocated'
                });

              // Update inventory available quantity
              await supabase
                .from('inventory')
                .update({ 
                  available: (inventory.available || 0) - pullItem.quantity 
                })
                .eq('id', inventory.id);
            }
          }
        }

        // Update the blanket order's main invoice to show overall completion percentage
        if (existingInvoices && existingInvoices.length > 0) {
          // Calculate total billed percentage across all invoices
          const totalBilledPercent = existingInvoices.reduce((sum, inv) => 
            sum + (inv.billed_percentage || 0), percentageOfOrder
          );
          
          // Update the first (full) invoice with cumulative percentage
          const firstInvoice = existingInvoices.find(inv => inv.invoice_type === 'full');
          if (firstInvoice) {
            await supabase
              .from('invoices')
              .update({ 
                billed_percentage: Number(totalBilledPercent.toFixed(2))
              })
              .eq('id', firstInvoice.id);
          }
        }

        toast({ 
          title: "Order Approved", 
          description: `Order ${orderNumber} approved and invoice ${invoiceNumber} created (${percentageOfOrder.toFixed(1)}% of blanket order)`
        });
      } else {
        toast({ 
          title: "Order Approved", 
          description: `Order ${orderNumber} has been approved (no parent order to invoice)`
        });
      }
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Delete order ${orderNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      // Get the order details first
      const { data: orderData, error: fetchError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      // If this was an approved order, restore inventory
      if (orderData.vibe_approved) {
        // Get inventory allocations for this order's items
        const { data: allocations } = await supabase
          .from('inventory_allocations')
          .select('*, inventory(id, available)')
          .in('order_item_id', orderData.order_items.map((item: any) => item.id));

        if (allocations) {
          // Restore inventory quantities
          for (const alloc of allocations) {
            if (alloc.inventory) {
              await supabase
                .from('inventory')
                .update({ 
                  available: (alloc.inventory.available || 0) + alloc.quantity_allocated 
                })
                .eq('id', alloc.inventory.id);
            }
          }

          // Delete the allocations
          await supabase
            .from('inventory_allocations')
            .delete()
            .in('order_item_id', orderData.order_items.map((item: any) => item.id));
        }
      }

      // Delete the order (cascades to order_items)
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      // If this was an approved pull & ship order with a parent, recalculate parent's shipped quantities
      if (orderData.parent_order_id && orderData.vibe_approved) {
        // Get parent order items
        const { data: parentItems } = await supabase
          .from('order_items')
          .select('id, sku')
          .eq('order_id', orderData.parent_order_id);

        if (parentItems && orderData.order_items) {
          for (const parentItem of parentItems) {
            // Find how much of this SKU was in the deleted pull & ship order
            const pulledItemsForSku = orderData.order_items.filter((oi: any) => oi.sku === parentItem.sku);
            if (pulledItemsForSku.length === 0) continue;

            const totalPulledQty = pulledItemsForSku.reduce(
              (sum: number, item: any) => sum + Number(item.quantity || 0),
              0
            );

            // Get current shipped_quantity for the parent item
            const { data: currentItem } = await supabase
              .from('order_items')
              .select('shipped_quantity')
              .eq('id', parentItem.id)
              .maybeSingle();

            const currentShipped = Number(currentItem?.shipped_quantity || 0);
            const newShipped = Math.max(0, currentShipped - totalPulledQty);

            await supabase
              .from('order_items')
              .update({ shipped_quantity: newShipped })
              .eq('id', parentItem.id);
          }
        }

        // Recalculate blanket invoice billed_percentage
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, invoice_type, billed_percentage')
          .eq('order_id', orderData.parent_order_id);

        if (invoices) {
          const partialInvoices = invoices.filter(inv => inv.invoice_type === 'partial');
          const totalBilledPercent = partialInvoices.reduce((sum, inv) => sum + (inv.billed_percentage || 0), 0);
          
          const blanketInvoice = invoices.find(inv => inv.invoice_type === 'full');
          if (blanketInvoice) {
            await supabase
              .from('invoices')
              .update({ billed_percentage: Number(totalBilledPercent.toFixed(2)) })
              .eq('id', blanketInvoice.id);
          }
        }
      }

      toast({ 
        title: "Order Deleted", 
        description: `Order ${orderNumber} has been deleted, inventory restored, and parent order updated`
      });
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Pull & Ship Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and approve fulfillment orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="border border-table-border rounded">
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Order #</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-2">Fulfillment Vendor</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Actions</div>
          </div>
        </div>
        <div className="divide-y divide-table-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No pull & ship orders found
            </div>
          ) : filteredOrders.map((order) => (
            <div 
              key={order.id} 
              className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
              onClick={() => navigate(`/pull-ship-orders/${order.id}`)}
            >
              <div className="col-span-2">
                <div className="font-medium font-mono text-sm">{order.order_number}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="col-span-2 text-sm font-medium">{order.companies?.name || '-'}</div>
              <div className="col-span-2 text-sm">{order.customer_name || '-'}</div>
              <div className="col-span-2 text-sm">
                {order.vendors?.name || <span className="text-yellow-600">Not Assigned</span>}
              </div>
              <div className="col-span-1 text-sm">${order.total?.toFixed(2) || '0.00'}</div>
              <div className="col-span-1">
                {getApprovalBadge(order)}
              </div>
              <div className="col-span-2 flex gap-2">
                {!order.vibe_approved && (
                  <Button 
                    size="sm" 
                    className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                    onClick={(e) => handleApproveOrder(order.id, order.order_number, order, e)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/pull-ship-orders/${order.id}`);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => handleDeleteOrder(order.id, order.order_number, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PullShipOrders;
