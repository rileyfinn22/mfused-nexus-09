import React, { useState, useEffect } from "react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Upload,
  X,
  Search,
  Minus,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PriceBreak {
  qty: number;
  unit_price: number;
}

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
  isCustom?: boolean;
  price_breaks: PriceBreak[];
  selected_tier: number | null;
  isExpanded?: boolean;
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
  
  // Add single product with price breaks dialog
  const [showAddProductWithPriceBreaks, setShowAddProductWithPriceBreaks] = useState(false);
  const [selectedProductForPriceBreaks, setSelectedProductForPriceBreaks] = useState<Product | null>(null);
  const [tempPriceBreaks, setTempPriceBreaks] = useState<PriceBreak[]>([]);
  
  // Custom item dialog state
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [customItem, setCustomItem] = useState({
    sku: "",
    name: "",
    description: "",
    state: "",
    quantity: 1,
    unit_price: 0,
    price_breaks: [] as PriceBreak[]
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
        total: 0,
        price_breaks: [],
        selected_tier: null,
        isExpanded: false
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
      total: item.total,
      price_breaks: Array.isArray(item.price_breaks) ? (item.price_breaks as unknown as PriceBreak[]) : [],
      selected_tier: item.selected_tier,
      isExpanded: false
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
        total: product?.price || 0,
        price_breaks: [],
        selected_tier: null,
        isExpanded: false
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
      isCustom: true,
      price_breaks: customItem.price_breaks,
      selected_tier: null,
      isExpanded: false
    };
    setItems([...items, newItem]);
    setCustomItem({ sku: "", name: "", description: "", state: "", quantity: 1, unit_price: 0, price_breaks: [] });
    setShowCustomItemDialog(false);
  };

  const openProductWithPriceBreaks = (product: Product) => {
    setSelectedProductForPriceBreaks(product);
    setTempPriceBreaks([{ qty: 10000, unit_price: product.price || 0 }]);
    setShowAddProductWithPriceBreaks(true);
    setShowAddItemsDialog(false);
  };

  const handleAddProductWithPriceBreaks = () => {
    if (!selectedProductForPriceBreaks) return;
    
    const firstTier = tempPriceBreaks[0];
    const newItem: QuoteItem = {
      product_id: selectedProductForPriceBreaks.id,
      sku: selectedProductForPriceBreaks.item_id || "",
      name: selectedProductForPriceBreaks.name,
      description: "",
      state: "",
      quantity: firstTier?.qty || 1,
      unit_price: firstTier?.unit_price || selectedProductForPriceBreaks.price || 0,
      total: (firstTier?.qty || 1) * (firstTier?.unit_price || selectedProductForPriceBreaks.price || 0),
      price_breaks: tempPriceBreaks,
      selected_tier: 0,
      isExpanded: false
    };
    
    setItems([...items, newItem]);
    setShowAddProductWithPriceBreaks(false);
    setSelectedProductForPriceBreaks(null);
    setTempPriceBreaks([]);
  };

  const addTempPriceBreak = () => {
    const lastBreak = tempPriceBreaks[tempPriceBreaks.length - 1];
    const newQty = lastBreak ? lastBreak.qty * 2 : 10000;
    setTempPriceBreaks([...tempPriceBreaks, { qty: newQty, unit_price: lastBreak?.unit_price || 0 }]);
  };

  const updateTempPriceBreak = (index: number, field: keyof PriceBreak, value: number) => {
    const newBreaks = [...tempPriceBreaks];
    newBreaks[index] = { ...newBreaks[index], [field]: value };
    newBreaks.sort((a, b) => a.qty - b.qty);
    setTempPriceBreaks(newBreaks);
  };

  const removeTempPriceBreak = (index: number) => {
    setTempPriceBreaks(tempPriceBreaks.filter((_, i) => i !== index));
  };

  const addCustomItemPriceBreak = () => {
    const lastBreak = customItem.price_breaks[customItem.price_breaks.length - 1];
    const newQty = lastBreak ? lastBreak.qty * 2 : 10000;
    setCustomItem({
      ...customItem,
      price_breaks: [...customItem.price_breaks, { qty: newQty, unit_price: customItem.unit_price }]
    });
  };

  const updateCustomItemPriceBreak = (index: number, field: keyof PriceBreak, value: number) => {
    const newBreaks = [...customItem.price_breaks];
    newBreaks[index] = { ...newBreaks[index], [field]: value };
    newBreaks.sort((a, b) => a.qty - b.qty);
    setCustomItem({ ...customItem, price_breaks: newBreaks });
  };

  const removeCustomItemPriceBreak = (index: number) => {
    setCustomItem({
      ...customItem,
      price_breaks: customItem.price_breaks.filter((_, i) => i !== index)
    });
  };

  const toggleItemExpanded = (index: number) => {
    const newItems = [...items];
    newItems[index].isExpanded = !newItems[index].isExpanded;
    setItems(newItems);
  };

  const addPriceBreak = (index: number) => {
    const newItems = [...items];
    const lastBreak = newItems[index].price_breaks[newItems[index].price_breaks.length - 1];
    const newQty = lastBreak ? lastBreak.qty * 2 : 10000;
    
    newItems[index].price_breaks.push({
      qty: newQty,
      unit_price: newItems[index].unit_price
    });
    newItems[index].isExpanded = true;
    setItems(newItems);
  };

  const updatePriceBreak = (itemIndex: number, breakIndex: number, field: keyof PriceBreak, value: number) => {
    const newItems = [...items];
    newItems[itemIndex].price_breaks[breakIndex] = {
      ...newItems[itemIndex].price_breaks[breakIndex],
      [field]: value
    };
    // Sort price breaks by qty
    newItems[itemIndex].price_breaks.sort((a, b) => a.qty - b.qty);
    setItems(newItems);
  };

  const removePriceBreak = (itemIndex: number, breakIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].price_breaks.splice(breakIndex, 1);
    setItems(newItems);
  };

  const selectPriceTier = (itemIndex: number, tierIndex: number) => {
    const newItems = [...items];
    const tier = newItems[itemIndex].price_breaks[tierIndex];
    newItems[itemIndex].selected_tier = tierIndex;
    newItems[itemIndex].unit_price = tier.unit_price;
    newItems[itemIndex].quantity = tier.qty;
    newItems[itemIndex].total = tier.qty * tier.unit_price;
    setItems(newItems);
  };

  const formatQty = (qty: number) => {
    return qty.toLocaleString();
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
          total: item.total,
          price_breaks: item.price_breaks.length > 0 ? JSON.parse(JSON.stringify(item.price_breaks)) : null,
          selected_tier: item.selected_tier
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
            {isEditing ? "Edit Quote" : (isResponding ? "Create Quote for Customer" : (isVibeAdmin ? "Create Quote" : "Request Quote"))}
          </h1>
          <p className="page-subtitle">
            {isResponding 
              ? `Creating official quote in response to ${parentQuote?.quote_number || "customer request"}`
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
                          <React.Fragment key={index}>
                            <TableRow className={item.isExpanded ? "border-b-0" : ""}>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-destructive"
                                    onClick={() => removeItem(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{item.sku || '-'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0"
                                    type="button"
                                    onClick={() => toggleItemExpanded(index)}
                                  >
                                    {item.isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <div>
                                    <p className="font-medium">{item.name}</p>
                                    {item.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                                    )}
                                    <div className="flex items-center gap-2">
                                      {item.state && <span className="text-xs text-muted-foreground">{item.state}</span>}
                                      {item.isCustom && <span className="text-xs text-primary">(Custom)</span>}
                                      {item.price_breaks.length > 0 && (
                                        <span className="text-xs text-primary">
                                          {item.price_breaks.length} price tier{item.price_breaks.length !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>
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
                            {item.isExpanded && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell colSpan={6} className="p-4">
                                  <div className="space-y-4">
                                    {/* Description editing for vibe admins */}
                                    {isVibeAdmin && (
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium">Item Description</Label>
                                        <Textarea
                                          placeholder="Add description for this item..."
                                          value={item.description || ''}
                                          onChange={(e) => {
                                            const newItems = [...items];
                                            newItems[index].description = e.target.value;
                                            setItems(newItems);
                                          }}
                                          className="min-h-[60px]"
                                        />
                                      </div>
                                    )}
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium">Price Breaks</h4>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => addPriceBreak(index)}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add Tier
                                        </Button>
                                      </div>
                                    
                                    {item.price_breaks.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        No price tiers defined. Add tiers to offer volume-based pricing.
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {item.price_breaks.map((priceBreak, breakIndex) => (
                                          <div 
                                            key={breakIndex} 
                                            className={`flex items-center gap-3 p-2 rounded-md border ${
                                              item.selected_tier === breakIndex 
                                                ? 'border-primary bg-primary/5' 
                                                : 'border-border'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 flex-1">
                                              <Label className="text-xs w-8">Qty</Label>
                                              <Input
                                                type="number"
                                                min="1"
                                                value={priceBreak.qty}
                                                onChange={(e) => updatePriceBreak(index, breakIndex, 'qty', parseInt(e.target.value) || 1)}
                                                className="h-8 w-28"
                                              />
                                              <Label className="text-xs w-10">Price</Label>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={priceBreak.unit_price}
                                                  onChange={(e) => updatePriceBreak(index, breakIndex, 'unit_price', parseFloat(e.target.value) || 0)}
                                                  className="h-8 w-24 pl-5"
                                                />
                                              </div>
                                              <span className="text-xs text-muted-foreground">
                                                = {formatCurrency(priceBreak.qty * priceBreak.unit_price)}
                                              </span>
                                            </div>
                                            <Button
                                              type="button"
                                              variant={item.selected_tier === breakIndex ? "default" : "outline"}
                                              size="sm"
                                              onClick={() => selectPriceTier(index, breakIndex)}
                                            >
                                              {item.selected_tier === breakIndex ? "Selected" : "Select"}
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0 text-destructive"
                                              onClick={() => removePriceBreak(index, breakIndex)}
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {item.price_breaks.length > 0 && (
                                      <div className="pt-2 border-t text-sm">
                                        <p className="text-muted-foreground">
                                          Summary: {item.price_breaks.map((pb, i) => (
                                            <span key={i} className={item.selected_tier === i ? 'text-primary font-medium' : ''}>
                                              {formatQty(pb.qty)}: {formatCurrency(pb.unit_price)}
                                              {i < item.price_breaks.length - 1 ? ' | ' : ''}
                                            </span>
                                          ))}
                                        </p>
                                      </div>
                                    )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
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
                              <TableHead className="w-28"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredProducts.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
                                  className="hover:bg-muted/50"
                                >
                                  <TableCell onClick={() => toggleProductSelection(product.id)} className="cursor-pointer">
                                    <Checkbox
                                      checked={tempSelectedProducts.includes(product.id)}
                                      onCheckedChange={() => toggleProductSelection(product.id)}
                                    />
                                  </TableCell>
                                  <TableCell onClick={() => toggleProductSelection(product.id)} className="font-mono text-xs cursor-pointer">{product.item_id || '-'}</TableCell>
                                  <TableCell onClick={() => toggleProductSelection(product.id)} className="font-medium cursor-pointer">{product.name}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(product.price || 0)}</TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openProductWithPriceBreaks(product);
                                      }}
                                    >
                                      + Price Tiers
                                    </Button>
                                  </TableCell>
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
                        
                        {/* Price Breaks for Custom Item */}
                        <div className="space-y-3 pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <Label>Price Tiers (optional)</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addCustomItemPriceBreak}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Tier
                            </Button>
                          </div>
                          
                          {customItem.price_breaks.length > 0 && (
                            <div className="space-y-2">
                              {customItem.price_breaks.map((priceBreak, index) => (
                                <div 
                                  key={index} 
                                  className="flex items-center gap-2 p-2 rounded-md border"
                                >
                                  <Label className="text-xs w-8">Qty</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={priceBreak.qty}
                                    onChange={(e) => updateCustomItemPriceBreak(index, 'qty', parseInt(e.target.value) || 1)}
                                    className="h-8 w-24"
                                  />
                                  <Label className="text-xs w-8">Price</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={priceBreak.unit_price}
                                    onChange={(e) => updateCustomItemPriceBreak(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                    className="h-8 w-20"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive"
                                    onClick={() => removeCustomItemPriceBreak(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowCustomItemDialog(false);
                            setCustomItem({ sku: "", name: "", description: "", state: "", quantity: 1, unit_price: 0, price_breaks: [] });
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

                  {/* Add Product with Price Breaks Dialog */}
                  <Dialog open={showAddProductWithPriceBreaks} onOpenChange={setShowAddProductWithPriceBreaks}>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add Product with Price Tiers</DialogTitle>
                        <DialogDescription>
                          Configure price tiers for {selectedProductForPriceBreaks?.name}
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                          <div>
                            <p className="font-medium">{selectedProductForPriceBreaks?.name}</p>
                            <p className="text-sm text-muted-foreground font-mono">{selectedProductForPriceBreaks?.item_id || '-'}</p>
                          </div>
                          <p className="text-sm">Base Price: {formatCurrency(selectedProductForPriceBreaks?.price || 0)}</p>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Price Tiers</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addTempPriceBreak}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Tier
                            </Button>
                          </div>
                          
                          {tempPriceBreaks.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No price tiers defined. Add at least one tier.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {tempPriceBreaks.map((priceBreak, index) => (
                                <div 
                                  key={index} 
                                  className="flex items-center gap-3 p-2 rounded-md border"
                                >
                                  <div className="flex items-center gap-2 flex-1">
                                    <Label className="text-xs w-8">Qty</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={priceBreak.qty}
                                      onChange={(e) => updateTempPriceBreak(index, 'qty', parseInt(e.target.value) || 1)}
                                      className="h-8 w-28"
                                    />
                                    <Label className="text-xs w-10">Price</Label>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={priceBreak.unit_price}
                                        onChange={(e) => updateTempPriceBreak(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                        className="h-8 w-24 pl-5"
                                      />
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                      = {formatCurrency(priceBreak.qty * priceBreak.unit_price)}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive"
                                    onClick={() => removeTempPriceBreak(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowAddProductWithPriceBreaks(false);
                            setSelectedProductForPriceBreaks(null);
                            setTempPriceBreaks([]);
                          }}
                          type="button"
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddProductWithPriceBreaks}
                          disabled={tempPriceBreaks.length === 0}
                          type="button"
                        >
                          Add to Quote
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