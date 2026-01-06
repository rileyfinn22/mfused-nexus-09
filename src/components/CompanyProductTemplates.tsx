import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Pencil,
  Save,
  X
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
  product_count?: number;
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

interface CompanyProductTemplatesProps {
  companyId: string;
  companyName: string;
  onProductsChange: () => void;
}

export function CompanyProductTemplates({ 
  companyId, 
  companyName,
  onProductsChange 
}: CompanyProductTemplatesProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [artworkThumbnails, setArtworkThumbnails] = useState<Record<string, string>>({});
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateDescription, setEditTemplateDescription] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  useEffect(() => {
    fetchTemplates();
    fetchArtworkData();
  }, [companyId]);

  useEffect(() => {
    if (selectedTemplate) {
      fetchProducts();
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    try {
      // Fetch templates that belong to this company OR are global (no company_id)
      // This ensures company-specific templates are only visible to their owner
      const { data: templatesData, error: templatesError } = await supabase
        .from('product_templates')
        .select('*')
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .order('name');

      if (templatesError) throw templatesError;

      // Fetch product counts for this company
      const templatesWithCounts = await Promise.all(
        (templatesData || []).map(async (template) => {
          const { count } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', template.id)
            .eq('company_id', companyId);

          return {
            ...template,
            product_count: count || 0
          };
        })
      );

      // Show all templates owned by this company (even with 0 products)
      // For global templates (no company_id), only show if they have products
      const visibleTemplates = templatesWithCounts.filter(t => 
        t.company_id === companyId || t.product_count > 0
      );
      setTemplates(visibleTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    if (!selectedTemplate) return;
    
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, item_id, price, cost, image_url, state')
        .eq('template_id', selectedTemplate.id)
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchArtworkData = async () => {
    try {
      const { data: statusData } = await supabase
        .from('artwork_files')
        .select('sku, is_approved');

      const statusMap: Record<string, boolean> = {};
      statusData?.forEach(artwork => {
        if (!statusMap[artwork.sku] || artwork.is_approved) {
          statusMap[artwork.sku] = artwork.is_approved;
        }
      });
      setArtworkStatus(statusMap);

      const { data: thumbData } = await supabase
        .from('artwork_files')
        .select('sku, preview_url, artwork_url')
        .eq('is_approved', true);

      const thumbnailMap: Record<string, string> = {};
      thumbData?.forEach(artwork => {
        if (!thumbnailMap[artwork.sku]) {
          thumbnailMap[artwork.sku] = artwork.preview_url || artwork.artwork_url;
        }
      });
      setArtworkThumbnails(thumbnailMap);
    } catch (error) {
      console.error('Error fetching artwork data:', error);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
      fetchTemplates();
      onProductsChange();
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
      
      const { error } = await supabase
        .from('products')
        .insert({
          name: `${product.name} (Copy)`,
          description: product.description,
          price: product.price,
          cost: product.cost,
          item_id: tempSKU,
          template_id: selectedTemplate?.id,
          company_id: companyId
        });

      if (error) throw error;

      toast({
        title: "Product duplicated",
        description: "Product has been duplicated successfully.",
      });

      fetchProducts();
      fetchTemplates();
      onProductsChange();
    } catch (error) {
      console.error('Error duplicating product:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate product.",
        variant: "destructive",
      });
    }
  };

  const hasApprovedArtwork = (itemId?: string | null) => {
    if (!itemId) return false;
    return artworkStatus[itemId] === true;
  };

  const openEditTemplate = (template: ProductTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTemplate(template);
    setEditTemplateName(template.name);
    setEditTemplateDescription(template.description || "");
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    
    setSavingTemplate(true);
    try {
      const { error } = await supabase
        .from('product_templates')
        .update({
          name: editTemplateName.trim(),
          description: editTemplateDescription.trim() || null
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;

      toast({
        title: "Template updated",
        description: "Template details have been saved.",
      });

      // Update local state
      if (selectedTemplate?.id === editingTemplate.id) {
        setSelectedTemplate({
          ...selectedTemplate,
          name: editTemplateName.trim(),
          description: editTemplateDescription.trim() || null
        });
      }

      fetchTemplates();
      setEditingTemplate(null);
    } catch (error) {
      console.error('Error updating template:', error);
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="aspect-square animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  // Template detail view
  if (selectedTemplate) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedTemplate(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div>
                <h3 className="text-lg font-semibold">{selectedTemplate.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {products.length} product{products.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => openEditTemplate(selectedTemplate)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedProducts.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete ({selectedProducts.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) setSelectedProducts(new Set());
              }}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              {isEditMode ? "Done" : "Edit"}
            </Button>
            <AddProductToTemplateDialog 
              template={selectedTemplate}
              companyId={companyId}
              onProductsAdded={() => {
                fetchProducts();
                fetchTemplates();
                onProductsChange();
              }}
            />
          </div>
        </div>

        {/* Template specs */}
        {selectedTemplate.description && (
          <Card className="p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openEditTemplate(selectedTemplate)}>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{selectedTemplate.description}</p>
          </Card>
        )}

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Products Grid */}
        {loadingProducts ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No products</p>
              <p className="text-sm text-muted-foreground mb-4">Add products to this template</p>
              <AddProductToTemplateDialog 
                template={selectedTemplate}
                companyId={companyId}
                onProductsAdded={() => {
                  fetchProducts();
                  fetchTemplates();
                  onProductsChange();
                }}
              />
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="group overflow-hidden transition-all hover:shadow-md relative"
              >
                {isEditMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                      className="bg-background"
                    />
                  </div>
                )}

                <div 
                  className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative cursor-pointer"
                  onClick={() => navigate(`/products/edit/${product.id}`)}
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
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                  )}

                  {product.item_id && !hasApprovedArtwork(product.item_id) && (
                    <Badge 
                      variant="outline" 
                      className="absolute top-2 right-2 bg-warning/10 text-warning border-warning/30 text-xs"
                    >
                      <AlertTriangle className="h-3 w-3" />
                    </Badge>
                  )}
                </div>

                <div className="p-2">
                  <h4 className="font-medium text-xs truncate">{product.name}</h4>
                  <p className="text-xs text-muted-foreground font-mono truncate">{product.item_id}</p>
                </div>

                <div className="flex border-t border-border text-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 rounded-none h-8"
                    onClick={() => navigate(`/products/edit/${product.id}`)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 rounded-none h-8 border-l border-border"
                    onClick={() => handleDuplicate(product)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 rounded-none h-8 text-destructive hover:text-destructive border-l border-border"
                    onClick={() => handleDeleteClick(product.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

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

  // Template grid view
  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No product templates</p>
          <p className="text-sm">Products added from templates will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="group cursor-pointer overflow-hidden transition-all hover:shadow-md hover:border-primary/50 relative"
              onClick={() => setSelectedTemplate(template)}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 left-2 z-10 h-7 w-7 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => openEditTemplate(template, e)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                <Badge 
                  variant="secondary" 
                  className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm text-xs"
                >
                  {template.product_count}
                </Badge>
              </div>
              <div className="p-2">
                <h4 className="font-medium text-sm truncate">{template.name}</h4>
                {template.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {template.description.split('\n')[0]}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                value={editTemplateName}
                onChange={(e) => setEditTemplateName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateDescription">Description / Specs</Label>
              <Textarea
                id="templateDescription"
                value={editTemplateDescription}
                onChange={(e) => setEditTemplateDescription(e.target.value)}
                placeholder="Enter template description, specifications, dimensions, etc."
                rows={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={savingTemplate || !editTemplateName.trim()}>
                {savingTemplate ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
