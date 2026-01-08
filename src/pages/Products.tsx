import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ChevronDown, 
  ChevronRight, 
  Search, 
  Plus,
  AlertTriangle,
  Edit,
  Trash2,
  Package,
  LayoutGrid,
  List,
  Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "@/components/AddProductDialog";
import { AnalyzePOProductsDialog } from "@/components/AnalyzePOProductsDialog";
import { QuickAddProductsDialog } from "@/components/QuickAddProductsDialog";
import { ProductTemplateGrid } from "@/components/ProductTemplateGrid";
import { TemplateProductsView } from "@/components/TemplateProductsView";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  description: string | null;
  state: string;
  cost: number | null;
  price: number | null;
  image_url: string | null;
  item_id?: string | null;
  sku?: string;
  states: ProductState[];
  template_id?: string | null;
}

interface ProductState {
  id: string;
  state: string;
  specs: string | null;
  artwork_status: string;
  status: string;
}

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
  thumbnail_url: string | null;
  state: string | null;
  product_count?: number;
}

const Products = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [artworkThumbnails, setArtworkThumbnails] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchProducts();
      fetchTemplates();
      fetchArtworkStatus();
      fetchArtworkThumbnails();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
  }, [isVibeAdmin, companyFilter]);

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

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCompanies(data);
    }
  };

  const fetchProducts = async () => {
    try {
      let query = supabase
        .from('products')
        .select('*, product_states(*)')
        .order('created_at', { ascending: false });

      if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data: productsData, error: productsError } = await query;

      if (productsError) throw productsError;

      const productsWithStates = await Promise.all(
        (productsData || []).map(async (product) => {
          const { data: states, error: statesError } = await supabase
            .from('product_states')
            .select('*')
            .eq('product_id', product.id);

          if (statesError) throw statesError;

          const { data: inventoryData } = await supabase
            .from('inventory')
            .select('sku')
            .eq('product_id', product.id)
            .limit(1)
            .single();

          return {
            id: product.id,
            name: product.name,
            description: product.description,
            state: product.state,
            cost: product.cost,
            price: product.price,
            image_url: product.image_url,
            item_id: product.item_id,
            sku: inventoryData?.sku,
            states: states || [],
            template_id: product.template_id
          };
        })
      );

      const productsToUpdate = productsWithStates.filter(p => !p.item_id);
      if (productsToUpdate.length > 0) {
        for (const product of productsToUpdate) {
          const tempSKU = `VB-${Math.floor(10000 + Math.random() * 90000)}`;
          await supabase
            .from('products')
            .update({ item_id: tempSKU })
            .eq('id', product.id);
          product.item_id = tempSKU;
        }
      }
      
      setProducts(productsWithStates);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      let templatesQuery = supabase
        .from('product_templates')
        .select('*');

      if (companyFilter !== 'all') {
        templatesQuery = templatesQuery.or(`company_id.eq.${companyFilter},company_id.is.null`);
      }

      const { data: templatesData, error: templatesError } = await templatesQuery.order('name');

      if (templatesError) throw templatesError;

      // Fetch product counts for each template
      const templatesWithCounts = await Promise.all(
        (templatesData || []).map(async (template) => {
          let query = supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', template.id);

          if (companyFilter !== 'all') {
            query = query.eq('company_id', companyFilter);
          }

          const { count } = await query;

          return {
            ...template,
            product_count: count || 0
          };
        })
      );

      setTemplates(templatesWithCounts);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchArtworkStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('artwork_files')
        .select('sku, is_approved');

      if (error) throw error;

      const statusMap: Record<string, boolean> = {};
      data?.forEach(artwork => {
        if (!statusMap[artwork.sku] || artwork.is_approved) {
          statusMap[artwork.sku] = artwork.is_approved;
        }
      });
      setArtworkStatus(statusMap);
    } catch (error) {
      console.error('Error fetching artwork status:', error);
    }
  };

  const fetchArtworkThumbnails = async () => {
    try {
      const { data, error } = await supabase
        .from('artwork_files')
        .select('sku, preview_url, artwork_url')
        .eq('is_approved', true);

      if (error) throw error;

      const thumbnailMap: Record<string, string> = {};
      data?.forEach(artwork => {
        if (!thumbnailMap[artwork.sku]) {
          thumbnailMap[artwork.sku] = artwork.preview_url || artwork.artwork_url;
        }
      });
      setArtworkThumbnails(thumbnailMap);
    } catch (error) {
      console.error('Error fetching artwork thumbnails:', error);
    }
  };

  const hasApprovedArtwork = (sku?: string) => {
    if (!sku) return false;
    return artworkStatus[sku] === true;
  };

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

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

  const handleDeleteSelected = () => {
    if (selectedProducts.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setSelectedProducts(new Set([productId]));
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-success';
      case 'pending': return 'text-warning';
      case 'revision': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If a template is selected, show the template products view
  if (selectedTemplate) {
    return (
      <div className="space-y-6">
        <TemplateProductsView
          template={selectedTemplate}
          companyFilter={companyFilter}
          isVibeAdmin={isVibeAdmin}
          onBack={() => setSelectedTemplate(null)}
          artworkThumbnails={artworkThumbnails}
          artworkStatus={artworkStatus}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="page-title">Product Catalog</h1>
          <p className="page-subtitle">Manage SKUs and state-specific packaging requirements</p>
        </div>
        <div className="flex gap-2">
          {viewMode === "list" && selectedProducts.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete ({selectedProducts.size})
            </Button>
          )}
          {viewMode === "list" && (
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
          )}
          <AnalyzePOProductsDialog 
            onProductsAdded={fetchProducts}
            selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
          />
          <QuickAddProductsDialog 
            onProductsAdded={fetchProducts}
            selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
          />
          <AddProductDialog 
            onProductAdded={fetchProducts} 
            selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
          />
        </div>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {isVibeAdmin && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Grid
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4 mr-1.5" />
            List
          </Button>
        </div>
      </div>

      {/* Unified Grid View */}
      {viewMode === "grid" && (
        <div className="space-y-8">
          {/* Templates Section */}
          {filteredTemplates.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Templates</h2>
                <Badge variant="secondary">{filteredTemplates.length}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    {/* Template Image/Icon Area */}
                    <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
                      {template.thumbnail_url ? (
                        <img 
                          src={template.thumbnail_url} 
                          alt={template.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="h-16 w-16 text-muted-foreground/30" />
                      )}
                      
                      {/* Template badge */}
                      <Badge 
                        variant="default" 
                        className="absolute top-2 left-2 bg-primary/90 backdrop-blur-sm text-xs"
                      >
                        Template
                      </Badge>
                      
                      {/* Product count badge */}
                      <Badge 
                        variant="secondary" 
                        className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm"
                      >
                        {template.product_count} SKU{template.product_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {/* Template Info */}
                    <div className="p-3 space-y-1">
                      <h3 className="font-medium text-sm leading-snug truncate">{template.name}</h3>
                      {template.state && (
                        <Badge variant="outline" className="text-xs">{template.state}</Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Individual Products Section (products without templates) */}
          {filteredProducts.filter(p => !p.template_id).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Individual Products</h2>
                <Badge variant="secondary">{filteredProducts.filter(p => !p.template_id).length}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredProducts.filter(p => !p.template_id).map((product) => (
                  <Card
                    key={product.id}
                    className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative"
                    onClick={() => navigate(`/products/edit/${product.id}`)}
                  >
                    {/* Product Image/Icon Area */}
                    <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
                      {product.sku && artworkThumbnails[product.sku] ? (
                        <img 
                          src={artworkThumbnails[product.sku]} 
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
                      
                      {/* Artwork warning */}
                      {product.sku && !hasApprovedArtwork(product.sku) && (
                        <div className="absolute top-2 left-2">
                          <AlertTriangle className="h-5 w-5 text-warning" />
                        </div>
                      )}
                      
                      {/* State badge */}
                      {product.state && (
                        <Badge 
                          variant="outline" 
                          className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm text-xs"
                        >
                          {product.state}
                        </Badge>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3 space-y-1">
                      <h3 className="font-medium text-sm leading-snug truncate">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {product.item_id || product.id.slice(0, 8)}
                      </p>
                      <p className="text-sm font-medium">
                        {isVibeAdmin 
                          ? (product.cost ? `$${product.cost.toFixed(3)}` : '—')
                          : (product.price ? `$${product.price.toFixed(3)}` : '—')}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {filteredTemplates.length === 0 && filteredProducts.filter(p => !p.template_id).length === 0 && (
            <div className="empty-state py-16">
              <Package className="h-12 w-12 mb-4 text-muted-foreground/50" />
              <p className="font-medium">No products found</p>
              <p className="text-sm">{searchQuery ? 'Try adjusting your search.' : 'Add your first product to get started.'}</p>
            </div>
          )}
        </div>
      )}

      {/* Products Table/List View */}
      {viewMode === "list" && (
        <Card className="overflow-hidden">
          {/* Table Header */}
          <div className="bg-muted/50 border-b border-border px-4 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isEditMode && (
                <div className="col-span-1 flex items-center">
                  <Checkbox
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </div>
              )}
              <div className={cn("flex items-center", isEditMode ? "col-span-1" : "col-span-1")}></div>
              <div className={cn(isEditMode ? "col-span-2" : "col-span-2")}>Product ID</div>
              <div className="col-span-1">Preview</div>
              <div className="col-span-4">Name</div>
              <div className="col-span-2">State</div>
              <div className="col-span-1">{isVibeAdmin ? 'Cost' : 'Price'}</div>
              {!isEditMode && <div className="col-span-1">Actions</div>}
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredProducts.length === 0 ? (
              <div className="empty-state py-16">
                <Package className="h-12 w-12 mb-4 text-muted-foreground/50" />
                <p className="font-medium">No products found</p>
                <p className="text-sm">Add your first product to get started.</p>
              </div>
            ) : (
              filteredProducts.map((product) => {
                const isExpanded = expandedProducts.includes(product.id);
                
                return (
                  <div key={product.id}>
                    <div 
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer items-center"
                      onClick={() => toggleExpanded(product.id)}
                    >
                      {isEditMode && (
                        <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                          />
                        </div>
                      )}
                      <div className={cn("flex items-center", isEditMode ? "col-span-1" : "col-span-1")}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className={cn("font-mono text-xs flex items-center gap-2", isEditMode ? "col-span-2" : "col-span-2")}>
                        <span className="truncate">{product.item_id || `${product.id.slice(0, 8)}...`}</span>
                        {product.sku && !hasApprovedArtwork(product.sku) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                        )}
                      </div>
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        {product.sku && (artworkThumbnails[product.sku] || product.image_url) ? (
                          <img 
                            src={artworkThumbnails[product.sku] || product.image_url} 
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => navigate(`/artwork?search=${encodeURIComponent(product.sku)}`)}
                          />
                        ) : product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded-md border border-border"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded-md border border-border flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="col-span-4">
                        <span className="text-sm font-medium truncate block">{product.name}</span>
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="text-xs">{product.state}</Badge>
                      </div>
                      <div className="col-span-1 text-sm font-medium">
                        {isVibeAdmin 
                          ? (product.cost ? `$${product.cost.toFixed(3)}` : '—')
                          : (product.price ? `$${product.price.toFixed(3)}` : '—')}
                      </div>
                      {!isEditMode && (
                        <div className="col-span-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => navigate(`/products/edit/${product.id}`)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-danger"
                            onClick={() => handleDeleteClick(product.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Expanded State Details */}
                    {isExpanded && product.states.length > 0 && (
                      <div className="bg-muted/30 border-t border-border">
                        <div className="px-8 py-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">State Variants</p>
                          {product.states.map((state) => (
                            <div key={state.id} className="flex items-center gap-4 text-sm py-1.5">
                              <Badge variant="outline" className="text-xs min-w-[40px] justify-center">{state.state}</Badge>
                              <span className={cn("text-xs font-medium", getStatusColor(state.status))}>{state.status}</span>
                              {state.specs && <span className="text-xs text-muted-foreground">{state.specs}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
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
};

export default Products;
