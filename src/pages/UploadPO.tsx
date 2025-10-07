import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function UploadPO() {
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

      // Create submission record
      const { data: submission, error: insertError } = await supabase
        .from('po_submissions')
        .insert({
          customer_id: user.id,
          pdf_url: publicUrl,
          original_filename: selectedFile.name,
          status: 'pending_analysis'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      toast({
        title: "Upload successful",
        description: "Your PO is being analyzed...",
      });

      setUploading(false);
      setAnalyzing(true);

      // Trigger AI analysis
      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-po', {
        body: { submissionId: submission.id }
      });

      if (functionError) {
        console.error('Analysis error:', functionError);
        toast({
          title: "Analysis failed",
          description: "We'll process your PO manually",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Analysis complete",
          description: "Your PO has been submitted for approval",
        });
      }

      setAnalyzing(false);
      setSelectedFile(null);
      navigate('/my-pos');

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
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-6 w-6" />
            Upload Purchase Order
          </CardTitle>
          <CardDescription>
            Upload a PDF of your purchase order for automated processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors">
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
              'Submit Purchase Order'
            )}
          </Button>

          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">What happens next?</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Your PO is analyzed by AI to extract order details</li>
              <li>Our team reviews pricing and lead times</li>
              <li>You'll be notified once approved</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}