import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Package, CheckCircle2, Circle, Truck, FileText, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PullShipOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notes, setNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isPicked, setIsPicked] = useState(false);
  const [isShipped, setIsShipped] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedOrder, setEditedOrder] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchVendors();
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsAdmin(data?.role === 'vibe_admin');
    }
  };

  const fetchVendors = async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_fulfillment_vendor', true)
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setVendors(data);
    }
  };

  const fetchOrder = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*),
        vendors!orders_fulfillment_vendor_id_fkey(name, contact_email)
      `)
      .eq('id', orderId)
      .eq('order_type', 'pull_ship')
      .single();

    if (!error && data) {
      setOrder(data);
      setEditedOrder(data);
      setIsPicked(data.status === 'picked' || data.status === 'shipped' || data.status === 'delivered');
      setIsShipped(data.status === 'shipped' || data.status === 'delivered');
    }
    setLoading(false);
  };

  const generatePackingListPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("PACKING LIST", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Order: ${order.order_number}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Ship To: ${order.shipping_name}`, 20, 60);
    doc.text(`${order.shipping_street}`, 20, 70);
    doc.text(`${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`, 20, 80);
    
    const tableData = order.order_items.map((item: any) => [
      item.item_id || "N/A",
      item.sku,
      item.name,
      item.quantity.toString()
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Description", "Quantity"]],
      body: tableData,
      startY: 100,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    return doc;
  };

  const generateInvoicePDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("INVOICE", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Invoice #: ${order.order_number}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`PO #: ${order.po_number || 'N/A'}`, 20, 60);
    
    doc.text("Bill To:", 20, 80);
    doc.text(order.customer_name, 20, 90);
    doc.text(`${order.shipping_street}`, 20, 100);
    doc.text(`${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`, 20, 110);
    
    const tableData = order.order_items.map((item: any) => [
      item.item_id || "N/A",
      item.sku,
      item.name,
      item.quantity.toString(),
      `$${item.unit_price?.toFixed(2)}`,
      `$${item.total?.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Description", "Qty", "Unit Price", "Total"]],
      body: tableData,
      startY: 130,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Subtotal: $${order.subtotal.toFixed(2)}`, 130, finalY);
    doc.text(`Tax: $${order.tax.toFixed(2)}`, 130, finalY + 10);
    doc.text(`Total: $${order.total.toFixed(2)}`, 130, finalY + 20);
    
    return doc;
  };

  const handleDownloadPackingList = () => {
    const doc = generatePackingListPDF();
    doc.save(`packing-list-${order.order_number}.pdf`);
    toast({ title: "Packing List Downloaded" });
  };

  const handleDownloadInvoice = () => {
    const doc = generateInvoicePDF();
    doc.save(`invoice-${order.order_number}.pdf`);
    toast({ title: "Invoice Downloaded" });
  };

  const handleSendToFulfillment = async () => {
    try {
      const packingListDoc = generatePackingListPDF();
      const packingListPdf = packingListDoc.output('dataurlstring');

      const items = order.order_items.map((item: any) => ({
        sku: item.sku,
        itemId: item.item_id,
        quantity: item.quantity
      }));

      const invoiceData = {
        invoiceNumber: order.order_number,
        customerName: order.customer_name,
        state: order.shipping_state,
        address: `${order.shipping_street}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
        items: items
      };

      const { error } = await supabase.functions.invoke('send-packing-list', {
        body: {
          packingListPdf,
          invoiceData,
          fulfillmentEmail: 'fulfillment@example.com'
        }
      });

      if (error) throw error;

      // Update order status to picked
      await supabase
        .from('orders')
        .update({ status: 'picked' })
        .eq('id', orderId);

      setIsPicked(true);
      toast({
        title: "Sent to Fulfillment",
        description: "Packing list has been sent to warehouse fulfillment",
      });
      fetchOrder();
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: "Notice",
        description: error.message || "Email requires RESEND_API_KEY to be configured",
        variant: "destructive",
      });
    }
  };

  const handleMarkPicked = async () => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'picked' })
      .eq('id', orderId);

    if (!error) {
      setIsPicked(true);
      toast({ title: "Marked as Picked" });
      fetchOrder();
    }
  };

  const handleMarkShipped = async () => {
    if (!trackingNumber.trim()) {
      toast({
        title: "Tracking Required",
        description: "Please enter a tracking number",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'shipped',
        tracking_number: trackingNumber
      })
      .eq('id', orderId);

    if (!error) {
      setIsShipped(true);
      toast({ title: "Marked as Shipped" });
      fetchOrder();
    }
  };

  const handleAddNote = async () => {
    if (!notes.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('order_notes')
      .insert({
        order_id: orderId,
        user_id: user.id,
        author_name: user.email || 'Admin',
        note_text: notes
      });

    if (!error) {
      toast({ title: "Note Added" });
      setNotes("");
    }
  };

  const handleSaveOrder = async () => {
    if (!editedOrder) return;

    // Recalculate totals based on edited items (no tax)
    const subtotal = editedOrder.order_items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unit_price);
    }, 0);

    const { error: orderError } = await supabase
      .from('orders')
      .update({
        customer_name: editedOrder.customer_name,
        customer_email: editedOrder.customer_email,
        customer_phone: editedOrder.customer_phone,
        shipping_name: editedOrder.shipping_name,
        shipping_street: editedOrder.shipping_street,
        shipping_city: editedOrder.shipping_city,
        shipping_state: editedOrder.shipping_state,
        shipping_zip: editedOrder.shipping_zip,
        billing_name: editedOrder.billing_name,
        billing_street: editedOrder.billing_street,
        billing_city: editedOrder.billing_city,
        billing_state: editedOrder.billing_state,
        billing_zip: editedOrder.billing_zip,
        po_number: editedOrder.po_number,
        due_date: editedOrder.due_date,
        memo: editedOrder.memo,
        subtotal: subtotal,
        tax: 0,
        total: subtotal
      })
      .eq('id', orderId);

    if (orderError) {
      toast({
        title: "Error",
        description: "Failed to save order",
        variant: "destructive",
      });
      return;
    }

    // Update order items
    for (const item of editedOrder.order_items) {
      const itemTotal = item.quantity * item.unit_price;
      await supabase
        .from('order_items')
        .update({
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: itemTotal,
          name: item.name,
          sku: item.sku
        })
        .eq('id', item.id);
    }

    setIsEditing(false);
    toast({ title: "Order Saved" });
    fetchOrder();
  };

  const handleCancelEdit = () => {
    setEditedOrder(order);
    setIsEditing(false);
  };

  const handleApproveOrder = async () => {
    if (!editedOrder.fulfillment_vendor_id) {
      toast({
        title: "Missing Fulfillment Vendor",
        description: "Please select a fulfillment vendor before approving",
        variant: "destructive",
      });
      return;
    }

    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save any edits and mark as approved
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          ...editedOrder,
          vibe_approved: true,
          vibe_approved_by: user.id,
          vibe_approved_at: new Date().toISOString(),
          status: 'picked'
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Update order items
      if (editedOrder.order_items) {
        for (const item of editedOrder.order_items) {
          const { error: itemError } = await supabase
            .from('order_items')
            .update({
              quantity: item.quantity,
              unit_price: item.unit_price,
              total: item.total
            })
            .eq('id', item.id);

          if (itemError) throw itemError;
        }
      }

      // Generate and send packing list to fulfillment vendor
      const items = editedOrder.order_items.map((item: any) => ({
        sku: item.sku,
        itemId: item.item_id,
        quantity: item.quantity
      }));

      const packingListDoc = generatePackingListPDF();
      const packingListPdf = packingListDoc.output('dataurlstring');

      const invoiceDoc = generateInvoicePDF();
      const invoicePdf = invoiceDoc.output('dataurlstring');

      // Send to fulfillment vendor
      const { error: emailError } = await supabase.functions.invoke('send-packing-list', {
        body: {
          packingListPdf,
          invoicePdf,
          orderData: editedOrder,
          recipientEmail: editedOrder.vendors?.contact_email
        }
      });

      if (emailError) {
        console.error('Error sending email:', emailError);
        toast({
          title: "Order Approved",
          description: "Order approved but email notification failed. Please send manually.",
          variant: "default",
        });
      } else {
        toast({
          title: "Order Approved & Sent",
          description: "Order has been approved and sent to the fulfillment vendor",
        });
      }

      setIsEditing(false);
      fetchOrder();
    } catch (error: any) {
      console.error('Error approving order:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const updateOrderField = (field: string, value: any) => {
    setEditedOrder((prev: any) => ({ ...prev, [field]: value }));
  };

  const updateItemField = (itemId: string, field: string, value: any) => {
    setEditedOrder((prev: any) => {
      const newItems = prev.order_items.map((item: any) => {
        if (item.id === itemId) {
          const updated = { ...item, [field]: value };
          // Recalculate total if quantity or unit_price changed
          if (field === 'quantity' || field === 'unit_price') {
            updated.total = (updated.quantity || 0) * (updated.unit_price || 0);
          }
          return updated;
        }
        return item;
      });
      
      // Recalculate order totals
      const subtotal = newItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
      const shipping = prev.shipping_cost || 0;
      
      return { 
        ...prev, 
        order_items: newItems,
        subtotal: subtotal,
        total: subtotal + shipping
      };
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading pull & ship order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Pull & Ship order not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/pull-ship-orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pull & Ship Orders
        </Button>
        <div className="flex gap-3">
          {isAdmin && !order?.vibe_approved && !isEditing && (
            <Button onClick={() => setIsEditing(true)}>
              Review & Edit
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveOrder}>
                Save Changes
              </Button>
              <Button 
                onClick={handleApproveOrder}
                disabled={approving}
                className="bg-green-600 hover:bg-green-700"
              >
                {approving ? "Approving..." : "Approve & Send to Fulfillment"}
              </Button>
            </>
          )}
          {isAdmin && order?.vibe_approved && (
            <Badge className="bg-green-500 text-white px-4 py-2">
              Approved {order.vibe_approved_at && `on ${new Date(order.vibe_approved_at).toLocaleDateString()}`}
            </Badge>
          )}
          {!isEditing && (
            <>
              <Button variant="outline" onClick={handleDownloadPackingList}>
                <Download className="h-4 w-4 mr-2" />
                Download Packing List
              </Button>
              <Button variant="outline" onClick={handleDownloadInvoice}>
                <Download className="h-4 w-4 mr-2" />
                Download Invoice
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Workflow Status */}
      <Card className="mb-6 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pull & Ship Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium">Order Created</p>
                <p className="text-sm text-muted-foreground">PO uploaded and processed</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isPicked ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Items Picked</p>
                <p className="text-sm text-muted-foreground">
                  {isPicked ? "Ready for shipment" : "Pending warehouse pick"}
                </p>
              </div>
              {!isPicked && isAdmin && (
                <Button size="sm" onClick={handleMarkPicked}>
                  Mark Picked
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {isShipped ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Shipped</p>
                <p className="text-sm text-muted-foreground">
                  {isShipped ? `Tracking: ${order.tracking_number}` : "Pending shipment"}
                </p>
              </div>
            </div>
          </div>

          {/* Send to Fulfillment Button */}
          {!isPicked && isAdmin && (
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <Button onClick={handleSendToFulfillment} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Send Packing List to Warehouse Fulfillment
              </Button>
            </div>
          )}

          {/* Shipping Section */}
          {isPicked && !isShipped && isAdmin && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium mb-3">Add Tracking & Mark Shipped</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter tracking number..."
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Button onClick={handleMarkShipped}>
                  <Truck className="h-4 w-4 mr-2" />
                  Mark Shipped
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">Pull & Ship Order #{order.order_number}</h1>
                  <Badge variant="outline" className="text-sm">Pull & Ship</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Created: {new Date(order.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Due: {order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set'}</span>
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-sm px-4 py-1.5 mb-2 capitalize">{order.status.replace('_', ' ')}</Badge>
                <p className="text-sm text-muted-foreground">PO #: {order.po_number || '-'}</p>
              </div>
            </div>

            {/* Customer & Address */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Customer</h3>
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder?.customer_name || ''}
                      onChange={(e) => updateOrderField('customer_name', e.target.value)}
                      placeholder="Customer name"
                    />
                    <Input
                      value={editedOrder?.customer_email || ''}
                      onChange={(e) => updateOrderField('customer_email', e.target.value)}
                      placeholder="Email"
                    />
                    <Input
                      value={editedOrder?.customer_phone || ''}
                      onChange={(e) => updateOrderField('customer_phone', e.target.value)}
                      placeholder="Phone"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_email || '-'}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_phone || '-'}</p>
                  </>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ship To</h3>
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder?.shipping_name || ''}
                      onChange={(e) => updateOrderField('shipping_name', e.target.value)}
                      placeholder="Name"
                    />
                    <Input
                      value={editedOrder?.shipping_street || ''}
                      onChange={(e) => updateOrderField('shipping_street', e.target.value)}
                      placeholder="Street"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={editedOrder?.shipping_city || ''}
                        onChange={(e) => updateOrderField('shipping_city', e.target.value)}
                        placeholder="City"
                      />
                      <Input
                        value={editedOrder?.shipping_state || ''}
                        onChange={(e) => updateOrderField('shipping_state', e.target.value)}
                        placeholder="State"
                        maxLength={2}
                      />
                    </div>
                    <Input
                      value={editedOrder?.shipping_zip || ''}
                      onChange={(e) => updateOrderField('shipping_zip', e.target.value)}
                      placeholder="ZIP"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.shipping_name}</p>
                    <p className="text-sm text-muted-foreground">{order.shipping_street}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
                    </p>
                  </>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Fulfillment</h3>
                {isEditing ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Fulfillment Vendor</Label>
                    <select
                      value={editedOrder?.fulfillment_vendor_id || ''}
                      onChange={(e) => updateOrderField('fulfillment_vendor_id', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">Select vendor...</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                    <Label className="text-xs mt-3">Shipping Cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedOrder?.shipping_cost || 0}
                      onChange={(e) => updateOrderField('shipping_cost', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.vendors?.name || 'Not assigned'}</p>
                    <p className="text-sm text-muted-foreground mt-2">Shipping Cost:</p>
                    <p className="text-sm font-medium">${order.shipping_cost?.toFixed(2) || '0.00'}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Items to Pull & Ship</h2>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Item ID</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isEditing ? editedOrder?.order_items : order.order_items)?.map((item: any, index: number) => (
                    <TableRow key={item.id || index}>
                      <TableCell className="font-mono text-xs">{item.item_id || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {isEditing ? (
                          <Input
                            value={item.sku}
                            onChange={(e) => updateItemField(item.id, 'sku', e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          item.sku
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {isEditing ? (
                          <Input
                            value={item.name}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          item.name
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItemField(item.id, 'quantity', parseInt(e.target.value) || 0)}
                            className="h-8 w-24"
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItemField(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-8 w-24"
                          />
                        ) : (
                          `$${item.unit_price?.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${(item.quantity * item.unit_price).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-6">
              <div className="w-80 space-y-2">
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total:</span>
                  <span>
                    ${isEditing 
                      ? editedOrder?.order_items.reduce((sum: number, item: any) => 
                          sum + (item.quantity * item.unit_price), 0).toFixed(2)
                      : order.total.toFixed(2)
                    }
                  </span>
                </div>
                <p className="text-xs text-muted-foreground text-right">No tax on Pull & Ship orders</p>
              </div>
            </div>

            {/* Memo */}
            {order.memo && (
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground">{order.memo}</p>
              </div>
            )}
          </div>

          {/* Admin Notes Section */}
          {isAdmin && (
            <div className="border-t bg-muted/30 p-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Internal Notes</h2>
                <Badge variant="default" className="text-xs">Admin Only</Badge>
              </div>
              
              <div className="p-4 bg-background rounded-lg border">
                <Label className="text-sm font-medium mb-2">Add Note</Label>
                <Textarea
                  placeholder="Add internal notes about this pull & ship order..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mb-2"
                />
                <Button onClick={handleAddNote} size="sm">
                  Add Note
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PullShipOrderDetail;
