import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Upload,
  X,
  Search,
  Minus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QuoteItem {
  id?: string;
  product_id?: string;
  sku: string;
  name: string;
  description: string;
  state: string;
  quantity: number;
  unit_price: number;
  total: number;
  isCustom?: boolean; // Flag for custom items not from products table
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  price: number | null;
  company_id: string;
}

interface Company {
  id: string;
  name: string;
}

const CreateQuote = () => {
  const { quoteId, parentQuoteId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!quoteId;
  const isResponding = !!parentQuoteId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [parentQuote, setParentQuote] = useState<any>(null);

  // Form state
  const [companyId, setCompanyId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingName, setShippingName] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [description, setDescription] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [terms, setTerms] = useState("Net 30");
  const [validUntil, setValidUntil] = useState("");
  const [shippingCost, setShippingCost] = useState(0);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [existingFilename, setExistingFilename] = useState<string | null>(null);

  // Add items dialog state
  const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedProducts, setTempSelectedProducts] = useState<string[]>([]);
  
  // Custom item dialog state
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [customItem, setCustomItem] = useState({
    sku: "",
    name: "",
    description: "",
    state: "",
    quantity: 1,
    unit_price: 0
  });

  useEffect(() => {
    initializeForm();
  }, [quoteId, parentQuoteId]);

  useEffect(() => {
    if (companyId && isVibeAdmin && !isEditing && !isResponding) {
      loadCompanyInfo(companyId);
    }
  }, [companyId, isVibeAdmin]);

  // Re-fetch products when company changes
  useEffect(() => {
    if (companyId) {
      fetchProducts(companyId);
    }
  }, [companyId]);

  const initializeForm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, company_id')
        .eq('user_id', user.id)
        .single();

      const isAdmin = roleData?.role === 'vibe_admin';
      setIsVibeAdmin(isAdmin);
      setUserCompanyId(roleData?.company_id || null);

      if (isAdmin) {
        const { data: companiesData } = await supabase
          .from('companies')
          .select('id, name')
          .order('name');
        setCompanies(companiesData || []);
      } else if (roleData?.company_id) {
        setCompanyId(roleData.company_id);
        await loadCompanyInfo(roleData.company_id);
        await fetchProducts(roleData.company_id);
      }

      if (isEditing) {
        await fetchQuote();
      } else if (isResponding) {
        await loadParentQuote();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (companyIdToFetch: string) => {
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, item_id, price, company_id')
      .eq('company_id', companyIdToFetch)
      .order('name');
    setProducts(productsData || []);
  };

  const loadParentQuote = async () => {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', parentQuoteId)
      .single();

    if (error) throw error;

    setParentQuote(quote);
    setCompanyId(quote.company_id);
    setCustomerName(quote.customer_name);
    setCustomerEmail(quote.customer_email || "");
    setCustomerPhone(quote.customer_phone || "");
    setShippingName(quote.shipping_name || "");
    setShippingStreet(quote.shipping_street || "");
    setShippingCity(quote.shipping_city || "");
    setShippingState(quote.shipping_state || "");
    setShippingZip(quote.shipping_zip || "");
    setDescription(quote.description || "");
    setInternalNotes(`Original Request Notes:\n${quote.request_notes || 'None'}`);
    setTerms(quote.terms || "Net 30");

    // Load items from parent quote if they exist
    const { data: itemsData } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', parentQuoteId);

    if (itemsData && itemsData.length > 0) {
      setItems(itemsData.map(item => ({
        product_id: item.product_id || undefined,
        sku: item.sku,
        name: item.name,
        description: item.description || "",
        state: item.state || "",
        quantity: item.quantity,
        unit_price: 0,
        total: 0
      })));
    }

    // Fetch products for this company
    await fetchProducts(quote.company_id);
  };

  const loadCompanyInfo = async (companyIdToLoad: string) => {
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyIdToLoad)
      .single();

    if (!companyData) return;

    const companyName = companyData.name;

    const { data: addressesData } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('company_id', companyIdToLoad)
      .order('is_default', { ascending: false });

    if (addressesData && addressesData.length > 0) {
      const defaultShipping = addressesData.find(a => a.address_type === 'shipping' && a.is_default) || 
                              addressesData.find(a => a.address_type === 'shipping');
      
      if (defaultShipping) {
        setCustomerName(companyName);
        setCustomerEmail(defaultShipping.customer_email || companyData.email || "");
        setCustomerPhone(defaultShipping.customer_phone || companyData.phone || "");
        setShippingName(defaultShipping.name);
        setShippingStreet(defaultShipping.street);
        setShippingCity(defaultShipping.city);
        setShippingState(defaultShipping.state);
        setShippingZip(defaultShipping.zip);
      }
    } else {
      setCustomerName(companyName);
      setCustomerEmail(companyData.email || "");
      setCustomerPhone(companyData.phone || "");
      setShippingName(companyName);
      setShippingStreet(companyData.shipping_street || "");
      setShippingCity(companyData.shipping_city || "");
      setShippingState(companyData.shipping_state || "");
      setShippingZip(companyData.shipping_zip || "");
    }
  };

  const fetchQuote = async () => {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (error) throw error;

    setCompanyId(quote.company_id);
    setCustomerName(quote.customer_name);
    setCustomerEmail(quote.customer_email || "");
    setCustomerPhone(quote.customer_phone || "");
    setShippingName(quote.shipping_name || "");
    setShippingStreet(quote.shipping_street || "");
    setShippingCity(quote.shipping_city || "");
    setShippingState(quote.shipping_state || "");
    setShippingZip(quote.shipping_zip || "");
    setDescription(quote.description || "");
    setRequestNotes(quote.request_notes || "");
    setInternalNotes(quote.internal_notes || "");
    setTerms(quote.terms || "Net 30");
    setValidUntil(quote.valid_until ? quote.valid_until.split('T')[0] : "");
    setShippingCost(quote.shipping_cost || 0);
    setExistingFileUrl(quote.uploaded_file_url);
    setExistingFilename(quote.uploaded_filename);

    const { data: itemsData } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId);

    setItems(itemsData?.map(item => ({
      id: item.id,
      product_id: item.product_id || undefined,
      sku: item.sku,
      name: item.name,
      description: item.description || "",
      state: item.state || "",
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total
    })) || []);

    // Fetch products for this company
    await fetchProducts(quote.company_id);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemQuantity = (index: number, change: number) => {
    const newItems = [...items];
    newItems[index].quantity = Math.max(1, newItems[index].quantity + change);
    newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
    setItems(newItems);
  };

  const updateItemPrice = (index: number, price: number) => {
    const newItems = [...items];
    newItems[index].unit_price = price;
    newItems[index].total = newItems[index].quantity * price;
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + shippingCost;
  };

  const generateQuoteNumber = async () => {
    const { count } = await supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true });
    
    const nextNumber = (count || 0) + 1;
    return `QT-${String(nextNumber).padStart(5, '0')}`;
  };

  const handleFileUpload = async () => {
    if (!uploadedFile) return null;

    const fileExt = uploadedFile.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('quote-documents')
      .upload(filePath, uploadedFile);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('quote-documents')
      .getPublicUrl(filePath);

    return { url: publicUrl, filename: uploadedFile.name };
  };

  // Filter products for the add items dialog
  const filteredProducts = products.filter(p => {
    // Exclude already added products
    const alreadyAdded = items.find(item => item.product_id === p.id);
    if (alreadyAdded) return false;
    
    if (!searchQuery) return true;
    
    const search = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(search) ||
      p.item_id?.toLowerCase().includes(search)
    );
  });

  const toggleProductSelection = (productId: string) => {
    setTempSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAddSelectedItems = () => {
    const newItems: QuoteItem[] = tempSelectedProducts.map(productId => {
      const product = products.find(p => p.id === productId);
      return {
        product_id: productId,
        sku: product?.item_id || "",
        name: product?.name || "",
        description: "",
        state: "",
        quantity: 1,
        unit_price: product?.price || 0,
        total: product?.price || 0
      };
    });
    setItems([...items, ...newItems]);
    setTempSelectedProducts([]);
    setSearchQuery("");
    setShowAddItemsDialog(false);
  };

  const handleAddCustomItem = () => {
    const newItem: QuoteItem = {
      sku: customItem.sku,
      name: customItem.name,
      description: customItem.description,
      state: customItem.state,
      quantity: customItem.quantity,
      unit_price: customItem.unit_price,
      total: customItem.quantity * customItem.unit_price,
      isCustom: true
    };
    setItems([...items, newItem]);
    setCustomItem({ sku: "", name: "", description: "", state: "", quantity: 1, unit_price: 0 });
    setShowCustomItemDialog(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId) {
      toast({
        title: "Error",
        description: "Please select a company",
        variant: "destructive",
      });
      return;
    }

    if (!customerName) {
      toast({
        title: "Error",
        description: "Please enter a customer name",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let fileData = null;
      if (uploadedFile) {
        fileData = await handleFileUpload();
      }

      const quoteData: any = {
        company_id: companyId,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        shipping_name: shippingName || null,
        shipping_street: shippingStreet || null,
        shipping_city: shippingCity || null,
        shipping_state: shippingState || null,
        shipping_zip: shippingZip || null,
        description: description || null,
        request_notes: requestNotes || null,
        internal_notes: internalNotes || null,
        terms: terms || 'Net 30',
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        subtotal: calculateSubtotal(),
        shipping_cost: shippingCost,
        total: calculateTotal(),
        status: isVibeAdmin ? 'draft' : 'pending_review'
      };

      if (fileData) {
        quoteData.uploaded_file_url = fileData.url;
        quoteData.uploaded_filename = fileData.filename;
      }

      let savedQuoteId = quoteId;

      if (isEditing) {
        const { error } = await supabase
          .from('quotes')
          .update(quoteData)
          .eq('id', quoteId);

        if (error) throw error;

        await supabase
          .from('quote_items')
          .delete()
          .eq('quote_id', quoteId);
      } else {
        quoteData.quote_number = await generateQuoteNumber();
        quoteData.created_by = user?.id;
        if (!isVibeAdmin) {
          quoteData.requested_by = user?.id;
        }
        if (isResponding && parentQuoteId) {
          quoteData.parent_quote_id = parentQuoteId;
        }

        const { data: newQuote, error } = await supabase
          .from('quotes')
          .insert(quoteData)
          .select()
          .single();

        if (error) throw error;
        savedQuoteId = newQuote.id;
      }

      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          quote_id: savedQuoteId,
          product_id: item.product_id || null,
          sku: item.sku,
          name: item.name,
          description: item.description || null,
          state: item.state || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total
        }));

        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      toast({
        title: "Success",
        description: isEditing ? "Quote updated" : "Quote created",
      });

      navigate(`/quotes/${savedQuoteId}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="page-title">
            {isEditing ? "Edit Quote" : (isResponding ? "Respond to Quote Request" : (isVibeAdmin ? "Create Quote" : "Request Quote"))}
          </h1>
          <p className="page-subtitle">
            {isResponding 
              ? `Creating response quote for ${parentQuote?.quote_number || 'request'}`
              : (isVibeAdmin 
                ? "Create a pricing quote for a customer" 
                : "Submit a quote request for pricing")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Company Selection (Vibe Admin only) */}
            {isVibeAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={companyId} onValueChange={setCompanyId} disabled={isResponding}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isResponding && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Company is set from the original quote request
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Name *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={shippingName}
                      onChange={(e) => setShippingName(e.target.value)}
                      placeholder="Recipient name"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Street</Label>
                    <Input
                      value={shippingStreet}
                      onChange={(e) => setShippingStreet(e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={shippingCity}
                      onChange={(e) => setShippingCity(e.target.value)}
                      placeholder="Los Angeles"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={shippingState}
                        onChange={(e) => setShippingState(e.target.value)}
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ZIP</Label>
                      <Input
                        value={shippingZip}
                        onChange={(e) => setShippingZip(e.target.value)}
                        placeholder="90210"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items Section - Order Style */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quote Items</CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No items added yet. Click "Add Items" to add products to this quote.
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-12"></TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center w-32">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => removeItem(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.sku || '-'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.name}</p>
                                {item.state && <span className="text-xs text-muted-foreground">{item.state}</span>}
                                {item.isCustom && <span className="text-xs text-primary ml-2">(Custom)</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => updateItemQuantity(index, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[index].quantity = parseInt(e.target.value) || 1;
                                    newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
                                    setItems(newItems);
                                  }}
                                  className="h-7 w-14 text-center"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => updateItemQuantity(index, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                className="h-8 w-24 text-right ml-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Add Items Buttons */}
                <div className="flex gap-2 mt-4">
                  <Dialog open={showAddItemsDialog} onOpenChange={setShowAddItemsDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        type="button"
                        disabled={!companyId}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {!companyId ? "Select a company first" : "Add Products"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                      <DialogHeader>
                        <DialogTitle>Add Products to Quote</DialogTitle>
                        <DialogDescription>
                          Search and select products to add to your quote
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name or SKU..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>

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
                              <TableHead>SKU</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredProducts.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                  {!companyId
                                    ? "Please select a company first to see available products" 
                                    : searchQuery 
                                      ? "No products found matching your search" 
                                      : "No products available for this company"}
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
                                  <TableCell className="text-right">{formatCurrency(product.price || 0)}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>

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

                  {/* Add Custom Item */}
                  <Dialog open={showCustomItemDialog} onOpenChange={setShowCustomItemDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" type="button">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Custom Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Custom Item</DialogTitle>
                        <DialogDescription>
                          Add a custom item that won't be saved to the product catalog
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>SKU</Label>
                            <Input
                              value={customItem.sku}
                              onChange={(e) => setCustomItem({ ...customItem, sku: e.target.value })}
                              placeholder="CUSTOM-001"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>State</Label>
                            <Input
                              value={customItem.state}
                              onChange={(e) => setCustomItem({ ...customItem, state: e.target.value })}
                              placeholder="CA, WA, etc."
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Name *</Label>
                          <Input
                            value={customItem.name}
                            onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                            placeholder="Product name"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            value={customItem.description}
                            onChange={(e) => setCustomItem({ ...customItem, description: e.target.value })}
                            placeholder="Product description"
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={customItem.quantity}
                              onChange={(e) => setCustomItem({ ...customItem, quantity: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Unit Price</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customItem.unit_price}
                              onChange={(e) => setCustomItem({ ...customItem, unit_price: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowCustomItemDialog(false);
                            setCustomItem({ sku: "", name: "", description: "", state: "", quantity: 1, unit_price: 0 });
                          }}
                          type="button"
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddCustomItem}
                          disabled={!customItem.name}
                          type="button"
                        >
                          Add Item
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Totals */}
                {items.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <Separator />
                    <div className="flex justify-between pt-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Shipping</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                        className="w-32 text-right"
                      />
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(calculateTotal())}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Request Notes (Customer) */}
            {!isVibeAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Request Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Describe what you need quoted</Label>
                    <Textarea
                      value={requestNotes}
                      onChange={(e) => setRequestNotes(e.target.value)}
                      placeholder="Describe the products, quantities, and any special requirements..."
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Upload a document (optional)</Label>
                    {existingFileUrl && !uploadedFile && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">{existingFilename}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExistingFileUrl(null);
                            setExistingFilename(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {uploadedFile && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">{uploadedFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploadedFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {!existingFileUrl && !uploadedFile && (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-2">
                          Upload a PO, spec sheet, or other document
                        </p>
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                          onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                          className="max-w-xs mx-auto"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quote Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quote Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Terms</Label>
                  <Select value={terms} onValueChange={setTerms}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 15">Net 15</SelectItem>
                      <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isVibeAdmin && (
                  <div className="space-y-2">
                    <Label>Valid Until</Label>
                    <Input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Internal Notes (Vibe Admin only) */}
            {isVibeAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Internal Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Internal notes (not visible to customer)"
                    rows={4}
                  />
                </CardContent>
              </Card>
            )}

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quote description or notes"
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                isEditing ? "Update Quote" : (isVibeAdmin ? "Create Quote" : "Submit Quote Request")
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateQuote;