import { useState } from "react";
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
  const [orderData, setOrderData] = useState({
    state: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notes: ""
  });

  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [skuQuantities, setSkuQuantities] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingPO, setUploadingPO] = useState(false);
  const [analyzingPO, setAnalyzingPO] = useState(false);
  const [selectedPOFile, setSelectedPOFile] = useState<File | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const [invoices, setInvoices] = useState([
    {
      id: "INV-001", 
      state: "WA", 
      items: [
        { sku: "VAPE-CART-001", quantity: 100 },
        { sku: "EDIBLE-PKG-005", quantity: 50 }
      ],
      status: "pending",
      requestDate: "2024-01-15", 
      estimatedShip: "2024-01-17", 
      shippingAddress: "123 Main St, Seattle, WA 98101",
      trackingNumber: null, 
      notes: "Rush order for new dispensary opening",
      invoiceAmount: "$15,250.00",
      packingListPdf: "data:application/pdf;base64,sample", // Mock PDF URL
      invoicePdf: "data:application/pdf;base64,sample" // Mock PDF URL
    },
    {
      id: "INV-002", 
      state: "CA", 
      items: [
        { sku: "EDIBLE-PKG-005", quantity: 250 },
        { sku: "FLOWER-JAR-003", quantity: 75 }
      ],
      status: "picked",
      requestDate: "2024-01-12", 
      estimatedShip: "2024-01-16", 
      shippingAddress: "456 Oak Ave, Los Angeles, CA 90210",
      trackingNumber: null, 
      notes: "Standard delivery",
      invoiceAmount: "$18,750.00",
      packingListPdf: "data:application/pdf;base64,sample", // Mock PDF URL
      invoicePdf: "data:application/pdf;base64,sample" // Mock PDF URL
    },
    {
      id: "INV-003", 
      state: "NY", 
      items: [
        { sku: "FLOWER-JAR-003", quantity: 75 }
      ],
      status: "shipped",
      requestDate: "2024-01-10", 
      estimatedShip: "2024-01-14", 
      shippingAddress: "789 Broadway, New York, NY 10001",
      trackingNumber: "1Z999AA1234567890", 
      notes: "Fragile - handle with care",
      invoiceAmount: "$5,625.00",
      packingListPdf: "data:application/pdf;base64,sample", // Mock PDF URL
      invoicePdf: "data:application/pdf;base64,sample" // Mock PDF URL
    },
    {
      id: "INV-004", 
      state: "AZ", 
      items: [
        { sku: "CONCENTRATE-TIN-002", quantity: 150 },
        { sku: "PRE-ROLL-TUBE-001", quantity: 200 }
      ],
      status: "delivered",
      requestDate: "2024-01-08", 
      estimatedShip: "2024-01-12", 
      shippingAddress: "321 Desert Rd, Phoenix, AZ 85001",
      trackingNumber: "1Z999AA1234567891", 
      notes: "Regular monthly shipment",
      invoiceAmount: "$22,500.00",
      packingListPdf: "data:application/pdf;base64,sample", // Mock PDF URL
      invoicePdf: "data:application/pdf;base64,sample" // Mock PDF URL
    },
  ]);

  const skuOptions = ["VAPE-CART-001", "EDIBLE-PKG-005", "FLOWER-JAR-003", "CONCENTRATE-TIN-002", "PRE-ROLL-TUBE-001", "TINCTURE-BTL-002"];
  
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

  // Fetch inventory from database for the selected state
  const fetchInventoryForState = async (state: string) => {
    setLoadingInventory(true);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, products(image_url)')
        .eq('state', state)
        .gt('available', 0)
        .order('sku', { ascending: true });

      if (error) throw error;
      setInventory(data || []);
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

  const generatePackingListPDF = (items: Array<{sku: string, quantity: number}>, orderData: any, invoiceId: string) => {
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
    const tableData = items.map(item => [item.sku, item.quantity.toString(), "Units"]);
    
    autoTable(doc, {
      head: [["SKU", "Quantity", "Unit"]],
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

  const generateInvoicePDF = (items: Array<{sku: string, quantity: number}>, orderData: any, invoiceId: string, invoiceAmount: string) => {
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
      item.sku, 
      item.quantity.toString(), 
      "$75.00", 
      `$${(item.quantity * 75).toLocaleString()}.00`
    ]);
    
    autoTable(doc, {
      head: [["SKU", "Quantity", "Unit Price", "Total"]],
      body: tableData,
      startY: 120,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    // Totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * 75), 0);
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + tax;
    
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Subtotal: $${subtotal.toLocaleString()}.00`, 130, finalY);
    doc.text(`Tax (8%): $${tax.toLocaleString()}.00`, 130, finalY + 10);
    doc.text(`Total: $${total.toLocaleString()}.00`, 130, finalY + 20);
    
    return doc;
  };

  const viewPackingList = () => {
    if (selectedSkus.size === 0) return;
    
    const items = Array.from(selectedSkus).map(sku => ({
      sku,
      quantity: skuQuantities[sku] || 1
    }));
    
    const doc = generatePackingListPDF(items, orderData, "PREVIEW");
    doc.save(`packing-list-preview-${Date.now()}.pdf`);
  };

  const viewInvoice = () => {
    if (selectedSkus.size === 0) return;
    
    const items = Array.from(selectedSkus).map(sku => ({
      sku,
      quantity: skuQuantities[sku] || 1
    }));
    
    const totalValue = items.reduce((sum, item) => sum + item.quantity, 0) * 75;
    const doc = generateInvoicePDF(items, orderData, "PREVIEW", `$${totalValue.toLocaleString()}.00`);
    doc.save(`invoice-preview-${Date.now()}.pdf`);
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
    
    // Fetch inventory for the selected state
    fetchInventoryForState(state);
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

      // Upload PDF to storage
      const fileName = `${Date.now()}-${selectedPOFile.name}`;
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

      // Trigger AI analysis
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-po', {
        body: { submissionId: submission.id }
      });

      if (analysisError) throw analysisError;

      setAnalyzingPO(false);

      // Auto-populate form with extracted data
      const extracted = analysisData.data;
      if (extracted) {
        setOrderData({
          state: extracted.shipping_address?.state || '',
          shippingAddress: extracted.shipping_address?.street || '',
          shippingCity: extracted.shipping_address?.city || '',
          shippingState: extracted.shipping_address?.state || '',
          shippingZip: extracted.shipping_address?.zip || '',
          notes: extracted.special_instructions || '',
        });

        // Auto-select items
        if (extracted.items && Array.isArray(extracted.items)) {
          const newSelectedSkus = new Set<string>();
          const newQuantities: Record<string, number> = {};
          
          extracted.items.forEach((item: any) => {
            if (item.sku) {
              newSelectedSkus.add(item.sku);
              newQuantities[item.sku] = item.quantity || 1;
            }
          });
          
          setSelectedSkus(newSelectedSkus);
          setSkuQuantities(newQuantities);
        }

        toast({
          title: "PO Analyzed Successfully",
          description: "Order details have been automatically filled in",
        });
      }

      setSelectedPOFile(null);
    } catch (error: any) {
      console.error('Error uploading PO:', error);
      toast({
        title: "Upload Failed",
        description: error.message,
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
    
    const items = Array.from(selectedSkus).map(sku => ({
      sku,
      quantity: skuQuantities[sku] || 1
    }));
    
    const invoiceId = `INV-${String(invoices.length + 1).padStart(3, '0')}`;
    const totalValue = items.reduce((sum, item) => sum + item.quantity, 0) * 75;
    const invoiceAmount = `$${totalValue.toLocaleString()}.00`;
    
    // Generate PDFs
    const packingListDoc = generatePackingListPDF(items, orderData, invoiceId);
    const invoiceDoc = generateInvoicePDF(items, orderData, invoiceId, invoiceAmount);
    
    const packingListBlob = packingListDoc.output("blob");
    const invoiceBlob = invoiceDoc.output("blob");
    const packingListPdf = packingListDoc.output('dataurlstring');
    
    const newInvoice = {
      id: invoiceId,
      state: orderData.state,
      items,
      status: "pending",
      requestDate: new Date().toISOString().split('T')[0],
      estimatedShip: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      shippingAddress: `${orderData.shippingAddress}, ${orderData.shippingCity}, ${orderData.shippingState} ${orderData.shippingZip}`,
      trackingNumber: null,
      notes: orderData.notes,
      invoiceAmount,
      packingListPdf: URL.createObjectURL(packingListBlob),
      invoicePdf: URL.createObjectURL(invoiceBlob)
    };
    
    // Send email with packing list
    await sendPackingListEmail(packingListPdf, {
      invoiceNumber: invoiceId,
      customerName: 'Customer',
      state: orderData.state,
      address: `${orderData.shippingAddress}, ${orderData.shippingCity}, ${orderData.shippingState} ${orderData.shippingZip}`,
      items
    });
    
    setInvoices([newInvoice, ...invoices]);
    setOrderData({ state: "", shippingAddress: "", shippingCity: "", shippingState: "", shippingZip: "", notes: "" });
    setSelectedSkus(new Set());
    setSkuQuantities({});
    
    toast({
      title: "Order Created",
      description: "Pull order, packing list, and invoice have been generated",
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    Est. Value: ${(Array.from(selectedSkus).reduce((sum, sku) => sum + (skuQuantities[sku] || 1), 0) * 75).toLocaleString()}.00
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Previous Orders Section */}
      <div className="mt-12 space-y-4">
        <div className="border-t border-table-border pt-6">
          <h2 className="text-lg font-semibold mb-4">Previous Invoice Requests</h2>
        </div>
        
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const StatusIcon = getStatusIcon(invoice.status);
            const totalItems = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
            
            return (
              <div key={invoice.id} className="bg-table-row border border-table-border rounded p-4 hover:bg-table-row-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="font-medium font-mono">{invoice.id}</div>
                    <Badge variant="outline" className="text-xs">{invoice.state}</Badge>
                    <div className={`flex items-center gap-1 text-sm ${getStatusColor(invoice.status)}`}>
                      <StatusIcon className="h-4 w-4" />
                      {invoice.status.toUpperCase()}
                    </div>
                  </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium">{invoice.invoiceAmount}</div>
                    <div className="text-sm text-muted-foreground">{invoice.estimatedShip}</div>
                  </div>
                  <div className="flex gap-2">
                    {invoice.packingListPdf && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.open(invoice.packingListPdf!)}
                        className="h-7 px-2 text-xs"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Packing List
                      </Button>
                    )}
                    {invoice.invoicePdf && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.open(invoice.invoicePdf!)}
                        className="h-7 px-2 text-xs"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Invoice
                      </Button>
                    )}
                  </div>
                </div>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoice.items.map((item, idx) => (
                    <div key={idx} className="bg-background border border-table-border px-3 py-1 rounded text-xs">
                      <span className="font-medium">{item.sku}</span>
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </div>
                  ))}
                  <div className="bg-primary/10 border border-primary/20 px-3 py-1 rounded text-xs font-medium text-primary">
                    Total: {totalItems} units
                  </div>
                </div>
                
                {invoice.notes && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {invoice.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PullShip;