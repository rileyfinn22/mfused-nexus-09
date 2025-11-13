import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  Search, 
  Filter, 
  ArrowUpDown,
  AlertTriangle,
  Trash2,
  Edit,
  Download,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UploadInventoryDialog } from "@/components/UploadInventoryDialog";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { exportToCSV } from "@/lib/exportUtils";

interface InventoryItem {
  id: string;
  sku: string;
  state: string;
  available: number;
  in_production: number;
  redline: number;
  product_id: string;
  upload_batch_id?: string;
  upload_timestamp?: string;
  products?: {
    image_url: string | null;
    name: string;
    item_id: string | null;
  };
}

const Inventory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [sortField, setSortField] = useState("available");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [artworkThumbnails, setArtworkThumbnails] = useState<Record<string, string>>({});
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [newInventory, setNewInventory] = useState({
    product_id: '',
    available: 0,
    in_production: 0,
    redline: 0
  });

  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchInventory();
      fetchArtworkStatus();
      fetchArtworkThumbnails();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
  }, [isVibeAdmin, companyFilter]);

  useEffect(() => {
    if (isVibeAdmin !== null && isVibeAdmin) {
      fetchProducts();
    }
  }, [isVibeAdmin, companyFilter]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
      setIsAdmin(data?.role === 'admin' || data?.role === 'vibe_admin');
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
  };

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchInventory = async () => {
    try {
      let query = supabase
        .from('inventory')
        .select('*, products(image_url, name, item_id)')
        .order('created_at', { ascending: false });

      // Filter by company if not "all" and user is vibe_admin
      if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
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

  const hasApprovedArtwork = (sku: string) => {
    return artworkStatus[sku] === true;
  };

  const getStockStatus = (available: number, redline: number) => {
    if (available < redline * 0.5) return "critical";
    if (available < redline) return "warning";
    return "good";
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case "critical": return "text-danger";
      case "warning": return "text-warning";
      case "good": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(filteredAndSortedData.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedItems.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .in('id', Array.from(selectedItems));

      if (error) throw error;

      toast({
        title: "Items deleted",
        description: `Successfully deleted ${selectedItems.size} inventory items.`,
      });

      setSelectedItems(new Set());
      fetchInventory();
    } catch (error) {
      console.error('Error deleting items:', error);
      toast({
        title: "Error",
        description: "Failed to delete items. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const fetchProducts = async () => {
    try {
      // Get the appropriate company_id based on role
      let targetCompanyId = companyFilter !== 'all' ? companyFilter : null;
      
      if (!isVibeAdmin) {
        // For non-vibe admins, get their company
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userRole } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();

        if (userRole) {
          targetCompanyId = userRole.company_id;
        }
      }

      let query = supabase
        .from('products')
        .select('id, name, item_id, company_id, state')
        .order('name');

      // Filter by company if we have one
      if (targetCompanyId) {
        query = query.eq('company_id', targetCompanyId);
      }

      const { data } = await query;
      if (data) setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleAddInventory = async () => {
    if (!newInventory.product_id) {
      toast({
        title: "Missing fields",
        description: "Please select a product.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the selected product with company_id and state
      const product = products.find(p => p.id === newInventory.product_id);
      if (!product) {
        toast({
          title: "Error",
          description: "Selected product not found.",
          variant: "destructive",
        });
        return;
      }

      // Use the product's company_id to ensure proper correlation
      const targetCompanyId = product.company_id;

      if (!targetCompanyId) {
        toast({
          title: "Error",
          description: "Product is not associated with a company.",
          variant: "destructive",
        });
        return;
      }

      // Use the product's state
      if (!product.state) {
        toast({
          title: "Error",
          description: "Product does not have a state assigned.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('inventory')
        .insert({
          sku: product.item_id || product.name,
          state: product.state,
          available: newInventory.available,
          in_production: newInventory.in_production,
          redline: newInventory.redline,
          product_id: newInventory.product_id,
          company_id: targetCompanyId
        });

      if (error) throw error;

      toast({
        title: "Inventory added",
        description: "Successfully added inventory item.",
      });

      setShowAddDialog(false);
      setNewInventory({
        product_id: '',
        available: 0,
        in_production: 0,
        redline: 0
      });
      fetchInventory();
    } catch (error) {
      console.error('Error adding inventory:', error);
      toast({
        title: "Error",
        description: "Failed to add inventory. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredAndSortedData = inventory
    .filter(item => {
      const matchesSearch = item.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesState = stateFilter === "all" || item.state === stateFilter;
      const status = getStockStatus(item.available, item.redline);
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "low" && (status === "critical" || status === "warning")) ||
        (statusFilter === "good" && status === "good");
      
      return matchesSearch && matchesState && matchesStatus;
    })
    .sort((a, b) => {
      const aValue = a[sortField as keyof typeof a] as number;
      const bValue = b[sortField as keyof typeof b] as number;
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Track stock levels, monitor thresholds, and manage production pipeline</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCSV(filteredAndSortedData, 'inventory')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          {isVibeAdmin && selectedItems.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedItems.size})
            </Button>
          )}
          {isVibeAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) {
                  setSelectedItems(new Set());
                }
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              {isEditMode ? "Done" : "Edit"}
            </Button>
          )}
          {isVibeAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Inventory
              </Button>
              <UploadInventoryDialog 
                onInventoryUploaded={fetchInventory} 
                selectedCompanyId={companyFilter !== 'all' ? companyFilter : undefined}
              />
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="WA">Washington</SelectItem>
            <SelectItem value="AZ">Arizona</SelectItem>
            <SelectItem value="NY">New York</SelectItem>
            <SelectItem value="CA">California</SelectItem>
            <SelectItem value="MD">Maryland</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="good">Good Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Grid */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {isVibeAdmin && isEditMode && (
              <div className="col-span-1 flex items-center">
                <Checkbox
                  checked={selectedItems.size === filteredAndSortedData.length && filteredAndSortedData.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </div>
            )}
            <div className={isVibeAdmin && isEditMode ? "col-span-1" : "col-span-1"}>Preview</div>
            <div className={isVibeAdmin && isEditMode ? "col-span-2" : "col-span-2"}>Product Name</div>
            <div className={isVibeAdmin && isEditMode ? "col-span-2" : "col-span-2"}>SKU / Item #</div>
            <div className="col-span-1">State</div>
            <div 
              className="col-span-2 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("available")}
            >
              Available {getSortIcon("available")}
            </div>
            <div 
              className="col-span-2 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("in_production")}
            >
              In Prod {getSortIcon("in_production")}
            </div>
            <div className="col-span-2">Status</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {filteredAndSortedData.map((item, index) => {
            const status = getStockStatus(item.available, item.redline);
            const stockColor = getStockColor(status);
            
            return (
              <div 
                key={`${item.sku}-${item.state}`}
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
              >
                {isVibeAdmin && isEditMode && (
                  <div className="col-span-1 flex items-center">
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                    />
                  </div>
                )}
                <div className={isVibeAdmin && isEditMode ? "col-span-1" : "col-span-1"}>
                  {artworkThumbnails[item.sku] || item.products?.image_url ? (
                    <img 
                      src={artworkThumbnails[item.sku] || item.products?.image_url} 
                      alt={item.sku}
                      className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/artwork?search=${encodeURIComponent(item.sku)}`)}
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                      No preview
                    </div>
                  )}
                </div>
                <div className={`${isVibeAdmin && isEditMode ? "col-span-2" : "col-span-2"} text-sm font-medium`}>
                  {item.products?.name || '-'}
                </div>
                <div className={`${isVibeAdmin && isEditMode ? "col-span-2" : "col-span-2"} font-mono text-sm flex items-center gap-2`}>
                  <span 
                    className="break-words"
                    title={item.sku}
                  >
                    {item.sku}
                  </span>
                  {!hasApprovedArtwork(item.sku) && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
                <div className="col-span-1">
                  <Badge variant="outline" className="text-xs">{item.state}</Badge>
                </div>
                <div className="col-span-2 font-semibold text-sm flex items-center gap-1">
                  {status === "critical" && <AlertTriangle className="h-3 w-3 text-danger" />}
                  {item.available}
                </div>
                <div className="col-span-2 text-sm">{item.in_production}</div>
                <div className={`col-span-2 text-xs font-medium uppercase ${stockColor}`}>
                  {status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {filteredAndSortedData.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No inventory items found matching your criteria.
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedItems.size} inventory item(s). This action cannot be undone.
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

        {/* Add Inventory Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory</DialogTitle>
              <DialogDescription>
                Manually add an inventory item for a product
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select
                  value={newInventory.product_id}
                  onValueChange={(value) => setNewInventory({...newInventory, product_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} {product.item_id && `(${product.item_id})`} {product.state && `- ${product.state}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Available</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newInventory.available}
                    onChange={(e) => setNewInventory({...newInventory, available: parseInt(e.target.value) || 0})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>In Production</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newInventory.in_production}
                    onChange={(e) => setNewInventory({...newInventory, in_production: parseInt(e.target.value) || 0})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Redline</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newInventory.redline}
                    onChange={(e) => setNewInventory({...newInventory, redline: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddInventory}>
                  Add Inventory
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default Inventory;