import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { 
  Search, 
  Upload, 
  Download, 
  Eye, 
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  FileImage,
  AlertTriangle,
  ChevronsUpDown,
  Check,
  Edit,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Artwork = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [artworkFiles, setArtworkFiles] = useState<any[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editThumbnailDialogOpen, setEditThumbnailDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [skuComboboxOpen, setSkuComboboxOpen] = useState(false);
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [approvalData, setApprovalData] = useState({
    printName: '',
    signature: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [uploadData, setUploadData] = useState({
    sku: '',
    file: null as File | null,
    previewFile: null as File | null,
    notes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== null) {
      fetchArtwork();
      fetchRejectedArtwork();
      fetchProducts();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
    
    // Check for search query parameter
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams, isVibeAdmin, companyFilter]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
    setIsVibeAdmin(userRole?.role === 'vibe_admin');
  };

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchArtwork = async () => {
    try {
      let query = supabase
        .from('artwork_files')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by company if not "all" and user is vibe_admin
      if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
      toast({
        title: "Error",
        description: "Failed to load artwork files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRejectedArtwork = async () => {
    try {
      let query = supabase
        .from('rejected_artwork_files')
        .select('*')
        .order('rejected_at', { ascending: false });

      // Filter by company if not "all" and user is vibe_admin
      if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data, error } = await query;
      setRejectedFiles(data || []);
    } catch (error) {
      console.error('Error fetching rejected artwork:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('sku, products(name)')
        .order('sku');

      if (error) throw error;
      
      // Remove duplicates and create unique product list
      const uniqueProducts = Array.from(
        new Map(data?.map(item => [item.sku, item])).values()
      );
      
      setProducts(uniqueProducts || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleUpload = async () => {
    if (!uploadData.file || !uploadData.sku) {
      toast({
        title: "Missing information",
        description: "Please select a file and enter SKU",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please log in to upload artwork",
          variant: "destructive",
        });
        return;
      }

      // Upload main artwork file
      const fileExt = uploadData.file.name.split('.').pop();
      const fileName = `${uploadData.sku}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('artwork')
        .upload(fileName, uploadData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl: artworkUrl } } = supabase.storage
        .from('artwork')
        .getPublicUrl(fileName);

      // Upload preview if provided
      let previewUrl = null;
      if (uploadData.previewFile) {
        const previewExt = uploadData.previewFile.name.split('.').pop();
        const previewName = `${uploadData.sku}/preview-${Date.now()}.${previewExt}`;
        
        const { error: previewError } = await supabase.storage
          .from('artwork')
          .upload(previewName, uploadData.previewFile);

        if (!previewError) {
          const { data: { publicUrl } } = supabase.storage
            .from('artwork')
            .getPublicUrl(previewName);
          previewUrl = publicUrl;
        }
      }

      // Get user's company
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole?.company_id) {
        throw new Error('User not associated with a company');
      }

      // Create database record
      const { error: insertError } = await supabase
        .from('artwork_files')
        .insert({
          sku: uploadData.sku,
          artwork_url: artworkUrl,
          preview_url: previewUrl,
          filename: uploadData.file.name,
          notes: uploadData.notes,
          is_approved: false,
          company_id: userRole.company_id
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Artwork uploaded successfully",
      });

      setUploadDialogOpen(false);
      setUploadData({ sku: '', file: null, previewFile: null, notes: '' });
      fetchArtwork();
    } catch (error) {
      console.error('Error uploading artwork:', error);
      toast({
        title: "Upload failed",
        description: "Please try again",
        variant: "destructive",
      });
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
      fetchArtwork();
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

      // Archive the rejected artwork
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

      // Delete from main table
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
      fetchArtwork();
      fetchRejectedArtwork();
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
      // Delete the file from storage
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

      // Delete from database
      const { error } = await supabase
        .from('artwork_files')
        .delete()
        .eq('id', selectedFile.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Artwork file has been deleted",
      });

      setDeleteDialogOpen(false);
      setSelectedFile(null);
      fetchArtwork();
    } catch (error) {
      console.error('Error deleting artwork:', error);
      toast({
        title: "Error",
        description: "Failed to delete artwork",
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
      // Upload new thumbnail
      const fileExt = newThumbnailFile.name.split('.').pop();
      const fileName = `${selectedFile.sku}/preview-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('artwork')
        .upload(fileName, newThumbnailFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('artwork')
        .getPublicUrl(fileName);

      // Update database record
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
      fetchArtwork();
    } catch (error) {
      console.error('Error updating thumbnail:', error);
      toast({
        title: "Update failed",
        description: "Failed to update thumbnail",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (isApproved: boolean) => {
    return isApproved ? CheckCircle : Clock;
  };

  const getStatusColor = (isApproved: boolean) => {
    return isApproved ? 'text-success' : 'text-warning';
  };

  const filteredFiles = artworkFiles.filter(file => {
    const matchesSearch = file.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         file.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "approved" && file.is_approved) ||
                         (statusFilter === "pending" && !file.is_approved);
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Artwork Library & Proofing</h1>
          <p className="text-muted-foreground mt-1">Manage artwork files, review process, and approval workflow</p>
        </div>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Artwork
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Artwork</DialogTitle>
              <DialogDescription>Upload artwork file for a specific SKU</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Popover open={skuComboboxOpen} onOpenChange={setSkuComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={skuComboboxOpen}
                      className="w-full justify-between"
                    >
                      {uploadData.sku || "Search or select a SKU"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search SKU..." />
                      <CommandList>
                        <CommandEmpty>No SKU found.</CommandEmpty>
                        <CommandGroup>
                          {products.map((product) => (
                            <CommandItem
                              key={product.sku}
                              value={product.sku}
                              onSelect={(currentValue) => {
                                setUploadData({...uploadData, sku: currentValue});
                                setSkuComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={uploadData.sku === product.sku ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"}
                              />
                              {product.sku} {product.products?.name ? `- ${product.products.name}` : ''}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="artwork">Artwork File</Label>
                <Input
                  id="artwork"
                  type="file"
                  onChange={(e) => setUploadData({...uploadData, file: e.target.files?.[0] || null})}
                />
              </div>
              <div>
                <Label htmlFor="preview">Preview Image (Optional)</Label>
                <Input
                  id="preview"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadData({...uploadData, previewFile: e.target.files?.[0] || null})}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={uploadData.notes}
                  onChange={(e) => setUploadData({...uploadData, notes: e.target.value})}
                  placeholder="Add any notes about this artwork..."
                />
              </div>
              <Button onClick={handleUpload} className="w-full">Upload</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Files</p>
          <p className="text-3xl font-bold mt-2">{artworkFiles.length}</p>
        </div>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="text-3xl font-bold mt-2 text-green-600">
            {artworkFiles.filter(f => f.is_approved).length}
          </p>
        </div>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Pending Review</p>
          <p className="text-3xl font-bold mt-2 text-yellow-600">
            {artworkFiles.filter(f => !f.is_approved).length}
          </p>
        </div>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Unique SKUs</p>
          <p className="text-3xl font-bold mt-2">
            {new Set(artworkFiles.map(f => f.sku)).size}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search artwork..."
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
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
      <div className="grid gap-4">
        {filteredFiles.map((file) => {
          const StatusIcon = getStatusIcon(file.is_approved);
          
          return (
            <div key={file.id} className="bg-card border rounded-lg p-6">
              <div className="flex items-start gap-4">
                {/* Thumbnail Image */}
                <div className="relative w-32 h-32 flex-shrink-0 bg-muted rounded-lg overflow-hidden border group">
                  {file.preview_url ? (
                    <img 
                      src={file.preview_url} 
                      alt={file.sku}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setSelectedFile(file);
                        setPreviewDialogOpen(true);
                      }}
                    />
                  ) : file.artwork_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img 
                      src={file.artwork_url} 
                      alt={file.sku}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setSelectedFile(file);
                        setPreviewDialogOpen(true);
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileImage className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setEditThumbnailDialogOpen(true);
                    }}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>

                {/* File Details */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{file.filename}</h3>
                    {file.is_approved ? (
                      <span className="text-green-600 font-bold">✓ Approved</span>
                    ) : (
                      <Badge variant="secondary" className="text-warning">
                        <StatusIcon className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                    <div>
                      <p className="text-muted-foreground">SKU</p>
                      <p className="font-mono font-medium">{file.sku}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Uploaded</p>
                      <p>{new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                    {file.is_approved && file.approved_at && (
                      <div>
                        <p className="text-muted-foreground">Approved Date</p>
                        <p>{new Date(file.approved_at).toLocaleDateString()}</p>
                      </div>
                    )}
                    {file.notes && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Notes</p>
                        <p className="whitespace-pre-wrap">{file.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDownload(file.artwork_url, file.filename)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!file.is_approved && (
                    <>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedFile(file);
                          setApprovalDialogOpen(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedFile(file);
                          setRejectDialogOpen(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 text-red-600" />
                      </Button>
                    </>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSelectedFile(file);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredFiles.length === 0 && (
        <div className="text-center py-12 bg-card border rounded-lg">
          <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No artwork files found</p>
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your filters'
              : 'Upload your first artwork file to get started'
            }
          </p>
        </div>
      )}

      {/* Rejected Archive Section */}
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

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedFile?.filename}</DialogTitle>
            <DialogDescription>SKU: {selectedFile?.sku}</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            {selectedFile?.preview_url ? (
              <img 
                src={selectedFile.preview_url} 
                alt={selectedFile.filename}
                className="w-full h-auto"
              />
            ) : selectedFile?.artwork_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img 
                src={selectedFile.artwork_url} 
                alt={selectedFile.filename}
                className="w-full h-auto"
              />
            ) : (
              <div className="text-center py-12">
                <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Preview not available for this file type</p>
                <Button 
                  className="mt-4"
                  onClick={() => handleDownload(selectedFile?.artwork_url, selectedFile?.filename)}
                >
                  Download to View
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
              <Button 
                onClick={handleApprove} 
                className="flex-1"
              >
                Approve Artwork
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setApprovalDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Thumbnail Dialog */}
      <Dialog open={editThumbnailDialogOpen} onOpenChange={setEditThumbnailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Thumbnail</DialogTitle>
            <DialogDescription>
              Upload a new thumbnail image for {selectedFile?.filename}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedFile?.preview_url && (
              <div>
                <Label>Current Thumbnail</Label>
                <img 
                  src={selectedFile.preview_url} 
                  alt="Current thumbnail"
                  className="w-full h-48 object-cover rounded border mt-2"
                />
              </div>
            )}
            <div>
              <Label htmlFor="newThumbnail">New Thumbnail Image *</Label>
              <Input
                id="newThumbnail"
                type="file"
                accept="image/*"
                onChange={(e) => setNewThumbnailFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleEditThumbnail} 
                className="flex-1"
                disabled={!newThumbnailFile}
              >
                Update Thumbnail
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditThumbnailDialogOpen(false);
                  setNewThumbnailFile(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Artwork</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting {selectedFile?.filename}. This artwork will be moved to the rejected archive.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this artwork is being rejected..."
                rows={4}
                className="mt-2"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleReject} 
                className="flex-1"
                variant="destructive"
                disabled={!rejectionReason.trim()}
              >
                Reject & Archive
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setRejectDialogOpen(false);
                  setRejectionReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Artwork</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete {selectedFile?.filename}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button 
              onClick={handleDelete} 
              className="flex-1"
              variant="destructive"
            >
              Delete Permanently
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedFile(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Artwork;