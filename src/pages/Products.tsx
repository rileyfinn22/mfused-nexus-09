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

const Products = () => {
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchArtworkStatus();
  }, []);

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

  const products = [
    {
      id: "VAPE-CART-001",
      name: "Premium Vape Cartridge Packaging",
      category: "Vaporizers",
      states: [
        { state: "WA", specs: "0.5ml/1ml capacity, 510 thread, ceramic core", artwork: "v2.1-approved", status: "active" },
        { state: "AZ", specs: "Child-resistant cap, tamper-evident seal", artwork: "v1.3-pending", status: "pending" },
        { state: "NY", specs: "Medical-grade materials, leak-proof design", artwork: "v2.0-approved", status: "active" },
        { state: "MD", specs: "Biodegradable plastic, UV-resistant coating", artwork: "v1.5-approved", status: "active" },
      ]
    },
    {
      id: "EDIBLE-PKG-005",
      name: "Gummy Bear Container Set",
      category: "Edibles",
      states: [
        { state: "WA", specs: "Opaque HDPE, 100ml volume, moisture barrier", artwork: "v3.1-approved", status: "active" },
        { state: "AZ", specs: "Tamper-evident closure, food-grade materials", artwork: "v2.8-approved", status: "active" },
        { state: "NY", specs: "Medical-grade PP, stackable design", artwork: "v3.0-rejected", status: "revision" },
        { state: "MD", specs: "Recyclable PET, oxygen barrier coating", artwork: "v2.9-approved", status: "active" },
      ]
    },
    {
      id: "FLOWER-JAR-003",
      name: "Premium Glass Storage Jars",
      category: "Flower",
      states: [
        { state: "WA", specs: "Borosilicate glass, 8oz capacity, airtight seal", artwork: "v1.8-approved", status: "active" },
        { state: "AZ", specs: "UV-blocking amber glass, wide mouth opening", artwork: "v1.7-approved", status: "active" },
        { state: "NY", specs: "Child-resistant lid, break-resistant design", artwork: "v1.9-pending", status: "pending" },
        { state: "MD", specs: "100% recyclable, nitrogen-flush compatible", artwork: "v1.6-approved", status: "active" },
      ]
    },
    {
      id: "CONCENTRATE-TIN-002",
      name: "Medical-Grade Concentrate Containers",
      category: "Concentrates",
      states: [
        { state: "WA", specs: "Aluminum construction, non-stick interior", artwork: "v2.3-approved", status: "active" },
        { state: "AZ", specs: "Heat-resistant to 200°C, 5ml capacity", artwork: "v2.1-approved", status: "active" },
        { state: "NY", specs: "FDA-approved materials, precision machined", artwork: "v2.4-pending", status: "pending" },
        { state: "MD", specs: "Child-proof locking mechanism, anodized finish", artwork: "v2.2-approved", status: "active" },
      ]
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage SKUs and state-specific packaging requirements</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
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
            <div className="col-span-3">Product ID</div>
            <div className="col-span-4">Product Name</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-1">States</div>
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
                  <div className="col-span-3 font-medium font-mono text-sm flex items-center gap-2">
                    {product.id}
                    {!hasApprovedArtwork(product.id) && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="col-span-4 text-sm font-medium">{product.name}</div>
                  <div className="col-span-2 text-sm">{product.category}</div>
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
                        <div className="col-span-4 text-muted-foreground">{stateVersion.specs}</div>
                        <div className="col-span-3 flex items-center gap-1 font-mono text-xs">
                          <Image className="h-3 w-3 text-muted-foreground" />
                          {stateVersion.artwork}
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