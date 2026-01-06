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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  cost: number | null;
  description: string | null;
  image_url: string | null;
}

interface OrderItem {
  productId: string;
  quantity: number;
  unit_price?: number;
}

export function CreateOrderDialog({ open, onOpenChange, onOrderCreated }: CreateOrderDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>("");

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

  const handlePriceClick = (productId: string, currentPrice: number) => {
    setEditingPriceId(productId);
    setTempPrice(currentPrice.toFixed(2));
  };

  const handlePriceBlur = (productId: string) => {
    const newPrice = parseFloat(tempPrice) || 0;
    setSelectedItems(selectedItems.map(item => 
      item.productId === productId ? { ...item, unit_price: Math.max(0, newPrice) } : item
    ));
    setEditingPriceId(null);
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
        const price = item.unit_price ?? product?.cost ?? 0;
        subtotal += price * item.quantity;
      }

      const tax = subtotal * 0.06;
      const total = subtotal + tax;

      // Generate order number - find highest numeric order number from recent orders
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('order_number')
        .order('created_at', { ascending: false })
        .limit(100);
      
      let maxOrderNum = 10699;
      if (recentOrders && recentOrders.length > 0) {
        for (const order of recentOrders) {
          const match = order.order_number.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxOrderNum) {
              maxOrderNum = num;
            }
          }
        }
      }
      const orderNumber = String(maxOrderNum + 1);

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
        const price = item.unit_price ?? product?.cost ?? 0;
        const itemTotal = price * item.quantity;
        
        return {
          order_id: order.id,
          product_id: item.productId,
          sku: `SKU-${product?.id.substring(0, 8)}`,
          item_id: product?.item_id || null,
          name: product?.name || "",
          description: product?.description || null,
          quantity: item.quantity,
          shipped_quantity: item.quantity,
          unit_price: price,
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

          <ScrollArea className="flex-1 px-8 py-6">
            <div className="space-y-6">
              {/* Customer & Address Grid - Similar to Order Detail Page */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/30 backdrop-blur rounded-lg p-6 border border-table-border">
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Customer</h3>
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
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ship To</h3>
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
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Bill To</h3>
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

              {/* Items Section - Like Order Detail Table */}
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
                        const price = item.unit_price ?? product.cost ?? 0;
                        const amount = price * item.quantity;
                        
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
                                <span className="w-12 text-center font-medium">{item.quantity}</span>
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
                            </TableCell>
                            <TableCell className="text-right">
                              {editingPriceId === item.productId ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={tempPrice}
                                  onChange={(e) => setTempPrice(e.target.value)}
                                  onBlur={() => handlePriceBlur(item.productId)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handlePriceBlur(item.productId);
                                    if (e.key === 'Escape') setEditingPriceId(null);
                                  }}
                                  className="h-8 w-24 text-right"
                                  autoFocus
                                />
                              ) : (
                                <span 
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded inline-block"
                                  onClick={() => handlePriceClick(item.productId, price)}
                                >
                                  ${price.toFixed(2)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">${amount.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Add Item Dropdown */}
                  <div className="border-t border-table-border p-3 bg-muted/20">
                    <Select onValueChange={(value) => handleProductToggle(value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Add an item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          .filter(p => !selectedItems.find(item => item.productId === p.id))
                          .map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.item_id ? `${product.item_id} - ` : ''}{product.name} (${product.cost?.toFixed(2) || '0.00'})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Totals - Right Aligned */}
                <div className="flex justify-end">
                  <div className="w-80 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">
                        ${(() => {
                          const subtotal = selectedItems.reduce((sum, item) => {
                            const product = products.find(p => p.id === item.productId);
                            const price = item.unit_price ?? product?.cost ?? 0;
                            return sum + (price * item.quantity);
                          }, 0);
                          return subtotal.toFixed(2);
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax (6%):</span>
                      <span className="font-medium">
                        ${(() => {
                          const subtotal = selectedItems.reduce((sum, item) => {
                            const product = products.find(p => p.id === item.productId);
                            const price = item.unit_price ?? product?.cost ?? 0;
                            return sum + (price * item.quantity);
                          }, 0);
                          const tax = subtotal * 0.06;
                          return tax.toFixed(2);
                        })()}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="font-semibold text-lg">Total:</span>
                      <span className="font-bold text-xl">
                        ${(() => {
                          const subtotal = selectedItems.reduce((sum, item) => {
                            const product = products.find(p => p.id === item.productId);
                            const price = item.unit_price ?? product?.cost ?? 0;
                            return sum + (price * item.quantity);
                          }, 0);
                          const tax = subtotal * 0.06;
                          return (subtotal + tax).toFixed(2);
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms & Additional Info */}
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
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <div className="border-t border-table-border bg-muted/20 px-8 py-4">
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
