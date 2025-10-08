import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Minus, X, Save, Send, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

const orderSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerEmail: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(50).optional().or(z.literal("")),
  shippingName: z.string().trim().min(1, "Shipping name is required").max(200),
  shippingStreet: z.string().trim().min(1, "Street address is required").max(500),
  shippingCity: z.string().trim().min(1, "City is required").max(100),
  shippingState: z.string().trim().min(2, "State is required").max(2),
  shippingZip: z.string().trim().min(1, "ZIP code is required").max(20),
  poNumber: z.string().trim().max(100).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  terms: z.string().max(100),
  memo: z.string().max(1000).optional().or(z.literal("")),
});

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  category: string;
  cost: number | null;
  description: string | null;
  image_url: string | null;
}

interface OrderItem {
  productId: string;
  quantity: number;
}

interface SavedAddress {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  address_type: string;
  is_default: boolean;
}

const CreateOrder = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState<string>("");
  const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedProducts, setTempSelectedProducts] = useState<string[]>([]);
  const [existingOrderNumber, setExistingOrderNumber] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [formData, setFormData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    shippingName: "",
    shippingStreet: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    billingName: "",
    billingStreet: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    poNumber: "",
    dueDate: "",
    terms: "Net 30",
    memo: "",
  });

  useEffect(() => {
    fetchProducts();
    fetchSavedAddresses();
    if (orderId) {
      loadExistingOrder(orderId);
    }
  }, [orderId]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setProducts(data);
    }
  };

  const fetchSavedAddresses = async () => {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setSavedAddresses(data);
    }
  };

  const loadExistingOrder = async (id: string) => {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (!error && order) {
      if (order.status !== 'draft') {
        toast({
          title: "Cannot Edit",
          description: "Only draft orders can be edited",
          variant: "destructive",
        });
        navigate('/orders');
        return;
      }

      setExistingOrderNumber(order.order_number);
      setFormData({
        customerName: order.customer_name,
        customerEmail: order.customer_email || "",
        customerPhone: order.customer_phone || "",
        shippingName: order.shipping_name,
        shippingStreet: order.shipping_street,
        shippingCity: order.shipping_city,
        shippingState: order.shipping_state,
        shippingZip: order.shipping_zip,
        billingName: order.billing_name || "",
        billingStreet: order.billing_street || "",
        billingCity: order.billing_city || "",
        billingState: order.billing_state || "",
        billingZip: order.billing_zip || "",
        poNumber: order.po_number || "",
        dueDate: order.due_date || "",
        terms: order.terms,
        memo: order.memo || "",
      });

      const items = order.order_items.map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
      }));
      setSelectedItems(items);
    }
  };

  const loadAddress = (address: SavedAddress) => {
    setFormData({
      ...formData,
      customerName: address.customer_name,
      customerEmail: address.customer_email || "",
      customerPhone: address.customer_phone || "",
      shippingName: address.name,
      shippingStreet: address.street,
      shippingCity: address.city,
      shippingState: address.state,
      shippingZip: address.zip,
    });
    setShowAddressDialog(false);
  };

  const handleProductToggle = (productId: string) => {
    const exists = selectedItems.find(item => item.productId === productId);
    if (exists) {
      setSelectedItems(selectedItems.filter(item => item.productId !== productId));
    } else {
      setSelectedItems([...selectedItems, { productId, quantity: 1 }]);
    }
  };

  const handleQuantityChange = (productId: string, change: number) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.productId === productId) {
        const newQuantity = Math.max(1, item.quantity + change);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const handleQuantityClick = (productId: string, currentQuantity: number) => {
    setEditingQuantityId(productId);
    setTempQuantity(currentQuantity.toString());
  };

  const handleQuantityBlur = (productId: string) => {
    const newQty = parseInt(tempQuantity) || 1;
    setSelectedItems(selectedItems.map(item => 
      item.productId === productId ? { ...item, quantity: Math.max(1, newQty) } : item
    ));
    setEditingQuantityId(null);
  };

  const handleAddSelectedItems = () => {
    const newItems = tempSelectedProducts.map(productId => ({
      productId,
      quantity: 1
    }));
    setSelectedItems([...selectedItems, ...newItems]);
    setTempSelectedProducts([]);
    setSearchQuery("");
    setShowAddItemsDialog(false);
  };

  const toggleProductSelection = (productId: string) => {
    setTempSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const filteredProducts = products.filter(p => {
    const alreadySelected = selectedItems.find(item => item.productId === p.id);
    if (alreadySelected) return false;
    
    if (!searchQuery) return true;
    
    const search = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(search) ||
      p.item_id?.toLowerCase().includes(search) ||
      p.category.toLowerCase().includes(search)
    );
  });

  const saveOrder = async (isDraft: boolean) => {
    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one product",
        variant: "destructive",
      });
      return;
    }

    if (!isDraft && !termsAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the terms and conditions to place the order",
        variant: "destructive",
      });
      return;
    }

    try {
      orderSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("User company not found");

      let subtotal = 0;
      for (const item of selectedItems) {
        const product = products.find(p => p.id === item.productId);
        if (product && product.cost) {
          subtotal += product.cost * item.quantity;
        }
      }

      const tax = subtotal * 0.06;
      const total = subtotal + tax;

      let order;
      let orderNumber = existingOrderNumber;

      if (orderId) {
        // Update existing order
        const { data: updatedOrder, error: orderError } = await supabase
          .from('orders')
          .update({
            po_number: formData.poNumber || null,
            customer_name: formData.customerName,
            customer_email: formData.customerEmail || null,
            customer_phone: formData.customerPhone || null,
            status: isDraft ? 'draft' : 'pending',
            due_date: formData.dueDate || null,
            shipping_name: formData.shippingName,
            shipping_street: formData.shippingStreet,
            shipping_city: formData.shippingCity,
            shipping_state: formData.shippingState,
            shipping_zip: formData.shippingZip,
            billing_name: sameAsBilling ? formData.shippingName : formData.billingName,
            billing_street: sameAsBilling ? formData.shippingStreet : formData.billingStreet,
            billing_city: sameAsBilling ? formData.shippingCity : formData.billingCity,
            billing_state: sameAsBilling ? formData.shippingState : formData.billingState,
            billing_zip: sameAsBilling ? formData.shippingZip : formData.billingZip,
            subtotal,
            tax,
            total,
            terms: formData.terms,
            memo: formData.memo || null,
          })
          .eq('id', orderId)
          .select()
          .single();

        if (orderError) throw orderError;
        order = updatedOrder;

        // Delete existing order items
        await supabase.from('order_items').delete().eq('order_id', orderId);
      } else {
        // Create new order
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true });
        
        orderNumber = `ORD-${String((count || 0) + 1).padStart(3, '0')}`;

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            po_number: formData.poNumber || null,
            company_id: userRole.company_id,
            customer_name: formData.customerName,
            customer_email: formData.customerEmail || null,
            customer_phone: formData.customerPhone || null,
            status: isDraft ? 'draft' : 'pending',
            due_date: formData.dueDate || null,
            shipping_name: formData.shippingName,
            shipping_street: formData.shippingStreet,
            shipping_city: formData.shippingCity,
            shipping_state: formData.shippingState,
            shipping_zip: formData.shippingZip,
            billing_name: sameAsBilling ? formData.shippingName : formData.billingName,
            billing_street: sameAsBilling ? formData.shippingStreet : formData.billingStreet,
            billing_city: sameAsBilling ? formData.shippingCity : formData.billingCity,
            billing_state: sameAsBilling ? formData.shippingState : formData.billingState,
            billing_zip: sameAsBilling ? formData.shippingZip : formData.billingZip,
            subtotal,
            tax,
            total,
            terms: formData.terms,
            memo: formData.memo || null,
          })
          .select()
          .single();

        if (orderError) throw orderError;
        order = newOrder;
      }

      const orderItems = selectedItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        const itemTotal = (product?.cost || 0) * item.quantity;
        
        return {
          order_id: order.id,
          product_id: item.productId,
          sku: `SKU-${product?.id.substring(0, 8)}`,
          item_id: product?.item_id || null,
          name: product?.name || "",
          description: product?.description || null,
          quantity: item.quantity,
          unit_price: product?.cost || 0,
          total: itemTotal,
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast({
        title: isDraft ? "Draft Saved" : "Order Placed",
        description: `Order ${orderNumber} has been ${isDraft ? 'saved as draft' : 'placed'} successfully`,
      });

      navigate(`/orders/${order.id}`);
    } catch (error: any) {
      console.error("Error saving order:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save order",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const subtotal = selectedItems.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + ((product?.cost || 0) * item.quantity);
  }, 0);
  const tax = subtotal * 0.06;
  const total = subtotal + tax;

  return (
    <div className="max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="mb-6 sticky top-0 bg-background z-10 pb-4 border-b border-table-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">{orderId ? 'Edit Draft Order' : 'Create New Order'}</h1>
              <p className="text-sm text-muted-foreground">
                {orderId ? `Editing ${existingOrderNumber}` : 'Fill in the details below'}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => saveOrder(true)} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button onClick={() => saveOrder(false)} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Placing..." : "Place Order"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Customer & Address Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/30 backdrop-blur rounded-lg p-6 border border-table-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Customer</h3>
              <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    Load Saved
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Saved Addresses</DialogTitle>
                    <DialogDescription>Select an address to load</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {savedAddresses.map((address) => (
                      <div
                        key={address.id}
                        className="p-3 border rounded hover:bg-muted cursor-pointer"
                        onClick={() => loadAddress(address)}
                      >
                        <p className="font-medium">{address.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{address.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {address.street}, {address.city}, {address.state} {address.zip}
                        </p>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="customerName" className="text-xs">Name *</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="customerEmail" className="text-xs">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="customerPhone" className="text-xs">Phone</Label>
                <Input
                  id="customerPhone"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="poNumber" className="text-xs">PO Number</Label>
                <Input
                  id="poNumber"
                  value={formData.poNumber}
                  onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Ship To</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="shippingName" className="text-xs">Name *</Label>
                <Input
                  id="shippingName"
                  value={formData.shippingName}
                  onChange={(e) => setFormData({ ...formData, shippingName: e.target.value })}
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="shippingStreet" className="text-xs">Street *</Label>
                <Input
                  id="shippingStreet"
                  value={formData.shippingStreet}
                  onChange={(e) => setFormData({ ...formData, shippingStreet: e.target.value })}
                  required
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="shippingCity" className="text-xs">City *</Label>
                  <Input
                    id="shippingCity"
                    value={formData.shippingCity}
                    onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="shippingState" className="text-xs">State *</Label>
                  <Input
                    id="shippingState"
                    value={formData.shippingState}
                    onChange={(e) => setFormData({ ...formData, shippingState: e.target.value.toUpperCase() })}
                    maxLength={2}
                    required
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="shippingZip" className="text-xs">ZIP *</Label>
                <Input
                  id="shippingZip"
                  value={formData.shippingZip}
                  onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                  required
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Bill To</h3>
            <div className="flex items-center gap-2 mb-3">
              <Checkbox
                id="sameAsBilling"
                checked={sameAsBilling}
                onCheckedChange={(checked) => setSameAsBilling(checked as boolean)}
              />
              <Label htmlFor="sameAsBilling" className="text-xs cursor-pointer">Same as shipping</Label>
            </div>
            {!sameAsBilling && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="billingName" className="text-xs">Name</Label>
                  <Input
                    id="billingName"
                    value={formData.billingName}
                    onChange={(e) => setFormData({ ...formData, billingName: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billingStreet" className="text-xs">Street</Label>
                  <Input
                    id="billingStreet"
                    value={formData.billingStreet}
                    onChange={(e) => setFormData({ ...formData, billingStreet: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="billingCity" className="text-xs">City</Label>
                    <Input
                      id="billingCity"
                      value={formData.billingCity}
                      onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="billingState" className="text-xs">State</Label>
                    <Input
                      id="billingState"
                      value={formData.billingState}
                      onChange={(e) => setFormData({ ...formData, billingState: e.target.value.toUpperCase() })}
                      maxLength={2}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billingZip" className="text-xs">ZIP</Label>
                  <Input
                    id="billingZip"
                    value={formData.billingZip}
                    onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Items Section */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Items</h2>
          <div className="border border-table-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-header">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Product/Service</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center w-32">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedItems.map((item) => {
                  const product = products.find(p => p.id === item.productId);
                  if (!product) return null;
                  const amount = (product.cost || 0) * item.quantity;
                  
                  return (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleProductToggle(item.productId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{product.item_id || '-'}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {product.description}
                      </TableCell>
                      <TableCell>
                        {editingQuantityId === item.productId ? (
                          <Input
                            type="number"
                            value={tempQuantity}
                            onChange={(e) => setTempQuantity(e.target.value)}
                            onBlur={() => handleQuantityBlur(item.productId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleQuantityBlur(item.productId);
                              if (e.key === 'Escape') setEditingQuantityId(null);
                            }}
                            className="h-8 w-20 text-center"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleQuantityChange(item.productId, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span 
                              className="w-12 text-center font-medium cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              onClick={() => handleQuantityClick(item.productId, item.quantity)}
                            >
                              {item.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleQuantityChange(item.productId, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">${product.cost?.toFixed(2) || '0.00'}</TableCell>
                      <TableCell className="text-right font-medium">${amount.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Add Items Button */}
            <div className="border-t border-table-border p-3 bg-muted/20">
              <Dialog open={showAddItemsDialog} onOpenChange={setShowAddItemsDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full" type="button">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Items
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add Items to Order</DialogTitle>
                    <DialogDescription>
                      Search and select multiple items to add to your order
                    </DialogDescription>
                  </DialogHeader>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, item ID, or category..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Products List */}
                  <div className="flex-1 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={tempSelectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setTempSelectedProducts(filteredProducts.map(p => p.id));
                                } else {
                                  setTempSelectedProducts([]);
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead>Item ID</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              {searchQuery ? "No products found matching your search" : "All products are already added"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProducts.map((product) => (
                            <TableRow 
                              key={product.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleProductSelection(product.id)}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={tempSelectedProducts.includes(product.id)}
                                  onCheckedChange={() => toggleProductSelection(product.id)}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs">{product.item_id || '-'}</TableCell>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                              <TableCell className="text-right">${product.cost?.toFixed(2) || '0.00'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      {tempSelectedProducts.length} item{tempSelectedProducts.length !== 1 ? 's' : ''} selected
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setShowAddItemsDialog(false);
                          setTempSelectedProducts([]);
                          setSearchQuery("");
                        }}
                        type="button"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleAddSelectedItems}
                        disabled={tempSelectedProducts.length === 0}
                        type="button"
                      >
                        Add {tempSelectedProducts.length} Item{tempSelectedProducts.length !== 1 ? 's' : ''}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (6%):</span>
                <span className="font-medium">${tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold text-lg">Total:</span>
                <span className="font-bold text-xl">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Additional Info */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Select value={formData.terms} onValueChange={(value) => setFormData({ ...formData, terms: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 60">Net 60</SelectItem>
                  <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                  <SelectItem value="Prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">Memo</Label>
            <Textarea
              id="memo"
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={3}
              placeholder="Any additional notes or special instructions..."
            />
          </div>

          {/* Terms and Conditions */}
          <div className="bg-muted/30 backdrop-blur rounded-lg p-6 border border-table-border space-y-4">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Terms and Conditions</h3>
            <div className="space-y-3 text-sm text-muted-foreground max-h-64 overflow-y-auto pr-2">
              <div>
                <h4 className="font-semibold text-foreground mb-1">1. Payment Terms</h4>
                <p>Payment is due according to the terms specified above. Late payments may incur additional fees. All prices are in USD unless otherwise specified.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">2. Order Acceptance</h4>
                <p>All orders are subject to acceptance and availability. We reserve the right to refuse or cancel any order for any reason, including product availability, errors in pricing, or credit issues.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">3. Shipping and Delivery</h4>
                <p>Delivery dates are estimates only. We are not liable for delays in delivery. Risk of loss passes to the buyer upon delivery to the carrier. Shipping charges are non-refundable.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">4. Returns and Cancellations</h4>
                <p>Custom orders cannot be cancelled once production has begun. Standard items may be returned within 30 days in original condition. Restocking fees may apply. Customer is responsible for return shipping costs.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">5. Quality and Inspection</h4>
                <p>Products are inspected before shipment. Claims for defects must be made within 7 days of receipt. Our liability is limited to replacement or refund of defective products.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">6. Artwork and Proofs</h4>
                <p>Customer is responsible for approving artwork proofs. Once approved, we are not liable for errors in customer-provided content. Changes after approval may incur additional charges.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">7. Limitation of Liability</h4>
                <p>Our liability is limited to the purchase price of the products. We are not liable for indirect, incidental, or consequential damages.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">8. Force Majeure</h4>
                <p>We are not liable for delays or failure to perform due to circumstances beyond our reasonable control, including natural disasters, labor disputes, or supply chain disruptions.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 pt-4 border-t border-table-border">
              <Checkbox
                id="termsAccepted"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
              />
              <Label htmlFor="termsAccepted" className="text-sm cursor-pointer leading-relaxed">
                I have read and agree to the terms and conditions outlined above. I understand that by placing this order, I am entering into a binding agreement.
              </Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrder;
