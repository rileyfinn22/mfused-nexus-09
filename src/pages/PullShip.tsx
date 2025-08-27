import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Eye
} from "lucide-react";

const PullShip = () => {
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
    "OR": { address: "147 Pine St", city: "Portland", zip: "97201" }
  };

  const stateOptions = Object.keys(stateAddressMapping);

  // Mock inventory data for the selected state
  const getInventoryForState = (state: string) => {
    const inventoryData = [
      { sku: "VAPE-CART-001", available: 45, reserved: 15, inProduction: 100, redline: 50 },
      { sku: "EDIBLE-PKG-005", available: 150, reserved: 25, inProduction: 200, redline: 100 },
      { sku: "FLOWER-JAR-003", available: 85, reserved: 20, inProduction: 150, redline: 100 },
      { sku: "CONCENTRATE-TIN-002", available: 200, reserved: 30, inProduction: 100, redline: 50 },
      { sku: "PRE-ROLL-TUBE-001", available: 22, reserved: 5, inProduction: 50, redline: 30 },
      { sku: "TINCTURE-BTL-002", available: 75, reserved: 10, inProduction: 80, redline: 40 }
    ];
    return inventoryData.filter(item => item.available > 0);
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
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url);
  };

  const viewInvoice = () => {
    if (selectedSkus.size === 0) return;
    
    const items = Array.from(selectedSkus).map(sku => ({
      sku,
      quantity: skuQuantities[sku] || 1
    }));
    
    const totalValue = items.reduce((sum, item) => sum + item.quantity, 0) * 75;
    const doc = generateInvoicePDF(items, orderData, "PREVIEW", `$${totalValue.toLocaleString()}.00`);
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url);
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
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    setInvoices([newInvoice, ...invoices]);
    setOrderData({ state: "", shippingAddress: "", shippingCity: "", shippingState: "", shippingZip: "", notes: "" });
    setSelectedSkus(new Set());
    setSkuQuantities({});
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
                        {stateOptions.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
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
                <h3 className="text-lg font-semibold mb-4">Available Inventory - {orderData.state}</h3>
                
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
                    {getInventoryForState(orderData.state)
                      .filter(item => item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((item) => {
                        const status = getStockStatus(item.available, item.redline);
                        const stockColor = getStockColor(status);
                        const isSelected = selectedSkus.has(item.sku);
                        
                        return (
                          <div 
                            key={item.sku}
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
                            <div className="col-span-2 text-sm">{item.reserved}</div>
                            <div className="col-span-2 text-sm">{item.inProduction}</div>
                            <div className={`col-span-1 text-xs font-medium uppercase ${stockColor}`}>
                              {status}
                            </div>
                          </div>
                        );
                      })}
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
                  <div className="font-medium">Destination: {orderData.state || 'Not selected'}</div>
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