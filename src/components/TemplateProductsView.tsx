import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Package,
  Search,
  AlertTriangle,
  LayoutGrid,
  List,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { AddProductToTemplateDialog } from "@/components/AddProductToTemplateDialog";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
  state: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  item_id: string | null;
  price: number | null;
  cost: number | null;
  image_url: string | null;
  state: string | null;
}

interface TemplateProductsViewProps {
  template: ProductTemplate;
  companyFilter: string;
  isVibeAdmin: boolean;
  onBack: () => void;
  artworkThumbnails: Record<string, string>;
  artworkStatus: Record<string, boolean>;
}

export function TemplateProductsView({ 
  template, 
  companyFilter, 
  isVibeAdmin, 
  onBack,
  artworkThumbnails,
  artworkStatus
}: TemplateProductsViewProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Quick add state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  
  // Inline edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCost, setEditCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [template.id, companyFilter]);

  const fetchProducts = async () => {
    try {
      let query = supabase
        .from('products')
        .select('id, name, description, item_id, price, cost, image_url, state')
        .eq('template_id', template.id)
        .order('name');

      if (companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleSelectProduct = (productId: string, checked: boolean) => {
    const newSelected = new Set(selectedProducts);
    if (checked) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setSelectedProducts(new Set([productId]));
    setDeleteDialogOpen(true);
  };

  const handleDeleteSelected = () => {
    if (selectedProducts.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const idsToDelete = productToDelete ? [productToDelete] : Array.from(selectedProducts);
    
    if (idsToDelete.length === 0) return;

    try {
      for (const id of idsToDelete) {
        await supabase.from('product_states').delete().eq('product_id', id);
        await supabase.from('inventory').delete().eq('product_id', id);
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
      }

      toast({
        title: "Products deleted",
        description: `Successfully deleted ${idsToDelete.length} product(s).`,
      });

      setSelectedProducts(new Set());
      fetchProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      toast({
        title: "Error",
        description: "Failed to delete products. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const tempSKU = `VB-${Math.floor(10000 + Math.random() * 90000)}`;
      
      // Use companyFilter if set, otherwise use template's company_id
      const targetCompanyId = companyFilter !== 'all' ? companyFilter : template.company_id;
      
      const { error } = await supabase
        .from('products')
        .insert({
          name: `${product.name} (Copy)`,
          description: product.description,
          price: product.price,
          cost: product.cost,
          state: product.state,
          item_id: tempSKU,
          template_id: template.id,
          company_id: targetCompanyId
        });

      if (error) throw error;

      toast({
        title: "Product duplicated",
        description: "Product has been duplicated successfully.",
      });

      fetchProducts();
    } catch (error) {
      console.error('Error duplicating product:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate product.",
        variant: "destructive",
      });
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) {
      toast({ title: "Error", description: "Please enter a product name.", variant: "destructive" });
      return;
    }

    // Use companyFilter if set, otherwise use template's company_id
    const targetCompanyId = companyFilter !== 'all' ? companyFilter : template.company_id;
    
    if (!targetCompanyId) {
      toast({ title: "Error", description: "Please select a company first.", variant: "destructive" });
      return;
    }

    setQuickAddLoading(true);
    try {
      const tempSKU = `VB-${Math.floor(10000 + Math.random() * 90000)}`;
      const fullProductName = `${template.name} - ${quickAddName.trim()}`;

      const { error } = await supabase
        .from('products')
        .insert({
          name: fullProductName,
          description: template.description,
          price: template.price,
          cost: template.cost,
          state: template.state,
          item_id: tempSKU,
          template_id: template.id,
          company_id: targetCompanyId
        });

      if (error) throw error;

      toast({ title: "Product added", description: `"${quickAddName.trim()}" has been added.` });
      setQuickAddName("");
      setQuickAddOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error adding product:', error);
      toast({ title: "Error", description: "Failed to add product.", variant: "destructive" });
    } finally {
      setQuickAddLoading(false);
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    // Strip template prefix for editing
    const displayName = product.name.startsWith(template.name + ' - ') 
      ? product.name.slice(template.name.length + 3) 
      : product.name;
    setEditName(displayName);
    setEditDescription(product.description || "");
    setEditPrice(product.price?.toString() || "");
    setEditCost(product.cost?.toString() || "");
    setEditDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!editingProduct) return;
    setSaving(true);

    try {
      // Reconstruct full name with template prefix
      const fullName = `${template.name} - ${editName.trim()}`;

      const { error } = await supabase
        .from('products')
        .update({
          name: fullName,
          description: editDescription.trim() || null,
          price: editPrice ? parseFloat(editPrice) : null,
          cost: editCost ? parseFloat(editCost) : null
        })
        .eq('id', editingProduct.id);

      if (error) throw error;

      toast({ title: "Product updated", description: "Changes saved successfully." });
      setEditDialogOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      toast({ title: "Error", description: "Failed to update product.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasApprovedArtwork = (itemId?: string | null) => {
    if (!itemId) return false;
    return artworkStatus[itemId] === true;
  };

  const getDisplayName = (product: Product) => {
    return product.name.startsWith(template.name + ' - ') 
      ? product.name.slice(template.name.length + 3) 
      : product.name;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{template.name}</h2>
            <p className="text-sm text-muted-foreground">
              {products.length} product{products.length !== 1 ? 's' : ''} in this template
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isVibeAdmin && selectedProducts.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete ({selectedProducts.size})
            </Button>
          )}
          {isVibeAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) setSelectedProducts(new Set());
              }}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              {isEditMode ? "Done" : "Select"}
            </Button>
          )}
          {isVibeAdmin && (
            <>
              {/* Quick Add Button */}
              <Button size="sm" variant="outline" onClick={() => setQuickAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Quick Add
              </Button>
              <AddProductToTemplateDialog 
                template={template}
                companyId={companyFilter !== 'all' ? companyFilter : (template.company_id || undefined)}
                onProductsAdded={fetchProducts}
              />
            </>
          )}
        </div>
      </div>

      {/* Template Description */}
      {template.description && (
        <Card className="p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{template.description}</p>
        </Card>
      )}

      {/* Search and View Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* View Toggle */}
        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Products Grid/List */}
      {filteredProducts.length === 0 ? (
        <Card className="p-16">
          <div className="text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-medium">No products in this template</p>
            <p className="text-sm text-muted-foreground mb-4">Add products to get started.</p>
            <AddProductToTemplateDialog 
              template={template}
              companyId={companyFilter !== 'all' ? companyFilter : (template.company_id || undefined)}
              onProductsAdded={fetchProducts}
            />
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className="group overflow-hidden transition-all hover:shadow-lg relative"
            >
              {/* Edit mode checkbox */}
              {isVibeAdmin && isEditMode && (
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedProducts.has(product.id)}
                    onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                    className="bg-background"
                  />
                </div>
              )}

              {/* Product Image */}
              <div 
                className={cn(
                  "aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative",
                  isVibeAdmin && "cursor-pointer"
                )}
                onClick={() => isVibeAdmin && openEditDialog(product)}
              >
                {product.item_id && artworkThumbnails[product.item_id] ? (
                  <img 
                    src={artworkThumbnails[product.item_id]} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="h-16 w-16 text-muted-foreground/30" />
                )}

                {/* Warning badge for no artwork */}
                {product.item_id && !hasApprovedArtwork(product.item_id) && (
                  <Badge 
                    variant="outline" 
                    className="absolute top-2 right-2 bg-warning/10 text-warning border-warning/30"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    No Art
                  </Badge>
                )}
              </div>

              {/* Product Info */}
              <div className="p-3 space-y-1">
                <h3 className="font-medium text-sm leading-snug">{getDisplayName(product)}</h3>
                <p className="text-xs text-muted-foreground font-mono">{product.item_id}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {product.price && <span>${Number(product.price).toFixed(2)}</span>}
                  {product.state && <Badge variant="outline" className="text-[10px] py-0">{product.state}</Badge>}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 rounded-none h-9 text-xs"
                  onClick={() => openEditDialog(product)}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 rounded-none h-9 text-xs border-l border-border"
                  onClick={() => handleDuplicate(product)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 rounded-none h-9 text-xs text-destructive hover:text-destructive border-l border-border"
                  onClick={() => handleDeleteClick(product.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Trash
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <Card className="overflow-hidden">
          <div className="bg-muted/50 border-b border-border px-4 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isEditMode && <div className="col-span-1"><Checkbox checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0} onCheckedChange={handleSelectAll} /></div>}
              <div className={cn(isEditMode ? "col-span-2" : "col-span-2")}>SKU</div>
              <div className="col-span-5">Product Name</div>
              <div className="col-span-2">Price</div>
              <div className={cn(isEditMode ? "col-span-2" : "col-span-3")}>Actions</div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {filteredProducts.map((product) => (
              <div key={product.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 items-center">
                {isEditMode && (
                  <div className="col-span-1">
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                    />
                  </div>
                )}
                <div className={cn("font-mono text-sm", isEditMode ? "col-span-2" : "col-span-2")}>{product.item_id}</div>
                <div className="col-span-5">
                  <p className="font-medium text-sm">{getDisplayName(product)}</p>
                  {product.description && <p className="text-xs text-muted-foreground truncate">{product.description}</p>}
                </div>
                <div className="col-span-2 text-sm">${product.price?.toFixed(2) || '0.00'}</div>
                <div className={cn("flex gap-1", isEditMode ? "col-span-2" : "col-span-3")}>
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(product)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(product)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(product.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Add Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Adding to: <span className="font-medium text-foreground">{template.name}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-add-name">Product Name</Label>
              <Input
                id="quick-add-name"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                placeholder="Enter product name (e.g., Blue Dream)"
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              />
              <p className="text-xs text-muted-foreground">
                Full name will be: {template.name} - {quickAddName || '...'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
              <Button onClick={handleQuickAdd} disabled={quickAddLoading || !quickAddName.trim()}>
                {quickAddLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Add Product
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Product Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Product name"
              />
              <p className="text-xs text-muted-foreground">
                Full name: {template.name} - {editName || '...'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Product description"
                rows={3}
              />
            </div>
            <div className={cn("grid gap-4", isVibeAdmin ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {isVibeAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="edit-cost">Cost ($)</Label>
                  <Input
                    id="edit-cost"
                    type="number"
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/products/edit/${editingProduct?.id}`)}>
                Full Edit Page
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveProduct} disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedProducts.size} product(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}