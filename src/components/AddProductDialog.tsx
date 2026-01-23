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
  description: z.string().max(500, "Description too long").optional(),
  state: z.string().min(1, "State is required"),
  cost: z.string().refine((val) => !val || !isNaN(parseFloat(val)), "Invalid cost").optional(),
  price: z.string().refine((val) => !val || !isNaN(parseFloat(val)), "Invalid price").optional(),
  preferred_vendor_id: z.string().optional(),
  specs: z.string().max(200, "Specifications too long").optional()
});

interface AddProductDialogProps {
  onProductAdded: () => void;
  selectedCompanyId?: string;
}

export function AddProductDialog({ onProductAdded, selectedCompanyId }: AddProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companyId, setCompanyId] = useState<string>(selectedCompanyId || "");
  const { syncProduct, checkConnection } = useQuickBooksAutoSync();
  const [formData, setFormData] = useState({
    name: "",
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
      checkRole();
      fetchVendors();
    }
  }, [open]);

  useEffect(() => {
    if (selectedCompanyId) {
      setCompanyId(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const vibeAdmin = userRole?.role === 'vibe_admin';
    setIsVibeAdmin(vibeAdmin);
    
    if (vibeAdmin) {
      fetchCompanies();
    }
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setCompanies(data);
    }
  };


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

  const generateTempSKU = () => {
    // Generate VB- followed by 5 random digits
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `VB-${randomDigits}`;
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
        .select('company_id, role')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("No company associated");

      // Determine company ID
      let finalCompanyId: string;
      if (isVibeAdmin) {
        if (!companyId) {
          toast.error("Please select a company");
          setLoading(false);
          return;
        }
        finalCompanyId = companyId;
      } else {
        finalCompanyId = userRole.company_id;
      }

      let imageUrl = null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${finalCompanyId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Generate temporary SKU if no item_id is provided
      const tempSKU = generateTempSKU();

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: formData.name,
          description: formData.description || null,
          state: formData.state,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          price: formData.price ? parseFloat(formData.price) : null,
          preferred_vendor_id: formData.preferred_vendor_id || null,
          image_url: imageUrl,
          item_id: tempSKU,
          company_id: finalCompanyId
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
      setFormData({ name: "", description: "", state: "", cost: "", price: "", preferred_vendor_id: "", specs: "" });
      setImageFile(null);
      setImagePreview(null);
      // Reset company only if not pre-selected
      if (!selectedCompanyId) setCompanyId("");
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
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Company selection for vibe_admin */}
          {isVibeAdmin && (
            <div className="space-y-2">
              <Label htmlFor="company">Company <span className="text-destructive">*</span></Label>
              <Select
                value={companyId}
                onValueChange={setCompanyId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
            <Label htmlFor="state">State</Label>
            <Select
              value={formData.state}
              onValueChange={(value) => setFormData({ ...formData, state: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="General">General (All States)</SelectItem>
                <SelectItem value="AL">Alabama</SelectItem>
                <SelectItem value="AK">Alaska</SelectItem>
                <SelectItem value="AZ">Arizona</SelectItem>
                <SelectItem value="AR">Arkansas</SelectItem>
                <SelectItem value="CA">California</SelectItem>
                <SelectItem value="CO">Colorado</SelectItem>
                <SelectItem value="CT">Connecticut</SelectItem>
                <SelectItem value="DE">Delaware</SelectItem>
                <SelectItem value="FL">Florida</SelectItem>
                <SelectItem value="GA">Georgia</SelectItem>
                <SelectItem value="HI">Hawaii</SelectItem>
                <SelectItem value="ID">Idaho</SelectItem>
                <SelectItem value="IL">Illinois</SelectItem>
                <SelectItem value="IN">Indiana</SelectItem>
                <SelectItem value="IA">Iowa</SelectItem>
                <SelectItem value="KS">Kansas</SelectItem>
                <SelectItem value="KY">Kentucky</SelectItem>
                <SelectItem value="LA">Louisiana</SelectItem>
                <SelectItem value="ME">Maine</SelectItem>
                <SelectItem value="MD">Maryland</SelectItem>
                <SelectItem value="MA">Massachusetts</SelectItem>
                <SelectItem value="MI">Michigan</SelectItem>
                <SelectItem value="MN">Minnesota</SelectItem>
                <SelectItem value="MS">Mississippi</SelectItem>
                <SelectItem value="MO">Missouri</SelectItem>
                <SelectItem value="MT">Montana</SelectItem>
                <SelectItem value="NE">Nebraska</SelectItem>
                <SelectItem value="NV">Nevada</SelectItem>
                <SelectItem value="NH">New Hampshire</SelectItem>
                <SelectItem value="NJ">New Jersey</SelectItem>
                <SelectItem value="NM">New Mexico</SelectItem>
                <SelectItem value="NY">New York</SelectItem>
                <SelectItem value="NC">North Carolina</SelectItem>
                <SelectItem value="ND">North Dakota</SelectItem>
                <SelectItem value="OH">Ohio</SelectItem>
                <SelectItem value="OK">Oklahoma</SelectItem>
                <SelectItem value="OR">Oregon</SelectItem>
                <SelectItem value="PA">Pennsylvania</SelectItem>
                <SelectItem value="RI">Rhode Island</SelectItem>
                <SelectItem value="SC">South Carolina</SelectItem>
                <SelectItem value="SD">South Dakota</SelectItem>
                <SelectItem value="TN">Tennessee</SelectItem>
                <SelectItem value="TX">Texas</SelectItem>
                <SelectItem value="UT">Utah</SelectItem>
                <SelectItem value="VT">Vermont</SelectItem>
                <SelectItem value="VA">Virginia</SelectItem>
                <SelectItem value="WA">Washington</SelectItem>
                <SelectItem value="WV">West Virginia</SelectItem>
                <SelectItem value="WI">Wisconsin</SelectItem>
                <SelectItem value="WY">Wyoming</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isVibeAdmin ? (
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.001"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.000"
              />
            </div>
          )}
          {isVibeAdmin && (
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
          )}
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