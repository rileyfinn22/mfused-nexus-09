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
import { ArrowLeft, Save, Plus, Trash2, Package, Users, Building2, Mail, Phone, MapPin, Upload, FileSpreadsheet, AlertCircle, Loader2, Edit, FileImage, CheckCircle, Clock, Eye, Search } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Papa from "papaparse";
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

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  state: z.string().trim().min(1, "State is required").max(50),
  item_id: z.string().trim().max(100).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  price: z.string().optional().or(z.literal("")),
  cost: z.string().optional().or(z.literal("")),
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
  const [showCreateProductDialog, setShowCreateProductDialog] = useState(false);
  const [showEditProductDialog, setShowEditProductDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [uploadingBulk, setUploadingBulk] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [artworkFiles, setArtworkFiles] = useState<any[]>([]);
  const [selectedArtworkFile, setSelectedArtworkFile] = useState<string>("");
  const [productFormData, setProductFormData] = useState({
    name: "",
    state: "",
    item_id: "",
    description: "",
    price: "",
    cost: "",
  });
  const [productFormErrors, setProductFormErrors] = useState<Record<string, string>>({});
  const [productSearchQuery, setProductSearchQuery] = useState("");
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

  const handleCreateProduct = async () => {
    try {
      setCreatingProduct(true);
      setProductFormErrors({});
      
      const validated = productSchema.parse(productFormData);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company found");

      // Check if item_id already exists
      if (validated.item_id) {
        const { data: existingProduct } = await supabase
          .from('products')
          .select('id, name')
          .eq('item_id', validated.item_id)
          .single();

        if (existingProduct) {
          throw new Error(`Item ID "${validated.item_id}" already exists for product: ${existingProduct.name}`);
        }
      }

      const productData = {
        name: validated.name,
        state: validated.state,
        item_id: validated.item_id || null,
        description: validated.description || null,
        price: validated.price ? parseFloat(validated.price) : null,
        cost: validated.cost ? parseFloat(validated.cost) : null,
        company_id: customer.company_id,
        customer_id: customerId,
      };

      const { error } = await supabase
        .from('products')
        .insert([productData]);

      if (error) throw error;

      toast({
        title: "Product created",
        description: `${validated.name} has been created and linked to ${customer.name}`,
      });

      setShowCreateProductDialog(false);
      setProductFormData({
        name: "",
        state: "",
        item_id: "",
        description: "",
        price: "",
        cost: "",
      });
      fetchCustomerProducts();
      fetchProducts();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setProductFormErrors(errors);
      } else {
        toast({
          title: "Error creating product",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setCreatingProduct(false);
    }
  };

  const fetchArtworkForProduct = async (itemId: string) => {
    if (!itemId) {
      setArtworkFiles([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('artwork_files')
        .select('*')
        .eq('sku', itemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
      setArtworkFiles([]);
    }
  };

  const handleEditProduct = async (product: any) => {
    console.log("=== EDITING PRODUCT ===");
    console.log("Full product object:", JSON.stringify(product, null, 2));
    console.log("Product state value:", product.state);
    console.log("Product item_id value:", product.item_id);
    console.log("Product item_id type:", typeof product.item_id);
    
    setEditingProduct(product);
    setHasUnsavedChanges(false);
    const formData = {
      name: product.name || "",
      state: product.state || "general",
      item_id: product.item_id || "",
      description: product.description || "",
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
    };
    console.log("Form data being set:", formData);
    setProductFormData(formData);
    setProductFormErrors({});
    setSelectedArtworkFile("");
    
    // Fetch artwork files for this product
    if (product.item_id) {
      await fetchArtworkForProduct(product.item_id);
    }
    
    setShowEditProductDialog(true);
  };

  const handleUpdateProduct = async () => {
    console.log("=== UPDATING PRODUCT ===");
    console.log("Form data:", JSON.stringify(productFormData, null, 2));
    console.log("Editing product ID:", editingProduct?.id);
    
    try {
      setCreatingProduct(true);
      setProductFormErrors({});
      
      console.log("Validating form data...");
      const validated = productSchema.parse(productFormData);
      console.log("Validated data:", JSON.stringify(validated, null, 2));

      const productData = {
        name: validated.name,
        state: validated.state,
        item_id: validated.item_id || null,
        description: validated.description || null,
        price: validated.price ? parseFloat(validated.price) : null,
        cost: validated.cost ? parseFloat(validated.cost) : null,
      };
      console.log("Product data to update:", JSON.stringify(productData, null, 2));

      const { data, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id)
        .select();

      console.log("Update result - data:", data);
      console.log("Update result - error:", error);

      if (error) throw error;

      toast({
        title: "Product updated",
        description: `${validated.name} has been updated successfully`,
      });

      setShowEditProductDialog(false);
      setEditingProduct(null);
      setHasUnsavedChanges(false);
      setProductFormData({
        name: "",
        state: "",
        item_id: "",
        description: "",
        price: "",
        cost: "",
      });
      fetchCustomerProducts();
      fetchProducts();
    } catch (error: any) {
      console.error("Error in handleUpdateProduct:", error);
      if (error instanceof z.ZodError) {
        console.log("Validation errors:", error.errors);
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setProductFormErrors(errors);
      } else {
        toast({
          title: "Error updating product",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvErrors([]);
    setUploadingBulk(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Use AI to intelligently parse the CSV data
          const { data: parsed, error } = await supabase.functions.invoke('parse-product-csv', {
            body: { csvRows: results.data }
          });

          if (error) throw error;

          setCsvData(parsed.products || []);
          setCsvErrors(parsed.errors || []);
          
          if (parsed.products.length > 0) {
            toast({
              title: "CSV Parsed with AI",
              description: `Successfully parsed ${parsed.products.length} products`,
            });
          }
        } catch (error) {
          console.error('AI parsing failed, falling back to simple parse:', error);
          
          // Fallback to simple parsing if AI fails
          const errors: string[] = [];
          const validData: any[] = [];

          results.data.forEach((row: any, index) => {
            if (!row.name) {
              errors.push(`Row ${index + 1}: Missing required field (name)`);
            } else {
              validData.push({
                name: row.name,
                item_id: row.item_id || row.sku || "",
                description: row.description || "",
                price: row.price || "",
                cost: row.cost || "",
              });
            }
          });

          setCsvData(validData);
          setCsvErrors(errors);
        } finally {
          setUploadingBulk(false);
        }
      },
      error: (error) => {
        toast({
          title: "CSV Parse Error",
          description: error.message,
          variant: "destructive",
        });
        setUploadingBulk(false);
      },
    });
  };

  const handleBulkCreate = async () => {
    try {
      setUploadingBulk(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company found");

      // Check for duplicate item_ids in CSV
      const itemIds = csvData
        .map(row => row.item_id)
        .filter(id => id); // Remove empty values

      // Check for duplicates within the CSV itself
      const idCounts: Record<string, number> = {};
      for (const id of itemIds) {
        idCounts[id] = (idCounts[id] || 0) + 1;
      }
      const duplicateIdsInCsv = Object.entries(idCounts)
        .filter(([, count]) => count > 1)
        .map(([id, count]) => `"${id}" (appears ${count} times in CSV)`);

      if (duplicateIdsInCsv.length > 0) {
        throw new Error(`Duplicate Item IDs in CSV: ${duplicateIdsInCsv.join(', ')}`);
      }

      if (itemIds.length > 0) {
        const { data: existingProducts } = await supabase
          .from('products')
          .select('item_id, name')
          .in('item_id', itemIds);

        if (existingProducts && existingProducts.length > 0) {
          const duplicates = existingProducts.map(p => `"${p.item_id}" (${p.name})`).join(', ');
          throw new Error(`The following Item IDs already exist: ${duplicates}`);
        }
      }

      const productsToCreate = csvData.map((row) => ({
        name: row.name,
        state: row.state || "general",
        item_id: row.item_id || null,
        description: row.description || null,
        price: row.price ? parseFloat(row.price) : null,
        cost: row.cost ? parseFloat(row.cost) : null,
        company_id: customer.company_id,
        customer_id: customerId,
      }));

      const { error } = await supabase
        .from('products')
        .insert(productsToCreate);

      if (error) throw error;

      toast({
        title: "Products created",
        description: `Successfully created ${csvData.length} products for ${customer.name}`,
      });

      setShowBulkUploadDialog(false);
      setCsvFile(null);
      setCsvData([]);
      setCsvErrors([]);
      fetchCustomerProducts();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error creating products",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingBulk(false);
    }
  };

  const downloadCsvTemplate = () => {
    const template = "name,state,item_id,description,price,cost\n" +
                     "Sample Product,CA,SKU-001,Product description,10.99,5.50\n" +
                     "Another Product,general,SKU-002,Another description,15.99,8.00";
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddProductDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Link Existing
                  </Button>
                  <Button variant="outline" onClick={() => setShowBulkUploadDialog(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Upload
                  </Button>
                  <Button onClick={() => setShowCreateProductDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New
                  </Button>
                </div>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by name or item ID..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              {customerProducts.filter(product => {
                const query = productSearchQuery.toLowerCase();
                return product.name.toLowerCase().includes(query) ||
                       product.item_id?.toLowerCase().includes(query) ||
                       product.description?.toLowerCase().includes(query);
              }).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{productSearchQuery ? 'No products match your search' : 'No products linked yet'}</p>
                  <p className="text-sm mt-2">{productSearchQuery ? 'Try a different search term' : 'Click "Add Products" to get started'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerProducts.filter(product => {
                    const query = productSearchQuery.toLowerCase();
                    return product.name.toLowerCase().includes(query) ||
                           product.item_id?.toLowerCase().includes(query) ||
                           product.description?.toLowerCase().includes(query);
                  }).map((product) => (
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
                            {product.item_id && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {product.item_id}
                              </span>
                            )}
                            {product.state && (
                              <Badge variant="outline" className="text-xs">
                                {product.state === 'general' ? 'General' : product.state}
                              </Badge>
                            )}
                            {product.price && (
                              <span className="text-xs text-muted-foreground">
                                ${parseFloat(product.price).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditProduct(product)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProduct(product.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Create Product Dialog */}
      <Dialog open={showCreateProductDialog} onOpenChange={setShowCreateProductDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Product for {customer.name}</DialogTitle>
            <DialogDescription>
              This product will be automatically linked to this customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={productFormData.name}
                  onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                />
                {productFormErrors.name && <p className="text-sm text-destructive mt-1">{productFormErrors.name}</p>}
              </div>
              <div>
                <Label htmlFor="product_state">State *</Label>
                <Select
                  value={productFormData.state}
                  onValueChange={(value) => setProductFormData({ ...productFormData, state: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General (No State Specificity)</SelectItem>
                    <SelectItem value="AL">Alabama</SelectItem>
                    <SelectItem value="AK">Alaska</SelectItem>
                    <SelectItem value="AZ">Arizona</SelectItem>
                    <SelectItem value="AR">Arkansas</SelectItem>
                    <SelectItem value="CA">California</SelectItem>
                    <SelectItem value="CO">Colorado</SelectItem>
                    <SelectItem value="CT">Connecticut</SelectItem>
                    <SelectItem value="DE">Delaware</SelectItem>
                    <SelectItem value="FL">Florida</SelectItem>
                    <SelectItem value="GA">Georgia</SelectItem>
                    <SelectItem value="HI">Hawaii</SelectItem>
                    <SelectItem value="ID">Idaho</SelectItem>
                    <SelectItem value="IL">Illinois</SelectItem>
                    <SelectItem value="IN">Indiana</SelectItem>
                    <SelectItem value="IA">Iowa</SelectItem>
                    <SelectItem value="KS">Kansas</SelectItem>
                    <SelectItem value="KY">Kentucky</SelectItem>
                    <SelectItem value="LA">Louisiana</SelectItem>
                    <SelectItem value="ME">Maine</SelectItem>
                    <SelectItem value="MD">Maryland</SelectItem>
                    <SelectItem value="MA">Massachusetts</SelectItem>
                    <SelectItem value="MI">Michigan</SelectItem>
                    <SelectItem value="MN">Minnesota</SelectItem>
                    <SelectItem value="MS">Mississippi</SelectItem>
                    <SelectItem value="MO">Missouri</SelectItem>
                    <SelectItem value="MT">Montana</SelectItem>
                    <SelectItem value="NE">Nebraska</SelectItem>
                    <SelectItem value="NV">Nevada</SelectItem>
                    <SelectItem value="NH">New Hampshire</SelectItem>
                    <SelectItem value="NJ">New Jersey</SelectItem>
                    <SelectItem value="NM">New Mexico</SelectItem>
                    <SelectItem value="NY">New York</SelectItem>
                    <SelectItem value="NC">North Carolina</SelectItem>
                    <SelectItem value="ND">North Dakota</SelectItem>
                    <SelectItem value="OH">Ohio</SelectItem>
                    <SelectItem value="OK">Oklahoma</SelectItem>
                    <SelectItem value="OR">Oregon</SelectItem>
                    <SelectItem value="PA">Pennsylvania</SelectItem>
                    <SelectItem value="RI">Rhode Island</SelectItem>
                    <SelectItem value="SC">South Carolina</SelectItem>
                    <SelectItem value="SD">South Dakota</SelectItem>
                    <SelectItem value="TN">Tennessee</SelectItem>
                    <SelectItem value="TX">Texas</SelectItem>
                    <SelectItem value="UT">Utah</SelectItem>
                    <SelectItem value="VT">Vermont</SelectItem>
                    <SelectItem value="VA">Virginia</SelectItem>
                    <SelectItem value="WA">Washington</SelectItem>
                    <SelectItem value="WV">West Virginia</SelectItem>
                    <SelectItem value="WI">Wisconsin</SelectItem>
                    <SelectItem value="WY">Wyoming</SelectItem>
                  </SelectContent>
                </Select>
                {productFormErrors.state && <p className="text-sm text-destructive mt-1">{productFormErrors.state}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product_item_id">Item ID / SKU</Label>
                <Input
                  id="product_item_id"
                  value={productFormData.item_id}
                  onChange={(e) => setProductFormData({ ...productFormData, item_id: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="product_price">Price</Label>
                <Input
                  id="product_price"
                  type="number"
                  step="0.01"
                  value={productFormData.price}
                  onChange={(e) => setProductFormData({ ...productFormData, price: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="product_cost">Cost</Label>
              <Input
                id="product_cost"
                type="number"
                step="0.01"
                value={productFormData.cost}
                onChange={(e) => setProductFormData({ ...productFormData, cost: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="product_description">Description</Label>
              <Textarea
                id="product_description"
                value={productFormData.description}
                onChange={(e) => setProductFormData({ ...productFormData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateProductDialog(false);
              setProductFormData({
                name: "",
                state: "",
                item_id: "",
                description: "",
                price: "",
                cost: "",
              });
              setProductFormErrors({});
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateProduct} disabled={creatingProduct}>
              {creatingProduct ? "Creating..." : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={showEditProductDialog} onOpenChange={(open) => {
        if (!open && hasUnsavedChanges) {
          setShowUnsavedChangesDialog(true);
        } else if (!open) {
          setShowEditProductDialog(false);
          setEditingProduct(null);
          setHasUnsavedChanges(false);
          setProductFormData({
            name: "",
            state: "",
            item_id: "",
            description: "",
            price: "",
            cost: "",
          });
          setProductFormErrors({});
        }
      }}>
        <DialogContent className="max-w-2xl" key={editingProduct?.id || 'new'}>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_product_name">Product Name *</Label>
                <Input
                  id="edit_product_name"
                  value={productFormData.name}
                  onChange={(e) => {
                    setProductFormData({ ...productFormData, name: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                />
                {productFormErrors.name && <p className="text-sm text-destructive mt-1">{productFormErrors.name}</p>}
              </div>
              <div>
                <Label htmlFor="edit_product_state">State *</Label>
                <Select
                  value={productFormData.state}
                  onValueChange={(value) => {
                    setProductFormData({ ...productFormData, state: value });
                    setHasUnsavedChanges(true);
                  }}
                >
                  <SelectTrigger id="edit_product_state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General (No State Specificity)</SelectItem>
                    <SelectItem value="AL">Alabama</SelectItem>
                    <SelectItem value="AK">Alaska</SelectItem>
                    <SelectItem value="AZ">Arizona</SelectItem>
                    <SelectItem value="AR">Arkansas</SelectItem>
                    <SelectItem value="CA">California</SelectItem>
                    <SelectItem value="CO">Colorado</SelectItem>
                    <SelectItem value="CT">Connecticut</SelectItem>
                    <SelectItem value="DE">Delaware</SelectItem>
                    <SelectItem value="FL">Florida</SelectItem>
                    <SelectItem value="GA">Georgia</SelectItem>
                    <SelectItem value="HI">Hawaii</SelectItem>
                    <SelectItem value="ID">Idaho</SelectItem>
                    <SelectItem value="IL">Illinois</SelectItem>
                    <SelectItem value="IN">Indiana</SelectItem>
                    <SelectItem value="IA">Iowa</SelectItem>
                    <SelectItem value="KS">Kansas</SelectItem>
                    <SelectItem value="KY">Kentucky</SelectItem>
                    <SelectItem value="LA">Louisiana</SelectItem>
                    <SelectItem value="ME">Maine</SelectItem>
                    <SelectItem value="MD">Maryland</SelectItem>
                    <SelectItem value="MA">Massachusetts</SelectItem>
                    <SelectItem value="MI">Michigan</SelectItem>
                    <SelectItem value="MN">Minnesota</SelectItem>
                    <SelectItem value="MS">Mississippi</SelectItem>
                    <SelectItem value="MO">Missouri</SelectItem>
                    <SelectItem value="MT">Montana</SelectItem>
                    <SelectItem value="NE">Nebraska</SelectItem>
                    <SelectItem value="NV">Nevada</SelectItem>
                    <SelectItem value="NH">New Hampshire</SelectItem>
                    <SelectItem value="NJ">New Jersey</SelectItem>
                    <SelectItem value="NM">New Mexico</SelectItem>
                    <SelectItem value="NY">New York</SelectItem>
                    <SelectItem value="NC">North Carolina</SelectItem>
                    <SelectItem value="ND">North Dakota</SelectItem>
                    <SelectItem value="OH">Ohio</SelectItem>
                    <SelectItem value="OK">Oklahoma</SelectItem>
                    <SelectItem value="OR">Oregon</SelectItem>
                    <SelectItem value="PA">Pennsylvania</SelectItem>
                    <SelectItem value="RI">Rhode Island</SelectItem>
                    <SelectItem value="SC">South Carolina</SelectItem>
                    <SelectItem value="SD">South Dakota</SelectItem>
                    <SelectItem value="TN">Tennessee</SelectItem>
                    <SelectItem value="TX">Texas</SelectItem>
                    <SelectItem value="UT">Utah</SelectItem>
                    <SelectItem value="VT">Vermont</SelectItem>
                    <SelectItem value="VA">Virginia</SelectItem>
                    <SelectItem value="WA">Washington</SelectItem>
                    <SelectItem value="WV">West Virginia</SelectItem>
                    <SelectItem value="WI">Wisconsin</SelectItem>
                    <SelectItem value="WY">Wyoming</SelectItem>
                  </SelectContent>
                </Select>
                {productFormErrors.state && <p className="text-sm text-destructive mt-1">{productFormErrors.state}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_product_item_id">Item ID / SKU</Label>
                <Input
                  id="edit_product_item_id"
                  value={productFormData.item_id}
                  onChange={(e) => {
                    setProductFormData({ ...productFormData, item_id: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="edit_product_price">Price</Label>
                <Input
                  id="edit_product_price"
                  type="number"
                  step="0.01"
                  value={productFormData.price}
                  onChange={(e) => {
                    setProductFormData({ ...productFormData, price: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit_product_cost">Cost</Label>
              <Input
                id="edit_product_cost"
                type="number"
                step="0.01"
                value={productFormData.cost}
                onChange={(e) => {
                  setProductFormData({ ...productFormData, cost: e.target.value });
                  setHasUnsavedChanges(true);
                }}
              />
            </div>

            <div>
              <Label htmlFor="edit_product_description">Description</Label>
              <Textarea
                id="edit_product_description"
                value={productFormData.description}
                onChange={(e) => {
                  setProductFormData({ ...productFormData, description: e.target.value });
                  setHasUnsavedChanges(true);
                }}
                rows={3}
              />
            </div>

            {/* Artwork Files Section */}
            {productFormData.item_id && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Artwork Files ({artworkFiles.length})</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/artwork?search=${productFormData.item_id}`)}
                  >
                    View All Artwork
                  </Button>
                </div>
                
                {artworkFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No artwork files found for SKU: {productFormData.item_id}</p>
                ) : (
                  <div className="space-y-2">
                    {artworkFiles.map((artwork) => (
                      <div
                        key={artwork.id}
                        className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                      >
                        {artwork.preview_url ? (
                          <img
                            src={artwork.preview_url}
                            alt={artwork.filename}
                            className="w-12 h-12 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center">
                            <FileImage className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{artwork.filename}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {artwork.is_approved ? (
                              <Badge variant="default" className="text-xs bg-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approved
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending Approval
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(artwork.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(artwork.artwork_url, '_blank')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (hasUnsavedChanges) {
                setShowUnsavedChangesDialog(true);
              } else {
                setShowEditProductDialog(false);
                setEditingProduct(null);
                setProductFormData({
                  name: "",
                  state: "",
                  item_id: "",
                  description: "",
                  price: "",
                  cost: "",
                });
                setProductFormErrors({});
              }
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProduct} disabled={creatingProduct}>
              {creatingProduct ? "Updating..." : "Update Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedChangesDialog(false)}>
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowUnsavedChangesDialog(false);
              setShowEditProductDialog(false);
              setEditingProduct(null);
              setHasUnsavedChanges(false);
              setProductFormData({
                name: "",
                state: "",
                item_id: "",
                description: "",
                price: "",
                cost: "",
              });
              setProductFormErrors({});
            }}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Upload Products for {customer.name}</DialogTitle>
            <DialogDescription>
              Upload a CSV file to create multiple products at once
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {/* Upload Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="csv-upload">Upload CSV File</Label>
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={downloadCsvTemplate}
                  className="h-auto p-0"
                >
                  Download Template
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  disabled={uploadingBulk}
                  className="flex-1"
                />
                {uploadingBulk && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Parsing with AI...
                  </Badge>
                )}
                {csvFile && !uploadingBulk && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <FileSpreadsheet className="h-3 w-3" />
                    {csvFile.name}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                AI will intelligently parse column names - they don't need to be exact. Works with variations like "Product Name", "name", "product_name", etc.
              </p>
            </div>

            {/* Errors */}
            {csvErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-1">Found {csvErrors.length} error(s):</p>
                  <ul className="list-disc list-inside text-sm">
                    {csvErrors.slice(0, 5).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {csvErrors.length > 5 && (
                      <li>... and {csvErrors.length - 5} more errors</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Preview */}
            {csvData.length > 0 && (
              <div className="space-y-2">
                <Label>Preview ({csvData.length} products)</Label>
                <ScrollArea className="h-[300px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Item ID</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.state || "general"}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.item_id || "-"}</TableCell>
                          <TableCell>{row.price ? `$${row.price}` : "-"}</TableCell>
                          <TableCell>{row.cost ? `$${row.cost}` : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBulkUploadDialog(false);
                setCsvFile(null);
                setCsvData([]);
                setCsvErrors([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkCreate}
              disabled={uploadingBulk || csvData.length === 0 || csvErrors.length > 0}
            >
              {uploadingBulk ? "Creating..." : `Create ${csvData.length} Products`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDetail;