import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search, 
  Filter, 
  ArrowUpDown,
  AlertTriangle,
  Undo2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UploadInventoryDialog } from "@/components/UploadInventoryDialog";
import { useToast } from "@/hooks/use-toast";

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
  };
}

interface UploadBatch {
  batch_id: string;
  upload_timestamp: string;
  count: number;
}

const Inventory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("available");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [artworkThumbnails, setArtworkThumbnails] = useState<Record<string, string>>({});
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadBatches, setUploadBatches] = useState<UploadBatch[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchArtworkStatus();
    fetchArtworkThumbnails();
    fetchUploadBatches();
  }, []);

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, products(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUploadBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('upload_batch_id, upload_timestamp')
        .not('upload_batch_id', 'is', null)
        .order('upload_timestamp', { ascending: false });

      if (error) throw error;

      // Group by batch_id and count items
      const batchMap = new Map<string, UploadBatch>();
      data?.forEach(item => {
        if (item.upload_batch_id && item.upload_timestamp) {
          const existing = batchMap.get(item.upload_batch_id);
          if (existing) {
            existing.count++;
          } else {
            batchMap.set(item.upload_batch_id, {
              batch_id: item.upload_batch_id,
              upload_timestamp: item.upload_timestamp,
              count: 1
            });
          }
        }
      });

      setUploadBatches(Array.from(batchMap.values()));
    } catch (error) {
      console.error('Error fetching upload batches:', error);
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

  const handleRevertBatch = (batchId: string) => {
    setBatchToDelete(batchId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteBatchConfirm = async () => {
    if (!batchToDelete) return;

    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('upload_batch_id', batchToDelete);

      if (error) throw error;

      toast({
        title: "Upload reverted",
        description: "The inventory upload has been successfully removed.",
      });

      fetchInventory();
      fetchUploadBatches();
    } catch (error) {
      console.error('Error deleting batch:', error);
      toast({
        title: "Error",
        description: "Failed to revert upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setBatchToDelete(null);
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
          <UploadInventoryDialog onInventoryUploaded={() => {
            fetchInventory();
            fetchUploadBatches();
          }} />
        </div>
      </div>

      {/* Recent Uploads - Undo Section */}
      {uploadBatches.length > 0 && (
        <div className="bg-muted/30 border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Undo2 className="h-4 w-4" />
            Recent Uploads
          </h2>
          <div className="space-y-2">
            {uploadBatches.slice(0, 5).map((batch) => (
              <div key={batch.batch_id} className="flex items-center justify-between bg-background rounded px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {new Date(batch.upload_timestamp).toLocaleString()}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {batch.count} items
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => handleRevertBatch(batch.batch_id)}
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  Revert
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-9 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1">Preview</div>
            <div className="col-span-2">SKU</div>
            <div className="col-span-1">State</div>
            <div 
              className="col-span-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("available")}
            >
              Available {getSortIcon("available")}
            </div>
            <div 
              className="col-span-2 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("in_production")}
            >
              In Production {getSortIcon("in_production")}
            </div>
            <div 
              className="col-span-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("redline")}
            >
              Redline {getSortIcon("redline")}
            </div>
            <div className="col-span-1">Status</div>
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
                className="grid grid-cols-9 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
              >
                <div className="col-span-1">
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
                <div className="col-span-2 font-mono text-sm font-medium flex items-center gap-2">
                  {item.sku}
                  {!hasApprovedArtwork(item.sku) && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
                <div className="col-span-1">
                  <Badge variant="outline" className="text-xs">{item.state}</Badge>
                </div>
                <div className="col-span-1 font-semibold text-sm flex items-center gap-1">
                  {status === "critical" && <AlertTriangle className="h-3 w-3 text-danger" />}
                  {item.available}
                </div>
                <div className="col-span-2 text-sm">{item.in_production}</div>
                <div className="col-span-1 text-sm text-muted-foreground">{item.redline}</div>
                <div className={`col-span-1 text-xs font-medium uppercase ${stockColor}`}>
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
            <AlertDialogTitle>Revert this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {uploadBatches.find(b => b.batch_id === batchToDelete)?.count || 0} inventory items from this upload batch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBatchConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revert Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Inventory;