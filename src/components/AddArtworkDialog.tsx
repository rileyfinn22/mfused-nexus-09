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
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { describeArtworkUploadError, uploadArtworkFile } from "@/lib/artworkUpload";
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
  // Default artwork type - if not provided, vibe_admin defaults to 'vibe_proof', others default to 'customer'
  defaultArtworkType?: 'customer' | 'vibe_proof';
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
  defaultArtworkType,
}: AddArtworkDialogProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const { activeCompanyId, isVibeAdmin } = useActiveCompany();
  const userCompanyId = isVibeAdmin ? null : activeCompanyId;
  const [uploading, setUploading] = useState(false);
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [resolvedArtworkType, setResolvedArtworkType] = useState<'customer' | 'vibe_proof'>(defaultArtworkType || 'customer');

  const [formData, setFormData] = useState({
    companyId: defaultCompanyId || restrictToCompany || '',
    sku: defaultSku,
    productId: defaultProductId,
    files: [] as File[],
    previewFile: null as File | null,
    notes: '',
    artworkType: defaultArtworkType || 'customer' as 'customer' | 'vibe_proof',
  });

  useEffect(() => {
    if (open) {
      fetchCompanies();
    }
  }, [open]);

  // Products are fetched scoped to the chosen company. The server caps result sets
  // at 1,000 rows, so fetching every product and filtering client-side silently
  // dropped everything past the alphabetical cut-off (e.g. "ZILIS ...").
  useEffect(() => {
    if (open) {
      fetchProducts();
    }
  }, [open, formData.companyId, restrictToCompany, isVibeAdmin, activeCompanyId]);

  // Reset form with proper defaults when opening - determine artwork type based on role
  useEffect(() => {
    if (open) {
      // Use provided defaultArtworkType, or determine based on role (vibe_admin defaults to vibe_proof)
      const artworkType = defaultArtworkType || (isVibeAdmin ? 'vibe_proof' : 'customer');
      setResolvedArtworkType(artworkType);
      setFormData({
        companyId: defaultCompanyId || restrictToCompany || '',
        sku: defaultSku,
        productId: defaultProductId,
        files: [],
        previewFile: null,
        notes: '',
        artworkType: artworkType,
      });
    }
  }, [open, defaultSku, defaultCompanyId, defaultProductId, restrictToCompany, defaultArtworkType, isVibeAdmin]);

  useEffect(() => {
    // Filter products based on selected company
    if (formData.companyId) {
      setFilteredProducts(products.filter(p => p.company_id === formData.companyId));
    } else {
      setFilteredProducts(products);
    }
  }, [formData.companyId, products]);

  // Non-admins upload against whichever company the switcher is on. Reading
  // user_roles directly left multi-company customers with no company at all.
  useEffect(() => {
    if (open && !isVibeAdmin && activeCompanyId) {
      setFormData(prev => (prev.companyId ? prev : { ...prev, companyId: activeCompanyId }));
    }
  }, [open, isVibeAdmin, activeCompanyId]);

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setCompanies(data);
  };

  const fetchProducts = async () => {
    // PostgREST returns at most 1,000 rows unless told otherwise. Mfused alone has ~880
    // products, and a member of several companies sees all of them, so without a limit the
    // list silently stopped partway through the alphabet and the product "wasn't there".
    let query = supabase
      .from('products')
      .select('id, item_id, name, company_id')
      .order('name')
      .limit(10000);

    const scopeCompany = restrictToCompany || (!isVibeAdmin ? activeCompanyId : null) || formData.companyId || null;
    if (scopeCompany) {
      query = query.eq('company_id', scopeCompany);
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

  const handleUpload = () => {
    const effectiveCompanyId = formData.companyId || userCompanyId;

    if (!formData.files.length) {
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

    const job = {
      files: formData.files,
      sku: formData.sku,
      companyId: effectiveCompanyId,
      artworkType: formData.artworkType,
      notes: formData.notes,
      previewFile: formData.previewFile,
    };

    // Close right away and finish the transfer in the background so several SKUs
    // can be queued back to back instead of waiting on each upload.
    onOpenChange(false);

    void (async () => {
      const label = job.files.length > 1 ? `${job.files.length} art files` : job.files[0].name;
      const toastId = toast.loading(`Uploading ${label}...`);
      let done = 0;
      try {
        for (const file of job.files) {
          // One upload path for the dialog and the per-product "+" button (src/lib/artworkUpload.ts).
          // The SKU is stored exactly as the product carries it.
          await uploadArtworkFile({
            file,
            sku: job.sku,
            companyId: job.companyId,
            artworkType: job.artworkType,
            notes: job.notes,
            previewFile: job.files.length === 1 ? job.previewFile : null,
          });
          done++;
          onSuccess?.();
        }
        toast.success(`Added ${label}`, { id: toastId });
      } catch (error) {
        console.error('Error uploading artwork:', error);
        toast.error(
          `${done > 0 ? `Added ${done} of ${job.files.length}. ` : ''}${describeArtworkUploadError(error)}`,
          { id: toastId },
        );
        onSuccess?.();
      }
    })();
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
            <Popover modal open={productComboOpen} onOpenChange={setProductComboOpen}>
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

          {/* Artwork Type - only vibe admins can change */}
          {isVibeAdmin && (
            <div className="space-y-2">
              <Label>Artwork Type</Label>
              <Select
                value={formData.artworkType}
                onValueChange={(value: 'customer' | 'vibe_proof') => setFormData(prev => ({ ...prev, artworkType: value }))}
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
          )}

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
