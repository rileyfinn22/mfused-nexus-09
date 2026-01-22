import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Vendor {
  id: string;
  name: string;
}

interface CustomLineItem {
  description: string;
  quantity: number;
  unit_cost: number;
  total: number;
}

interface CreateCustomVendorPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  companyId: string;
  onCreated: () => void;
}

export function CreateCustomVendorPODialog({ 
  open, 
  onOpenChange, 
  orderId,
  orderNumber,
  companyId,
  onCreated 
}: CreateCustomVendorPODialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [createdPOId, setCreatedPOId] = useState<string | null>(null);
  const [createdPONumber, setCreatedPONumber] = useState<string | null>(null);

  // Form state
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [items, setItems] = useState<CustomLineItem[]>([
    { description: "", quantity: 1, unit_cost: 0, total: 0 }
  ]);

  useEffect(() => {
    if (open) {
      fetchVendors();
      // Reset form when opening
      setCreatedPOId(null);
      setCreatedPONumber(null);
    }
  }, [open]);

  const fetchVendors = async () => {
    setFetchingData(true);
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFetchingData(false);
    }
  };

  const generatePONumber = async () => {
    const { data } = await supabase
      .from("vendor_pos")
      .select("po_number")
      .order("created_at", { ascending: false })
      .limit(100);
    
    let maxNumber = 3000;
    if (data) {
      for (const po of data) {
        const match = po.po_number.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= 3001 && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }
    
    return String(maxNumber + 1);
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_cost: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof CustomLineItem, value: string | number) => {
    const newItems = [...items];
    if (field === "quantity" || field === "unit_cost") {
      const numValue = typeof value === "string" ? parseFloat(value) || 0 : value;
      newItems[index][field] = numValue;
      newItems[index].total = newItems[index].quantity * newItems[index].unit_cost;
    } else {
      (newItems[index] as any)[field] = value;
    }
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = async () => {
    if (!selectedVendorId) {
      toast({
        title: "Error",
        description: "Please select a vendor",
        variant: "destructive",
      });
      return;
    }

    const validItems = items.filter(item => item.description && item.total > 0);
    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one line item with a description and cost",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const poNumber = await generatePONumber();

      // Create the custom vendor PO linked to the order
      const { data: newPO, error: poError } = await supabase
        .from("vendor_pos")
        .insert({
          po_number: poNumber,
          vendor_id: selectedVendorId,
          company_id: companyId,
          order_id: orderId,
          po_type: "custom",
          description: description || `Custom PO for Order ${orderNumber}`,
          order_date: new Date().toISOString(),
          expected_delivery_date: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : null,
          total: calculateTotal(),
          status: "draft"
        })
        .select()
        .single();

      if (poError) throw poError;

      // Create the custom line items
      // Note: order_item_id is nullable for custom items
      const itemsToInsert = validItems.map((item, idx) => ({
        vendor_po_id: newPO.id,
        order_item_id: null, // Custom items don't link to specific order items
        sku: `CUSTOM-${idx + 1}`,
        name: item.description,
        description: item.description,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total: item.total,
        shipped_quantity: 0
      }));

      const { error: itemsError } = await supabase
        .from("vendor_po_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      setCreatedPOId(newPO.id);
      setCreatedPONumber(poNumber);

      toast({
        title: "Success",
        description: `Custom Vendor PO ${poNumber} created and linked to Order ${orderNumber}`,
      });

      onCreated();
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

  const handleClose = () => {
    // Reset form
    setSelectedVendorId("");
    setDescription("");
    setExpectedDeliveryDate("");
    setItems([{ description: "", quantity: 1, unit_cost: 0, total: 0 }]);
    setCreatedPOId(null);
    setCreatedPONumber(null);
    onOpenChange(false);
  };

  const handleViewPO = () => {
    if (createdPOId) {
      navigate(`/vendor-pos/${createdPOId}`);
      handleClose();
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Success state - show link to PO
  if (createdPOId && createdPONumber) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">PO Created Successfully</DialogTitle>
          <DialogDescription>
            Custom Vendor PO <span className="font-semibold">{createdPONumber}</span> has been created and linked to Order {orderNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              You can now view and manage this PO, add attachments, and send it to the vendor.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            <Button onClick={handleViewPO}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View PO {createdPONumber}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Custom Vendor PO</DialogTitle>
          <DialogDescription>
            Create a vendor purchase order with custom line items (press runs, paper costs, etc.) linked to Order {orderNumber}.
          </DialogDescription>
        </DialogHeader>
        
        {fetchingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor *</Label>
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expected Date</Label>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description / Notes</Label>
              <Textarea
                placeholder="Add any notes about this vendor PO..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Custom Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Line
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                    <div className="flex-1">
                      <Input
                        placeholder="Description (e.g., Press Run, Paper, Setup)"
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit Cost"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(index, "unit_cost", e.target.value)}
                      />
                    </div>
                    <div className="w-24 text-right font-medium">
                      {formatCurrency(item.total)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t">
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="text-lg font-semibold">{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Vendor PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
