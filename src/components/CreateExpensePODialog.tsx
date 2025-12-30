import { useState, useEffect } from "react";
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
import { Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Vendor {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
}

interface ExpenseItem {
  description: string;
  quantity: number;
  unit_cost: number;
  total: number;
}

interface CreateExpensePODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EXPENSE_CATEGORIES = [
  "Shipping",
  "Materials",
  "Packaging",
  "Samples",
  "Freight",
  "Storage",
  "Customs/Duties",
  "Other"
];

export function CreateExpensePODialog({ open, onOpenChange, onCreated }: CreateExpensePODialogProps) {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // Form state
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [expenseCategory, setExpenseCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([
    { description: "", quantity: 1, unit_cost: 0, total: 0 }
  ]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const [vendorsRes, companiesRes] = await Promise.all([
        supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
        supabase.from("companies").select("id, name").order("name")
      ]);
      
      if (vendorsRes.error) throw vendorsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      
      setVendors(vendorsRes.data || []);
      setCompanies(companiesRes.data || []);
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
    const { count } = await supabase
      .from("vendor_pos")
      .select("*", { count: "exact", head: true });
    
    const nextNumber = (count || 0) + 1;
    return `EXP-${String(nextNumber).padStart(5, "0")}`;
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_cost: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
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

    if (!expenseCategory) {
      toast({
        title: "Error",
        description: "Please select an expense category",
        variant: "destructive",
      });
      return;
    }

    const validItems = items.filter(item => item.description && item.total > 0);
    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one expense item",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      const poNumber = await generatePONumber();

      // Create the expense PO
      const { data: newPO, error: poError } = await supabase
        .from("vendor_pos")
        .insert({
          po_number: poNumber,
          vendor_id: selectedVendorId,
          company_id: roleData?.company_id,
          customer_company_id: selectedCompanyId || null,
          po_type: "expense",
          expense_category: expenseCategory,
          description: description || null,
          order_date: new Date().toISOString(),
          expected_delivery_date: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : null,
          total: calculateTotal(),
          status: "submitted"
        })
        .select()
        .single();

      if (poError) throw poError;

      // Create the expense items
      const itemsToInsert = validItems.map(item => ({
        vendor_po_id: newPO.id,
        sku: expenseCategory.toUpperCase().replace(/\s/g, "-"),
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

      toast({
        title: "Success",
        description: `Expense PO ${poNumber} created successfully`,
      });

      // Reset form
      setSelectedVendorId("");
      setSelectedCompanyId("");
      setExpenseCategory("");
      setDescription("");
      setExpectedDeliveryDate("");
      setItems([{ description: "", quantity: 1, unit_cost: 0, total: 0 }]);

      onCreated();
      onOpenChange(false);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Expense PO</DialogTitle>
          <DialogDescription>
            Create a purchase order for expenses like shipping, materials, or other costs linked to a customer.
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
                <Label>Expense Category *</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link to Customer (optional)</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No customer link</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
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
                placeholder="Add any notes about this expense..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Expense Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Expense Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Expense PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
