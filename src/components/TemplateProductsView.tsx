import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertTriangle 
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
      
      const { error } = await supabase
        .from('products')
        .insert({
          name: `${product.name} (Copy)`,
          description: product.description,
          price: product.price,
          cost: product.cost,
          item_id: tempSKU,
          template_id: template.id,
          company_id: companyFilter !== 'all' ? companyFilter : null
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

  const hasApprovedArtwork = (itemId?: string | null) => {
    if (!itemId) return false;
    return artworkStatus[itemId] === true;
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
            template={template}
            companyId={companyFilter !== 'all' ? companyFilter : undefined}
            onProductsAdded={fetchProducts}
          />
        </div>
      </div>

      {/* Template Description */}
      {template.description && (
        <Card className="p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{template.description}</p>
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
      {filteredProducts.length === 0 ? (
        <Card className="p-16">
          <div className="text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-medium">No products in this template</p>
            <p className="text-sm text-muted-foreground mb-4">Add products to get started.</p>
            <AddProductToTemplateDialog 
              template={template}
              companyId={companyFilter !== 'all' ? companyFilter : undefined}
              onProductsAdded={fetchProducts}
            />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className="group overflow-hidden transition-all hover:shadow-lg"
            >
              {/* Edit mode checkbox */}
              {isEditMode && (
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

              {/* Product Info - Show only product-specific name (strip template prefix) */}
              <div className="p-3 space-y-1">
                <h3 className="font-medium text-sm leading-snug">
                  {product.name.startsWith(template.name + ' - ') 
                    ? product.name.slice(template.name.length + 3) 
                    : product.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{product.item_id}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 rounded-none h-9 text-xs"
                  onClick={() => navigate(`/products/edit/${product.id}`)}
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
