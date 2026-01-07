import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileImage, CheckCircle, Clock, Eye, Upload, Trash2 } from "lucide-react";
import AddArtworkDialog from "@/components/AddArtworkDialog";

const EditProduct = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableStock, setAvailableStock] = useState<number>(0);
  const [vendors, setVendors] = useState<any[]>([]);
  const [artworkFiles, setArtworkFiles] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [addArtworkOpen, setAddArtworkOpen] = useState(false);
  const [productCompanyId, setProductCompanyId] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  
  const [formData, setFormData] = useState({
    item_id: "",
    product_type: "",
    name: "",
    description: "",
    units_per_case: "",
    cases_per_pallet: "",
    weight_per_case: "",
    cost: "",
    price: "",
    preferred_vendor_id: ""
  });

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (id) {
      fetchProduct();
      fetchInventory();
      fetchVendors();
    }
  }, [id]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
  };

  useEffect(() => {
    // Auto-resize description textarea when content loads
    if (descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
    }
  }, [formData.description]);

  useEffect(() => {
    // Fetch artwork files when item_id changes
    if (formData.item_id) {
      fetchArtworkFiles(formData.item_id);
    } else {
      setArtworkFiles([]);
    }
  }, [formData.item_id]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setProductCompanyId(data.company_id);
      setFormData({
        item_id: data.item_id || "",
        product_type: data.product_type || "",
        name: data.name || "",
        description: data.description || "",
        units_per_case: data.units_per_case?.toString() || "",
        cases_per_pallet: data.cases_per_pallet?.toString() || "",
        weight_per_case: data.weight_per_case?.toString() || "",
        cost: data.cost?.toString() || "",
        price: data.price?.toString() || "",
        preferred_vendor_id: data.preferred_vendor_id || ""
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error("Failed to load product");
    } finally {
      setLoading(false);
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

  const fetchArtworkFiles = async (itemId: string) => {
    if (!itemId) {
      setArtworkFiles([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('artwork_files')
        .select('*')
        .eq('sku', itemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
      setArtworkFiles([]);
    }
  };

  const handleDeleteArtwork = async (artworkId: string, artworkUrl: string, previewUrl: string | null) => {
    if (!confirm('Are you sure you want to delete this artwork file?')) return;

    try {
      // Delete from storage
      const artworkPath = artworkUrl.split('/artwork/')[1];
      if (artworkPath) {
        await supabase.storage.from('artwork').remove([artworkPath]);
      }

      if (previewUrl) {
        const previewPath = previewUrl.split('/artwork/')[1];
        if (previewPath) {
          await supabase.storage.from('artwork').remove([previewPath]);
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('artwork_files')
        .delete()
        .eq('id', artworkId);

      if (error) throw error;

      toast.success("Artwork deleted");
      fetchArtworkFiles(formData.item_id);
    } catch (error) {
      console.error('Error deleting artwork:', error);
      toast.error("Failed to delete artwork");
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
          cost: formData.cost ? parseFloat(formData.cost) : null,
          price: formData.price ? parseFloat(formData.price) : null,
          preferred_vendor_id: formData.preferred_vendor_id || null
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

        {/* Pricing Section */}
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Pricing</h2>
          
          <div className={isVibeAdmin ? "grid grid-cols-2 gap-4" : ""}>
            {isVibeAdmin && (
              <div className="space-y-2">
                <Label htmlFor="cost">Cost per Unit (Vendor Cost)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.001"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.000"
                />
                <p className="text-xs text-muted-foreground">What the vendor charges</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="price">Price per Unit</Label>
              <Input
                id="price"
                type="number"
                step="0.001"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.000"
              />
              {isVibeAdmin && <p className="text-xs text-muted-foreground">What you charge the customer</p>}
            </div>
          </div>

          {isVibeAdmin && (
            <div className="space-y-2">
              <Label htmlFor="preferred_vendor">Preferred Vendor</Label>
              <Select
                value={formData.preferred_vendor_id || undefined}
                onValueChange={(value) => setFormData({ ...formData, preferred_vendor_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No preferred vendor" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Auto-populates when creating orders (can be edited)</p>
            </div>
          )}
        </div>

        {/* Artwork Files Section */}
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Artwork Files {formData.item_id && `(${artworkFiles.length})`}
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setAddArtworkOpen(true)}
                disabled={!formData.item_id}
              >
                <Upload className="h-4 w-4 mr-2" />
                Add Artwork
              </Button>
              {formData.item_id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/artwork?search=${formData.item_id}`)}
                >
                  View All
                </Button>
              )}
            </div>
          </div>

          {!formData.item_id ? (
            <p className="text-sm text-muted-foreground">
              Enter an Item ID above to manage artwork files for this product.
            </p>
          ) : artworkFiles.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                No artwork files found for SKU: {formData.item_id}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddArtworkOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload First Artwork
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {artworkFiles.map((artwork) => (
                <div
                  key={artwork.id}
                  className="flex items-center gap-3 p-4 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                >
                  {artwork.preview_url ? (
                    <img
                      src={artwork.preview_url}
                      alt={artwork.filename}
                      className="w-16 h-16 object-cover rounded border"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded border flex items-center justify-center">
                      <FileImage className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{artwork.filename}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {artwork.is_approved ? (
                        <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending Approval
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(artwork.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {artwork.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{artwork.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(artwork.artwork_url, '_blank')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteArtwork(artwork.id, artwork.artwork_url, artwork.preview_url)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Artwork Dialog */}
        <AddArtworkDialog
          open={addArtworkOpen}
          onOpenChange={setAddArtworkOpen}
          onSuccess={() => fetchArtworkFiles(formData.item_id)}
          defaultSku={formData.item_id}
          defaultProductId={id}
          restrictToCompany={productCompanyId || undefined}
        />

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
