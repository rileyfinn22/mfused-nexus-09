import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, FileImage, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddArtworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  // Pre-fill values
  defaultSku?: string;
  defaultCompanyId?: string;
  defaultProductId?: string;
  // If provided, show only this company's products
  restrictToCompany?: string;
}

interface Product {
  id: string;
  item_id: string | null;
  name: string;
  company_id: string;
}

interface Company {
  id: string;
  name: string;
}

const AddArtworkDialog = ({
  open,
  onOpenChange,
  onSuccess,
  defaultSku = '',
  defaultCompanyId = '',
  defaultProductId = '',
  restrictToCompany,
}: AddArtworkDialogProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productComboOpen, setProductComboOpen] = useState(false);

  const [formData, setFormData] = useState({
    companyId: defaultCompanyId || restrictToCompany || '',
    sku: defaultSku,
    productId: defaultProductId,
    file: null as File | null,
    previewFile: null as File | null,
    notes: '',
    artworkType: 'customer',
  });

  useEffect(() => {
    if (open) {
      checkRole();
      fetchCompanies();
      fetchProducts();
      // Reset form with defaults when opening
      setFormData({
        companyId: defaultCompanyId || restrictToCompany || '',
        sku: defaultSku,
        productId: defaultProductId,
        file: null,
        previewFile: null,
        notes: '',
        artworkType: 'customer',
      });
    }
  }, [open, defaultSku, defaultCompanyId, defaultProductId, restrictToCompany]);

  useEffect(() => {
    // Filter products based on selected company
    if (formData.companyId) {
      setFilteredProducts(products.filter(p => p.company_id === formData.companyId));
    } else {
      setFilteredProducts(products);
    }
  }, [formData.companyId, products]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
    setUserCompanyId(userRole?.company_id || null);

    // If not admin and no company specified, use user's company
    if (userRole?.role !== 'vibe_admin' && userRole?.company_id) {
      setFormData(prev => ({ ...prev, companyId: userRole.company_id }));
    }
  };

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setCompanies(data);
  };

  const fetchProducts = async () => {
    let query = supabase
      .from('products')
      .select('id, item_id, name, company_id')
      .order('name');

    if (restrictToCompany) {
      query = query.eq('company_id', restrictToCompany);
    }

    const { data } = await query;
    if (data) setProducts(data);
  };

  const handleProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setFormData(prev => ({
        ...prev,
        productId,
        sku: product.item_id || '',
        companyId: product.company_id,
      }));
    }
    setProductComboOpen(false);
  };

  const handleUpload = async () => {
    const effectiveCompanyId = formData.companyId || userCompanyId;
    
    if (!formData.file) {
      toast.error("Please select an artwork file");
      return;
    }

    // Product is now required
    if (!formData.productId) {
      toast.error("Please select a product to attach the artwork to");
      return;
    }

    if (!formData.sku.trim()) {
      toast.error("Selected product has no SKU. Please add a SKU to the product first.");
      return;
    }

    if (!effectiveCompanyId) {
      toast.error("Please select a company");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to upload artwork");
        return;
      }

      // Upload main artwork file
      const fileExt = formData.file.name.split('.').pop();
      const fileName = `${formData.sku}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('artwork')
        .upload(fileName, formData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl: artworkUrl } } = supabase.storage
        .from('artwork')
        .getPublicUrl(fileName);

      // Upload preview if provided
      let previewUrl = null;
      if (formData.previewFile) {
        const previewExt = formData.previewFile.name.split('.').pop();
        const previewName = `${formData.sku}/preview-${Date.now()}.${previewExt}`;

        const { error: previewError } = await supabase.storage
          .from('artwork')
          .upload(previewName, formData.previewFile);

        if (!previewError) {
          const { data: { publicUrl } } = supabase.storage
            .from('artwork')
            .getPublicUrl(previewName);
          previewUrl = publicUrl;
        }
      }

      // Create database record
      const { error: insertError } = await supabase
        .from('artwork_files')
        .insert({
          sku: formData.sku.toUpperCase(),
          artwork_url: artworkUrl,
          preview_url: previewUrl,
          filename: formData.file.name,
          notes: formData.notes,
          artwork_type: formData.artworkType,
          is_approved: false,
          company_id: effectiveCompanyId,
        });

      if (insertError) throw insertError;

      toast.success("Artwork added successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error uploading artwork:', error);
      toast.error("Failed to upload artwork");
    } finally {
      setUploading(false);
    }
  };

  const showCompanySelect = isVibeAdmin && !restrictToCompany;
  const selectedProduct = filteredProducts.find(p => p.id === formData.productId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Art</DialogTitle>
          <DialogDescription>
            Select a product and upload artwork files to attach to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company Selection - only for vibe_admin */}
          {showCompanySelect && (
            <div className="space-y-2">
              <Label>Company *</Label>
              <Select
                value={formData.companyId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, companyId: value, productId: '', sku: '' }))}
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

          {/* Product Selection - REQUIRED */}
          <div className="space-y-2">
            <Label>Select Product *</Label>
            <Popover open={productComboOpen} onOpenChange={setProductComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={productComboOpen}
                  className={cn(
                    "w-full justify-between",
                    !formData.productId && "text-muted-foreground"
                  )}
                  disabled={showCompanySelect && !formData.companyId}
                >
                  {formData.productId
                    ? selectedProduct?.name || "Select product..."
                    : "Select product..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start" sideOffset={4}>
                <Command shouldFilter={true}>
                  <CommandInput placeholder="Search products..." className="h-10" />
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandEmpty>No products found.</CommandEmpty>
                    <CommandGroup>
                      {filteredProducts.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={`${product.item_id || ''} ${product.name}`}
                          onSelect={() => handleProductSelect(product.id)}
                          className="cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 flex-shrink-0",
                              formData.productId === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{product.name}</span>
                            {product.item_id && (
                              <span className="text-xs text-muted-foreground font-mono truncate">
                                {product.item_id}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {showCompanySelect && !formData.companyId && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Select a company first to see products
              </p>
            )}
          </div>

          {/* Show selected product SKU */}
          {selectedProduct && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">{selectedProduct.name}</p>
              {selectedProduct.item_id ? (
                <p className="text-xs text-muted-foreground font-mono">
                  SKU: {selectedProduct.item_id}
                </p>
              ) : (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  This product has no SKU assigned
                </p>
              )}
            </div>
          )}

          {/* Artwork Type */}
          <div className="space-y-2">
            <Label>Artwork Type</Label>
            <Select
              value={formData.artworkType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, artworkType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer Artwork</SelectItem>
                <SelectItem value="vibe_proof">Vibe Proof</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Artwork File */}
          <div className="space-y-2">
            <Label htmlFor="artwork-file">Artwork File *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="artwork-file"
                type="file"
                onChange={(e) => setFormData(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
                className="flex-1"
              />
            </div>
            {formData.file && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileImage className="h-3 w-3" />
                {formData.file.name}
              </p>
            )}
          </div>

          {/* Preview File */}
          <div className="space-y-2">
            <Label htmlFor="preview-file">Preview Image (Optional)</Label>
            <Input
              id="preview-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFormData(prev => ({ ...prev, previewFile: e.target.files?.[0] || null }))}
            />
            <p className="text-xs text-muted-foreground">
              Upload a preview/thumbnail image if the artwork file isn't an image
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any notes about this artwork..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={uploading || !formData.productId || !formData.file}
            >
              {uploading ? (
                <>Uploading...</>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Art
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddArtworkDialog;
