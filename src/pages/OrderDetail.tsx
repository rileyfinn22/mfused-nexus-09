import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Plus, Upload, FileText, Package, CheckCircle2, Circle, Truck, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VendorAssignmentDialog } from "@/components/VendorAssignmentDialog";
const OrderDetail = () => {
  const {
    orderId
  } = useParams();
  const navigate = useNavigate();
  const [vibeNotes, setVibeNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [productionUpdate, setProductionUpdate] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [artApproved, setArtApproved] = useState(false);
  const [orderFinalized, setOrderFinalized] = useState(false);
  const [vibeProcessed, setVibeProcessed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedOrder, setEditedOrder] = useState<any>({});
  useEffect(() => {
    checkAdminStatus();
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
      setIsAdmin(data?.role === 'admin');
      setIsVibeAdmin((data?.role as string) === 'vibe_admin');
    }
  };
  const fetchOrder = async () => {
    setLoading(true);
    const {
      data,
      error
    } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (!error && data) {
      setOrder(data);
      setEditedOrder(data);
      setVibeProcessed(data.vibe_processed || false);
      setOrderFinalized(data.order_finalized || false);
      
      // Check artwork approval status for all products in order
      if (data.order_items && data.order_items.length > 0) {
        const productIds = data.order_items.map((item: any) => item.product_id);
        const { data: artworkData } = await supabase
          .from('artwork_files')
          .select('is_approved, sku')
          .in('sku', data.order_items.map((item: any) => item.sku));
        
        // All products must have approved artwork
        const allApproved = data.order_items.every((item: any) => 
          artworkData?.some((art: any) => art.sku === item.sku && art.is_approved)
        );
        setArtApproved(allApproved);
      }
    }
    setLoading(false);
  };
  const handleAddVibeNote = () => {
    if (!vibeNotes.trim() || !isAdmin) return;
    toast({
      title: "Vibe Note Added",
      description: "Your note has been saved to the order."
    });
    setVibeNotes("");
  };
  const handleAddTracking = () => {
    if (!trackingNumber.trim()) return;
    toast({
      title: "Tracking Added",
      description: `Tracking number ${trackingNumber} has been added.`
    });
    setTrackingNumber("");
  };
  const handleAddProductionUpdate = () => {
    if (!productionUpdate.trim()) return;
    toast({
      title: "Production Update Added",
      description: "Production update has been logged."
    });
    setProductionUpdate("");
  };

  const handleOrderFinalized = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        order_finalized: true,
        order_finalized_at: new Date().toISOString(),
        order_finalized_by: user.id
      })
      .eq('id', orderId);

    if (!error) {
      setOrderFinalized(true);
      toast({
        title: "Order Finalized",
        description: "Order has been approved and finalized."
      });
      fetchOrder();
    }
  };

  const handleVibeProcessed = async () => {
    if (!isAdmin) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        vibe_processed: true,
        vibe_processed_at: new Date().toISOString(),
        vibe_processed_by: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', orderId);

    if (!error) {
      setVibeProcessed(true);
      toast({
        title: "Order Processed",
        description: "Order has been marked as Vibe Processed."
      });
      fetchOrder();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (!error) {
      toast({
        title: "Status Updated",
        description: `Order status changed to ${newStatus}`
      });
      fetchOrder();
    } else {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive"
      });
    }
  };

  const handleSaveOrder = async () => {
    if (!isAdmin) return;

    const { error } = await supabase
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
        memo: editedOrder.memo
      })
      .eq('id', orderId);

    if (!error) {
      toast({
        title: "Order Updated",
        description: "Order details saved successfully"
      });
      setIsEditMode(false);
      fetchOrder();
    } else {
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive"
      });
    }
  };
  const handleDownloadPackingList = () => {
    toast({
      title: "Downloading Packing List",
      description: "Generating packing list PDF..."
    });
  };
  const handleDownloadInvoice = () => {
    toast({
      title: "Downloading Invoice",
      description: "Generating invoice PDF..."
    });
  };
  if (loading) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading order...</p>
      </div>;
  }
  if (!order) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Order not found</p>
      </div>;
  }
  const subtotal = order.subtotal || 0;
  const total = order.total || 0;
  return <div className="max-w-7xl mx-auto">
      {/* Header with Back Button and Action Buttons */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              {order.status === 'pending' && (
                <Button 
                  variant="default" 
                  onClick={() => handleStatusChange('open')}
                >
                  Process Order → Open
                </Button>
              )}
              {order.status === 'open' && (
                <Button 
                  variant="default" 
                  onClick={() => handleStatusChange('in_production')}
                >
                  Start Production
                </Button>
              )}
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditMode(false);
                    setEditedOrder(order);
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveOrder}>
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Order
                </Button>
              )}
            </>
          )}
          {isVibeAdmin && order?.order_items && order.order_items.length > 0 && (
            <Button onClick={() => setShowVendorDialog(true)}>
              <Truck className="h-4 w-4 mr-2" />
              Assign Vendors
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPackingList}>
            <Download className="h-4 w-4 mr-2" />
            Packing List
          </Button>
          <Button variant="outline" onClick={handleDownloadInvoice}>
            <Download className="h-4 w-4 mr-2" />
            Invoice
          </Button>
        </div>
      </div>

      {/* Vendor Assignment Dialog */}
      {isVibeAdmin && order?.order_items && (
        <VendorAssignmentDialog
          open={showVendorDialog}
          onOpenChange={setShowVendorDialog}
          orderId={orderId || ''}
          orderItems={order.order_items}
          onSuccess={fetchOrder}
        />
      )}

      {/* Order Checklist */}
      <Card className="mb-6 shadow-md">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Order Status Checklist</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              {artApproved ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Art Approved</p>
                <p className="text-sm text-muted-foreground">
                  {artApproved ? "All artwork approved" : "Pending artwork approval"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {orderFinalized ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Order Finalized Approval</p>
                <p className="text-sm text-muted-foreground">
                  {orderFinalized ? "Order approved by customer" : "Pending customer approval"}
                </p>
              </div>
              {!orderFinalized && order?.status === 'pending' && (
                <Button size="sm" onClick={handleOrderFinalized}>
                  Approve Order
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {vibeProcessed ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Vibe Processed</p>
                <p className="text-sm text-muted-foreground">
                  {vibeProcessed ? "Order reviewed and approved" : "Pending admin review"}
                </p>
              </div>
              {isAdmin && !vibeProcessed && (
                <Button size="sm" onClick={handleVibeProcessed}>
                  Mark as Processed
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Order Card - ERP Style */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Order Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Order #{order.order_number}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Order Date: {new Date(order.order_date || order.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Due Date: {order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set'}</span>
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-sm px-4 py-1.5 mb-2 capitalize">{order.status}</Badge>
                {isEditMode ? (
                  <Input
                    value={editedOrder.po_number || ''}
                    onChange={(e) => setEditedOrder({...editedOrder, po_number: e.target.value})}
                    placeholder="PO Number"
                    className="text-sm mt-2"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">PO #: {order.po_number || '-'}</p>
                )}
              </div>
            </div>

            {/* Customer & Address Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Customer</h3>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.customer_name}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_name: e.target.value})}
                      placeholder="Customer Name"
                    />
                    <Input
                      value={editedOrder.customer_email || ''}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_email: e.target.value})}
                      placeholder="Email"
                    />
                    <Input
                      value={editedOrder.customer_phone || ''}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_phone: e.target.value})}
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
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.shipping_name}
                      onChange={(e) => setEditedOrder({...editedOrder, shipping_name: e.target.value})}
                      placeholder="Name"
                    />
                    <Input
                      value={editedOrder.shipping_street}
                      onChange={(e) => setEditedOrder({...editedOrder, shipping_street: e.target.value})}
                      placeholder="Street"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editedOrder.shipping_city}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_city: e.target.value})}
                        placeholder="City"
                      />
                      <Input
                        value={editedOrder.shipping_state}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_state: e.target.value})}
                        placeholder="ST"
                        className="w-20"
                      />
                      <Input
                        value={editedOrder.shipping_zip}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_zip: e.target.value})}
                        placeholder="ZIP"
                        className="w-28"
                      />
                    </div>
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
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Bill To</h3>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.billing_name || editedOrder.shipping_name}
                      onChange={(e) => setEditedOrder({...editedOrder, billing_name: e.target.value})}
                      placeholder="Name"
                    />
                    <Input
                      value={editedOrder.billing_street || editedOrder.shipping_street}
                      onChange={(e) => setEditedOrder({...editedOrder, billing_street: e.target.value})}
                      placeholder="Street"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editedOrder.billing_city || editedOrder.shipping_city}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_city: e.target.value})}
                        placeholder="City"
                      />
                      <Input
                        value={editedOrder.billing_state || editedOrder.shipping_state}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_state: e.target.value})}
                        placeholder="ST"
                        className="w-20"
                      />
                      <Input
                        value={editedOrder.billing_zip || editedOrder.shipping_zip}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_zip: e.target.value})}
                        placeholder="ZIP"
                        className="w-28"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.billing_name || order.shipping_name}</p>
                    <p className="text-sm text-muted-foreground">{order.billing_street || order.shipping_street}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.billing_city || order.shipping_city}, {order.billing_state || order.shipping_state} {order.billing_zip || order.shipping_zip}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Items Table - ERP Style */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Items</h2>
            <div className="border border-table-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header">
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.order_items?.map((item: any, index: number) => <TableRow key={index}>
                      <TableCell>
                        <div className="w-12 h-12 bg-muted rounded border border-table-border flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.item_id || '-'}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs">{item.description || '-'}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${item.unit_price?.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-medium">${item.total?.toFixed(3)}</TableCell>
                    </TableRow>)}
                </TableBody>
              </Table>
            </div>

            {/* Totals Section - Right Aligned */}
            <div className="flex justify-end mt-6">
              <div className="w-80 space-y-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-lg">Total:</span>
                  <span className="font-bold text-xl">${total.toFixed(3)}</span>
                </div>
              </div>
            </div>

            {/* Memo Section */}
            {(order.memo || isEditMode) && (
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Memo</h3>
                {isEditMode ? (
                  <Textarea
                    value={editedOrder.memo || ''}
                    onChange={(e) => setEditedOrder({...editedOrder, memo: e.target.value})}
                    placeholder="Add order memo..."
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{order.memo}</p>
                )}
              </div>
            )}

            {/* Terms and Conditions */}
            <div className="mt-8 p-6 bg-muted/30 rounded-lg border border-table-border">
              <h3 className="text-sm font-semibold mb-3">Terms and Conditions</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Payment Terms:</strong> {order.terms}</p>
                <div className="space-y-1 pl-4">
                  <p>• Payment is due according to the terms specified above</p>
                  <p>• Late payments may incur additional fees</p>
                  <p>• All prices are in USD unless otherwise specified</p>
                </div>
                <p className="pt-2"><strong>Order Acceptance:</strong> All orders are subject to acceptance and availability</p>
                <p><strong>Shipping & Delivery:</strong> Delivery dates are estimates only. Risk of loss passes to buyer upon delivery to carrier</p>
                <p><strong>Returns:</strong> Custom orders cannot be cancelled once production begins. Standard items may be returned within 30 days</p>
                <p><strong>Liability:</strong> Our liability is limited to the purchase price of the products</p>
              </div>
            </div>
          </div>

          {/* Vibe Notes & Internal Management Section - Admin Only Editing */}
          <div className="border-t border-table-border bg-muted/30 p-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Vibe Notes & Management</h2>
              {isAdmin ? <Badge variant="default" className="text-xs">Admin</Badge> : <Badge variant="outline" className="text-xs">View Only</Badge>}
            </div>
            
            {isAdmin && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Vibe Notes */}
                <div className="p-4 bg-background rounded-lg border border-table-border">
                  <h3 className="font-medium text-sm mb-3">Add Vibe Note (Visible to Customer)</h3>
                  <Textarea placeholder="Add a note visible to the customer..." value={vibeNotes} onChange={e => setVibeNotes(e.target.value)} rows={3} className="mb-2" />
                  <Button onClick={handleAddVibeNote} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Vibe Note
                  </Button>
                </div>

                {/* Tracking */}
                <div className="p-4 bg-background rounded-lg border border-table-border">
                  <h3 className="font-medium text-sm mb-3">Tracking Information</h3>
                  <div className="space-y-2">
                    <Input placeholder="Enter tracking number..." value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
                    <Button onClick={handleAddTracking} size="sm" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Tracking
                    </Button>
                  </div>
                  {order.tracking_number && <div className="mt-3 p-3 bg-muted/50 rounded">
                      <p className="text-xs font-medium mb-1">Current Tracking</p>
                      <p className="text-sm font-mono">{order.tracking_number}</p>
                    </div>}
                </div>

                {/* Production Updates */}
                <div className="p-4 bg-background rounded-lg border border-table-border md:col-span-2">
                  <h3 className="font-medium text-sm mb-3">Production Updates (Internal Only)</h3>
                  <div className="space-y-2">
                    <Textarea placeholder="Add internal production update..." value={productionUpdate} onChange={e => setProductionUpdate(e.target.value)} rows={3} />
                    <Button onClick={handleAddProductionUpdate} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Update
                    </Button>
                  </div>
                </div>

                {/* Image Upload */}
                <div className="md:col-span-2">
                  <Button variant="outline" className="w-full md:w-auto">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Production Images
                  </Button>
                </div>
              </div>}

            {/* Display Vibe Notes (Visible to All) */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Customer-Visible Notes</h3>
              {!order.vibeNotes || order.vibeNotes.length === 0 ? <p className="text-sm text-muted-foreground p-4 bg-background rounded border border-table-border">
                  No vibe notes yet
                </p> : order.vibeNotes?.map((note: any, index: number) => <div key={index} className="p-4 bg-background rounded-lg border border-table-border">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium text-primary">{note.author}</span>
                      <span className="text-xs text-muted-foreground">{note.date}</span>
                    </div>
                    <p className="text-sm">{note.text}</p>
                  </div>)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default OrderDetail;