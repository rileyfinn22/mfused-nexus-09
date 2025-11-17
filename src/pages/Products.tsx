import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Eye, 
  Download, 
  Truck,
  Image,
  Plus,
  AlertTriangle,
  Edit,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "@/components/AddProductDialog";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  description: string | null;
  state: string;
  cost: number | null;
  image_url: string | null;
  item_id?: string | null;
  sku?: string;
  customer_id?: string | null;
  states: ProductState[];
}

interface ProductState {
  id: string;
  state: string;
  specs: string | null;
  artwork_status: string;
  status: string;
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
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchProducts();
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

      // Filter by company if not "all" and user is vibe_admin
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

          // Get SKU from inventory table
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
            image_url: product.image_url,
            sku: inventoryData?.sku,
            states: states || []
          };
        })
      );

      setProducts(productsWithStates);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchArtworkStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('artwork_files')
        .select('sku, is_approved');

      if (error) throw error;

      // Create a map of SKU to approval status
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

      // Create a map of SKU to thumbnail URL
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
    
    console.log('Deleting products:', idsToDelete);
    
    if (idsToDelete.length === 0) {
      console.log('No products to delete');
      return;
    }

    try {
      // Delete related records first for all selected products
      for (const id of idsToDelete) {
        console.log('Deleting product:', id);
        
        await supabase
          .from('product_states')
          .delete()
          .eq('product_id', id);

        await supabase
          .from('inventory')
          .delete()
          .eq('product_id', id);

        // Delete the product
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Error deleting product:', error);
          throw error;
        }
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
    product.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage SKUs and state-specific packaging requirements</p>
        </div>
        <div className="flex gap-3">
          {selectedProducts.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedProducts.size})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditMode(!isEditMode);
              if (isEditMode) {
                setSelectedProducts(new Set());
              }
            }}
          >
            <Edit className="h-4 w-4 mr-2" />
            {isEditMode ? "Done" : "Edit"}
          </Button>
          <AddProductDialog 
            onProductAdded={fetchProducts} 
            selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
          />
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-48">
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

      {/* Products Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-10 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {isEditMode && (
              <div className="col-span-1 flex items-center">
                <Checkbox
                  checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </div>
            )}
            <div className={isEditMode ? "col-span-1" : "col-span-1"}></div>
            <div className={isEditMode ? "col-span-1" : "col-span-2"}>Product ID</div>
            <div className="col-span-1">Preview</div>
            <div className="col-span-3">Item</div>
            <div className="col-span-2">State</div>
            <div className="col-span-1">Cost</div>
            {!isEditMode && <div className="col-span-1">Actions</div>}
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {filteredProducts.map((product) => {
            const isExpanded = expandedProducts.includes(product.id);
            
            return (
              <div key={product.id}>
                {/* Parent Row */}
                <div 
                  className="grid grid-cols-10 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
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
                  <div className={`${isEditMode ? "col-span-1" : "col-span-1"} flex items-center`}>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className={`${isEditMode ? "col-span-1" : "col-span-2"} font-medium font-mono text-xs flex items-center gap-2`}>
                    {product.item_id || `${product.id.slice(0, 8)}...`}
                    {product.sku && !hasApprovedArtwork(product.sku) && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                    {product.sku && (artworkThumbnails[product.sku] || product.image_url) ? (
                      <img 
                        src={artworkThumbnails[product.sku] || product.image_url} 
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => navigate(`/artwork?search=${encodeURIComponent(product.sku)}`)}
                      />
                    ) : product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="col-span-3 text-sm font-medium">{product.name}</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="text-xs">{product.state}</Badge>
                  </div>
                  <div className="col-span-1 text-sm font-medium">
                    {product.cost ? `$${product.cost.toFixed(3)}` : '-'}
                  </div>
                  {!isEditMode && (
                    <div className="col-span-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => navigate(`/products/edit/${product.id}`)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(product.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Expanded State Rows */}
                {isExpanded && (
                  <div className="bg-table-row">
                    {/* Sub-header */}
                    <div className="bg-table-header border-t border-b border-table-border">
                      <div className="grid grid-cols-12 gap-4 px-8 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <div className="col-span-1">State</div>
                        <div className="col-span-4">Specifications</div>
                        <div className="col-span-3">Artwork</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-2">Actions</div>
                      </div>
                    </div>
                    {/* State Version Rows */}
                    {product.states.map((stateVersion, index) => (
                      <div 
                        key={stateVersion.state} 
                        className={`grid grid-cols-12 gap-4 px-8 py-2 hover:bg-table-row-hover transition-colors text-sm ${
                          index !== product.states.length - 1 ? 'border-b border-table-border/30' : ''
                        }`}
                      >
                        <div className="col-span-1">
                          <Badge variant="outline" className="text-xs">{stateVersion.state}</Badge>
                        </div>
                        <div className="col-span-4 text-muted-foreground">{stateVersion.specs || '-'}</div>
                        <div className="col-span-3 flex items-center gap-1 font-mono text-xs">
                          <Image className="h-3 w-3 text-muted-foreground" />
                          {stateVersion.artwork_status}
                        </div>
                        <div className={`col-span-2 font-medium uppercase ${getStatusColor(stateVersion.status)}`}>
                          {stateVersion.status}
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Truck className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No products found matching your search criteria.
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected products?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {productToDelete ? '1 product' : `${selectedProducts.size} products`} and all associated data including inventory records and state-specific configurations. This action cannot be undone.
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