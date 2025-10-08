import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  ArrowLeft,
  FileImage,
  XCircle,
  Download,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RejectedArchive = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [rejectedFiles, setRejectedFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchRejectedArtwork();
  }, []);

  const fetchRejectedArtwork = async () => {
    try {
      const { data, error } = await supabase
        .from('rejected_artwork_files')
        .select('*')
        .order('rejected_at', { ascending: false });

      if (error) throw error;
      setRejectedFiles(data || []);
    } catch (error) {
      console.error('Error fetching rejected artwork:', error);
      toast({
        title: "Error",
        description: "Failed to load rejected artwork files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

  const filteredFiles = rejectedFiles.filter(file => {
    const matchesSearch = file.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         file.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/artwork')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Artwork
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <XCircle className="h-8 w-8 text-destructive" />
              Rejected Archive
            </h1>
            <p className="text-muted-foreground mt-1">View all rejected artwork files</p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Rejected</p>
          <p className="text-3xl font-bold mt-2 text-destructive">{rejectedFiles.length}</p>
        </div>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Unique SKUs</p>
          <p className="text-3xl font-bold mt-2">
            {new Set(rejectedFiles.map(f => f.sku)).size}
          </p>
        </div>
        <div className="bg-card border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">This Month</p>
          <p className="text-3xl font-bold mt-2">
            {rejectedFiles.filter(f => {
              const rejectedDate = new Date(f.rejected_at);
              const now = new Date();
              return rejectedDate.getMonth() === now.getMonth() && 
                     rejectedDate.getFullYear() === now.getFullYear();
            }).length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search rejected artwork..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Rejected Files Grid */}
      <div className="grid gap-4">
        {filteredFiles.map((file) => (
          <div key={file.id} className="bg-card border border-destructive/20 rounded-lg p-6">
            <div className="flex items-start gap-4">
              {/* Thumbnail Image */}
              <div className="relative w-32 h-32 flex-shrink-0 bg-muted rounded-lg overflow-hidden border">
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
              </div>

              {/* File Details */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{file.filename}</h3>
                  <Badge variant="destructive" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <p className="text-muted-foreground">SKU</p>
                    <p className="font-mono font-medium">{file.sku}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Rejected Date</p>
                    <p className="text-destructive">{new Date(file.rejected_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Originally Uploaded</p>
                    <p>{new Date(file.original_created_at).toLocaleDateString()}</p>
                  </div>
                  {file.rejection_reason && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Rejection Reason</p>
                      <p className="whitespace-pre-wrap text-destructive">{file.rejection_reason}</p>
                    </div>
                  )}
                  {file.notes && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Original Notes</p>
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
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setSelectedFile(file);
                    setPreviewDialogOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredFiles.length === 0 && (
        <div className="text-center py-12 bg-card border rounded-lg">
          <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No rejected artwork files found</p>
          <p className="text-muted-foreground">
            {searchQuery 
              ? 'Try adjusting your search'
              : 'No artwork has been rejected yet'
            }
          </p>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedFile?.filename}</DialogTitle>
            <DialogDescription>
              SKU: {selectedFile?.sku} • Rejected: {selectedFile?.rejected_at && new Date(selectedFile.rejected_at).toLocaleDateString()}
            </DialogDescription>
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
    </div>
  );
};

export default RejectedArchive;
