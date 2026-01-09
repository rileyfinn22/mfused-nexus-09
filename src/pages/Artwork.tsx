import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Plus, 
  Download, 
  Eye, 
  CheckCircle,
  XCircle,
  Clock,
  FileImage,
  FileText,
  Edit,
  Trash2,
  ArrowLeft,
  Package,
  LayoutGrid,
  List,
  ImageIcon,
  FolderOpen,
  Upload
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generatePdfThumbnailFromUrl } from "@/lib/pdfThumbnail";
import AddArtworkDialog from "@/components/AddArtworkDialog";
import BulkArtworkUploadDialog from "@/components/BulkArtworkUploadDialog";
import ArtworkViewerDialog, { getArtworkThumbnail } from "@/components/ArtworkViewerDialog";
import { CustomerArtworkTab } from "@/components/CustomerArtworkTab";
import { cn } from "@/lib/utils";
import { FileArchive, FileCode } from "lucide-react";

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

// Artwork status types
type ArtworkStatus = 'approved' | 'pending' | 'no_art';

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
}

const Artwork = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Template/Product hierarchy
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkFile[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<any[]>([]);
  
  // Artwork counts per product SKU
  const [artworkCounts, setArtworkCounts] = useState<Record<string, { total: number; approved: number; pending: number }>>({});
  
  // Template artwork status
  const [templateStatus, setTemplateStatus] = useState<Record<string, ArtworkStatus>>({});
  
  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editThumbnailDialogOpen, setEditThumbnailDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalData, setApprovalData] = useState({
    printName: '',
    signature: '',
    date: new Date().toISOString().split('T')[0]
  });
  
  const { toast } = useToast();

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchTemplates();
      fetchAllArtwork();
      fetchRejectedArtwork();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
    
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams, isVibeAdmin, companyFilter]);

  useEffect(() => {
    if (selectedTemplate) {
      fetchProductsForTemplate();
    }
  }, [selectedTemplate, companyFilter]);

  useEffect(() => {
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  }, [selectedProduct, statusFilter]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userRole } = await supabase.from('user_roles').select('role, company_id').eq('user_id', user.id).single();
    setIsVibeAdmin(userRole?.role === 'vibe_admin');
    setUserCompanyId(userRole?.company_id || null);
  };

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchTemplates = async () => {
    try {
      // Get templates that have products with artwork
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
      const productSkus = productsData?.filter(p => p.item_id).map(p => p.item_id) || [];
      
      // Fetch templates
      const { data: templatesData } = await supabase
        .from('product_templates')
        .select('*')
        .in('id', templateIds.length > 0 ? templateIds : ['none'])
        .order('name');
      
      // Fetch artwork counts per SKU
      let artworkQuery = supabase
        .from('artwork_files')
        .select('sku, is_approved');
      
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
        } else if (hasPending) {
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
      let query = supabase
        .from('artwork_files')
        .select('*')
        .eq('sku', selectedProduct.item_id)
        .order('created_at', { ascending: false });
      
      if (statusFilter === 'approved') {
        query = query.eq('is_approved', true);
      } else if (statusFilter === 'pending') {
        query = query.eq('is_approved', false);
      }
      
      const { data } = await query;
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
    }
  };

  const fetchAllArtwork = async () => {
    try {
      let query = supabase
        .from('artwork_files')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isVibeAdmin && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data } = await query;
      if (!selectedProduct) {
        setArtworkFiles(data || []);
      }
    } catch (error) {
      console.error('Error fetching artwork:', error);
    }
  };

  const fetchRejectedArtwork = async () => {
    try {
      let query = supabase
        .from('rejected_artwork_files')
        .select('*')
        .order('rejected_at', { ascending: false });

      if (!isVibeAdmin && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data } = await query;
      setRejectedFiles(data || []);
    } catch (error) {
      console.error('Error fetching rejected artwork:', error);
    }
  };

  const handleUploadSuccess = () => {
    fetchAllArtwork();
    fetchTemplates();
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  };

  const handleApprove = async () => {
    if (!approvalData.printName) {
      toast({
        title: "Missing information",
        description: "Please provide print name",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('artwork_files')
        .update({
          is_approved: true,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes: `Approved by: ${approvalData.printName}\nDate: ${approvalData.date}\n\n${selectedFile?.notes || ''}`
        })
        .eq('id', selectedFile.id);

      if (error) throw error;

      toast({
        title: "Approved",
        description: "Artwork has been approved",
      });
      
      setApprovalDialogOpen(false);
      setApprovalData({
        printName: '',
        signature: '',
        date: new Date().toISOString().split('T')[0]
      });
      fetchArtworkForProduct();
      fetchAllArtwork();
      fetchTemplates();
    } catch (error) {
      console.error('Error approving artwork:', error);
      toast({
        title: "Error",
        description: "Failed to approve artwork",
        variant: "destructive",
      });
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

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason for rejecting this artwork",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: archiveError } = await supabase
        .from('rejected_artwork_files')
        .insert({
          original_artwork_id: selectedFile.id,
          company_id: selectedFile.company_id,
          sku: selectedFile.sku,
          filename: selectedFile.filename,
          artwork_url: selectedFile.artwork_url,
          preview_url: selectedFile.preview_url,
          notes: selectedFile.notes,
          rejection_reason: rejectionReason,
          rejected_by: user.id,
          original_created_at: selectedFile.created_at
        });

      if (archiveError) throw archiveError;

      const { error: deleteError } = await supabase
        .from('artwork_files')
        .delete()
        .eq('id', selectedFile.id);

      if (deleteError) throw deleteError;

      toast({
        title: "Artwork rejected",
        description: "Artwork has been archived and removed from active files",
      });

      setRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedFile(null);
      fetchArtworkForProduct();
      fetchAllArtwork();
      fetchRejectedArtwork();
      fetchTemplates();
    } catch (error) {
      console.error('Error rejecting artwork:', error);
      toast({
        title: "Error",
        description: "Failed to reject artwork",
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
        description: "Artwork file has been deleted",
      });

      fetchArtworkForProduct();
      fetchAllArtwork();
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
      fetchAllArtwork();
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
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-500 text-white border-0">
            <Clock className="h-3 w-3 mr-1" />
            Proof Pending Approval
          </Badge>
        );
      case 'no_art':
        return (
          <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
            <ImageIcon className="h-3 w-3 mr-1" />
            No Art
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
  const approvedArtwork = Object.values(artworkCounts).reduce((sum, c) => sum + c.approved, 0);
  const pendingArtwork = totalArtwork - approvedArtwork;

  if (loading) {
    return <div className="p-6">Loading...</div>;
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
          {isVibeAdmin && (
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Art
            </Button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Artwork Grid */}
        {artworkFiles.length === 0 ? (
          <Card className="p-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium mb-2">No artwork files</p>
            <p className="text-sm text-muted-foreground mb-4">
              {isVibeAdmin ? "Add artwork to this product to get started" : "No artwork files have been uploaded for this product yet"}
            </p>
            {isVibeAdmin && (
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Art
              </Button>
            )}
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
                            // If image fails to load, show placeholder instead
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector('.fallback-placeholder')) {
                              const placeholder = document.createElement('div');
                              placeholder.className = 'fallback-placeholder w-full h-full flex flex-col items-center justify-center bg-muted/50';
                              placeholder.innerHTML = '<span class="text-xs text-muted-foreground">Image unavailable</span>';
                              parent.appendChild(placeholder);
                            }
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
                          <span className="text-xs text-muted-foreground mt-1">Click to view</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
                          <FileCode className="h-12 w-12 text-muted-foreground mb-2" />
                          <Badge variant="secondary" className="text-xs">
                            {thumbnail.label} File
                          </Badge>
                          <span className="text-xs text-muted-foreground mt-1">Click to view</span>
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
                  
                  <div className="absolute top-2 left-2">
                    {file.is_approved ? (
                      <Badge className="bg-green-600 text-white border-0">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-yellow-500/90 text-white border-0">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-base truncate" title={file.filename}>
                      {file.filename}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(file.created_at).toLocaleDateString()}</span>
                    {file.is_approved && file.approved_at && (
                      <span className="text-green-600">
                        ✓ {new Date(file.approved_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1"
                      onClick={() => {
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
                      onClick={() => handleDownload(file.artwork_url, file.filename)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  {!file.is_approved && isVibeAdmin && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => {
                          setSelectedFile(file);
                          setApprovalDialogOpen(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  )}

                  {!file.is_approved && isVibeAdmin && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setSelectedFile(file);
                          setRejectDialogOpen(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setSelectedFile(file);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add Artwork Dialog - pre-filled with product */}
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

        {/* Approval Dialog */}
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Artwork</DialogTitle>
              <DialogDescription>
                Please provide your approval details for {selectedFile?.filename}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="printName">Print Name *</Label>
                <Input
                  id="printName"
                  value={approvalData.printName}
                  onChange={(e) => setApprovalData({...approvalData, printName: e.target.value})}
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <Label htmlFor="approvalDate">Date</Label>
                <Input
                  id="approvalDate"
                  type="date"
                  value={approvalData.date}
                  onChange={(e) => setApprovalData({...approvalData, date: e.target.value})}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleApprove} className="flex-1">Approve Artwork</Button>
                <Button variant="outline" onClick={() => setApprovalDialogOpen(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Artwork</DialogTitle>
              <DialogDescription>Please provide a reason for rejecting {selectedFile?.filename}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rejectionReason">Rejection Reason *</Label>
                <Textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this artwork is being rejected..." rows={4} className="mt-2" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleReject} className="flex-1" variant="destructive" disabled={!rejectionReason.trim()}>Reject & Archive</Button>
                <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectionReason(''); }} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Artwork</DialogTitle>
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
              Add Art
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
                <div className="col-span-2">Art Files</div>
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
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Artwork Library</h1>
          <p className="text-muted-foreground mt-1">Browse templates and products to view artwork files</p>
        </div>
      </div>

      {/* Tabs for Vibe Proofs and Customer Art */}
      <Tabs defaultValue="proofs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="proofs" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Vibe Proofs
          </TabsTrigger>
          <TabsTrigger value="customer" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Customer Art
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proofs" className="space-y-6">
          {/* Vibe Proofs Header Actions */}
          {isVibeAdmin && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkUploadDialogOpen(true)}>
                <FileArchive className="h-4 w-4 mr-2" />
                AI Bulk Upload
              </Button>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Art
              </Button>
            </div>
          )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Total Files</p>
          <p className="text-3xl font-bold mt-2">{totalArtwork}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="text-3xl font-bold mt-2 text-green-600">{approvedArtwork}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Pending Review</p>
          <p className="text-3xl font-bold mt-2 text-yellow-600">{pendingArtwork}</p>
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
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
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
      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="font-medium mb-2">No templates with products</p>
          <p className="text-sm text-muted-foreground">
            Create products and organize them into templates to manage artwork
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates
            .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((template) => (
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

      {/* Rejected Archive Link */}
      {rejectedFiles.length > 0 && (
        <div className="mt-6">
          <div 
            className="inline-flex items-center gap-2 bg-card border border-destructive/20 rounded-lg px-4 py-2 hover:shadow-md transition-all cursor-pointer"
            onClick={() => navigate('/artwork/rejected')}
          >
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium">Rejected Archive</span>
            <Badge variant="destructive" className="text-xs">
              {rejectedFiles.length}
            </Badge>
          </div>
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
        </TabsContent>

        <TabsContent value="customer">
          <CustomerArtworkTab
            isVibeAdmin={isVibeAdmin}
            userCompanyId={userCompanyId}
            companies={companies}
            companyFilter={companyFilter}
            onCompanyFilterChange={setCompanyFilter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Artwork;
