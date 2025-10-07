import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface AddProductDialogProps {
  onProductAdded: () => void;
}

export function AddProductDialog({ onProductAdded }: AddProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    state: "",
    specs: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get user's company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company associated");

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: formData.name,
          category: formData.category,
          company_id: userRole.company_id
        })
        .select()
        .single();

      if (productError) throw productError;

      // Create product state
      const { error: stateError } = await supabase
        .from('product_states')
        .insert({
          product_id: product.id,
          state: formData.state,
          specs: formData.specs,
          artwork_status: 'pending',
          status: 'active'
        });

      if (stateError) throw stateError;

      toast.success("Product added successfully");
      setOpen(false);
      setFormData({ name: "", category: "", state: "", specs: "" });
      onProductAdded();
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error("Failed to add product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Create a new product with initial state configuration
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Vape Cartridge">Vape Cartridge</SelectItem>
                <SelectItem value="Disposable">Disposable</SelectItem>
                <SelectItem value="Edible">Edible</SelectItem>
                <SelectItem value="Flower">Flower</SelectItem>
                <SelectItem value="Concentrate">Concentrate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Select
              value={formData.state}
              onValueChange={(value) => setFormData({ ...formData, state: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MI">Michigan</SelectItem>
                <SelectItem value="IL">Illinois</SelectItem>
                <SelectItem value="CA">California</SelectItem>
                <SelectItem value="CO">Colorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="specs">Specifications</Label>
            <Input
              id="specs"
              value={formData.specs}
              onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
              placeholder="e.g., 1g, 510 thread"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Adding..." : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
