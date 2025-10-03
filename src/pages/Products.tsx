import { useState } from "react";
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
  Plus
} from "lucide-react";

const Products = () => {
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Product Catalog</h1>
          <p className="text-muted-foreground mt-2">Manage SKUs and state-specific packaging requirements</p>
        </div>
        <Button className="bg-primary text-primary-foreground">
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

      {/* Products List */}
      <div className="space-y-4">
        {filteredProducts.map((product) => {
          const isExpanded = expandedProducts.includes(product.id);
          
          return (
            <div key={product.id} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Product Header */}
              <div 
                className="p-6 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => toggleExpanded(product.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-mono font-medium">{product.id}</p>
                      <p className="text-sm text-muted-foreground mt-1">{product.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{product.category}</Badge>
                    <span className="text-sm text-muted-foreground">{product.states.length} states</span>
                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Expanded State Details */}
              {isExpanded && (
                <div className="border-t border-border bg-accent/20">
                  <div className="divide-y divide-border">
                    {product.states.map((stateVersion) => (
                      <div key={stateVersion.state} className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <Badge variant="outline" className="mb-2">{stateVersion.state}</Badge>
                            <p className="text-sm text-muted-foreground">{stateVersion.specs}</p>
                          </div>
                          <Badge className={`${getStatusColor(stateVersion.status)} border-0`}>
                            {stateVersion.status}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Image className="h-4 w-4" />
                            <span className="font-mono">{stateVersion.artwork}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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