import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Plus, Trash2, Package, Users, Building2, Mail, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  billing_street: z.string().trim().max(500).optional().or(z.literal("")),
  billing_city: z.string().trim().max(100).optional().or(z.literal("")),
  billing_state: z.string().trim().max(50).optional().or(z.literal("")),
  billing_zip: z.string().trim().max(20).optional().or(z.literal("")),
  shipping_street: z.string().trim().max(500).optional().or(z.literal("")),
  shipping_city: z.string().trim().max(100).optional().or(z.literal("")),
  shipping_state: z.string().trim().max(50).optional().or(z.literal("")),
  shipping_zip: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const CustomerDetail = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [customerProducts, setCustomerProducts] = useState<any[]>([]);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    billing_street: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    shipping_street: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (customerId) {
      fetchCustomerDetails();
      fetchProducts();
      fetchCustomerProducts();
    }
  }, [customerId]);

  const fetchCustomerDetails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (error) {
      toast({
        title: "Error loading customer",
        description: error.message,
        variant: "destructive",
      });
      navigate('/customers');
    } else {
      setCustomer(data);
      setFormData({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        billing_street: data.billing_street || "",
        billing_city: data.billing_city || "",
        billing_state: data.billing_state || "",
        billing_zip: data.billing_zip || "",
        shipping_street: data.shipping_street || "",
        shipping_city: data.shipping_city || "",
        shipping_state: data.shipping_state || "",
        shipping_zip: data.shipping_zip || "",
        notes: data.notes || "",
      });
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (!error && data) {
      setProducts(data);
    }
  };

  const fetchCustomerProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('customer_id', customerId)
      .order('name');

    if (!error && data) {
      setCustomerProducts(data);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const validated = customerSchema.parse(formData);

      const { error } = await supabase
        .from('customers')
        .update(validated)
        .eq('id', customerId);

      if (error) throw error;

      toast({
        title: "Customer updated",
        description: "Customer information has been saved successfully.",
      });

      fetchCustomerDetails();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setFormErrors(errors);
      } else {
        toast({
          title: "Error saving customer",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddProducts = async () => {
    try {
      const productsToUpdate = Array.from(selectedProducts);
      
      for (const productId of productsToUpdate) {
        const { error } = await supabase
          .from('products')
          .update({ customer_id: customerId })
          .eq('id', productId);

        if (error) throw error;
      }

      toast({
        title: "Products added",
        description: `${productsToUpdate.length} product(s) linked to ${customer.name}`,
      });

      setShowAddProductDialog(false);
      setSelectedProducts(new Set());
      fetchCustomerProducts();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error adding products",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ customer_id: null })
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: "Product removed",
        description: "Product has been unlinked from this customer",
      });

      fetchCustomerProducts();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error removing product",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const availableProducts = products.filter(p => !p.customer_id || p.customer_id === customerId);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading customer...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            <p className="text-muted-foreground mt-1">Manage customer information, contacts, and products</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* QuickBooks Status */}
      {customer.quickbooks_id && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
              QuickBooks Synced
            </Badge>
            <span className="text-sm text-muted-foreground">
              ID: {customer.quickbooks_id}
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">
            <Building2 className="h-4 w-4 mr-2" />
            Information
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products ({customerProducts.length})
          </TabsTrigger>
        </TabsList>

        {/* Information Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>Primary contact details for this customer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Customer Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  {formErrors.name && <p className="text-sm text-destructive mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="email">
                    <Mail className="h-4 w-4 inline mr-2" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                  {formErrors.email && <p className="text-sm text-destructive mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <Label htmlFor="phone">
                    <Phone className="h-4 w-4 inline mr-2" />
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <MapPin className="h-4 w-4 inline mr-2" />
                Billing Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="billing_street">Street Address</Label>
                  <Input
                    id="billing_street"
                    value={formData.billing_street}
                    onChange={(e) => setFormData({ ...formData, billing_street: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="billing_city">City</Label>
                  <Input
                    id="billing_city"
                    value={formData.billing_city}
                    onChange={(e) => setFormData({ ...formData, billing_city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="billing_state">State</Label>
                  <Input
                    id="billing_state"
                    value={formData.billing_state}
                    onChange={(e) => setFormData({ ...formData, billing_state: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="billing_zip">ZIP Code</Label>
                  <Input
                    id="billing_zip"
                    value={formData.billing_zip}
                    onChange={(e) => setFormData({ ...formData, billing_zip: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <MapPin className="h-4 w-4 inline mr-2" />
                Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="shipping_street">Street Address</Label>
                  <Input
                    id="shipping_street"
                    value={formData.shipping_street}
                    onChange={(e) => setFormData({ ...formData, shipping_street: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="shipping_city">City</Label>
                  <Input
                    id="shipping_city"
                    value={formData.shipping_city}
                    onChange={(e) => setFormData({ ...formData, shipping_city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="shipping_state">State</Label>
                  <Input
                    id="shipping_state"
                    value={formData.shipping_state}
                    onChange={(e) => setFormData({ ...formData, shipping_state: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="shipping_zip">ZIP Code</Label>
                  <Input
                    id="shipping_zip"
                    value={formData.shipping_zip}
                    onChange={(e) => setFormData({ ...formData, shipping_zip: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this customer..."
                rows={4}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Linked Products</CardTitle>
                  <CardDescription>Products associated with {customer.name}</CardDescription>
                </div>
                <Button onClick={() => setShowAddProductDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Products
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customerProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No products linked yet</p>
                  <p className="text-sm mt-2">Click "Add Products" to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{product.category}</Badge>
                            {product.item_id && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {product.item_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveProduct(product.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Products Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Products to {customer.name}</DialogTitle>
            <DialogDescription>
              Select products to link to this customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {availableProducts.filter(p => !customerProducts.find(cp => cp.id === p.id)).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No available products to add</p>
                <p className="text-sm mt-2">All products are already linked to this customer or other customers</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {availableProducts
                  .filter(p => !customerProducts.find(cp => cp.id === p.id))
                  .map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleProductSelection(product.id)}
                    >
                      <Checkbox
                        checked={selectedProducts.has(product.id)}
                        onCheckedChange={() => toggleProductSelection(product.id)}
                      />
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                          {product.item_id && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {product.item_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddProductDialog(false);
              setSelectedProducts(new Set());
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddProducts}
              disabled={selectedProducts.size === 0}
            >
              Add {selectedProducts.size} Product{selectedProducts.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDetail;