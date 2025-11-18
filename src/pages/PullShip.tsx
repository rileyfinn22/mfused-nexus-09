import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Plus, 
  Package, 
  Truck, 
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Archive,
  Trash2,
  X,
  Search,
  Filter,
  ArrowUpDown,
  FileText,
  Download,
  Eye,
  Upload
} from "lucide-react";

const PullShip = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState({
    companyId: "",
    state: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notes: "",
    parentOrderId: ""
  });

  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [skuQuantities, setSkuQuantities] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingPO, setUploadingPO] = useState(false);
  const [analyzingPO, setAnalyzingPO] = useState(false);
  const [selectedPOFile, setSelectedPOFile] = useState<File | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [blanketOrders, setBlanketOrders] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoiceItemPrices, setInvoiceItemPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchPullShipOrders();
    fetchCompanies();
  }, []);

  const fetchPullShipOrders = async () => {
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(sku, quantity),
          companies(name)
        `)
        .eq('order_type', 'pull_ship')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching pull & ship orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchBlanketOrders = async (companyId: string) => {
    if (!companyId) {
      setBlanketOrders([]);
      return;
    }

    try {
      // Only fetch orders that have a full invoice (not partial)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, 
          order_number, 
          customer_name, 
          total, 
          created_at,
          invoices!inner(invoice_type),
          companies!company_id(name)
        `)
        .eq('company_id', companyId)
        .eq('order_type', 'standard')
        .eq('invoices.invoice_type', 'full')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setBlanketOrders(data || []);
    } catch (error) {
      console.error('Error fetching blanket orders:', error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };
  
  const stateAddressMapping = {
    "WA": { address: "123 Main St", city: "Seattle", zip: "98101" },
    "CA": { address: "456 Oak Ave", city: "Los Angeles", zip: "90210" },
    "NY": { address: "789 Broadway", city: "New York", zip: "10001" },
    "AZ": { address: "321 Desert Rd", city: "Phoenix", zip: "85001" },
    "MD": { address: "654 Harbor Dr", city: "Baltimore", zip: "21201" },
    "CO": { address: "987 Mountain View", city: "Denver", zip: "80202" },
    "OR": { address: "147 Pine St", city: "Portland", zip: "97201" },
    "Primary": { address: "", city: "", zip: "" }
  };

  const stateOptions = [...Object.keys(stateAddressMapping).filter(s => s !== "Primary"), "Primary"];

  // Fetch inventory from database for the selected state and company
  const fetchInventoryForState = async (state: string, companyId: string) => {
    if (!state || !companyId) return;
    
    setLoadingInventory(true);
    try {
      console.log('Fetching inventory for state:', state, 'companyId:', companyId);
      const { data, error } = await supabase
        .from('inventory')
        .select('*, products(image_url, item_id, name)')
        .eq('state', state)
        .eq('company_id', companyId)
        .gt('available', 0)
        .order('sku', { ascending: true });

      if (error) throw error;
      console.log('Inventory fetched:', data?.length || 0, 'items');
      setInventory(data || []);
      
      if (!data || data.length === 0) {
        toast({
          title: "No inventory found",
          description: `No available inventory found for state ${state}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory data",
        variant: "destructive",
      });
    } finally {
      setLoadingInventory(false);
    }
  };

  const getStockStatus = (available: number, redline: number) => {
    if (available < redline * 0.5) return "critical";
    if (available < redline) return "warning";
    return "good";
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case "critical": return "text-danger";
      case "warning": return "text-warning";
      case "good": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'text-warning';
      case 'picked': return 'text-primary';
      case 'shipped': return 'text-blue-500';
      case 'delivered': return 'text-success';
      case 'cancelled': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };


  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return Clock;
      case 'picked': return Package;
      case 'shipped': return Truck;
      case 'delivered': return CheckCircle;
      case 'cancelled': return AlertCircle;
      default: return Clock;
    }
  };

  const handleSkuSelection = (sku: string, checked: boolean) => {
    const newSelected = new Set(selectedSkus);
    if (checked) {
      newSelected.add(sku);
      setSkuQuantities(prev => ({ ...prev, [sku]: 1 }));
    } else {
      newSelected.delete(sku);
      setSkuQuantities(prev => {
        const newQuantities = { ...prev };
        delete newQuantities[sku];
        return newQuantities;
      });
    }
    setSelectedSkus(newSelected);
  };

  const handleQuantityChange = (sku: string, quantity: number) => {
    setSkuQuantities(prev => ({ ...prev, [sku]: Math.max(1, quantity) }));
  };

  const generatePackingListPDF = (items: Array<{sku: string, itemId?: string, quantity: number}>, orderData: any, invoiceId: string) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("PACKING LIST", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Packing List ID: ${invoiceId}-PACK`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Destination: ${orderData.state}`, 20, 60);
    
    // Shipping Address
    doc.text("Ship To:", 20, 80);
    doc.text(orderData.shippingAddress, 20, 90);
    doc.text(`${orderData.shippingCity}, ${orderData.shippingState} ${orderData.shippingZip}`, 20, 100);
    
    // Items table
    const tableData = items.map(item => [
      item.itemId || "N/A",
      item.sku, 
      item.quantity.toString(), 
      "Units"
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Quantity", "Unit"]],
      body: tableData,
      startY: 120,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    // Summary
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    doc.text(`Total Items: ${totalItems}`, 20, (doc as any).lastAutoTable.finalY + 20);
    
    if (orderData.notes) {
      doc.text("Notes:", 20, (doc as any).lastAutoTable.finalY + 35);
      doc.text(orderData.notes, 20, (doc as any).lastAutoTable.finalY + 45);
    }
    
    return doc;
  };

  const generateInvoicePDF = (items: Array<{sku: string, itemId?: string, quantity: number, unitPrice?: number}>, orderData: any, invoiceId: string, invoiceAmount: string) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("INVOICE", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Invoice #: ${invoiceId}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Due Date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}`, 20, 60);
    
    // Bill To
    doc.text("Bill To:", 20, 80);
    doc.text(orderData.shippingAddress, 20, 90);
    doc.text(`${orderData.shippingCity}, ${orderData.shippingState} ${orderData.shippingZip}`, 20, 100);
    
    // Items table with pricing
    const tableData = items.map(item => [
      item.itemId || "N/A",
      item.sku, 
      item.quantity.toString(), 
      `$${(item.unitPrice || 1).toFixed(2)}`, 
      `$${(item.quantity * (item.unitPrice || 1)).toFixed(2)}`
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Quantity", "Unit Price", "Total"]],
      body: tableData,
      startY: 120,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    // Totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * (item.unitPrice || 1)), 0);
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + tax;
    
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 130, finalY);
    doc.text(`Tax (8%): $${tax.toFixed(2)}`, 130, finalY + 10);
    doc.text(`Total: $${total.toFixed(2)}`, 130, finalY + 20);
    
    return doc;
  };

  const viewPackingList = () => {
    if (selectedSkus.size === 0) return;
    
    const items = Array.from(selectedSkus).map(sku => {
      const inventoryItem = inventory.find(item => item.sku === sku);
      return {
        sku,
        itemId: inventoryItem?.products?.item_id,
        quantity: skuQuantities[sku] || 1
      };
    });
    
    const doc = generatePackingListPDF(items, orderData, "PREVIEW");
    doc.save(`packing-list-preview-${Date.now()}.pdf`);
  };

  const viewInvoice = async () => {
    if (selectedSkus.size === 0) return;
    
    // Get parent order item prices if available
    let parentOrderItems: any[] = [];
    if (orderData.parentOrderId) {
      const { data: parentData } = await supabase
        .from('order_items')
        .select('sku, unit_price')
        .eq('order_id', orderData.parentOrderId);
      
      if (parentData) {
        parentOrderItems = parentData;
      }
    }
    
    const items = Array.from(selectedSkus).map(sku => {
      const inventoryItem = inventory.find(item => item.sku === sku);
      const parentItem = parentOrderItems.find(pi => pi.sku === sku);
      const unitPrice = parentItem?.unit_price || 1;
      return {
        sku,
        itemId: inventoryItem?.products?.item_id,
        quantity: skuQuantities[sku] || 1,
        unitPrice
      };
    });
    
    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const doc = generateInvoicePDF(items, orderData, "PREVIEW", `$${totalValue.toFixed(2)}`);
    doc.save(`invoice-preview-${Date.now()}.pdf`);
  };

  const handleCompanyChange = (companyId: string) => {
    setOrderData(prev => ({
      ...prev,
      companyId,
      state: "",
      parentOrderId: ""
    }));
    setInventory([]);
    setBlanketOrders([]);
    setInvoiceItemPrices({});
    fetchBlanketOrders(companyId);
  };

  const fetchInvoiceItemPrices = async (parentOrderId: string) => {
    if (!parentOrderId) {
      setInvoiceItemPrices({});
      return;
    }

    try {
      // Fetch order items with their SKUs and unit prices - need to join with products to get item_id
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          sku,
          unit_price,
          product_id,
          products!inner(item_id)
        `)
        .eq('order_id', parentOrderId);

      if (error) throw error;

      // Create a map of product item_id (inventory SKU) to unit price
      const priceMap: Record<string, number> = {};
      if (data) {
        data.forEach((item: any) => {
          const inventorySku = item.products?.item_id;
          if (inventorySku) {
            priceMap[inventorySku] = item.unit_price;
          }
        });
      }

      console.log('Invoice item prices loaded:', priceMap);
      setInvoiceItemPrices(priceMap);
    } catch (error) {
      console.error('Error fetching invoice item prices:', error);
      setInvoiceItemPrices({});
    }
  };

  const handleStateChange = (state: string) => {
    const addressData = stateAddressMapping[state as keyof typeof stateAddressMapping];
    setOrderData(prev => ({
      ...prev,
      state,
      shippingAddress: addressData?.address || "",
      shippingCity: addressData?.city || "",
      shippingState: state,
      shippingZip: addressData?.zip || ""
    }));
    
    // Fetch inventory for the selected state and company
    if (orderData.companyId) {
      fetchInventoryForState(state, orderData.companyId);
    }
  };

  const handlePOFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedPOFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a PDF file",
        variant: "destructive",
      });
    }
  };

  const handlePOUpload = async () => {
    if (!selectedPOFile) return;

    setUploadingPO(true);
    setAnalyzingPO(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload PDF to storage with user ID folder for RLS
      const fileName = `${user.id}/${Date.now()}-${selectedPOFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('po-documents')
        .upload(fileName, selectedPOFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('po-documents')
        .getPublicUrl(fileName);

      // Get user's company
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole?.company_id) {
        throw new Error('User not associated with a company');
      }

      // Create submission record
      const { data: submission, error: insertError } = await supabase
        .from('po_submissions')
        .insert({
          pdf_url: publicUrl,
          original_filename: selectedPOFile.name,
          customer_id: user.id,
          status: 'pending_analysis',
          company_id: userRole.company_id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setUploadingPO(false);
      setAnalyzingPO(true);

      // Trigger AI analysis with file path
      console.log('Calling analyze-po with path:', fileName);
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-po', {
        body: { 
          pdfPath: fileName,
          companyId: userRole.company_id,
          filename: selectedPOFile.name
        }
      });

      if (analysisError) throw analysisError;

      setAnalyzingPO(false);

      // The edge function has created a pull & ship order
      if (analysisData?.success && analysisData?.orderId) {
        toast({
          title: "Pull & Ship Order Created",
          description: `Order ${analysisData.orderNumber} has been created and is pending approval`,
        });

        // Refresh the orders list to show the new order
        await fetchPullShipOrders();
        
        // Clear the file selection
        setSelectedPOFile(null);
        
        // Scroll to the orders section
        document.querySelector('.mt-12')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        throw new Error('Failed to create pull & ship order from PO');
      }
    } catch (error: any) {
      console.error('Error uploading PO:', error);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      toast({
        title: "Upload Failed",
        description: error.message || 'An unknown error occurred',
        variant: "destructive",
      });
      setUploadingPO(false);
      setAnalyzingPO(false);
    }
  };

  const sendPackingListEmail = async (packingListPdf: string, invoiceData: any) => {
    try {
      const { error } = await supabase.functions.invoke('send-packing-list', {
        body: {
          packingListPdf,
          invoiceData,
          fulfillmentEmail: 'fulfillment@example.com'
        }
      });

      if (error) throw error;

      toast({
        title: "Email Sent",
        description: "Packing list has been sent to the fulfillment center",
      });
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: "Email Notice",
        description: error.message || "Email functionality requires RESEND_API_KEY to be configured.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSkus.size === 0) return;
    
    if (!orderData.companyId) {
      toast({
        title: "Company Required",
        description: "Please select a company first",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const items = Array.from(selectedSkus).map(sku => {
        const inventoryItem = inventory.find(item => item.sku === sku);
        return {
          sku,
          itemId: inventoryItem?.products?.item_id,
          name: inventoryItem?.products?.name || sku,
          quantity: skuQuantities[sku] || 1
        };
      });

      // Generate order number
      const orderNumber = `PS-${Date.now()}`;

      // Get parent order item prices if this is linked to a blanket order
      let priceMap: Record<string, number> = {};
      if (orderData.parentOrderId) {
        const { data: parentData, error: parentError } = await supabase
          .from('order_items')
          .select(`
            sku,
            unit_price,
            product_id,
            products!inner(item_id)
          `)
          .eq('order_id', orderData.parentOrderId);
        
        if (!parentError && parentData) {
          parentData.forEach((item: any) => {
            const inventorySku = item.products?.item_id;
            if (inventorySku) {
              priceMap[inventorySku] = item.unit_price;
            }
          });
        }
      }

      // Calculate totals using parent order prices (or fallback to $1)
      const itemsWithPrices = items.map(item => {
        const unitPrice = priceMap[item.itemId || ''] || 1;
        return {
          ...item,
          unitPrice,
          itemTotal: item.quantity * unitPrice
        };
      });

      const subtotal = itemsWithPrices.reduce((sum, item) => sum + item.itemTotal, 0);
      const tax = subtotal * 0.08;
      const total = subtotal + tax;

      // Create the pull & ship order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          company_id: orderData.companyId,
          order_type: 'pull_ship',
          parent_order_id: orderData.parentOrderId || null,
          customer_name: orderData.state,
          shipping_name: orderData.state,
          shipping_street: orderData.shippingAddress,
          shipping_city: orderData.shippingCity,
          shipping_state: orderData.shippingState,
          shipping_zip: orderData.shippingZip,
          subtotal,
          tax,
          total,
          memo: orderData.notes,
          status: 'pending',
          vibe_approved: false
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = itemsWithPrices.map(item => ({
        order_id: order.id,
        sku: item.sku,
        name: item.name,
        item_id: item.itemId,
        quantity: item.quantity,
        shipped_quantity: 0,
        unit_price: item.unitPrice,
        total: item.itemTotal
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Pull & Ship Order Created",
        description: `Order ${orderNumber} has been created and is pending approval`,
      });

      // Refresh the orders list
      await fetchPullShipOrders();

      // Reset the form
      setOrderData({
        companyId: "",
        state: "",
        shippingAddress: "",
        shippingCity: "",
        shippingState: "",
        shippingZip: "",
        notes: "",
        parentOrderId: ""
      });
      setSelectedSkus(new Set());
      setSkuQuantities({});
      setInventory([]);

      // Scroll to the orders section
      document.querySelector('.mt-12')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({
        title: "Order Creation Failed",
        description: error.message || 'An unknown error occurred',
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
    
    // Fetch invoice item prices when parent order is selected
    if (field === 'parentOrderId' && value) {
      fetchInvoiceItemPrices(value);
    } else if (field === 'parentOrderId' && !value) {
      setInvoiceItemPrices({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4">
        <h1 className="text-2xl font-semibold">Pull & Ship Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">Create multi-SKU pull requests and track invoice fulfillment</p>
      </div>

      {/* PO Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Purchase Order
          </CardTitle>
          <CardDescription>Upload a PO PDF to automatically create a pull order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept="application/pdf"
                onChange={handlePOFileSelect}
                disabled={uploadingPO || analyzingPO}
              />
              <Button
                onClick={handlePOUpload}
                disabled={!selectedPOFile || uploadingPO || analyzingPO}
              >
                {uploadingPO ? "Uploading..." : analyzingPO ? "Analyzing..." : "Upload & Analyze"}
              </Button>
            </div>
            {selectedPOFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedPOFile.name}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection - Inventory Style */}
        <div className="lg:col-span-2">
          <div className="space-y-6">
            {/* State and Address Selection */}
            <div className="bg-table-row border border-table-border rounded p-4">
              <h2 className="text-lg font-semibold mb-4">Order Details</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Company</Label>
                    <Select value={orderData.companyId} onValueChange={handleCompanyChange}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select Company" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border shadow-lg z-50">
                        {companies.map(company => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {orderData.companyId && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Destination State</Label>
                        <Select value={orderData.state} onValueChange={handleStateChange}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select State" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border border-border shadow-lg z-50">
                            {stateOptions.map(state => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Link to Blanket Order (Optional)</Label>
                        <Select value={orderData.parentOrderId || "none"} onValueChange={(value) => handleInputChange('parentOrderId', value === "none" ? "" : value)}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select blanket order..." />
                          </SelectTrigger>
                          <SelectContent className="bg-background border border-border shadow-lg z-50">
                            <SelectItem value="none">None (standalone order)</SelectItem>
                            {blanketOrders.map(order => (
                              <SelectItem key={order.id} value={order.id}>
                                {order.order_number} - {order.companies?.name || order.customer_name} (${order.total?.toFixed(2)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Select a blanket order to create invoice when approved
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {orderData.state && (
                  <div className="space-y-4">
                    <Label className="text-sm font-medium">Shipping Address</Label>
                    <Input className="h-10" placeholder="Street Address" value={orderData.shippingAddress} onChange={(e) => handleInputChange('shippingAddress', e.target.value)} required />
                    <div className="grid grid-cols-2 gap-4">
                      <Input className="h-10" placeholder="City" value={orderData.shippingCity} onChange={(e) => handleInputChange('shippingCity', e.target.value)} required />
                      <Input className="h-10" placeholder="ZIP Code" value={orderData.shippingZip} onChange={(e) => handleInputChange('shippingZip', e.target.value)} required />
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Product Selection */}
            {orderData.state && (
              <div className="bg-table-row border border-table-border rounded p-4">
                <h3 className="text-lg font-semibold mb-4">
                  Available Inventory - {orderData.state}
                </h3>
                
                {/* Search */}
                <div className="mb-4">
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by SKU..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Inventory Table */}
                <div className="border border-table-border rounded">
                  <div className="bg-table-header border-b border-table-border">
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div className="col-span-1">Select</div>
                      <div className="col-span-4">SKU</div>
                      <div className="col-span-2">Available</div>
                      <div className="col-span-2">Reserved</div>
                      <div className="col-span-2">In Production</div>
                      <div className="col-span-1">Status</div>
                    </div>
                  </div>

                  <div className="divide-y divide-table-border">
                    {loadingInventory ? (
                      <div className="px-4 py-8 text-center text-muted-foreground">
                        Loading inventory...
                      </div>
                    ) : inventory.length === 0 ? (
                      <div className="px-4 py-8 text-center text-muted-foreground">
                        No inventory available for this state
                      </div>
                    ) : (
                      inventory
                        .filter(item => item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((item) => {
                          const status = getStockStatus(item.available, item.redline);
                          const stockColor = getStockColor(status);
                          const isSelected = selectedSkus.has(item.sku);
                          
                          return (
                            <div 
                              key={item.id}
                              className={`grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors ${isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : ''}`}
                            >
                              <div className="col-span-1 flex items-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleSkuSelection(item.sku, checked as boolean)}
                                  className="h-4 w-4"
                                />
                              </div>
                              <div className="col-span-4 font-mono text-sm font-medium">{item.sku}</div>
                              <div className="col-span-2 font-semibold text-sm flex items-center gap-1">
                                {status === "critical" && <AlertTriangle className="h-3 w-3 text-danger" />}
                                {item.available}
                              </div>
                              <div className="col-span-2 text-sm">{item.in_production || 0}</div>
                              <div className="col-span-2 text-sm">{item.in_production}</div>
                              <div className={`col-span-1 text-xs font-medium uppercase ${stockColor}`}>
                                {status}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-background border border-table-border rounded p-4 sticky top-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Order Summary
            </h3>
            
            {selectedSkus.size === 0 ? (
              <p className="text-sm text-muted-foreground">No items selected</p>
            ) : (
                <div className="space-y-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Destination: {orderData.state || 'Not selected'}
                    </div>
                    <div className="text-muted-foreground">Items: {selectedSkus.size}</div>
                    <div className="text-muted-foreground">
                      Total Units: {Array.from(selectedSkus).reduce((sum, sku) => sum + (skuQuantities[sku] || 1), 0)}
                    </div>
                  </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={viewPackingList}
                      disabled={selectedSkus.size === 0}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Packing List
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={viewInvoice}
                      disabled={selectedSkus.size === 0}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Invoice
                    </Button>
                  </div>
                </div>
                
                <div className="border-t pt-4 space-y-3">
                  <div className="text-sm font-medium">Set Quantities:</div>
                  {Array.from(selectedSkus).map(sku => (
                    <div key={sku} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">{sku}</div>
                      <Input
                        type="number"
                        min="1"
                        value={skuQuantities[sku] || 1}
                        onChange={(e) => handleQuantityChange(sku, parseInt(e.target.value) || 1)}
                        className="h-8 text-sm"
                        placeholder="Quantity"
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Order Notes</Label>
                    <Textarea 
                      className="min-h-16 text-sm" 
                      placeholder="Add notes..." 
                      value={orderData.notes} 
                      onChange={(e) => handleInputChange('notes', e.target.value)} 
                      rows={2} 
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleSubmit}
                  className="w-full h-10 text-sm font-medium"
                  disabled={selectedSkus.size === 0 || !orderData.state}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Submit Request
                </Button>

                <div className="bg-primary/10 border border-primary/20 p-3 rounded text-center">
                  <div className="text-sm font-semibold text-primary">
                    Est. Value: ${(() => {
                      return Array.from(selectedSkus).reduce((sum, sku) => {
                        const quantity = skuQuantities[sku] || 1;
                        // Use invoice price from parent order if available, otherwise fall back to product cost
                        const unitPrice = invoiceItemPrices[sku] || 0;
                        return sum + (quantity * unitPrice);
                      }, 0).toFixed(2);
                    })()}
                  </div>
                  {orderData.parentOrderId && Object.keys(invoiceItemPrices).length === 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      No pricing data from linked invoice
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Previous Orders Section */}
      <div className="mt-12 space-y-4">
        <div className="border-t border-table-border pt-6 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Previous Pull & Ship Orders</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/pull-ship-orders')}
          >
            View All Orders
          </Button>
        </div>
        
        <div className="space-y-3">
          {loadingOrders ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pull & ship orders found. Upload a PO to get started.
            </div>
          ) : (
            orders.slice(0, 5).map((order) => {
              const totalItems = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
              
              return (
                <div 
                  key={order.id} 
                  className="bg-table-row border border-table-border rounded p-4 hover:bg-table-row-hover transition-colors cursor-pointer"
                  onClick={() => navigate(`/pull-ship-orders/${order.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="font-medium font-mono">{order.order_number}</div>
                      <Badge variant="outline" className="text-xs">{order.companies?.name || 'N/A'}</Badge>
                      {order.vibe_approved ? (
                        <Badge className="bg-green-500 text-white text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium">${order.total?.toFixed(2) || '0.00'}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/pull-ship-orders/${order.id}`);
                        }}
                        className="h-7 px-3 text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                  
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {order.order_items.slice(0, 5).map((item: any, idx: number) => (
                        <div key={idx} className="bg-background border border-table-border px-3 py-1 rounded text-xs">
                          <span className="font-medium">{item.sku}</span>
                          <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                        </div>
                      ))}
                      {order.order_items.length > 5 && (
                        <div className="bg-background border border-table-border px-3 py-1 rounded text-xs text-muted-foreground">
                          +{order.order_items.length - 5} more
                        </div>
                      )}
                      <div className="bg-primary/10 border border-primary/20 px-3 py-1 rounded text-xs font-medium text-primary">
                        Total: {totalItems} units
                      </div>
                    </div>
                  )}
                  
                  {order.memo && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {order.memo}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default PullShip;