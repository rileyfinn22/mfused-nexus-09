import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, Plus, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const OrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  
  const [adminNotes, setAdminNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [productionUpdate, setProductionUpdate] = useState("");

  // Mock order data - in production, this would come from the database
  const order = {
    id: orderId,
    sku: "VAPE-CART-001",
    state: "WA",
    quantity: 500,
    status: "In Production",
    createdDate: "2024-01-10",
    estimatedCompletion: "2024-01-20",
    progress: 65,
    items: [
      {
        sku: "VAPE-CART-001",
        itemId: "VC-001",
        description: "Premium vape cartridge packaging with child-resistant cap and tamper-evident seal. Features UV-protected plastic housing with holographic branding panel.",
        quantity: 500,
        unitCost: 2.50,
        thumbnail: "/placeholder.svg"
      }
    ],
    shippingAddress: {
      name: "Green Valley Dispensary",
      street: "123 Main Street",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    },
    termsAndConditions: "Payment due within 30 days of invoice date. All sales are final. Products must be inspected upon delivery.",
    additionalInfo: "Rush order - expedited production requested by customer.",
    notes: [],
    tracking: "",
    productionUpdates: []
  };

  const totalCost = order.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  const handleAddNote = () => {
    if (!adminNotes.trim()) return;
    toast({
      title: "Note Added",
      description: "Admin note has been saved to the order.",
    });
    setAdminNotes("");
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Order {order.id}</h1>
          <p className="text-sm text-muted-foreground mt-1">Created on {order.createdDate}</p>
        </div>
        <Badge className="text-sm px-3 py-1">{order.status}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="border border-table-border rounded p-4 space-y-3">
                  <div className="flex gap-4">
                    <img 
                      src={item.thumbnail} 
                      alt={item.sku}
                      className="w-20 h-20 object-cover rounded border border-table-border"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">{item.sku}</p>
                          <p className="text-sm text-muted-foreground">Item ID: {item.itemId}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${(item.quantity * item.unitCost).toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground">${item.unitCost} × {item.quantity}</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="flex justify-between items-center">
                <p className="font-semibold">Total Cost</p>
                <p className="text-xl font-bold">${totalCost.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="font-medium">{order.shippingAddress.name}</p>
                <p className="text-sm text-muted-foreground">{order.shippingAddress.street}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Terms and Conditions */}
          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{order.termsAndConditions}</p>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{order.additionalInfo}</p>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleDownloadPackingList}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Packing List
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleDownloadInvoice}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Invoice
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Admin Panel - 1 column */}
        <div className="space-y-6">
          {/* Admin Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Admin Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Add internal notes about this order..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                />
                <Button onClick={handleAddNote} size="sm" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>

              {order.notes.length > 0 && (
                <div className="space-y-2 mt-4">
                  {order.notes.map((note: any, index: number) => (
                    <div key={index} className="p-3 bg-muted rounded text-sm">
                      <p className="text-muted-foreground text-xs mb-1">{note.date}</p>
                      <p>{note.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>Tracking Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tracking Number</Label>
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
                <div className="p-3 bg-muted rounded">
                  <p className="text-sm font-medium">Current Tracking</p>
                  <p className="text-sm font-mono">{order.tracking}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Production Updates */}
          <Card>
            <CardHeader>
              <CardTitle>Production Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Add production update..."
                  value={productionUpdate}
                  onChange={(e) => setProductionUpdate(e.target.value)}
                  rows={4}
                />
                <Button onClick={handleAddProductionUpdate} size="sm" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Update
                </Button>
              </div>

              {order.productionUpdates.length > 0 && (
                <div className="space-y-2 mt-4">
                  {order.productionUpdates.map((update: any, index: number) => (
                    <div key={index} className="p-3 bg-muted rounded text-sm">
                      <p className="text-muted-foreground text-xs mb-1">{update.date}</p>
                      <p>{update.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Production Images</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                Upload Images
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
