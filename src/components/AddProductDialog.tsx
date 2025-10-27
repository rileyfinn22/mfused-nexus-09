import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1, "Item name is required").max(200, "Name too long"),
  category: z.string().min(1, "Category is required"),
  description: z.string().max(500, "Description too long").optional(),
  state: z.string().min(1, "State is required"),
  cost: z.string().refine((val) => !val || !isNaN(parseFloat(val)), "Invalid cost").optional(),
  price: z.string().refine((val) => !val || !isNaN(parseFloat(val)), "Invalid price").optional(),
  preferred_vendor_id: z.string().optional(),
  specs: z.string().max(200, "Specifications too long").optional()
});

interface AddProductDialogProps {
  onProductAdded: () => void;
}

export function AddProductDialog({ onProductAdded }: AddProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const { syncProduct, checkConnection } = useQuickBooksAutoSync();
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    state: "",
    cost: "",
    price: "",
    preferred_vendor_id: "",
    specs: ""
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchVendors();
    }
  }, [open]);

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setVendors(data || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate image file size (max 5MB)
      const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error("Image too large. Maximum size is 5MB");
        return;
      }
      
      // Validate image type
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!validImageTypes.includes(file.type)) {
        toast.error("Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed");
        return;
      }
      
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validation = productSchema.safeParse(formData);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    
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

      let imageUrl = null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${userRole.company_id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: formData.name,
          category: formData.category,
          description: formData.description || null,
          state: formData.state,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          price: formData.price ? parseFloat(formData.price) : null,
          preferred_vendor_id: formData.preferred_vendor_id || null,
          image_url: imageUrl,
          company_id: userRole.company_id
        })
        .select()
        .single();

      if (productError) throw productError;

      // Create product state if specs provided
      if (formData.specs) {
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
      }

      toast.success("Product added successfully");
      
      // Auto-sync to QuickBooks if connected
      const isConnected = await checkConnection();
      if (isConnected) {
        await syncProduct(product.id);
      }
      
      setOpen(false);
      setFormData({ name: "", category: "", description: "", state: "", cost: "", price: "", preferred_vendor_id: "", specs: "" });
      setImageFile(null);
      setImagePreview(null);
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
            <Label htmlFor="name">Item Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product description"
              maxLength={500}
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
                <SelectItem value="WA">Washington</SelectItem>
                <SelectItem value="AZ">Arizona</SelectItem>
                <SelectItem value="NY">New York</SelectItem>
                <SelectItem value="CA">California</SelectItem>
                <SelectItem value="MD">Maryland</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost">Cost (Vendor Cost)</Label>
              <Input
                id="cost"
                type="number"
                step="0.001"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="0.000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (Customer Price)</Label>
              <Input
                id="price"
                type="number"
                step="0.001"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred_vendor">Preferred Vendor (Optional)</Label>
            <Select
              value={formData.preferred_vendor_id || undefined}
              onValueChange={(value) => setFormData({ ...formData, preferred_vendor_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="No preferred vendor" />
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
            <Label htmlFor="specs">Specifications (Optional)</Label>
            <Input
              id="specs"
              value={formData.specs}
              onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
              placeholder="e.g., 1g, 510 thread"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">Product Image</Label>
            <div className="flex items-center gap-4">
              <Input
                id="image"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                onChange={handleImageChange}
                className="hidden"
              />
              <Label 
                htmlFor="image" 
                className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-accent"
              >
                <Upload className="h-4 w-4" />
                {imageFile ? imageFile.name : "Choose Image"}
              </Label>
              {imagePreview && (
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-16 h-16 object-cover rounded border"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Max 5MB. JPEG, PNG, WebP, or GIF</p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Adding..." : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}