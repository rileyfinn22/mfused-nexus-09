import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Plus, Upload, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const OrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  
  const [vibeNotes, setVibeNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [productionUpdate, setProductionUpdate] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    checkAdminStatus();
    fetchCompanyName();
  }, []);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsAdmin(data?.role === 'admin');
    }
  };

  const fetchCompanyName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('company_id, companies(name)')
        .eq('user_id', user.id)
        .single();
      if (data?.companies) {
        setCompanyName((data.companies as any).name);
      }
    }
  };

  // Mock order data - will be replaced with real data
  const order = {
    id: orderId,
    orderNumber: orderId,
    poNumber: `PO-${orderId}`,
    orderDate: "2024-01-10",
    dueDate: "2024-01-20",
    status: "In Production",
    customer: {
      name: companyName || "Common Citizen",
      email: "orders@commoncitizen.com",
      phone: "(555) 123-4567"
    },
    items: orderId === "ORD-001" ? [
      {
        sku: "VAPE-CART-001",
        itemId: "CC-VC-001",
        name: "Vape Cartridge Box - White",
        description: "Premium vape cartridge packaging with child-resistant cap and tamper-evident seal.",
        quantity: 500,
        unitPrice: 2.50,
        image: "/placeholder.svg"
      },
      {
        sku: "EDIBLE-PKG-001",
        itemId: "CC-ED-001", 
        name: "Edible Package - Clear",
        description: "Food-grade transparent packaging for edibles with resealable zipper.",
        quantity: 300,
        unitPrice: 1.75,
        image: "/placeholder.svg"
      },
      {
        sku: "FLOWER-JAR-001",
        itemId: "CC-FJ-001",
        name: "Flower Jar 1oz",
        description: "UV-protected glass jar with child-resistant lid for flower products.",
        quantity: 250,
        unitPrice: 3.25,
        image: "/placeholder.svg"
      }
    ] : [
      {
        sku: "VAPE-CART-001",
        itemId: "VC-001",
        name: "Vape Cartridge Box",
        description: "Premium vape cartridge packaging with child-resistant cap.",
        quantity: 500,
        unitPrice: 2.50,
        image: "/placeholder.svg"
      }
    ],
    shippingAddress: {
      name: companyName || "Common Citizen",
      street: "123 Cannabis Ave",
      city: "Detroit",
      state: "MI",
      zip: "48201"
    },
    billingAddress: {
      name: companyName || "Common Citizen",
      street: "123 Cannabis Ave",
      city: "Detroit", 
      state: "MI",
      zip: "48201"
    },
    terms: "Net 30",
    memo: "Rush order - expedited production requested",
    vibeNotes: [
      { date: "2024-01-10 10:30 AM", author: "VibePKG Team", text: "Order received and confirmed. Production scheduled to begin 1/11." },
      { date: "2024-01-12 2:15 PM", author: "VibePKG Team", text: "Production in progress. First batch completed QC inspection." }
    ],
    tracking: "1Z999AA10123456784",
    productionUpdates: [
      { date: "2024-01-11", text: "Production started - plates prepared" },
      { date: "2024-01-13", text: "50% complete - first run completed" }
    ]
  };

  const subtotal = order.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const taxRate = 0.06;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const handleAddVibeNote = () => {
    if (!vibeNotes.trim() || !isAdmin) return;
    toast({
      title: "Vibe Note Added",
      description: "Your note has been saved to the order.",
    });
    setVibeNotes("");
  };

  const handleAddTracking = () => {
    if (!trackingNumber.trim()) return;
    toast({
      title: "Tracking Added",
      description: `Tracking number ${trackingNumber} has been added.`,
    });
    setTrackingNumber("");
  };

  const handleAddProductionUpdate = () => {
    if (!productionUpdate.trim()) return;
    toast({
      title: "Production Update Added",
      description: "Production update has been logged.",
    });
    setProductionUpdate("");
  };

  const handleDownloadPackingList = () => {
    toast({
      title: "Downloading Packing List",
      description: "Generating packing list PDF...",
    });
  };

  const handleDownloadInvoice = () => {
    toast({
      title: "Downloading Invoice",
      description: "Generating invoice PDF...",
    });
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header with Back Button */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
      </div>

      {/* Main Order Card - ERP Style */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Order Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Order #{order.orderNumber}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Order Date: {order.orderDate}</span>
                  <span>•</span>
                  <span>Due Date: {order.dueDate}</span>
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-sm px-4 py-1.5 mb-2">{order.status}</Badge>
                <p className="text-sm text-muted-foreground">PO #: {order.poNumber}</p>
              </div>
            </div>

            {/* Customer & Address Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Customer</h3>
                <p className="font-medium">{order.customer.name}</p>
                <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ship To</h3>
                <p className="font-medium">{order.shippingAddress.name}</p>
                <p className="text-sm text-muted-foreground">{order.shippingAddress.street}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Bill To</h3>
                <p className="font-medium">{order.billingAddress.name}</p>
                <p className="text-sm text-muted-foreground">{order.billingAddress.street}</p>
                <p className="text-sm text-muted-foreground">
                  {order.billingAddress.city}, {order.billingAddress.state} {order.billingAddress.zip}
                </p>
              </div>
            </div>
          </div>

          {/* Items Table - ERP Style */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Items</h2>
            <div className="border border-table-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header">
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <img 
                          src={item.image} 
                          alt={item.name}
                          className="w-12 h-12 object-cover rounded border border-table-border"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.itemId}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs">{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">${(item.quantity * item.unitPrice).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals Section - Right Aligned */}
            <div className="flex justify-end mt-6">
              <div className="w-80 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (6%):</span>
                  <span className="font-medium">${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold text-lg">Total:</span>
                  <span className="font-bold text-xl">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Memo Section */}
            {order.memo && (
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Memo</h3>
                <p className="text-sm text-muted-foreground">{order.memo}</p>
              </div>
            )}

            {/* Terms */}
            <div className="mt-6 flex items-center gap-2 text-sm">
              <span className="font-medium">Terms:</span>
              <span className="text-muted-foreground">{order.terms}</span>
            </div>
          </div>

          {/* Vibe Notes Section - Visible to All, Editable by Admin */}
          <div className="border-t border-table-border bg-muted/30 p-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Vibe Notes</h2>
              {!isAdmin && <Badge variant="outline" className="text-xs">View Only</Badge>}
            </div>
            
            {isAdmin && (
              <div className="mb-6 p-4 bg-background rounded-lg border border-table-border">
                <Textarea
                  placeholder="Add a note visible to the customer..."
                  value={vibeNotes}
                  onChange={(e) => setVibeNotes(e.target.value)}
                  rows={3}
                  className="mb-2"
                />
                <Button onClick={handleAddVibeNote} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Vibe Note
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {order.vibeNotes.map((note, index) => (
                <div key={index} className="p-4 bg-background rounded-lg border border-table-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-primary">{note.author}</span>
                    <span className="text-xs text-muted-foreground">{note.date}</span>
                  </div>
                  <p className="text-sm">{note.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Section - Only Visible to Admins */}
          {isAdmin && (
            <div className="border-t border-table-border bg-primary/5 p-8">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Badge variant="default" className="text-xs">Admin Only</Badge>
                Internal Management
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tracking */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Tracking Information</h3>
                  <div className="space-y-2">
                    <Input
                      placeholder="Enter tracking number..."
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                    <Button onClick={handleAddTracking} size="sm" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Tracking
                    </Button>
                  </div>
                  {order.tracking && (
                    <div className="p-3 bg-background rounded border border-table-border">
                      <p className="text-xs font-medium mb-1">Current Tracking</p>
                      <p className="text-sm font-mono">{order.tracking}</p>
                    </div>
                  )}
                </div>

                {/* Production Updates */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Production Updates</h3>
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add internal production update..."
                      value={productionUpdate}
                      onChange={(e) => setProductionUpdate(e.target.value)}
                      rows={3}
                    />
                    <Button onClick={handleAddProductionUpdate} size="sm" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Update
                    </Button>
                  </div>
                  {order.productionUpdates.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {order.productionUpdates.map((update, index) => (
                        <div key={index} className="p-3 bg-background rounded border border-table-border text-sm">
                          <p className="text-xs text-muted-foreground mb-1">{update.date}</p>
                          <p>{update.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Image Upload */}
              <div className="mt-6">
                <Button variant="outline" className="w-full md:w-auto">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Production Images
                </Button>
              </div>
            </div>
          )}

          {/* Documents Footer */}
          <div className="border-t border-table-border p-8 bg-muted/20">
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleDownloadPackingList}>
                <Download className="h-4 w-4 mr-2" />
                Download Packing List
              </Button>
              <Button variant="outline" onClick={handleDownloadInvoice}>
                <Download className="h-4 w-4 mr-2" />
                Download Invoice
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetail;
