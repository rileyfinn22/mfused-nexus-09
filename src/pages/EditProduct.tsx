import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const EditProduct = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableStock, setAvailableStock] = useState<number>(0);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  
  const [formData, setFormData] = useState({
    item_id: "",
    product_type: "",
    name: "",
    description: "",
    units_per_case: "",
    cases_per_pallet: "",
    weight_per_case: "",
    cost: ""
  });

  useEffect(() => {
    if (id) {
      fetchProduct();
      fetchInventory();
    }
  }, [id]);

  useEffect(() => {
    // Auto-resize description textarea when content loads
    if (descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
    }
  }, [formData.description]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setFormData({
        item_id: data.item_id || "",
        product_type: data.product_type || "",
        name: data.name || "",
        description: data.description || "",
        units_per_case: data.units_per_case?.toString() || "",
        cases_per_pallet: data.cases_per_pallet?.toString() || "",
        weight_per_case: data.weight_per_case?.toString() || "",
        cost: data.cost?.toString() || ""
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error("Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('available')
        .eq('product_id', id);

      if (error) throw error;

      const total = data?.reduce((sum, item) => sum + item.available, 0) || 0;
      setAvailableStock(total);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('products')
        .update({
          item_id: formData.item_id || null,
          product_type: formData.product_type,
          name: formData.name,
          description: formData.description,
          units_per_case: formData.units_per_case ? parseInt(formData.units_per_case) : null,
          cases_per_pallet: formData.cases_per_pallet ? parseInt(formData.cases_per_pallet) : null,
          weight_per_case: formData.weight_per_case ? parseFloat(formData.weight_per_case) : null,
          cost: formData.cost ? parseFloat(formData.cost) : null
        })
        .eq('id', id);

      if (error) throw error;

      toast.success("Product updated successfully");
      navigate('/products');
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error("Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-table-border pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/products')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Edit Product</h1>
          <p className="text-sm text-muted-foreground mt-1">Update product details and specifications</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">ID: {id}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Product Section */}
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Product</h2>
          
          <div className="space-y-2">
            <Label htmlFor="item_id">Item ID</Label>
            <Input
              id="item_id"
              value={formData.item_id}
              onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
              placeholder="e.g., SKU-12345"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_type">Product Type</Label>
            <Select
              value={formData.product_type}
              onValueChange={(value) => setFormData({ ...formData, product_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paperboard">Paperboard Cartons/Boxes/Displays/Inserts</SelectItem>
                <SelectItem value="pouches">Pouches</SelectItem>
                <SelectItem value="labels">Labels</SelectItem>
                <SelectItem value="glass_plastic">Glass/Plastic</SelectItem>
                <SelectItem value="tins">Tins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Item Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              ref={descriptionRef}
              id="description"
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value });
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
              className="min-h-[120px] resize-none overflow-hidden"
            />
          </div>
        </div>

        {/* Inventory & Logistics Section */}
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Inventory & Logistics</h2>
          
          <div className="space-y-2">
            <Label>Available Stock</Label>
            <div className="text-2xl font-semibold text-primary">{availableStock}</div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="units_per_case">Average Units / Case</Label>
              <Input
                id="units_per_case"
                type="number"
                value={formData.units_per_case}
                onChange={(e) => setFormData({ ...formData, units_per_case: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cases_per_pallet">Average Cases / Pallet</Label>
              <Input
                id="cases_per_pallet"
                type="number"
                value={formData.cases_per_pallet}
                onChange={(e) => setFormData({ ...formData, cases_per_pallet: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight_per_case">Average Weight per Case</Label>
              <Input
                id="weight_per_case"
                type="number"
                step="0.01"
                value={formData.weight_per_case}
                onChange={(e) => setFormData({ ...formData, weight_per_case: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Cost Section */}
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Cost</h2>
          
          <div className="space-y-2">
            <Label htmlFor="cost">Cost per Unit</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/products')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditProduct;
