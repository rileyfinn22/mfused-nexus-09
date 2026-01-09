import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Plus, 
  Download, 
  Eye, 
  FileImage,
  Trash2,
  Package,
  LayoutGrid,
  List,
  FileArchive,
  FileCode
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AddArtworkDialog from "@/components/AddArtworkDialog";
import BulkArtworkUploadDialog from "@/components/BulkArtworkUploadDialog";
import ArtworkViewerDialog, { getArtworkThumbnail } from "@/components/ArtworkViewerDialog";
import { cn } from "@/lib/utils";

interface CustomerArtFile {
  id: string;
  sku: string;
  filename: string;
  artwork_url: string;
  preview_url: string | null;
  notes: string | null;
  created_at: string;
  company_id: string;
  artwork_type: string;
  is_approved: boolean;
  approved_at: string | null;
}

interface Company {
  id: string;
  name: string;
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [customerArtFiles, setCustomerArtFiles] = useState<CustomerArtFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<CustomerArtFile | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchCustomerArtFiles();
  }, [companyFilter, isVibeAdmin, userCompanyId]);

  const fetchCustomerArtFiles = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('artwork_files')
        .select('*')
        .eq('artwork_type', 'customer')
        .order('created_at', { ascending: false });

      if (!isVibeAdmin && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomerArtFiles(data || []);
    } catch (error) {
      console.error('Error fetching customer art files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    fetchCustomerArtFiles();
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

      fetchCustomerArtFiles();
    } catch (error) {
      console.error('Error deleting artwork:', error);
      toast({
        title: "Error",
        description: "Failed to delete artwork. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredFiles = customerArtFiles.filter(file =>
    file.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Customer Art Files</h2>
          <p className="text-muted-foreground text-sm">Upload and manage customer-provided artwork files</p>
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU or filename..."
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
        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
          <Button 
            variant={viewMode === "grid" ? "secondary" : "ghost"} 
            size="sm" 
            className="h-8" 
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button 
            variant={viewMode === "list" ? "secondary" : "ghost"} 
            size="sm" 
            className="h-8" 
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Total Customer Files</p>
          <p className="text-3xl font-bold mt-2">{customerArtFiles.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Unique SKUs</p>
          <p className="text-3xl font-bold mt-2">
            {new Set(customerArtFiles.map(f => f.sku)).size}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Recent Uploads (7 days)</p>
          <p className="text-3xl font-bold mt-2">
            {customerArtFiles.filter(f => {
              const uploadDate = new Date(f.created_at);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return uploadDate > weekAgo;
            }).length}
          </p>
        </Card>
      </div>

      {/* Files Grid/List */}
      {filteredFiles.length === 0 ? (
        <Card className="p-12 text-center">
          <FileImage className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="font-medium mb-2">No customer art files</p>
          <p className="text-sm text-muted-foreground mb-4">
            Upload customer-provided artwork to connect to products
          </p>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer Art
          </Button>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFiles.map((file) => (
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
                
                <Badge className="absolute top-2 left-2 bg-blue-600 text-white border-0">
                  Customer Art
                </Badge>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-base truncate" title={file.filename}>
                    {file.filename}
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono">SKU: {file.sku}</p>
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
      ) : (
        <Card className="overflow-hidden">
          <div className="bg-muted/50 border-b px-4 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase">
              <div className="col-span-1"></div>
              <div className="col-span-3">Filename</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-2">Uploaded</div>
              <div className="col-span-4">Actions</div>
            </div>
          </div>
          <div className="divide-y">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center"
              >
                <div className="col-span-1">
                  {file.preview_url ? (
                    <img src={file.preview_url} alt={file.filename} className="w-10 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <FileImage className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="col-span-3 font-medium text-sm truncate">{file.filename}</div>
                <div className="col-span-2 text-sm font-mono text-muted-foreground">{file.sku}</div>
                <div className="col-span-2 text-sm text-muted-foreground">
                  {new Date(file.created_at).toLocaleDateString()}
                </div>
                <div className="col-span-4 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedFile(file);
                      setPreviewDialogOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownload(file.artwork_url, file.filename)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setSelectedFile(file);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
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

      {/* Bulk Upload Dialog */}
      <BulkArtworkUploadDialog
        open={bulkUploadDialogOpen}
        onOpenChange={setBulkUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        restrictToCompany={companyFilter !== 'all' ? companyFilter : undefined}
      />

      {/* Artwork Viewer Dialog */}
      <ArtworkViewerDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        file={selectedFile}
        onDownload={handleDownload}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-lg mb-2">Delete Customer Art</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to permanently delete "{selectedFile?.filename}"? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default CustomerArtworkTab;
