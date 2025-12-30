import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Upload,
  X
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
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  price: number | null;
  states?: { state: string }[];
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

  useEffect(() => {
    initializeForm();
  }, [quoteId, parentQuoteId]);

  useEffect(() => {
    if (companyId && isVibeAdmin && !isEditing && !isResponding) {
      loadCompanyInfo(companyId);
    }
  }, [companyId, isVibeAdmin]);

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
        // Load customer company info for non-admin users
        await loadCompanyInfo(roleData.company_id);
      }

      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, item_id, price')
        .order('name');
      setProducts(productsData || []);

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
    // Keep request notes visible but as internal reference
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
        unit_price: 0, // Reset price for admin to fill in
        total: 0
      })));
    }
  };

  const loadCompanyInfo = async (companyIdToLoad: string) => {
    // Get company details
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyIdToLoad)
      .single();

    if (!companyData) return;

    const companyName = companyData.name;

    // Try to get saved addresses first
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
      // Fall back to company address info
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
  };

  const addItem = () => {
    setItems([...items, {
      sku: "",
      name: "",
      description: "",
      state: "",
      quantity: 1,
      unit_price: 0,
      total: 0
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
    }
    
    setItems(newItems);
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const newItems = [...items];
      newItems[index] = {
        ...newItems[index],
        product_id: product.id,
        sku: product.item_id || "",
        name: product.name,
        unit_price: product.price || 0,
        total: (newItems[index].quantity || 1) * (product.price || 0)
      };
      setItems(newItems);
    }
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

        // Delete existing items and re-insert
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

      // Insert items
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
                      placeholder="Enter customer name"
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
                      placeholder="(555) 123-4567"
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
                    <Label>Ship To Name</Label>
                    <Input
                      value={shippingName}
                      onChange={(e) => setShippingName(e.target.value)}
                      placeholder="Recipient name"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Street Address</Label>
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
                      placeholder="City"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={shippingState}
                        onChange={(e) => setShippingState(e.target.value)}
                        placeholder="CA"
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

            {/* Line Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Quote Items</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No items added yet. Click "Add Item" to add products to this quote.
                  </p>
                ) : (
                  <>
                    {items.map((item, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Product</Label>
                              <Select 
                                value={item.product_id || ""} 
                                onValueChange={(value) => selectProduct(index, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select or enter manually" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((product) => (
                                    <SelectItem key={product.id} value={product.id}>
                                      {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>SKU</Label>
                              <Input
                                value={item.sku}
                                onChange={(e) => updateItem(index, 'sku', e.target.value)}
                                placeholder="SKU"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>State</Label>
                              <Input
                                value={item.state}
                                onChange={(e) => updateItem(index, 'state', e.target.value)}
                                placeholder="CA, WA, etc."
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Name</Label>
                              <Input
                                value={item.name}
                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                                placeholder="Product name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unit Price</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                        <div className="flex justify-end">
                          <span className="text-sm font-medium">
                            Line Total: {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex justify-between">
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
                  </>
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
                  <Label>Payment Terms</Label>
                  <Select value={terms} onValueChange={setTerms}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Net 15">Net 15</SelectItem>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 45">Net 45</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                      <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Quote description..."
                    rows={3}
                  />
                </div>
                {isVibeAdmin && (
                  <div className="space-y-2">
                    <Label>Internal Notes</Label>
                    <Textarea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Notes for internal use only..."
                      rows={3}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="pt-6">
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {isEditing ? "Update Quote" : (isVibeAdmin ? "Create Quote" : "Submit Request")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateQuote;
