import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Edit, Save, X, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const VendorPODetail = () => {
  const { poId } = useParams();
  const navigate = useNavigate();
  
  // Get returnTo parameter from URL to navigate back properly
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = searchParams.get('returnTo') || '/vendor-pos';
  const [po, setPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPO, setEditedPO] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    if (poId) {
      fetchPODetails();
    }
  }, [poId]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      const role = data?.role as string;
      setIsAdmin(role === 'admin' || role === 'vibe_admin');
    }
  };

  const fetchPODetails = async () => {
    setLoading(true);
    
    // Fetch PO
    const { data: poData, error: poError } = await supabase
      .from('vendor_pos')
      .select('*, orders(order_number, customer_name)')
      .eq('id', poId)
      .single();

    if (poError || !poData) {
      toast({
        title: "Error",
        description: "Failed to load vendor PO",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    setPO(poData);
    setEditedPO(poData);

    // Fetch vendor
    const { data: vendorData } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', poData.vendor_id)
      .single();

    if (vendorData) {
      setVendor(vendorData);
    }

    // Fetch PO items
    const { data: itemsData } = await supabase
      .from('vendor_po_items')
      .select('*')
      .eq('vendor_po_id', poId)
      .order('created_at', { ascending: true });

    if (itemsData) {
      setPOItems(itemsData);
    }

    setLoading(false);
  };

  const handleSavePO = async () => {
    if (!isAdmin) return;

    try {
      // Update existing items with edited quantities
      for (const item of poItems) {
        if (!item.isNew) {
          // Update existing items - use shipped_quantity for calculations
          const newTotal = Number(item.shipped_quantity) * Number(item.unit_cost);
          
          const { error: updateError } = await supabase
            .from('vendor_po_items')
            .update({
              shipped_quantity: item.shipped_quantity,
              total: newTotal
            })
            .eq('id', item.id);

          if (updateError) {
            console.error('Update error:', updateError);
            throw new Error(`Failed to update item: ${updateError.message}`);
          }
        } else {
          // Insert new custom line items
          if (!item.sku || !item.name || item.quantity <= 0) {
            throw new Error('Please fill in all required fields for custom line items');
          }

          const { error: insertError } = await supabase
            .from('vendor_po_items')
            .insert({
              vendor_po_id: poId,
              order_item_id: null,
              sku: item.sku,
              name: item.name,
              description: item.description || null,
              quantity: item.quantity,
              shipped_quantity: item.quantity,
              unit_cost: item.unit_cost,
              total: item.total
            } as any);

          if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error(`Failed to add custom line item: ${insertError.message}`);
          }
        }
      }

      // Calculate new total from all items
      const newTotal = poItems.reduce((sum, item) => sum + Number(item.total), 0);

      // Update the PO
      const { error: poError } = await supabase
        .from('vendor_pos')
        .update({
          status: editedPO.status,
          expected_delivery_date: editedPO.expected_delivery_date,
          total: newTotal
        })
        .eq('id', poId);

      if (poError) throw poError;

      toast({
        title: "PO Updated",
        description: "Purchase order updated successfully"
      });
      setIsEditMode(false);
      fetchPODetails();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase order",
        variant: "destructive"
      });
    }
  };

  const handleDownloadPDF = () => {
    if (!po || !vendor) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("VENDOR PURCHASE ORDER", 105, 20, { align: "center" });
    
    // PO Info
    doc.setFontSize(12);
    doc.text(`PO Number: ${po.po_number}`, 20, 40);
    doc.text(`Order Date: ${new Date(po.order_date).toLocaleDateString()}`, 20, 48);
    doc.text(`Customer Order: ${po.orders?.order_number || 'N/A'}`, 20, 56);
    doc.text(`Status: ${po.status.replace('_', ' ').toUpperCase()}`, 20, 64);
    
    if (po.expected_delivery_date) {
      doc.text(`Expected Delivery: ${new Date(po.expected_delivery_date).toLocaleDateString()}`, 20, 72);
    }

    // Vendor Info
    doc.setFontSize(14);
    doc.text("Vendor Information", 20, 88);
    doc.setFontSize(11);
    doc.text(`${vendor.name}`, 20, 96);
    if (vendor.contact_name) doc.text(`Contact: ${vendor.contact_name}`, 20, 102);
    if (vendor.contact_email) doc.text(`Email: ${vendor.contact_email}`, 20, 108);
    if (vendor.contact_phone) doc.text(`Phone: ${vendor.contact_phone}`, 20, 114);

    // Items table
    const tableData = poItems.map(item => [
      item.sku,
      item.name,
      item.description || '',
      item.quantity.toString(),
      `$${Number(item.unit_cost).toFixed(3)}`,
      `$${Number(item.total).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 125,
      head: [['SKU', 'Product', 'Description', 'Quantity', 'Unit Cost', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66] },
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY || 125;
    doc.setFontSize(14);
    const totalAmount = poItems.reduce((sum, item) => sum + Number(item.total), 0);
    doc.text(`Total: $${totalAmount.toFixed(2)}`, 150, finalY + 15);

    // Save
    doc.save(`vendor-po-${po.po_number}.pdf`);
    
    toast({
      title: "PDF Downloaded",
      description: "Vendor PO has been downloaded"
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading vendor PO...</p>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Vendor PO not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditMode(false);
                    setEditedPO(po);
                  }}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSavePO}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit PO
                </Button>
              )}
            </>
          )}
          <Button onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* PO Details Card */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2">Vendor PO #{po.po_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Customer Order: {po.orders?.order_number || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Customer: {po.orders?.customer_name || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                {isEditMode ? (
                  <Select
                    value={editedPO.status}
                    onValueChange={(value) => setEditedPO({...editedPO, status: value})}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="in_production">In Production</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary capitalize">
                    {po.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-6 mt-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <Label className="text-xs text-muted-foreground">Order Date</Label>
                <p className="font-medium">{new Date(po.order_date).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expected Delivery</Label>
                {isEditMode ? (
                  <Input
                    type="date"
                    value={editedPO.expected_delivery_date || ''}
                    onChange={(e) => setEditedPO({...editedPO, expected_delivery_date: e.target.value})}
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium">
                    {po.expected_delivery_date 
                      ? new Date(po.expected_delivery_date).toLocaleDateString()
                      : 'Not set'
                    }
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Vendor Info */}
          <div className="p-8 border-b">
            <h2 className="text-lg font-semibold mb-4">Vendor Information</h2>
            {vendor ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Name</Label>
                  <p className="font-medium">{vendor.name}</p>
                </div>
                {vendor.contact_name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Person</Label>
                    <p className="font-medium">{vendor.contact_name}</p>
                  </div>
                )}
                {vendor.contact_email && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium">{vendor.contact_email}</p>
                  </div>
                )}
                {vendor.contact_phone && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="font-medium">{vendor.contact_phone}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Vendor information not available</p>
            )}
          </div>

          {/* Items Table */}
          <div className="p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Order Items</h2>
              {isAdmin && isEditMode && (
                <Button
                  size="sm"
                  onClick={() => {
                    const newItem = {
                      id: `temp-${Date.now()}`,
                      sku: '',
                      name: '',
                      quantity: 1,
                      shipped_quantity: 1,
                      unit_cost: 0,
                      total: 0,
                      isNew: true
                    };
                    setPOItems([...poItems, newItem]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Line
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">Shipped</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {isAdmin && isEditMode && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {poItems.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.sku}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].sku = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="SKU"
                          className="font-mono"
                        />
                      ) : (
                        <span className="font-mono">{item.sku}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].name = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="Product name"
                        />
                      ) : (
                        item.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditMode && item.isNew ? (
                        <Input
                          value={item.description || ''}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].description = e.target.value;
                            setPOItems(updated);
                          }}
                          placeholder="Description (optional)"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{item.description || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditMode ? (
                        <Input
                          type="number"
                          min="0"
                          value={item.shipped_quantity}
                          onChange={(e) => {
                            const updated = [...poItems];
                            const newQuantity = parseInt(e.target.value) || 0;
                            updated[index].shipped_quantity = newQuantity;
                            // For new items, also update the ordered quantity
                            if (updated[index].isNew) {
                              updated[index].quantity = newQuantity;
                            }
                            updated[index].total = updated[index].shipped_quantity * Number(updated[index].unit_cost);
                            setPOItems(updated);
                          }}
                          className="w-24 text-center"
                        />
                      ) : (
                        item.shipped_quantity
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditMode && item.isNew ? (
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.unit_cost}
                          onChange={(e) => {
                            const updated = [...poItems];
                            updated[index].unit_cost = parseFloat(e.target.value) || 0;
                            updated[index].total = updated[index].shipped_quantity * updated[index].unit_cost;
                            setPOItems(updated);
                          }}
                          className="w-28 text-right"
                        />
                      ) : (
                        `$${Number(item.unit_cost).toFixed(3)}`
                      )}
                    </TableCell>
                    <TableCell className="text-right">${Number(item.total).toFixed(2)}</TableCell>
                    {isAdmin && isEditMode && (
                      <TableCell className="text-center">
                        {item.isNew && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = poItems.filter((_, i) => i !== index);
                              setPOItems(updated);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Total */}
            <div className="flex justify-end mt-6 pt-6 border-t">
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
                <p className="text-2xl font-bold">${poItems.reduce((sum, item) => sum + Number(item.total), 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorPODetail;