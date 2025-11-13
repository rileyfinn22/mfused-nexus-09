import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Plus, Upload, FileText, Package, CheckCircle2, Circle, Truck, Edit, AlertCircle, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VendorAssignmentDialog } from "@/components/VendorAssignmentDialog";
import { CreateShipmentInvoiceDialog } from "@/components/CreateShipmentInvoiceDialog";
import { generateInvoiceNumber } from "@/lib/invoiceUtils";

const STAGE_NAMES = [
  { value: 'production_proceeding_part_1', label: 'Production Proceeding (Part 1)', order: 1 },
  { value: 'production_proceeding_part_2', label: 'Production Proceeding (Part 2)', order: 2 },
  { value: 'complete_qc', label: 'Completed & QC', order: 3 },
  { value: 'shipped', label: 'Shipped', order: 4 },
  { value: 'delivered', label: 'Delivered', order: 5 },
];

const OrderDetail = () => {
  const {
    orderId
  } = useParams();
  const navigate = useNavigate();
  const [vibeNotes, setVibeNotes] = useState("");
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
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [productionStages, setProductionStages] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [stageUpdates, setStageUpdates] = useState<{[key: string]: any[]}>({});
  const [isVendor, setIsVendor] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [stageNotes, setStageNotes] = useState<{[key: string]: string}>({});
  const [stageImages, setStageImages] = useState<{[key: string]: File | null}>({});
  const [updatingStages, setUpdatingStages] = useState<{[key: string]: boolean}>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  useEffect(() => {
    checkAdminStatus();
    if (orderId) {
      fetchOrder();
      fetchProductionStages();
      fetchVendors();
      fetchInvoices();
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
      const role = data?.role as string;
      setIsAdmin(role === 'admin' || role === 'vibe_admin');
      setIsVibeAdmin(role === 'vibe_admin');
      setIsVendor(role === 'vendor');

      if (role === 'vendor') {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setVendorId(vendorData?.id || null);
      }
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
      setEditedItems(data.order_items || []);
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

  const fetchProductionStages = async () => {
    let stagesQuery = supabase
      .from('production_stages')
      .select('*, vendors(name)')
      .eq('order_id', orderId)
      .order('sequence_order');

    // Vendors only see their assigned stages
    if (isVendor && vendorId) {
      stagesQuery = stagesQuery.eq('vendor_id', vendorId);
    }

    const { data, error } = await stagesQuery;
    
    if (!error && data) {
      setProductionStages(data);
      
      // Fetch updates for each stage
      const updates: {[key: string]: any[]} = {};
      for (const stage of data) {
        const { data: stageUpdatesData } = await supabase
          .from('production_stage_updates')
          .select('*')
          .eq('stage_id', stage.id)
          .order('created_at', { ascending: false });
        
        if (stageUpdatesData) {
          updates[stage.id] = stageUpdatesData;
        }
      }
      setStageUpdates(updates);
    }
  };

  const fetchVendors = async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setVendors(data);
    }
  };

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', orderId)
      .order('shipment_number');
    
    if (data) {
      setInvoices(data);
    }
  };

  const initializeStages = async () => {
    try {
      const stagesToCreate = STAGE_NAMES.map(stage => ({
        order_id: orderId,
        stage_name: stage.value,
        sequence_order: stage.order,
        status: 'pending'
      }));

      const { error } = await supabase
        .from('production_stages')
        .insert(stagesToCreate);

      if (error) throw error;
      
      await fetchProductionStages();
      
      toast({
        title: "Success",
        description: "Production stages initialized successfully",
      });
    } catch (error: any) {
      console.error('Error initializing stages:', error);
      toast({
        title: "Error",
        description: "Failed to initialize stages",
        variant: "destructive",
      });
    }
  };

  const calculateProductionProgress = () => {
    if (productionStages.length === 0) return 0;
    const completedStages = productionStages.filter(s => s.status === 'completed').length;
    return Math.round((completedStages / productionStages.length) * 100);
  };

  const handleStageStatusChange = async (stageId: string, newStatus: string) => {
    // Both vendors and vibe admins can update stage status
    if (!isVibeAdmin && !isVendor) return;

    // Vendors can only update their own stages
    if (isVendor) {
      const stage = productionStages.find(s => s.id === stageId);
      if (!stage || stage.vendor_id !== vendorId) {
        toast({
          title: "Error",
          description: "You can only update your assigned stages",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      setUpdatingStages(prev => ({ ...prev, [stageId]: true }));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let imageUrl = null;

      // Upload image if provided
      if (stageImages[stageId]) {
        const fileExt = stageImages[stageId]!.name.split('.').pop();
        const fileName = `${stageId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('production-images')
          .upload(fileName, stageImages[stageId]!);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('production-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Update stage status
      const { error } = await supabase
        .from('production_stages')
        .update({ status: newStatus })
        .eq('id', stageId);

      if (error) throw error;

      // Create updates
      const updates = [];

      // Status change update
      updates.push({
        stage_id: stageId,
        updated_by: user.id,
        update_type: 'status_change',
        previous_status: productionStages.find(s => s.id === stageId)?.status,
        new_status: newStatus,
        note_text: stageNotes[stageId] || null,
        image_url: imageUrl,
      });

      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('production_stage_updates')
          .insert(updates);

        if (updateError) throw updateError;
      }

      // Clear note and image for this stage
      setStageNotes(prev => ({ ...prev, [stageId]: "" }));
      setStageImages(prev => ({ ...prev, [stageId]: null }));

      toast({
        title: "Stage Updated",
        description: "Production stage has been updated successfully"
      });
      fetchProductionStages();
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({
        title: "Error",
        description: "Failed to update stage",
        variant: "destructive"
      });
    } finally {
      setUpdatingStages(prev => ({ ...prev, [stageId]: false }));
    }
  };

  const handleAssignVendor = async (stageId: string, vendorId: string) => {
    if (!isVibeAdmin) return;

    const actualVendorId = vendorId === 'none' ? null : vendorId;
    const { error } = await supabase
      .from('production_stages')
      .update({ vendor_id: actualVendorId })
      .eq('id', stageId);

    if (!error) {
      toast({
        title: "Vendor Assigned",
        description: "Vendor has been assigned to the stage"
      });
      fetchProductionStages();
    } else {
      toast({
        title: "Error",
        description: "Failed to assign vendor",
        variant: "destructive"
      });
    }
  };

  const handleAddVibeNote = async () => {
    if (!vibeNotes.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get current notes or initialize empty array
    const currentNotes = order.vibenotes || [];
    
    // Create new note object
    const newNote = {
      author: user.email || 'Unknown',
      date: new Date().toLocaleString(),
      text: vibeNotes.trim()
    };

    // Add new note to the array
    const updatedNotes = [...currentNotes, newNote];

    // Update order in database
    const { error } = await supabase
      .from('orders')
      .update({ vibenotes: updatedNotes })
      .eq('id', orderId);

    if (!error) {
      toast({
        title: "Vibe Note Added",
        description: "Your note has been saved to the order."
      });
      setVibeNotes("");
      fetchOrder(); // Refresh order to show new note
    } else {
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('orders')
      .update({ 
        vibe_processed: true,
        vibe_processed_at: new Date().toISOString(),
        vibe_processed_by: user.id
      })
      .eq('id', orderId);

    if (!error) {
      // Check if invoice already exists
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!existingInvoice) {
        // Create invoice with status "Final Review"
        const invoiceNumber = generateInvoiceNumber(1);
        const { error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            company_id: order.company_id,
            order_id: orderId,
            invoice_number: invoiceNumber,
            status: 'final_review',
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            created_by: user.id
          });

        if (invoiceError) {
          toast({
            title: "Warning",
            description: "Order processed but invoice creation failed",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Order Processed",
            description: "Order marked as Vibe Processed and invoice created with Final Review status."
          });
        }
      } else {
        toast({
          title: "Order Processed",
          description: "Order has been marked as Vibe Processed."
        });
      }
      
      setVibeProcessed(true);
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
      // If moving to production, automatically create invoice and mark as vibe processed
      if (newStatus === 'in production' && isVibeAdmin) {
        await handleVibeProcessed();
      }
      
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

    try {
      // Update each order item with new unit prices and quantities
      for (const item of editedItems) {
        const newTotal = Number(item.quantity) * Number(item.unit_price);
        
        const { error } = await supabase
          .from('order_items')
          .update({
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: newTotal
          })
          .eq('id', item.id);

        if (error) throw error;
      }

      // Recalculate order totals
      const newSubtotal = editedItems.reduce((sum, item) => 
        sum + (Number(item.quantity) * Number(item.unit_price)), 0
      );
      const newTotal = newSubtotal + Number(editedOrder.tax || 0);

      // Update order
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
          memo: editedOrder.memo,
          subtotal: newSubtotal,
          total: newTotal
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      toast({
        title: "Order Updated",
        description: "Order details saved successfully"
      });
      setIsEditMode(false);
      fetchOrder();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive"
      });
    }
  };

  const handleItemPriceChange = (itemId: string, newPrice: number) => {
    setEditedItems(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, unit_price: newPrice, total: Number(item.quantity) * newPrice }
          : item
      )
    );
  };

  const handleItemQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    
    setEditedItems(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, quantity: newQuantity, total: newQuantity * Number(item.unit_price) }
          : item
      )
    );
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
  const displayItems = isEditMode ? editedItems : (order.order_items || []);
  const subtotal = isEditMode 
    ? displayItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unit_price)), 0)
    : (order.subtotal || 0);
  const total = isEditMode
    ? subtotal + Number(order.tax || 0)
    : (order.total || 0);
  return <div className="max-w-7xl mx-auto">
      {/* Process Order Banner for Pending Orders */}
      {isVibeAdmin && (order.status === 'pending' || order.status === 'pending_pull') && (
        <div className="mb-6 p-4 bg-blue-500/10 border-2 border-blue-500 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-600">Order Ready to Process</h3>
              <p className="text-sm text-muted-foreground">This order is pending and ready to be moved to production</p>
            </div>
            <Button 
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleStatusChange('in production')}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Process Order → Production
            </Button>
          </div>
        </div>
      )}
      
      {/* Header with Back Button and Action Buttons */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditMode(false);
                    setEditedOrder(order);
                    setEditedItems(order.order_items || []);
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveOrder}>
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditMode(true)}
                  disabled={!isVibeAdmin && (order.status === 'in production' || order.status === 'shipped' || order.status === 'delivered' || order.vibe_processed)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Order
                </Button>
              )}
            </>
          )}
          {isVibeAdmin && (
            <Button variant="outline" onClick={() => setShowVendorDialog(true)}>
              <Package className="h-4 w-4 mr-2" />
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
              {isVibeAdmin && !vibeProcessed && (
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

          {/* Order Fulfillment Status Section */}
          {!isEditMode && (
            <div className="p-8 border-t border-table-border bg-gradient-to-b from-primary/5 to-transparent">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Fulfillment Status
              </h2>
              
              {(() => {
                const totalOrdered = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
                const totalShipped = order.order_items?.reduce((sum: number, item: any) => sum + (item.shipped_quantity || 0), 0) || 0;
                const fulfillmentProgress = totalOrdered > 0 ? (totalShipped / totalOrdered) * 100 : 0;
                
                return (
                  <>
                    {/* Overall Progress */}
                    <div className="mb-6 p-4 bg-background rounded-lg border border-table-border">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-sm text-muted-foreground">
                          {totalShipped} of {totalOrdered} units shipped ({fulfillmentProgress.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={fulfillmentProgress} className="h-3" />
                      <div className="flex justify-between mt-2">
                        <Badge variant={totalShipped === 0 ? "secondary" : totalShipped < totalOrdered ? "outline" : "default"}>
                          {totalShipped === 0 ? "Not Shipped" : totalShipped < totalOrdered ? "Partially Shipped" : "Fully Shipped"}
                        </Badge>
                        {invoices.length > 0 && (
                          <span className="text-xs text-muted-foreground">{invoices.length} shipment(s) created</span>
                        )}
                      </div>
                    </div>

                    {/* Item-by-Item Breakdown */}
                    <div className="border border-table-border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-table-header">
                            <TableHead>Item</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Ordered</TableHead>
                            <TableHead className="text-right">Shipped</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                            <TableHead className="w-48">Progress</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.order_items?.map((item: any) => {
                            const shipped = item.shipped_quantity || 0;
                            const remaining = item.quantity - shipped;
                            const itemProgress = (shipped / item.quantity) * 100;
                            
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right font-medium">{shipped}</TableCell>
                                <TableCell className="text-right">
                                  <span className={remaining > 0 ? "text-warning" : "text-success"}>
                                    {remaining}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={itemProgress} className="h-2 flex-1" />
                                    <span className="text-xs text-muted-foreground w-12 text-right">
                                      {itemProgress.toFixed(0)}%
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Items Table - ERP Style */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">
              Items
              {isEditMode && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Editing Mode - Adjust quantities and prices as needed)
                </span>
              )}
            </h2>
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
                  {displayItems.map((item: any, index: number) => <TableRow key={index}>
                      <TableCell>
                        <div className="w-12 h-12 bg-muted rounded border border-table-border flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.item_id || '-'}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs">{item.description || '-'}</TableCell>
                      <TableCell className="text-right">
                        {isEditMode ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => handleItemQuantityChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-24 text-right"
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditMode ? (
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => handleItemPriceChange(item.id, parseFloat(e.target.value) || 0)}
                            className="w-28 text-right"
                          />
                        ) : (
                          `$${item.unit_price?.toFixed(3)}`
                        )}
                      </TableCell>
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

            {/* Shipments & Invoices Section - Enhanced */}
            {isVibeAdmin && (
              <div className="mt-8 p-6 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Shipments & Invoices
                    </h3>
                    {invoices.length > 0 && (() => {
                      const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
                      const billingProgress = (totalBilled / order.total) * 100;
                      return (
                        <p className="text-sm text-muted-foreground mt-1">
                          {invoices.length} shipment(s) • ${totalBilled.toFixed(2)} billed ({billingProgress.toFixed(1)}% of order total)
                        </p>
                      );
                    })()}
                  </div>
                  <Button onClick={() => setShowShipmentDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Shipment Invoice
                  </Button>
                </div>
                
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shipment invoices created yet. Create your first one to start billing.</p>
                ) : (
                  <div className="space-y-3">
                    {invoices.map((invoice, idx) => (
                      <div 
                        key={invoice.id} 
                        className="p-4 bg-background rounded-lg border border-table-border hover:border-primary/40 transition-colors cursor-pointer" 
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
                                {invoice.shipment_number}
                              </div>
                              {idx < invoices.length - 1 && (
                                <div className="w-0.5 h-8 bg-table-border mt-2"></div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{invoice.invoice_number}</span>
                                <Badge className={
                                  invoice.invoice_type === 'partial' ? 'bg-blue-500 text-white' :
                                  invoice.invoice_type === 'final' ? 'bg-green-500 text-white' :
                                  'bg-purple-500 text-white'
                                }>
                                  {invoice.invoice_type?.toUpperCase() || 'FULL'}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {invoice.status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Created: {new Date(invoice.created_at).toLocaleDateString()}</span>
                                {invoice.shipping_cost > 0 && (
                                  <span>• Shipping: ${Number(invoice.shipping_cost).toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">${Number(invoice.total).toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">{invoice.billed_percentage?.toFixed(1)}% of order</p>
                            {(() => {
                              const cumulativeBilled = invoices.slice(0, idx + 1).reduce((sum, inv) => sum + Number(inv.total), 0);
                              const cumulativePercent = (cumulativeBilled / order.total) * 100;
                              return (
                                <p className="text-xs text-primary font-medium mt-1">
                                  Cumulative: {cumulativePercent.toFixed(1)}%
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <CreateShipmentInvoiceDialog
              open={showShipmentDialog}
              onOpenChange={setShowShipmentDialog}
              order={order}
              onSuccess={() => {
                fetchInvoices();
                fetchOrder();
              }}
            />

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

          {/* Vibe Notes Section */}
          <div className="border-t border-table-border bg-muted/30 p-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Vibe Notes</h2>
            </div>
            
            <div className="mb-6">
              {/* Vibe Notes - All Users Can Add */}
              <div className="p-4 bg-background rounded-lg border border-table-border">
                <h3 className="font-medium text-sm mb-3">Add Vibe Note</h3>
                <Textarea placeholder="Add a note..." value={vibeNotes} onChange={e => setVibeNotes(e.target.value)} rows={3} className="mb-2" />
                <Button onClick={handleAddVibeNote} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </div>

            {/* Display Vibe Notes (Visible to All) */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Notes</h3>
              {!order.vibenotes || order.vibenotes.length === 0 ? <p className="text-sm text-muted-foreground p-4 bg-background rounded border border-table-border">
                  No vibe notes yet
                </p> : order.vibenotes?.map((note: any, index: number) => <div key={index} className="p-4 bg-background rounded-lg border border-table-border">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium text-primary">{note.author}</span>
                      <span className="text-xs text-muted-foreground">{note.date}</span>
                    </div>
                    <p className="text-sm">{note.text}</p>
                  </div>)}
            </div>
          </div>

          {/* Production Stages Section */}
          {order.status === 'in production' && (
            <div className="border-t border-table-border bg-muted/30 p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Production Stages</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Overall Progress:</span>
                  <div className="flex items-center gap-2 w-48">
                    <Progress value={calculateProductionProgress()} className="h-2 flex-1" />
                    <span className="text-sm font-semibold">{calculateProductionProgress()}%</span>
                  </div>
                </div>
              </div>

              {productionStages.length === 0 ? (
                <div className="text-center py-8 p-4 bg-background rounded-lg border border-table-border">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-4">No production stages have been set up for this order yet.</p>
                  {isVibeAdmin && (
                    <Button onClick={initializeStages}>
                      <Plus className="h-4 w-4 mr-2" />
                      Initialize Production Stages
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {productionStages.map((stage, index) => (
                    <div key={stage.id} className="p-4 bg-background rounded-lg border border-table-border">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                            stage.status === 'completed' ? 'bg-green-500 text-white' :
                            stage.status === 'in_progress' ? 'bg-blue-500 text-white' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-medium">{STAGE_NAMES.find(s => s.value === stage.stage_name)?.label || stage.stage_name.replace(/_/g, ' ')}</h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            stage.status === 'completed' ? 'bg-green-500' :
                            stage.status === 'in_progress' ? 'bg-blue-500' :
                            'bg-muted-foreground'
                          }>
                            {stage.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      {(isVibeAdmin || (isVendor && stage.vendor_id === vendorId)) && (
                        <div className="space-y-3 mt-3 pt-3 border-t border-table-border">
                          <div>
                            <Label className="text-xs">Status</Label>
                            <Select
                              value={stage.status}
                              onValueChange={(value) => {
                                setProductionStages(prev => 
                                  prev.map(s => s.id === stage.id ? { ...s, status: value } : s)
                                );
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label htmlFor={`note-${stage.id}`} className="text-xs">Add Note (Optional)</Label>
                            <Textarea
                              id={`note-${stage.id}`}
                              value={stageNotes[stage.id] || ""}
                              onChange={(e) => setStageNotes(prev => ({ ...prev, [stage.id]: e.target.value }))}
                              placeholder="Add notes about the update..."
                              rows={2}
                              className="mt-1 text-xs"
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor={`image-${stage.id}`} className="text-xs">Add Image (Optional)</Label>
                            <Input
                              id={`image-${stage.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => setStageImages(prev => ({ ...prev, [stage.id]: e.target.files?.[0] || null }))}
                              className="mt-1 text-xs"
                            />
                            {stageImages[stage.id] && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Selected: {stageImages[stage.id]!.name}
                              </p>
                            )}
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={() => handleStageStatusChange(stage.id, stage.status)}
                            disabled={updatingStages[stage.id]}
                            className="w-full"
                          >
                            {updatingStages[stage.id] ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              "Update Stage"
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Stage Updates */}
                      {stageUpdates[stage.id] && stageUpdates[stage.id].length > 0 && (
                        <div className="mt-3 pt-3 border-t border-table-border">
                          <p className="text-xs font-medium mb-2">Recent Updates:</p>
                          <div className="space-y-2">
                            {stageUpdates[stage.id].slice(0, 3).map((update, idx) => (
                              <div key={idx} className="text-xs p-2 bg-muted/50 rounded">
                                <div className="flex justify-between items-start mb-1">
                                  <span className="font-medium capitalize">{update.update_type.replace('_', ' ')}</span>
                                  <span className="text-muted-foreground">
                                    {new Date(update.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                {update.note_text && <p className="text-muted-foreground mb-1">{update.note_text}</p>}
                                {update.image_url && (
                                  <div 
                                    className="relative group cursor-pointer"
                                    onClick={() => setPreviewImage(update.image_url)}
                                  >
                                    <img 
                                      src={update.image_url} 
                                      alt="Production update" 
                                      className="w-full h-32 object-cover rounded border border-table-border mt-1 transition-opacity group-hover:opacity-80"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded">
                                      <span className="text-white text-sm font-medium">Click to preview</span>
                                    </div>
                                  </div>
                                )}
                                {update.previous_status && update.new_status && (
                                  <p className="text-muted-foreground">
                                    Status changed: {update.previous_status} → {update.new_status}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>Production Image</DialogTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setPreviewImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="p-4 overflow-auto">
            {previewImage && (
              <img 
                src={previewImage} 
                alt="Production preview" 
                className="w-full h-auto rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>;
};
export default OrderDetail;