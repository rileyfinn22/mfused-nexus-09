import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Package, CheckCircle2, Circle, Truck, FileText, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PullShipOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notes, setNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isPicked, setIsPicked] = useState(false);
  const [isShipped, setIsShipped] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

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

  const fetchOrder = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .eq('order_type', 'pull_ship')
      .single();

    if (!error && data) {
      setOrder(data);
      setIsPicked(data.status === 'picked' || data.status === 'shipped' || data.status === 'delivered');
      setIsShipped(data.status === 'shipped' || data.status === 'delivered');
    }
    setLoading(false);
  };

  const generatePackingListPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("PACKING LIST", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Order: ${order.order_number}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Ship To: ${order.shipping_name}`, 20, 60);
    doc.text(`${order.shipping_street}`, 20, 70);
    doc.text(`${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`, 20, 80);
    
    const tableData = order.order_items.map((item: any) => [
      item.item_id || "N/A",
      item.sku,
      item.name,
      item.quantity.toString()
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Description", "Quantity"]],
      body: tableData,
      startY: 100,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    return doc;
  };

  const generateInvoicePDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("INVOICE", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Invoice #: ${order.order_number}`, 20, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`PO #: ${order.po_number || 'N/A'}`, 20, 60);
    
    doc.text("Bill To:", 20, 80);
    doc.text(order.customer_name, 20, 90);
    doc.text(`${order.shipping_street}`, 20, 100);
    doc.text(`${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`, 20, 110);
    
    const tableData = order.order_items.map((item: any) => [
      item.item_id || "N/A",
      item.sku,
      item.name,
      item.quantity.toString(),
      `$${item.unit_price?.toFixed(2)}`,
      `$${item.total?.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      head: [["Item ID", "SKU", "Description", "Qty", "Unit Price", "Total"]],
      body: tableData,
      startY: 130,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Subtotal: $${order.subtotal.toFixed(2)}`, 130, finalY);
    doc.text(`Tax: $${order.tax.toFixed(2)}`, 130, finalY + 10);
    doc.text(`Total: $${order.total.toFixed(2)}`, 130, finalY + 20);
    
    return doc;
  };

  const handleDownloadPackingList = () => {
    const doc = generatePackingListPDF();
    doc.save(`packing-list-${order.order_number}.pdf`);
    toast({ title: "Packing List Downloaded" });
  };

  const handleDownloadInvoice = () => {
    const doc = generateInvoicePDF();
    doc.save(`invoice-${order.order_number}.pdf`);
    toast({ title: "Invoice Downloaded" });
  };

  const handleSendToFulfillment = async () => {
    try {
      const packingListDoc = generatePackingListPDF();
      const packingListPdf = packingListDoc.output('dataurlstring');

      const items = order.order_items.map((item: any) => ({
        sku: item.sku,
        itemId: item.item_id,
        quantity: item.quantity
      }));

      const invoiceData = {
        invoiceNumber: order.order_number,
        customerName: order.customer_name,
        state: order.shipping_state,
        address: `${order.shipping_street}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
        items: items
      };

      const { error } = await supabase.functions.invoke('send-packing-list', {
        body: {
          packingListPdf,
          invoiceData,
          fulfillmentEmail: 'fulfillment@example.com'
        }
      });

      if (error) throw error;

      // Update order status to picked
      await supabase
        .from('orders')
        .update({ status: 'picked' })
        .eq('id', orderId);

      setIsPicked(true);
      toast({
        title: "Sent to Fulfillment",
        description: "Packing list has been sent to warehouse fulfillment",
      });
      fetchOrder();
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: "Notice",
        description: error.message || "Email requires RESEND_API_KEY to be configured",
        variant: "destructive",
      });
    }
  };

  const handleMarkPicked = async () => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'picked' })
      .eq('id', orderId);

    if (!error) {
      setIsPicked(true);
      toast({ title: "Marked as Picked" });
      fetchOrder();
    }
  };

  const handleMarkShipped = async () => {
    if (!trackingNumber.trim()) {
      toast({
        title: "Tracking Required",
        description: "Please enter a tracking number",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'shipped',
        tracking_number: trackingNumber
      })
      .eq('id', orderId);

    if (!error) {
      setIsShipped(true);
      toast({ title: "Marked as Shipped" });
      fetchOrder();
    }
  };

  const handleAddNote = async () => {
    if (!notes.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('order_notes')
      .insert({
        order_id: orderId,
        user_id: user.id,
        author_name: user.email || 'Admin',
        note_text: notes
      });

    if (!error) {
      toast({ title: "Note Added" });
      setNotes("");
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading pull & ship order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Pull & Ship order not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/pull-ship")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pull & Ship
        </Button>
        <div className="flex gap-3">
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

      {/* Workflow Status */}
      <Card className="mb-6 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pull & Ship Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium">Order Created</p>
                <p className="text-sm text-muted-foreground">PO uploaded and processed</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isPicked ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Items Picked</p>
                <p className="text-sm text-muted-foreground">
                  {isPicked ? "Ready for shipment" : "Pending warehouse pick"}
                </p>
              </div>
              {!isPicked && isAdmin && (
                <Button size="sm" onClick={handleMarkPicked}>
                  Mark Picked
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {isShipped ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Shipped</p>
                <p className="text-sm text-muted-foreground">
                  {isShipped ? `Tracking: ${order.tracking_number}` : "Pending shipment"}
                </p>
              </div>
            </div>
          </div>

          {/* Send to Fulfillment Button */}
          {!isPicked && isAdmin && (
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <Button onClick={handleSendToFulfillment} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Send Packing List to Warehouse Fulfillment
              </Button>
            </div>
          )}

          {/* Shipping Section */}
          {isPicked && !isShipped && isAdmin && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium mb-3">Add Tracking & Mark Shipped</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter tracking number..."
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Button onClick={handleMarkShipped}>
                  <Truck className="h-4 w-4 mr-2" />
                  Mark Shipped
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">Pull & Ship Order #{order.order_number}</h1>
                  <Badge variant="outline" className="text-sm">Pull & Ship</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Created: {new Date(order.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Due: {order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Not set'}</span>
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-sm px-4 py-1.5 mb-2 capitalize">{order.status.replace('_', ' ')}</Badge>
                <p className="text-sm text-muted-foreground">PO #: {order.po_number || '-'}</p>
              </div>
            </div>

            {/* Customer & Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Customer</h3>
                <p className="font-medium">{order.customer_name}</p>
                <p className="text-sm text-muted-foreground">{order.customer_email || '-'}</p>
                <p className="text-sm text-muted-foreground">{order.customer_phone || '-'}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ship To</h3>
                <p className="font-medium">{order.shipping_name}</p>
                <p className="text-sm text-muted-foreground">{order.shipping_street}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
                </p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">Items to Pull & Ship</h2>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Item ID</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.order_items?.map((item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs">{item.item_id || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${item.unit_price?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">${item.total?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-6">
              <div className="w-80 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax:</span>
                  <span>${order.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total:</span>
                  <span>${order.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Memo */}
            {order.memo && (
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground">{order.memo}</p>
              </div>
            )}
          </div>

          {/* Admin Notes Section */}
          {isAdmin && (
            <div className="border-t bg-muted/30 p-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Internal Notes</h2>
                <Badge variant="default" className="text-xs">Admin Only</Badge>
              </div>
              
              <div className="p-4 bg-background rounded-lg border">
                <Label className="text-sm font-medium mb-2">Add Note</Label>
                <Textarea
                  placeholder="Add internal notes about this pull & ship order..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mb-2"
                />
                <Button onClick={handleAddNote} size="sm">
                  Add Note
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PullShipOrderDetail;
