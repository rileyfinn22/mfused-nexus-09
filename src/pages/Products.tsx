import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Eye, 
  Download, 
  Truck,
  Image,
  Plus,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "@/components/AddProductDialog";

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  state: string;
  cost: number | null;
  image_url: string | null;
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
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
    fetchArtworkStatus();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      const productsWithStates = await Promise.all(
        (productsData || []).map(async (product) => {
          const { data: states, error: statesError } = await supabase
            .from('product_states')
            .select('*')
            .eq('product_id', product.id);

          if (statesError) throw statesError;

          return {
            id: product.id,
            name: product.name,
            category: product.category,
            description: product.description,
            state: product.state,
            cost: product.cost,
            image_url: product.image_url,
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

  const hasApprovedArtwork = (sku: string) => {
    return artworkStatus[sku] === true;
  };

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
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
    product.category.toLowerCase().includes(searchQuery.toLowerCase())
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
        <AddProductDialog onProductAdded={fetchProducts} />
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
      </div>

      {/* Products Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1"></div>
            <div className="col-span-2">Product ID</div>
            <div className="col-span-1">Image</div>
            <div className="col-span-2">Item</div>
            <div className="col-span-1">Description</div>
            <div className="col-span-1">Category</div>
            <div className="col-span-1">State</div>
            <div className="col-span-1">Cost</div>
            <div className="col-span-1">Details</div>
            <div className="col-span-1">Actions</div>
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
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors cursor-pointer"
                  onClick={() => toggleExpanded(product.id)}
                >
                  <div className="col-span-1 flex items-center">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="col-span-2 font-medium font-mono text-xs flex items-center gap-2">
                    {product.id.slice(0, 8)}...
                    {!hasApprovedArtwork(product.id) && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="col-span-1">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-sm font-medium">{product.name}</div>
                  <div className="col-span-1 text-sm text-muted-foreground truncate">{product.description || '-'}</div>
                  <div className="col-span-1 text-sm">{product.category}</div>
                  <div className="col-span-1">
                    <Badge variant="outline" className="text-xs">{product.state}</Badge>
                  </div>
                  <div className="col-span-1 text-sm font-medium">
                    {product.cost ? `$${product.cost.toFixed(2)}` : '-'}
                  </div>
                  <div className="col-span-1 text-sm text-center">{product.states.length}</div>
                  <div className="col-span-1 flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
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
    </div>
  );
};

export default Products;