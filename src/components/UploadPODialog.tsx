import { useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export function UploadPODialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please log in to upload purchase orders",
          variant: "destructive",
        });
        navigate('/login');
        return;
      }

      // Upload to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('po-documents')
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('po-documents')
        .getPublicUrl(fileName);

      // Get user's company
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole?.company_id) {
        throw new Error('User not associated with a company');
      }

      toast({
        title: "Upload successful",
        description: "Your PO is being analyzed...",
      });

      setUploading(false);
      setAnalyzing(true);

      // Trigger AI analysis
      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-po', {
        body: { 
          pdfUrl: publicUrl,
          companyId: userRole.company_id,
          userId: user.id,
          filename: selectedFile.name
        }
      });

      if (functionError) {
        console.error('Analysis error:', functionError);
        toast({
          title: "Analysis failed",
          description: "Creating order with manual entry",
          variant: "destructive",
        });
      } else if (functionData?.orderId) {
        toast({
          title: "Order created successfully",
          description: "Your PO has been analyzed and order created",
        });
        
        // Navigate to the created order
        navigate(`/orders/${functionData.orderId}`);
      }

      setAnalyzing(false);
      setSelectedFile(null);
      setOpen(false);

    } catch (error) {
      console.error('Error uploading PO:', error);
      toast({
        title: "Upload failed",
        description: "Please try again",
        variant: "destructive",
      });
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Upload PO
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Purchase Order
          </DialogTitle>
          <DialogDescription>
            Upload a PDF of your purchase order to automatically create an order
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="po-upload"
              disabled={uploading || analyzing}
            />
            <label htmlFor="po-upload" className="cursor-pointer block">
              {selectedFile ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-primary" />
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Click to change file
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="font-medium">Click to upload PDF</p>
                  <p className="text-sm text-muted-foreground">
                    or drag and drop your purchase order here
                  </p>
                </div>
              )}
            </label>
          </div>

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || analyzing}
            className="w-full"
            size="lg"
          >
            {uploading || analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploading ? 'Uploading...' : 'Analyzing...'}
              </>
            ) : (
              'Create Order from PO'
            )}
          </Button>

          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">What happens next?</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Your PO is analyzed by AI to extract order details</li>
              <li>An order is automatically created with the extracted data</li>
              <li>You can review and edit the order details</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
