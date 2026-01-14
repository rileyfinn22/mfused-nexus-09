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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Minus, X, Save, Send, Search, Upload, FileText, Loader2, Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { cn } from "@/lib/utils";

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
  cost: number | null;
  description: string | null;
  image_url: string | null;
  company_id: string;
  state: string | null;
}

interface Company {
  id: string;
  name: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  unit_price?: number; // Preserve PO prices
}

const mergeOrderItems = (base: OrderItem[], additions: OrderItem[]): OrderItem[] => {
  const merged = new Map<string, OrderItem>();

  for (const item of [...base, ...additions]) {
    const priceKey = item.unit_price ?? "";
    const key = `${item.productId}::${priceKey}`;

    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }

  return Array.from(merged.values());
};

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
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [roleChecked, setRoleChecked] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [addressLoadType, setAddressLoadType] = useState<'shipping' | 'billing'>('shipping');
  const [showSaveAddressDialog, setShowSaveAddressDialog] = useState(false);
  const [saveAddressType, setSaveAddressType] = useState<'shipping' | 'billing'>('shipping');
  const [saveAddressName, setSaveAddressName] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState<string>("");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>("");
  const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedProducts, setTempSelectedProducts] = useState<string[]>([]);
  const [existingOrderNumber, setExistingOrderNumber] = useState<string | null>(null);
  
  const [unmatchedPoItems, setUnmatchedPoItems] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedPOs, setUploadedPOs] = useState<{ filename: string; poNumber?: string }[]>([]);
  const [matchingProductId, setMatchingProductId] = useState<Record<string, string>>({});
  const [openCombobox, setOpenCombobox] = useState<Record<string, boolean>>({});
  const [inputMode, setInputMode] = useState<"pdf" | "text">("pdf");
  const [textInput, setTextInput] = useState<string>("");
  const [analysisHint, setAnalysisHint] = useState<string>("");

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

  // Initial data loading - runs once on mount
  useEffect(() => {
    let isMounted = true;
    
    const initializeData = async () => {
      try {
        setInitialLoading(true);
        
        // Check role first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        const { data: userRole } = await supabase
          .from('user_roles')
          .select('role, company_id')
          .eq('user_id', user.id)
          .single();

        const isAdmin = userRole?.role === 'vibe_admin';
        if (isMounted) {
          setIsVibeAdmin(isAdmin);
          setRoleChecked(true);
        }

        // Fetch products
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name, item_id, cost, description, image_url, company_id, state')
          .order('name');
        
        if (productsData && isMounted) {
          setProducts(productsData);
        }

        // Fetch all companies for reference
        const { data: companiesData } = await supabase
          .from('companies')
          .select('id, name');
        
        if (companiesData && isMounted) {
          setAllCompanies(companiesData);
        }

        if (isAdmin) {
          // For vibe admin, fetch all companies
          const { data: allCompaniesData } = await supabase
            .from('companies')
            .select('*')
            .order('name');
          
          if (allCompaniesData && isMounted) {
            setCompanies(allCompaniesData);
          }
        } else {
          // For regular users, load their company info
          if (userRole?.company_id && isMounted) {
            const { data: companyData } = await supabase
              .from('companies')
              .select('name')
              .eq('id', userRole.company_id)
              .single();

            if (companyData && isMounted) {
              setFormData(prev => ({
                ...prev,
                customerName: companyData.name,
              }));
            }
            
            // Load company addresses
            const { data: addressData } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('company_id', userRole.company_id)
              .order('is_default', { ascending: false });
            
            if (addressData && isMounted) {
              const defaultShipping = addressData.find(a => a.address_type === 'shipping' && a.is_default) || 
                                      addressData.find(a => a.address_type === 'shipping');
              
              if (defaultShipping) {
                setFormData(prev => ({
                  ...prev,
                  customerName: companyData?.name || prev.customerName,
                  customerEmail: defaultShipping.customer_email || "",
                  customerPhone: defaultShipping.customer_phone || "",
                  shippingName: defaultShipping.name,
                  shippingStreet: defaultShipping.street,
                  shippingCity: defaultShipping.city,
                  shippingState: defaultShipping.state,
                  shippingZip: defaultShipping.zip,
                }));
              }
              setSavedAddresses(addressData);
            }
          }
        }

        // Load existing order if editing
        if (orderId && isMounted) {
          await loadExistingOrder(orderId);
        }

      } catch (error) {
        console.error('Error initializing order page:', error);
      } finally {
        if (isMounted) {
          setInitialLoading(false);
        }
      }
    };

    initializeData();

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  const loadUserCompanyInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('company_id, companies(name)')
      .eq('user_id', user.id)
      .single();

    if (userRole?.company_id && userRole.companies) {
      const companyName = (userRole.companies as any).name;
      setFormData(prev => ({
        ...prev,
        customerName: companyName,
      }));
      
      // Load company addresses
      const { data } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('company_id', userRole.company_id)
        .order('is_default', { ascending: false });
      
      if (data) {
        const defaultShipping = data.find(a => a.address_type === 'shipping' && a.is_default) || 
                                data.find(a => a.address_type === 'shipping');
        
        if (defaultShipping) {
          setFormData(prev => ({
            ...prev,
            customerName: companyName,
            customerEmail: defaultShipping.customer_email || "",
            customerPhone: defaultShipping.customer_phone || "",
            shippingName: defaultShipping.name,
            shippingStreet: defaultShipping.street,
            shippingCity: defaultShipping.city,
            shippingState: defaultShipping.state,
            shippingZip: defaultShipping.zip,
          }));
        }
        setSavedAddresses(data);
      }
    }
  };

  // Only load company addresses when admin manually selects a company (not during initial load of existing order)
  useEffect(() => {
    if (selectedCompanyId && roleChecked && !initialLoading) {
      loadCompanyAddresses();
    }
  }, [selectedCompanyId, roleChecked, initialLoading]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCompanies(data);
    }
  };

  const loadCompanyAddresses = async () => {
    // Get the selected company details with full address info
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', selectedCompanyId)
      .single();
    
    const selectedCompany = companyData;
    const companyName = selectedCompany?.name || '';
    
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('company_id', selectedCompanyId)
      .order('is_default', { ascending: false });
    
    if (!error && data && data.length > 0) {
      // Auto-fill with default addresses or first addresses from customer_addresses
      const defaultShipping = data.find(a => a.address_type === 'shipping' && a.is_default) || 
                              data.find(a => a.address_type === 'shipping');
      const defaultBilling = data.find(a => a.address_type === 'billing' && a.is_default) || 
                             data.find(a => a.address_type === 'billing');
      
      if (defaultShipping) {
        setFormData(prev => ({
          ...prev,
          customerName: companyName,
          customerEmail: defaultShipping.customer_email || selectedCompany?.email || "",
          customerPhone: defaultShipping.customer_phone || selectedCompany?.phone || "",
          shippingName: defaultShipping.name,
          shippingStreet: defaultShipping.street,
          shippingCity: defaultShipping.city,
          shippingState: defaultShipping.state,
          shippingZip: defaultShipping.zip,
        }));
      } else if (selectedCompany) {
        // Fall back to company shipping address
        setFormData(prev => ({
          ...prev,
          customerName: companyName,
          customerEmail: selectedCompany.email || "",
          customerPhone: selectedCompany.phone || "",
          shippingName: companyName,
          shippingStreet: selectedCompany.shipping_street || "",
          shippingCity: selectedCompany.shipping_city || "",
          shippingState: selectedCompany.shipping_state || "",
          shippingZip: selectedCompany.shipping_zip || "",
        }));
      }

      if (defaultBilling && !sameAsBilling) {
        setFormData(prev => ({
          ...prev,
          billingName: defaultBilling.name,
          billingStreet: defaultBilling.street,
          billingCity: defaultBilling.city,
          billingState: defaultBilling.state,
          billingZip: defaultBilling.zip,
        }));
      } else if (selectedCompany && !sameAsBilling) {
        // Fall back to company billing address
        setFormData(prev => ({
          ...prev,
          billingName: companyName,
          billingStreet: selectedCompany.billing_street || "",
          billingCity: selectedCompany.billing_city || "",
          billingState: selectedCompany.billing_state || "",
          billingZip: selectedCompany.billing_zip || "",
        }));
      }

      setSavedAddresses(data);
    } else if (selectedCompany) {
      // No saved customer addresses, use company address info directly
      setFormData(prev => ({
        ...prev,
        customerName: companyName,
        customerEmail: selectedCompany.email || "",
        customerPhone: selectedCompany.phone || "",
        shippingName: companyName,
        shippingStreet: selectedCompany.shipping_street || "",
        shippingCity: selectedCompany.shipping_city || "",
        shippingState: selectedCompany.shipping_state || "",
        shippingZip: selectedCompany.shipping_zip || "",
        // Always load billing address - it will be hidden if sameAsBilling is checked
        billingName: companyName,
        billingStreet: selectedCompany.billing_street || "",
        billingCity: selectedCompany.billing_city || "",
        billingState: selectedCompany.billing_state || "",
        billingZip: selectedCompany.billing_zip || "",
      }));
      setSavedAddresses([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const validFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (files[i].type !== 'application/pdf') {
          toast({
            title: "Invalid file type",
            description: `${files[i].name} is not a PDF file`,
            variant: "destructive",
          });
        } else {
          validFiles.push(files[i]);
        }
      }
      if (validFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...validFiles]);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePOUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please log in to upload purchase orders",
          variant: "destructive",
        });
        navigate('/login');
        return;
      }

      // For vibe_admin, require company selection
      let companyId: string;
      if (isVibeAdmin) {
        if (!selectedCompanyId) {
          toast({
            title: "Company Required",
            description: "Please select a company before uploading a PO",
            variant: "destructive",
          });
          setUploading(false);
          return;
        }
        companyId = selectedCompanyId;
      } else {
        // Get user's company
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();

        if (!userRole?.company_id) {
          throw new Error('User not associated with a company');
        }
        companyId = userRole.company_id;
      }

      toast({
        title: "Processing POs",
        description: `Analyzing ${selectedFiles.length} purchase order(s)...`,
      });

      setUploading(false);
      setAnalyzing(true);

      // Process each file and accumulate products
      for (const file of selectedFiles) {
        // Upload to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('po-documents')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Trigger AI analysis
        const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-po', {
          body: { 
            pdfPath: fileName,
            companyId: companyId,
            filename: file.name,
            orderType: 'standard',
            returnProductsOnly: true, // New flag to just return extracted data without creating order
            analysisHint: analysisHint.trim() || undefined
          }
        });

        if (functionError) {
          console.error('Analysis error:', functionError);
          toast({
            title: "Analysis failed",
            description: `Could not analyze ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Add extracted products to order
        if (functionData?.items && Array.isArray(functionData.items)) {
          const additions: OrderItem[] = [];
          const newUnmatched: any[] = [];

          for (const item of functionData.items) {
            if (item.product_id) {
              additions.push({
                productId: item.product_id,
                quantity: item.quantity || 1,
                unit_price: item.unit_price,
              });
            } else {
              newUnmatched.push(item);
            }
          }

          if (additions.length > 0) {
            setSelectedItems((prev) => mergeOrderItems(prev, additions));
          }
          if (newUnmatched.length > 0) {
            setUnmatchedPoItems((prev) => [...prev, ...newUnmatched]);
          }
        }

        // Extract PO number from data or filename
        const poNum = functionData?.poNumber || file.name.replace('.pdf', '');
        setUploadedPOs(prev => [...prev, { filename: file.name, poNumber: poNum }]);
        
        // Update form PO number field (combine multiple)
        setFormData(prev => ({
          ...prev,
          poNumber: prev.poNumber 
            ? `${prev.poNumber}, ${poNum}` 
            : poNum
        }));

        // Fill in customer/shipping if available and not already filled
        if (functionData?.customerName && !formData.customerName) {
          setFormData(prev => ({ ...prev, customerName: functionData.customerName }));
        }
        if (functionData?.shippingAddress) {
          const addr = functionData.shippingAddress;
          if (!formData.shippingStreet && addr.street) {
            setFormData(prev => ({
              ...prev,
              shippingName: addr.name || prev.shippingName,
              shippingStreet: addr.street || prev.shippingStreet,
              shippingCity: addr.city || prev.shippingCity,
              shippingState: addr.state || prev.shippingState,
              shippingZip: addr.zip || prev.shippingZip,
            }));
          }
        }
      }

      toast({
        title: "POs analyzed",
        description: `${selectedFiles.length} PO(s) processed. Review items below.`,
      });

      setAnalyzing(false);
      setSelectedFiles([]);

    } catch (error: any) {
      console.error('Error uploading POs:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const handleTextAnalyze = async () => {
    if (!textInput.trim()) {
      toast({
        title: "No text provided",
        description: "Please paste some text to analyze",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please log in to analyze orders",
          variant: "destructive",
        });
        navigate('/login');
        return;
      }

      // For vibe_admin, require company selection
      let companyId: string;
      if (isVibeAdmin) {
        if (!selectedCompanyId) {
          toast({
            title: "Company Required",
            description: "Please select a company before analyzing text",
            variant: "destructive",
          });
          setAnalyzing(false);
          return;
        }
        companyId = selectedCompanyId;
      } else {
        // Get user's company
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();

        if (!userRole?.company_id) {
          throw new Error('User not associated with a company');
        }
        companyId = userRole.company_id;
      }

      toast({
        title: "Analyzing text",
        description: "Processing your order data...",
      });

      // Trigger AI analysis with text content
      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-po', {
        body: { 
          textContent: textInput.trim(),
          companyId: companyId,
          orderType: 'standard',
          returnProductsOnly: true,
          analysisHint: analysisHint.trim() || undefined
        }
      });

      if (functionError) {
        console.error('Analysis error:', functionError);
        toast({
          title: "Analysis failed",
          description: "Could not analyze the text",
          variant: "destructive",
        });
        setAnalyzing(false);
        return;
      }

      // Add extracted products to order
      if (functionData?.items && Array.isArray(functionData.items)) {
        const newItems: OrderItem[] = [];
        const newUnmatched: any[] = [];
        
        for (const item of functionData.items) {
          if (item.product_id) {
            // Check if already in selected items
            const existingIdx = selectedItems.findIndex(si => si.productId === item.product_id);
            if (existingIdx >= 0) {
              // Add quantity to existing
              setSelectedItems(prev => prev.map((si, idx) => 
                idx === existingIdx 
                  ? { ...si, quantity: si.quantity + (item.quantity || 1) }
                  : si
              ));
            } else {
              newItems.push({
                productId: item.product_id,
                quantity: item.quantity || 1,
                unit_price: item.unit_price,
              });
            }
          } else {
            // Unmatched item
            newUnmatched.push(item);
          }
        }
        
        if (newItems.length > 0) {
          setSelectedItems(prev => [...prev, ...newItems]);
        }
        if (newUnmatched.length > 0) {
          setUnmatchedPoItems(prev => [...prev, ...newUnmatched]);
        }
      }

      // Extract PO number if available
      if (functionData?.poNumber) {
        setFormData(prev => ({
          ...prev,
          poNumber: prev.poNumber 
            ? `${prev.poNumber}, ${functionData.poNumber}` 
            : functionData.poNumber
        }));
      }

      // Fill in customer/shipping if available and not already filled
      if (functionData?.customerName && !formData.customerName) {
        setFormData(prev => ({ ...prev, customerName: functionData.customerName }));
      }
      if (functionData?.shippingAddress) {
        const addr = functionData.shippingAddress;
        if (!formData.shippingName && addr.name) {
          setFormData(prev => ({
            ...prev,
            shippingName: addr.name || prev.shippingName,
            shippingStreet: addr.street || prev.shippingStreet,
            shippingCity: addr.city || prev.shippingCity,
            shippingState: addr.state || prev.shippingState,
            shippingZip: addr.zip || prev.shippingZip,
          }));
        }
      }

      const matchedCount = functionData?.items?.filter((i: any) => i.product_id).length || 0;
      const totalCount = functionData?.items?.length || 0;
      
      toast({
        title: "Text analyzed",
        description: `Found ${totalCount} items. ${matchedCount} matched to products.`,
      });

      setTextInput("");
      setInputMode("pdf");
      
    } catch (error: any) {
      console.error('Error analyzing text:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, item_id, cost, description, image_url, company_id, state')
      .order('name');
    
    if (!error && data) {
      setProducts(data);
    }

    // Also fetch all companies for reference
    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name');
    
    if (companiesData) {
      setAllCompanies(companiesData);
    }
  };

  // Filter products: show products where company matches
  const availableProducts = (() => {
    if (isVibeAdmin && selectedCompanyId) {
      return products.filter(p => p.company_id === selectedCompanyId);
    }
    
    // For non-admin users, show all products (filtered by RLS)
    return products;
  })();

  const fetchSavedAddresses = async () => {
    if (!isVibeAdmin) {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setSavedAddresses(data);
      }
    }
  };

  const loadExistingOrder = async (id: string) => {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (!error && order) {
      // Check if order can be edited
      const restrictedStatuses = ['in production', 'shipped', 'delivered'];
      const isRestricted = restrictedStatuses.includes(order.status) || order.vibe_processed;
      
      if (!isVibeAdmin && isRestricted) {
        toast({
          title: "Cannot Edit",
          description: "This order has been approved for production and cannot be edited",
          variant: "destructive",
        });
        navigate('/orders');
        return;
      }

      setExistingOrderNumber(order.order_number);
      setSelectedCompanyId(order.company_id); // Set company when loading existing order
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

      const items = order.order_items
        .filter((item: any) => item.product_id !== null) // Only load items with matching products
        .map((item: any) => ({
          productId: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price, // Preserve PO prices
        }));
      setSelectedItems(mergeOrderItems([], items));
      
      // Store unmatched items from PO for display
      const unmatchedItems = order.order_items.filter((item: any) => item.product_id === null);
      setUnmatchedPoItems(unmatchedItems);
      
      if (unmatchedItems.length > 0) {
        toast({
          title: "Items extracted from PO",
          description: `${unmatchedItems.length} item(s) from the PO are shown below. Add products from your catalog to match them.`,
        });
      }
    }
  };

  const loadAddress = (address: SavedAddress, type: 'shipping' | 'billing') => {
    if (type === 'shipping') {
      setFormData({
        ...formData,
        shippingName: address.name,
        shippingStreet: address.street,
        shippingCity: address.city,
        shippingState: address.state,
        shippingZip: address.zip,
      });
    } else {
      setFormData({
        ...formData,
        billingName: address.name,
        billingStreet: address.street,
        billingCity: address.city,
        billingState: address.state,
        billingZip: address.zip,
      });
      setSameAsBilling(false);
    }
    setShowAddressDialog(false);
  };

  const handleSaveAddress = async () => {
    const companyId = isVibeAdmin ? selectedCompanyId : await getUserCompanyId();
    if (!companyId) {
      toast({
        title: "Error",
        description: "Please select a company first",
        variant: "destructive",
      });
      return;
    }

    if (!saveAddressName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for this address",
        variant: "destructive",
      });
      return;
    }

    setSavingAddress(true);
    try {
      const addressData = saveAddressType === 'shipping' 
        ? {
            company_id: companyId,
            customer_name: formData.customerName,
            customer_email: formData.customerEmail || null,
            customer_phone: formData.customerPhone || null,
            address_type: 'shipping',
            name: saveAddressName,
            street: formData.shippingStreet,
            city: formData.shippingCity,
            state: formData.shippingState,
            zip: formData.shippingZip,
          }
        : {
            company_id: companyId,
            customer_name: formData.customerName,
            customer_email: formData.customerEmail || null,
            customer_phone: formData.customerPhone || null,
            address_type: 'billing',
            name: saveAddressName,
            street: formData.billingStreet,
            city: formData.billingCity,
            state: formData.billingState,
            zip: formData.billingZip,
          };

      const { error } = await supabase
        .from('customer_addresses')
        .insert(addressData);

      if (error) throw error;

      toast({
        title: "Address saved",
        description: `${saveAddressName} has been saved for future use`,
      });

      setShowSaveAddressDialog(false);
      setSaveAddressName('');
      
      // Refresh addresses
      if (isVibeAdmin && selectedCompanyId) {
        loadCompanyAddresses();
      } else {
        fetchSavedAddresses();
      }
    } catch (error: any) {
      toast({
        title: "Error saving address",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingAddress(false);
    }
  };

  const getUserCompanyId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    
    return userRole?.company_id || null;
  };

  const openSaveAddressDialog = (type: 'shipping' | 'billing') => {
    setSaveAddressType(type);
    setSaveAddressName(type === 'shipping' ? formData.shippingName : formData.billingName);
    setShowSaveAddressDialog(true);
  };

  const openLoadAddressDialog = (type: 'shipping' | 'billing') => {
    setAddressLoadType(type);
    setShowAddressDialog(true);
  };

  const handleRemoveItem = (itemKey: string) => {
    setSelectedItems(prev => prev.filter(item => getItemKey(item) !== itemKey));
  };

  const handleAddItem = (productId: string) => {
    const exists = selectedItems.find(item => item.productId === productId);
    if (!exists) {
      setSelectedItems([...selectedItems, { productId, quantity: 1 }]);
    }
  };

  const handleAddUnmatchedAsProduct = async (unmatchedItem: any) => {
    if (!selectedCompanyId) {
      toast({
        title: "Error",
        description: "Please select a company first",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({
          name: unmatchedItem.name,
          item_id: unmatchedItem.sku,
          description: unmatchedItem.description,
          cost: unmatchedItem.unit_price,
          company_id: selectedCompanyId,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to products list
      setProducts([...products, newProduct]);

      // Add to selected items with PO price (using callback to prevent race conditions)
      setSelectedItems(prev => {
        const exists = prev.find(item => item.productId === newProduct.id);
        if (exists) return prev;
        return [...prev, {
          productId: newProduct.id,
          quantity: unmatchedItem.quantity,
          unit_price: unmatchedItem.unit_price,
        }];
      });

      // Remove from unmatched state
      setUnmatchedPoItems(unmatchedPoItems.filter(item => item.id !== unmatchedItem.id));
      
      // Delete the unmatched item from database immediately
      if (unmatchedItem.id) {
        await supabase
          .from('order_items')
          .delete()
          .eq('id', unmatchedItem.id);
      }

      toast({
        title: "Product Added",
        description: `${newProduct.name} has been added to your catalog and order`,
      });
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        title: "Error",
        description: "Failed to add product to catalog",
        variant: "destructive",
      });
    }
  };

  const handleMatchUnmatchedItem = async (unmatchedItem: any, productId: string) => {
    if (!productId) return;

    // Add to selected items with PO price (using callback to prevent race conditions)
    setSelectedItems(prev => {
      const exists = prev.find(item => item.productId === productId);
      if (exists) return prev;
      return [...prev, {
        productId: productId,
        quantity: unmatchedItem.quantity,
        unit_price: unmatchedItem.unit_price,
      }];
    });

    // Remove from unmatched state
    setUnmatchedPoItems(unmatchedPoItems.filter(item => item.id !== unmatchedItem.id));

    // Delete the unmatched item from database immediately
    if (unmatchedItem.id) {
      await supabase
        .from('order_items')
        .delete()
        .eq('id', unmatchedItem.id);
    }

    // Clear selection and close popover
    setMatchingProductId({ ...matchingProductId, [unmatchedItem.id]: "" });
    setOpenCombobox({ ...openCombobox, [unmatchedItem.id]: false });

    toast({
      title: "Item Matched",
      description: "Product has been added to the order",
    });
  };

  // Generate unique key for each item (productId + price combo)
  const getItemKey = (item: OrderItem) => `${item.productId}::${item.unit_price ?? 'default'}`;

  const handleQuantityChange = (itemKey: string, change: number) => {
    setSelectedItems(selectedItems.map(item => {
      if (getItemKey(item) === itemKey) {
        const newQuantity = Math.max(1, item.quantity + change);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const handleQuantityClick = (itemKey: string, currentQuantity: number) => {
    setEditingQuantityId(itemKey);
    setTempQuantity(currentQuantity.toString());
  };

  const handleQuantityBlur = (itemKey: string) => {
    const newQty = parseInt(tempQuantity) || 1;
    setSelectedItems(selectedItems.map(item => 
      getItemKey(item) === itemKey ? { ...item, quantity: Math.max(1, newQty) } : item
    ));
    setEditingQuantityId(null);
  };

  const handlePriceClick = (itemKey: string, currentPrice: number) => {
    setEditingPriceId(itemKey);
    setTempPrice(currentPrice.toFixed(2));
  };

  const handlePriceBlur = (itemKey: string) => {
    const newPrice = parseFloat(tempPrice) || 0;
    setSelectedItems(selectedItems.map(item => 
      getItemKey(item) === itemKey ? { ...item, unit_price: Math.max(0, newPrice) } : item
    ));
    setEditingPriceId(null);
  };

  const handleAddSelectedItems = () => {
    // Filter out products that are already selected
    const existingProductIds = new Set(selectedItems.map(item => item.productId));
    const newItems = tempSelectedProducts
      .filter(productId => !existingProductIds.has(productId))
      .map(productId => ({
        productId,
        quantity: 1
      }));
    setSelectedItems(prev => [...prev, ...newItems]);
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

  const filteredProducts = availableProducts.filter(p => {
    const alreadySelected = selectedItems.find(item => item.productId === p.id);
    if (alreadySelected) return false;
    
    if (!searchQuery) return true;
    
    const search = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(search) ||
      p.item_id?.toLowerCase().includes(search)
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

      let companyId: string;

      if (isVibeAdmin) {
        if (!selectedCompanyId) {
          toast({
            title: "Company Required",
            description: "Please select a company for this order",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        companyId = selectedCompanyId;
      } else {
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();

        if (!userRole) throw new Error("User company not found");
        companyId = userRole.company_id;
      }

      let subtotal = 0;
      for (const item of selectedItems) {
        const product = products.find(p => p.id === item.productId);
        // Use stored unit_price if available (from PO), otherwise use product cost
        const price = item.unit_price ?? product?.cost ?? 0;
        subtotal += price * item.quantity;
      }

      const total = subtotal;

      let order;
      let orderNumber = existingOrderNumber;
      let existingItemsMap: Map<string, any> | null = null;

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
            total,
            terms: formData.terms,
            memo: formData.memo || null,
          })
          .eq('id', orderId)
          .select()
          .single();

        if (orderError) throw orderError;
        order = updatedOrder;

        // Fetch existing order items to preserve vendor assignments
        const { data: existingItems } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        // Track existing items by their ID to preserve them during update
        existingItemsMap = new Map(
          (existingItems || [])
            .filter(item => item.product_id !== null)
            .map(item => [item.id, item])
        );
      } else {
        // Create new order with sequential number - get max existing order number
        // Fetch recent orders and find the highest numeric order number
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('order_number')
          .order('created_at', { ascending: false })
          .limit(100);
        
        // Find the highest numeric order number from recent orders
        let maxOrderNum = 10699; // Starting point (will increment to 10700)
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
        orderNumber = String(maxOrderNum + 1);

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            po_number: formData.poNumber || null,
            company_id: companyId,
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
            total,
            terms: formData.terms,
            memo: formData.memo || null,
            order_type: 'standard',
          })
          .select()
          .single();

        if (orderError) throw orderError;
        order = newOrder;
      }

      if (orderId && existingItemsMap) {
        // Update existing items and add new ones, preserving vendor assignments
        for (const item of selectedItems) {
          const product = products.find(p => p.id === item.productId);
          const price = item.unit_price ?? product?.cost ?? 0;
          const itemTotal = price * item.quantity;
          
          const existingItem = existingItemsMap.get(item.productId);
          
          if (existingItem) {
            // Update existing item, preserving vendor data and shipped_quantity
            await supabase
              .from('order_items')
              .update({
                quantity: item.quantity,
                unit_price: price,
                total: itemTotal,
                sku: product?.item_id || existingItem.sku,
                item_id: product?.item_id || existingItem.item_id,
                name: product?.name || existingItem.name,
                description: product?.description || existingItem.description,
              })
              .eq('id', existingItem.id);
            
            // Remove from map so we know it's been handled
            existingItemsMap.delete(item.productId);
          } else {
            // Insert new item
            await supabase
              .from('order_items')
              .insert({
                order_id: order.id,
                product_id: item.productId,
                sku: product?.item_id || `SKU-${product?.id.substring(0, 8)}`,
                item_id: product?.item_id || null,
                name: product?.name || "",
                description: product?.description || null,
                quantity: item.quantity,
                shipped_quantity: 0,
                unit_price: price,
                total: itemTotal,
              });
          }
        }
        
        // Delete items that are no longer in the order (matched items that were removed)
        const itemsToDelete = Array.from(existingItemsMap.values());
        if (itemsToDelete.length > 0) {
          await supabase
            .from('order_items')
            .delete()
            .in('id', itemsToDelete.map(i => i.id));
        }
      } else {
        // New order - insert all items
        const orderItems = selectedItems.map(item => {
          const product = products.find(p => p.id === item.productId);
          const price = item.unit_price ?? product?.cost ?? 0;
          const itemTotal = price * item.quantity;
          
          return {
            order_id: order.id,
            product_id: item.productId,
            sku: product?.item_id || `SKU-${product?.id.substring(0, 8)}`,
            item_id: product?.item_id || null,
            name: product?.name || "",
            description: product?.description || null,
            quantity: item.quantity,
            shipped_quantity: 0,
            unit_price: price,
            total: itemTotal,
          };
        });

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsError) throw itemsError;
      }

      const actionText = orderId 
        ? (isDraft ? "updated as draft" : "updated")
        : (isDraft ? "saved as draft" : "placed");
      
      toast({
        title: orderId ? (isDraft ? "Draft Updated" : "Order Updated") : (isDraft ? "Draft Saved" : "Order Placed"),
        description: `Order ${orderNumber} has been ${actionText} successfully`,
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
    // Use stored unit_price if available (from PO), otherwise use product cost
    const price = item.unit_price ?? product?.cost ?? 0;
    return sum + (price * item.quantity);
  }, 0);
  const total = subtotal;

  // Show loading state while initializing
  if (initialLoading) {
    return (
      <div className="max-w-7xl mx-auto pb-8">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading order form...</p>
          </div>
        </div>
      </div>
    );
  }

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
              {orderId ? "Update Draft" : "Save Draft"}
            </Button>
            <Button onClick={() => saveOrder(false)} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? (orderId ? "Updating..." : "Placing...") : (orderId ? "Update Order" : "Place Order")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Company Selector for Vibe Admin */}
        {isVibeAdmin && (
          <div className="bg-muted/30 backdrop-blur rounded-lg p-6 border border-table-border">
            <Label htmlFor="company" className="text-xs font-semibold uppercase text-muted-foreground">
              Select Company *
            </Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId} disabled={!!orderId}>
              <SelectTrigger className="w-full mt-2">
                <SelectValue placeholder="Choose a company..." />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCompanyId && (
              <p className="text-xs text-muted-foreground mt-2">
                {orderId 
                  ? "Company cannot be changed for existing orders"
                  : "Customer and shipping information will be auto-filled from saved addresses"
                }
              </p>
            )}
          </div>
        )}

        {/* Order Entry - Upload PO or Paste Text */}
        {!orderId && (
          <div className="bg-muted/30 backdrop-blur rounded-lg p-4 border border-table-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Order Entry
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload POs or paste text from email to automatically fill the order
                </p>
              </div>
            </div>
            
            {/* Analysis Hint */}
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground mb-1 block">
                AI Matching Hint (optional)
              </Label>
              <Input
                value={analysisHint}
                onChange={(e) => setAnalysisHint(e.target.value)}
                placeholder="e.g., 'All items are for California warehouse' or 'SKUs start with ABC-'"
                className="h-8 text-sm"
                disabled={analyzing || (isVibeAdmin && !selectedCompanyId)}
              />
            </div>
            
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "pdf" | "text")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="pdf" className="flex items-center gap-1.5">
                  <Upload className="h-4 w-4" />
                  Upload PO
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Paste Text
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="pdf" className="mt-0">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="po-upload"
                    multiple
                    disabled={uploading || analyzing || (isVibeAdmin && !selectedCompanyId)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('po-upload')?.click()}
                    disabled={uploading || analyzing || (isVibeAdmin && !selectedCompanyId)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {selectedFiles.length > 0 ? 'Add More POs' : 'Select PDF Files'}
                  </Button>
                  {selectedFiles.length > 0 && (
                    <Button
                      onClick={handlePOUpload}
                      disabled={uploading || analyzing}
                      size="sm"
                    >
                      {uploading || analyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {uploading ? 'Uploading...' : 'Analyzing...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          {`Analyze ${selectedFiles.length} PO${selectedFiles.length > 1 ? 's' : ''}`}
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {/* Show selected files */}
                {selectedFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {file.name.length > 25 ? `${file.name.substring(0, 22)}...` : file.name}
                        <button
                          onClick={() => removeSelectedFile(idx)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="text" className="mt-0">
                <div className="space-y-3">
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste product names or order details from email...&#10;&#10;Example:&#10;SKU-001 Product Name x 100&#10;SKU-002 Another Product x 50&#10;..."
                    className="min-h-[120px] resize-y"
                    disabled={analyzing || (isVibeAdmin && !selectedCompanyId)}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Paste from emails, spreadsheets, or any text containing product info
                    </p>
                    <Button
                      onClick={handleTextAnalyze}
                      disabled={!textInput.trim() || analyzing || (isVibeAdmin && !selectedCompanyId)}
                      size="sm"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Analyze Text
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            {/* Show already processed POs with clear option */}
            {(uploadedPOs.length > 0 || selectedItems.length > 0 || unmatchedPoItems.length > 0) && (
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">
                    {uploadedPOs.length > 0 ? 'Processed POs:' : 'Analysis Results:'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setSelectedItems([]);
                      setUnmatchedPoItems([]);
                      setUploadedPOs([]);
                      setTextInput("");
                      setFormData(prev => ({ ...prev, poNumber: "" }));
                      toast({
                        title: "Analysis cleared",
                        description: "You can now re-analyze with different input or hints",
                      });
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear & Retry
                  </Button>
                </div>
                {uploadedPOs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedPOs.map((po, idx) => (
                      <Badge key={idx} variant="outline" className="flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" />
                        {po.poNumber || po.filename}
                      </Badge>
                    ))}
                  </div>
                )}
                {selectedItems.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedItems.length} item(s) matched
                    {unmatchedPoItems.length > 0 && `, ${unmatchedPoItems.length} unmatched`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Customer & Address Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/30 backdrop-blur rounded-lg p-6 border border-table-border">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Customer</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="customerName" className="text-xs">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  required
                  className="h-9"
                  placeholder="Contact or ship-to name"
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to company name, edit for ship-to contact
                </p>
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
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Ship To</h3>
              <div className="flex gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => openLoadAddressDialog('shipping')}
                >
                  Load
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => openSaveAddressDialog('shipping')}
                  disabled={!formData.shippingStreet}
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
              </div>
            </div>
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
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Bill To</h3>
              {!sameAsBilling && (
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => openLoadAddressDialog('billing')}
                  >
                    Load
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => openSaveAddressDialog('billing')}
                    disabled={!formData.billingStreet}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
              )}
            </div>
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

        {/* Load Address Dialog */}
        <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load {addressLoadType === 'shipping' ? 'Shipping' : 'Billing'} Address</DialogTitle>
              <DialogDescription>Select an address to load into the {addressLoadType} fields</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {savedAddresses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No saved addresses found</p>
              ) : (
                savedAddresses.map((address) => (
                  <div
                    key={address.id}
                    className="p-3 border rounded hover:bg-muted cursor-pointer"
                    onClick={() => loadAddress(address, addressLoadType)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{address.name}</p>
                      <Badge variant="outline" className="text-xs">
                        {address.address_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {address.street}, {address.city}, {address.state} {address.zip}
                    </p>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Save Address Dialog */}
        <Dialog open={showSaveAddressDialog} onOpenChange={setShowSaveAddressDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save {saveAddressType === 'shipping' ? 'Shipping' : 'Billing'} Address</DialogTitle>
              <DialogDescription>Save this address for future orders</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="addressName">Address Name *</Label>
                <Input
                  id="addressName"
                  value={saveAddressName}
                  onChange={(e) => setSaveAddressName(e.target.value)}
                  placeholder="e.g., Headquarters, Warehouse, Distribution Center"
                />
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <p className="font-medium mb-1">Address Preview:</p>
                {saveAddressType === 'shipping' ? (
                  <>
                    <p>{formData.shippingName}</p>
                    <p>{formData.shippingStreet}</p>
                    <p>{formData.shippingCity}, {formData.shippingState} {formData.shippingZip}</p>
                  </>
                ) : (
                  <>
                    <p>{formData.billingName}</p>
                    <p>{formData.billingStreet}</p>
                    <p>{formData.billingCity}, {formData.billingState} {formData.billingZip}</p>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSaveAddressDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveAddress} disabled={savingAddress || !saveAddressName.trim()}>
                  {savingAddress ? "Saving..." : "Save Address"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Unmatched PO Items Section */}
        {unmatchedPoItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Items from PO (Need Matching)</h2>
              <span className="text-sm text-muted-foreground">{unmatchedPoItems.length} items extracted</span>
            </div>
            <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 space-y-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                These items were extracted from the purchase order but don't match any products in your catalog. 
                Add products from your catalog below to fulfill this order.
              </p>
              <div className="border border-table-border rounded-lg overflow-hidden bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header">
                      <TableHead>SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[300px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatchedPoItems.map((item) => {
                      // Only show products from the selected company
                      const companyFilteredProducts = availableProducts;

                      const selectedProduct = companyFilteredProducts.find(p => p.id === matchingProductId[item.id]);

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">${Number(item.unit_price).toFixed(3)}</TableCell>
                          <TableCell className="text-right font-medium">${Number(item.total).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddUnmatchedAsProduct(item)}
                                className="whitespace-nowrap"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add to Catalog
                              </Button>
                              <Popover 
                                open={openCombobox[item.id]} 
                                onOpenChange={(open) => setOpenCombobox({ ...openCombobox, [item.id]: open })}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCombobox[item.id]}
                                    className="w-[200px] justify-between h-8"
                                  >
                                    {selectedProduct ? (selectedProduct.item_id || selectedProduct.name) : "Match to product..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0 bg-popover z-50" align="start">
                                  <Command className="bg-popover">
                                    <CommandInput placeholder="Search products..." className="h-9" />
                                    <CommandList>
                                      <CommandEmpty>No products found.</CommandEmpty>
                                      <CommandGroup>
                                        {companyFilteredProducts.map((product) => (
                                          <CommandItem
                                            key={product.id}
                                            value={`${product.item_id || ''} ${product.state ? product.state + ' ' : ''}${product.name}`}
                                            onSelect={() => {
                                              setMatchingProductId({ ...matchingProductId, [item.id]: product.id });
                                              handleMatchUnmatchedItem(item, product.id);
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                matchingProductId[item.id] === product.id ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium">
                                                {product.state ? `${product.state} - ${product.name}` : product.name}
                                              </span>
                                              {product.item_id && (
                                                <span className="text-xs text-muted-foreground font-mono">{product.item_id}</span>
                                              )}
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

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
                  // Use stored unit_price if available (from PO), otherwise use product cost
                  const price = item.unit_price ?? product.cost ?? 0;
                  const amount = price * item.quantity;
                  const itemKey = getItemKey(item);
                  
                  return (
                    <TableRow key={itemKey}>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleRemoveItem(itemKey)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{product.item_id || '-'}</TableCell>
                      <TableCell className="font-medium">
                        {product.state ? `${product.state} - ${product.name}` : product.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {product.description}
                      </TableCell>
                      <TableCell>
                        {editingQuantityId === itemKey ? (
                          <Input
                            type="number"
                            value={tempQuantity}
                            onChange={(e) => setTempQuantity(e.target.value)}
                            onBlur={() => handleQuantityBlur(itemKey)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleQuantityBlur(itemKey);
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
                              onClick={() => handleQuantityChange(itemKey, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span 
                              className="w-12 text-center font-medium cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              onClick={() => handleQuantityClick(itemKey, item.quantity)}
                            >
                              {item.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleQuantityChange(itemKey, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingPriceId === itemKey ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            onBlur={() => handlePriceBlur(itemKey)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handlePriceBlur(itemKey);
                              if (e.key === 'Escape') setEditingPriceId(null);
                            }}
                            className="h-8 w-24 text-right"
                            autoFocus
                          />
                        ) : (
                          <span 
                            className="cursor-pointer hover:bg-muted px-2 py-1 rounded inline-block"
                            onClick={() => handlePriceClick(itemKey, price)}
                          >
                            ${price.toFixed(3)}
                          </span>
                        )}
                      </TableCell>
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
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    type="button"
                    disabled={isVibeAdmin && !selectedCompanyId}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isVibeAdmin && !selectedCompanyId ? "Select a company first" : "Add Items"}
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
                              {isVibeAdmin && !selectedCompanyId
                                ? "Please select a company first to see available products" 
                                : searchQuery 
                                  ? "No products found matching your search" 
                                  : "No products available"}
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
                              <TableCell className="font-medium">
                                {product.state ? `${product.state} - ${product.name}` : product.name}
                              </TableCell>
                              <TableCell className="text-right">${product.cost?.toFixed(3) || '0.000'}</TableCell>
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
              <div className="flex justify-between">
                <span className="font-semibold text-lg">Total:</span>
                <span className="font-bold text-xl">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Additional Info */}
        <div className="space-y-6">
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
            <Label htmlFor="memo">Memo</Label>
            <Textarea
              id="memo"
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={3}
              placeholder="Any additional notes or special instructions..."
            />
          </div>

          {/* Terms */}
          <div className="space-y-2">
            <Label htmlFor="orderTerms">Terms</Label>
            <Textarea
              id="orderTerms"
              value={formData.terms}
              onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
              rows={4}
              placeholder="Enter order terms..."
              className="resize-y"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrder;
