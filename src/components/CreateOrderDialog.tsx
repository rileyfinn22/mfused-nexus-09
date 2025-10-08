import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, X } from "lucide-react";
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

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated: () => void;
}

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

export function CreateOrderDialog({ open, onOpenChange, onOrderCreated }: CreateOrderDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);

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
    if (open) {
      fetchProducts();
    }
  }, [open]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      });
      return;
    }
    
    setProducts(data || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one product",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate form data
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

      // Calculate totals
      let subtotal = 0;
      for (const item of selectedItems) {
        const product = products.find(p => p.id === item.productId);
        if (product && product.cost) {
          subtotal += product.cost * item.quantity;
        }
      }

      const tax = subtotal * 0.06;
      const total = subtotal + tax;

      // Generate order number
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });
      
      const orderNumber = `ORD-${String((count || 0) + 1).padStart(3, '0')}`;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          po_number: formData.poNumber || null,
          company_id: userRole.company_id,
          customer_name: formData.customerName,
          customer_email: formData.customerEmail || null,
          customer_phone: formData.customerPhone || null,
          status: 'pending',
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

      // Create order items
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
        title: "Order Created",
        description: `Order ${orderNumber} has been created successfully`,
      });

      // Reset form
      setFormData({
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
      setSelectedItems([]);
      setSameAsBilling(true);
      
      onOrderCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating order:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* ERP-Style Header */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Create New Order</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Complete the information below to create a new order
              </DialogDescription>
            </DialogHeader>
          </div>

          <ScrollArea className="flex-1 px-6">
            <div className="space-y-8 py-6">
              {/* Product Selection - ERP Table Style */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-semibold">Items</Label>
                  <span className="text-sm text-muted-foreground">
                    {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="border border-table-border rounded-lg overflow-hidden">
                  <div className="bg-table-header border-b border-table-border px-4 py-3">
                    <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div className="col-span-1">Select</div>
                      <div className="col-span-2">Item ID</div>
                      <div className="col-span-4">Product/Service</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-2 text-center">Quantity</div>
                      <div className="col-span-1 text-right">Amount</div>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {products.map((product) => {
                      const selected = selectedItems.find(item => item.productId === product.id);
                      const amount = selected ? (product.cost || 0) * selected.quantity : 0;
                      
                      return (
                        <div key={product.id} className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-table-border hover:bg-muted/30 transition-colors items-center">
                          <div className="col-span-1">
                            <Checkbox
                              checked={!!selected}
                              onCheckedChange={() => handleProductToggle(product.id)}
                            />
                          </div>
                          <div className="col-span-2 font-mono text-xs text-muted-foreground">
                            {product.item_id || '-'}
                          </div>
                          <div className="col-span-4">
                            <p className="font-medium text-sm">{product.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                          </div>
                          <div className="col-span-2 text-right text-sm">
                            ${product.cost?.toFixed(2) || '0.00'}
                          </div>
                          <div className="col-span-2">
                            {selected ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleQuantityChange(product.id, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-12 text-center font-medium text-sm">{selected.quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleQuantityChange(product.id, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="text-center text-muted-foreground text-sm">-</div>
                            )}
                          </div>
                          <div className="col-span-1 text-right font-medium text-sm">
                            {selected ? `$${amount.toFixed(2)}` : '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Customer Information - ERP Grid Style */}
              <div className="space-y-4">
                <Label className="text-lg font-semibold">Customer Information</Label>
                <div className="bg-muted/30 rounded-lg p-6 border border-table-border">
                  <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerEmail">Email</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={formData.customerEmail}
                      onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerPhone">Phone</Label>
                    <Input
                      id="customerPhone"
                      value={formData.customerPhone}
                      onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="poNumber">PO Number</Label>
                    <Input
                      id="poNumber"
                      value={formData.poNumber}
                      onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              </div>

              {/* Shipping Address - ERP Grid Style */}
              <div className="space-y-4">
                <Label className="text-lg font-semibold">Shipping Address</Label>
                <div className="bg-muted/30 rounded-lg p-6 border border-table-border">
                  <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="shippingName">Name *</Label>
                    <Input
                      id="shippingName"
                      value={formData.shippingName}
                      onChange={(e) => setFormData({ ...formData, shippingName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="shippingStreet">Street Address *</Label>
                    <Input
                      id="shippingStreet"
                      value={formData.shippingStreet}
                      onChange={(e) => setFormData({ ...formData, shippingStreet: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingCity">City *</Label>
                    <Input
                      id="shippingCity"
                      value={formData.shippingCity}
                      onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingState">State *</Label>
                    <Input
                      id="shippingState"
                      value={formData.shippingState}
                      onChange={(e) => setFormData({ ...formData, shippingState: e.target.value.toUpperCase() })}
                      maxLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingZip">ZIP Code *</Label>
                    <Input
                      id="shippingZip"
                      value={formData.shippingZip}
                      onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>
              </div>

              {/* Order Details - ERP Grid Style */}
              <div className="space-y-4">
                <Label className="text-lg font-semibold">Order Details</Label>
                <div className="bg-muted/30 rounded-lg p-6 border border-table-border">
                  <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="terms">Terms</Label>
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
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="memo">Memo</Label>
                    <Textarea
                      id="memo"
                      value={formData.memo}
                      onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
              </div>

              {/* Order Summary - ERP Style */}
              <div className="bg-gradient-to-r from-primary/5 to-transparent rounded-lg p-6 border border-table-border">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Order Summary</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} • 
                      {' '}{selectedItems.reduce((sum, item) => sum + item.quantity, 0)} total units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Estimated Total</p>
                    <p className="text-2xl font-bold">
                      ${(() => {
                        const subtotal = selectedItems.reduce((sum, item) => {
                          const product = products.find(p => p.id === item.productId);
                          return sum + ((product?.cost || 0) * item.quantity);
                        }, 0);
                        const tax = subtotal * 0.06;
                        return (subtotal + tax).toFixed(2);
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Footer Actions - ERP Style */}
          <div className="border-t border-table-border bg-muted/20 px-6 py-4">
            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="lg">
                Cancel
              </Button>
              <Button type="submit" disabled={loading || selectedItems.length === 0} size="lg" className="min-w-32">
                {loading ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
