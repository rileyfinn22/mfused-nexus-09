import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Search, 
  Plus, 
  Download, 
  Eye, 
  CheckCircle,
  Clock,
  FileImage,
  Trash2,
  ArrowLeft,
  Package,
  LayoutGrid,
  List,
  ImageIcon,
  FileArchive,
  FileCode,
  Edit
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AddArtworkDialog from "@/components/AddArtworkDialog";
import BulkArtworkUploadDialog from "@/components/BulkArtworkUploadDialog";
import ArtworkViewerDialog, { getArtworkThumbnail } from "@/components/ArtworkViewerDialog";
import { cn } from "@/lib/utils";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  template_id: string | null;
  company_id: string;
  image_url: string | null;
}

interface ArtworkFile {
  id: string;
  sku: string;
  filename: string;
  artwork_url: string;
  preview_url: string | null;
  is_approved: boolean;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  company_id: string;
  artwork_type: string;
}

interface Company {
  id: string;
  name: string;
}

type ArtworkStatus = 'approved' | 'pending' | 'no_art';

interface CustomerArtworkTabProps {
  isVibeAdmin: boolean;
  userCompanyId: string | null;
  companies: Company[];
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
}

export function CustomerArtworkTab({ 
  isVibeAdmin, 
  userCompanyId, 
  companies, 
  companyFilter,
  onCompanyFilterChange 
}: CustomerArtworkTabProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Template/Product hierarchy (same as Vibe Proofs)
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkFile[]>([]);
  
  // Artwork counts per product SKU
  const [artworkCounts, setArtworkCounts] = useState<Record<string, { total: number; approved: number; pending: number }>>({});
  
  // Template artwork status
  const [templateStatus, setTemplateStatus] = useState<Record<string, ArtworkStatus>>({});
  
  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editThumbnailDialogOpen, setEditThumbnailDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ArtworkFile | null>(null);
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, [companyFilter, isVibeAdmin, userCompanyId]);

  useEffect(() => {
    if (selectedTemplate) {
      fetchProductsForTemplate();
    }
  }, [selectedTemplate, companyFilter]);

  useEffect(() => {
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  }, [selectedProduct]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      
      // Get templates that have products
      let productsQuery = supabase
        .from('products')
        .select('template_id, item_id');
      
      if (!isVibeAdmin && userCompanyId) {
        productsQuery = productsQuery.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        productsQuery = productsQuery.eq('company_id', companyFilter);
      }
      
      const { data: productsData } = await productsQuery;
      const templateIds = [...new Set(productsData?.filter(p => p.template_id).map(p => p.template_id))];
      
      // Fetch templates
      const { data: templatesData } = await supabase
        .from('product_templates')
        .select('*')
        .in('id', templateIds.length > 0 ? templateIds : ['none'])
        .order('name');
      
      // Fetch customer artwork counts per SKU
      let artworkQuery = supabase
        .from('artwork_files')
        .select('sku, is_approved')
        .eq('artwork_type', 'customer');
      
      if (!isVibeAdmin && userCompanyId) {
        artworkQuery = artworkQuery.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        artworkQuery = artworkQuery.eq('company_id', companyFilter);
      }
      
      const { data: artworkData } = await artworkQuery;
      
      const counts: Record<string, { total: number; approved: number; pending: number }> = {};
      artworkData?.forEach(art => {
        if (!counts[art.sku]) {
          counts[art.sku] = { total: 0, approved: 0, pending: 0 };
        }
        counts[art.sku].total++;
        if (art.is_approved) {
          counts[art.sku].approved++;
        } else {
          counts[art.sku].pending++;
        }
      });
      setArtworkCounts(counts);
      
      // Calculate template status based on product artwork
      const templateStatusMap: Record<string, ArtworkStatus> = {};
      templatesData?.forEach(template => {
        const templateProducts = productsData?.filter(p => p.template_id === template.id) || [];
        const templateSkus = templateProducts.map(p => p.item_id).filter(Boolean) as string[];
        
        let hasApproved = false;
        let hasPending = false;
        
        templateSkus.forEach(sku => {
          if (counts[sku]) {
            if (counts[sku].approved > 0) hasApproved = true;
            if (counts[sku].pending > 0) hasPending = true;
          }
        });
        
        if (hasApproved && !hasPending) {
          templateStatusMap[template.id] = 'approved';
        } else if (hasPending || hasApproved) {
          templateStatusMap[template.id] = 'pending';
        } else {
          templateStatusMap[template.id] = 'no_art';
        }
      });
      setTemplateStatus(templateStatusMap);
      
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsForTemplate = async () => {
    if (!selectedTemplate) return;
    
    try {
      let query = supabase
        .from('products')
        .select('id, name, item_id, template_id, company_id, image_url')
        .eq('template_id', selectedTemplate.id)
        .order('name');
      
      if (!isVibeAdmin && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
      
      const { data } = await query;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchArtworkForProduct = async () => {
    if (!selectedProduct?.item_id) return;
    
    try {
      const { data } = await supabase
        .from('artwork_files')
        .select('*')
        .eq('sku', selectedProduct.item_id)
        .eq('artwork_type', 'customer')
        .order('created_at', { ascending: false });
      
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
    }
  };

  const handleUploadSuccess = () => {
    fetchTemplates();
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;

    try {
      const artworkPath = selectedFile.artwork_url.split('/artwork/')[1];
      if (artworkPath) {
        await supabase.storage.from('artwork').remove([artworkPath]);
      }

      if (selectedFile.preview_url) {
        const previewPath = selectedFile.preview_url.split('/artwork/')[1];
        if (previewPath) {
          await supabase.storage.from('artwork').remove([previewPath]);
        }
      }

      const { error } = await supabase
        .from('artwork_files')
        .delete()
        .eq('id', selectedFile.id);

      if (error) throw error;

      setDeleteDialogOpen(false);
      setSelectedFile(null);

      toast({
        title: "Deleted",
        description: "Customer art file has been deleted",
      });

      fetchArtworkForProduct();
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting artwork:', error);
      toast({
        title: "Error",
        description: "Failed to delete artwork. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditThumbnail = async () => {
    if (!newThumbnailFile || !selectedFile) {
      toast({
        title: "Missing file",
        description: "Please select a thumbnail image",
        variant: "destructive",
      });
      return;
    }

    try {
      const fileExt = newThumbnailFile.name.split('.').pop();
      const fileName = `${selectedFile.sku}/preview-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('artwork')
        .upload(fileName, newThumbnailFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('artwork')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('artwork_files')
        .update({ preview_url: publicUrl })
        .eq('id', selectedFile.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Thumbnail updated successfully",
      });

      setEditThumbnailDialogOpen(false);
      setNewThumbnailFile(null);
      fetchArtworkForProduct();
    } catch (error) {
      console.error('Error updating thumbnail:', error);
      toast({
        title: "Update failed",
        description: "Failed to update thumbnail",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    if (selectedProduct) {
      setSelectedProduct(null);
      setArtworkFiles([]);
    } else if (selectedTemplate) {
      setSelectedTemplate(null);
      setProducts([]);
    }
  };

  const getProductArtworkCount = (sku: string | null) => {
    if (!sku) return { total: 0, approved: 0, pending: 0 };
    return artworkCounts[sku] || { total: 0, approved: 0, pending: 0 };
  };
  
  const getProductArtworkStatus = (sku: string | null): ArtworkStatus => {
    if (!sku) return 'no_art';
    const counts = artworkCounts[sku];
    if (!counts || counts.total === 0) return 'no_art';
    if (counts.approved > 0 && counts.pending === 0) return 'approved';
    return 'pending';
  };
  
  const getStatusBadge = (status: ArtworkStatus) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-600 text-white border-0">
            <CheckCircle className="h-3 w-3 mr-1" />
            Complete
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-blue-500 text-white border-0">
            <Clock className="h-3 w-3 mr-1" />
            Customer Art Uploaded
          </Badge>
        );
      case 'no_art':
        return (
          <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
            <ImageIcon className="h-3 w-3 mr-1" />
            No Customer Art
          </Badge>
        );
    }
  };

  const getDisplayName = (productName: string) => {
    if (!selectedTemplate) return productName;
    const prefix = `${selectedTemplate.name} - `;
    if (productName.startsWith(prefix)) {
      return productName.substring(prefix.length);
    }
    return productName;
  };

  // Get all artwork stats
  const totalArtwork = Object.values(artworkCounts).reduce((sum, c) => sum + c.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // PRODUCT ARTWORK VIEW
  if (selectedProduct) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{getDisplayName(selectedProduct.name)}</h1>
              <p className="text-sm text-muted-foreground font-mono">
                SKU: {selectedProduct.item_id || 'No SKU'}
              </p>
            </div>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer Art
          </Button>
        </div>

        {/* Artwork Grid */}
        {artworkFiles.length === 0 ? (
          <Card className="p-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium mb-2">No customer art files</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload customer-provided artwork for this product
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer Art
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworkFiles.map((file) => (
              <Card key={file.id} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <div 
                  className="relative w-full aspect-square bg-muted overflow-hidden cursor-pointer"
                  onClick={() => {
                    setSelectedFile(file);
                    setPreviewDialogOpen(true);
                  }}
                >
                  {(() => {
                    const thumbnail = getArtworkThumbnail(file);
                    if (thumbnail.type === 'image' && thumbnail.src) {
                      return (
                        <img 
                          src={thumbnail.src} 
                          alt={file.sku}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      );
                    } else if (thumbnail.type === 'pdf') {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/20">
                          <FileImage className="h-12 w-12 text-red-500 mb-2" />
                          <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                            PDF
                          </Badge>
                        </div>
                      );
                    } else {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
                          <FileCode className="h-12 w-12 text-muted-foreground mb-2" />
                          <Badge variant="secondary" className="text-xs">
                            {thumbnail.label} File
                          </Badge>
                        </div>
                      );
                    }
                  })()}
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setEditThumbnailDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  
                  <Badge className="absolute top-2 left-2 bg-blue-600 text-white border-0">
                    Customer Art
                  </Badge>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-base truncate" title={file.filename}>
                      {file.filename}
                    </h3>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {new Date(file.created_at).toLocaleDateString()}
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                        setPreviewDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file.artwork_url, file.filename);
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add Artwork Dialog - pre-filled with product, default to customer artwork */}
        <AddArtworkDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onSuccess={handleUploadSuccess}
          defaultProductId={selectedProduct.id}
          defaultSku={selectedProduct.item_id || ''}
          defaultCompanyId={selectedProduct.company_id}
        />

        {/* Artwork Viewer Dialog */}
        <ArtworkViewerDialog
          open={previewDialogOpen}
          onOpenChange={setPreviewDialogOpen}
          file={selectedFile}
          onDownload={handleDownload}
        />

        {/* Edit Thumbnail Dialog */}
        <Dialog open={editThumbnailDialogOpen} onOpenChange={setEditThumbnailDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Thumbnail</DialogTitle>
              <DialogDescription>Upload a new thumbnail image for {selectedFile?.filename}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedFile?.preview_url && (
                <div>
                  <Label>Current Thumbnail</Label>
                  <img src={selectedFile.preview_url} alt="Current thumbnail" className="w-full h-48 object-cover rounded border mt-2" />
                </div>
              )}
              <div>
                <Label htmlFor="newThumbnail">New Thumbnail Image *</Label>
                <Input id="newThumbnail" type="file" accept="image/*" onChange={(e) => setNewThumbnailFile(e.target.files?.[0] || null)} className="mt-2" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEditThumbnail} className="flex-1" disabled={!newThumbnailFile}>Update Thumbnail</Button>
                <Button variant="outline" onClick={() => { setEditThumbnailDialogOpen(false); setNewThumbnailFile(null); }} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Customer Art</DialogTitle>
              <DialogDescription>Are you sure you want to permanently delete {selectedFile?.filename}? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button onClick={handleDelete} className="flex-1" variant="destructive">Delete Permanently</Button>
              <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setSelectedFile(null); }} className="flex-1">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // PRODUCTS LIST VIEW (when template is selected)
  if (selectedTemplate) {
    const filteredProducts = products.filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedTemplate.name}</h1>
              <p className="text-sm text-muted-foreground">
                {products.length} product{products.length !== 1 ? 's' : ''} in this template
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer Art
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Products Grid/List */}
        {filteredProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium mb-2">No products found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try adjusting your search' : 'No products in this template'}
            </p>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const artCount = getProductArtworkCount(product.item_id);
              const status = getProductArtworkStatus(product.item_id);
              return (
                <Card
                  key={product.id}
                  className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-16 w-16 text-muted-foreground/30" />
                    )}
                    
                    {/* Status badge */}
                    <div className="absolute top-2 left-2">
                      {getStatusBadge(status)}
                    </div>
                    
                    {/* Artwork count badge */}
                    {artCount.total > 0 && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {artCount.total}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-sm truncate">{getDisplayName(product.name)}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{product.item_id || 'No SKU'}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="bg-muted/50 border-b px-4 py-3">
              <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase">
                <div className="col-span-1"></div>
                <div className="col-span-4">Product</div>
                <div className="col-span-3">SKU</div>
                <div className="col-span-2">Customer Art</div>
                <div className="col-span-2">Status</div>
              </div>
            </div>
            <div className="divide-y">
              {filteredProducts.map((product) => {
                const artCount = getProductArtworkCount(product.item_id);
                return (
                  <div
                    key={product.id}
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer items-center"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="col-span-1">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 font-medium text-sm truncate">{getDisplayName(product.name)}</div>
                    <div className="col-span-3 text-sm font-mono text-muted-foreground">{product.item_id || '-'}</div>
                    <div className="col-span-2">
                      {artCount.total > 0 ? (
                        <Badge variant="secondary">{artCount.total} file{artCount.total !== 1 ? 's' : ''}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      {getStatusBadge(getProductArtworkStatus(product.item_id))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Add Artwork Dialog */}
        <AddArtworkDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onSuccess={handleUploadSuccess}
          defaultCompanyId={companyFilter !== 'all' ? companyFilter : undefined}
        />
      </div>
    );
  }

  // TEMPLATE GRID VIEW (default)
  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Customer Art Files</h2>
          <p className="text-muted-foreground text-sm">
            Upload customer-provided artwork for Vibe to proof. Browse by template and product.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkUploadDialogOpen(true)}>
            <FileArchive className="h-4 w-4 mr-2" />
            AI Bulk Upload
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer Art
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Total Customer Art Files</p>
          <p className="text-3xl font-bold mt-2">{totalArtwork}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Unique Products</p>
          <p className="text-3xl font-bold mt-2">
            {Object.keys(artworkCounts).length}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Templates</p>
          <p className="text-3xl font-bold mt-2">{templates.length}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={onCompanyFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
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
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="font-medium mb-2">No templates with products</p>
          <p className="text-sm text-muted-foreground mb-4">
            Create products and organize them into templates to manage customer artwork
          </p>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer Art
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
                {template.thumbnail_url ? (
                  <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-16 w-16 text-muted-foreground/30" />
                )}
                {/* Status badge */}
                <div className="absolute top-2 left-2">
                  {getStatusBadge(templateStatus[template.id] || 'no_art')}
                </div>
              </div>
              <div className="p-3 space-y-1">
                <h3 className="font-medium text-sm leading-snug">{template.name}</h3>
                {template.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description.split('\n')[0]}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Artwork Dialog */}
      <AddArtworkDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        defaultCompanyId={companyFilter !== 'all' ? companyFilter : undefined}
      />

      {/* Bulk Upload Dialog */}
      <BulkArtworkUploadDialog
        open={bulkUploadDialogOpen}
        onOpenChange={setBulkUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        restrictToCompany={companyFilter !== 'all' ? companyFilter : undefined}
      />
    </div>
  );
}
