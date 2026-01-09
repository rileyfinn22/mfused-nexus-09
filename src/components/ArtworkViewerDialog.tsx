import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileImage, FileText, FileCode, CheckCircle, Clock } from "lucide-react";

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
}

interface ArtworkViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: ArtworkFile | null;
  onDownload: (url: string, filename: string) => void;
}

// File type categories
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const DESIGN_EXTENSIONS = /\.(ai|eps|psd|tif|tiff|indd|cdr)$/i;

const getFileType = (filename: string): 'image' | 'pdf' | 'design' | 'unknown' => {
  if (IMAGE_EXTENSIONS.test(filename)) return 'image';
  if (PDF_EXTENSION.test(filename)) return 'pdf';
  if (DESIGN_EXTENSIONS.test(filename)) return 'design';
  return 'unknown';
};

const getFileTypeLabel = (filename: string): string => {
  const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';
  return ext;
};

const ArtworkViewerDialog = ({
  open,
  onOpenChange,
  file,
  onDownload,
}: ArtworkViewerDialogProps) => {
  if (!file) return null;

  const fileType = getFileType(file.filename);
  const fileTypeLabel = getFileTypeLabel(file.filename);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {file.filename}
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
              </DialogTitle>
              <DialogDescription>
                SKU: {file.sku} • Uploaded: {new Date(file.created_at).toLocaleDateString()}
                {file.is_approved && file.approved_at && (
                  <span className="text-green-600 ml-2">
                    • Approved: {new Date(file.approved_at).toLocaleDateString()}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {/* Has preview URL - show it */}
          {file.preview_url ? (
            <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
              <img 
                src={file.preview_url} 
                alt={file.filename} 
                className="max-w-full max-h-[60vh] object-contain rounded"
                onError={(e) => {
                  console.log('Preview image failed to load:', file.preview_url);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ) : fileType === 'image' ? (
            /* Image files - display directly */
            <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
              <img 
                src={file.artwork_url} 
                alt={file.filename} 
                className="max-w-full max-h-[60vh] object-contain rounded"
                onError={(e) => {
                  console.log('Artwork image failed to load:', file.artwork_url);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ) : fileType === 'pdf' ? (
            /* PDF files - use object tag to prevent auto-download */
            <div className="w-full h-[60vh] bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center">
              <object
                data={file.artwork_url}
                type="application/pdf"
                className="w-full h-full"
              >
                {/* Fallback if PDF can't be displayed inline */}
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="h-24 w-24 text-muted-foreground mb-6" />
                  <h3 className="text-lg font-semibold mb-2">PDF Document</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    Your browser cannot display this PDF inline.
                  </p>
                  <Button 
                    size="lg"
                    onClick={() => onDownload(file.artwork_url, file.filename)}
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </object>
            </div>
          ) : (
            /* Design files (AI, EPS, PSD, etc.) - show placeholder */
            <div className="flex flex-col items-center justify-center py-16 bg-muted/30 rounded-lg">
              <div className="relative mb-6">
                <FileCode className="h-24 w-24 text-muted-foreground" />
                <Badge 
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground"
                >
                  {fileTypeLabel}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold mb-2">{fileTypeLabel} File</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                This file type cannot be previewed in the browser. 
                Please download to view in the appropriate application.
              </p>
              <Button 
                size="lg"
                onClick={() => onDownload(file.artwork_url, file.filename)}
              >
                <Download className="h-5 w-5 mr-2" />
                Download {fileTypeLabel} File
              </Button>
            </div>
          )}
        </div>

        {/* Footer with download button (always visible for convenience) */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {file.notes && (
              <span className="line-clamp-1" title={file.notes}>
                Notes: {file.notes}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => onDownload(file.artwork_url, file.filename)}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArtworkViewerDialog;

// Helper function to get thumbnail display for artwork cards
export const getArtworkThumbnail = (file: { 
  preview_url: string | null; 
  artwork_url: string; 
  filename: string 
}): { type: 'image' | 'placeholder'; src?: string; label?: string } => {
  // Has preview URL
  if (file.preview_url) {
    return { type: 'image', src: file.preview_url };
  }
  
  // Is an image file
  if (IMAGE_EXTENSIONS.test(file.filename)) {
    return { type: 'image', src: file.artwork_url };
  }
  
  // Is a design file - return placeholder with label
  const ext = file.filename.split('.').pop()?.toUpperCase() || 'FILE';
  return { type: 'placeholder', label: ext };
};
