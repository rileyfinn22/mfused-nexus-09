import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  FileArchive, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle,
  Loader2,
  Check,
  ChevronsUpDown,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { generatePdfThumbnailFromArrayBuffer } from "@/lib/pdfThumbnail";
import { toast } from "sonner";

interface BulkArtworkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  restrictToCompany?: string;
  defaultArtworkType?: 'customer' | 'vibe_proof';
}

interface Company {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
}

interface MatchResult {
  filename: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  suggestedSku: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  tempStoragePath?: string | null;
  // User selections
  selectedProductId: string | null;
  selectedSku: string | null;
  include: boolean;
}

const BulkArtworkUploadDialog = ({
  open,
  onOpenChange,
  onSuccess,
  restrictToCompany,
  defaultArtworkType = 'vibe_proof',
}: BulkArtworkUploadDialogProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(restrictToCompany || '');
  const [templateId, setTemplateId] = useState('');
  
  // Processing states
  const [step, setStep] = useState<'upload' | 'review' | 'uploading' | 'done'>('upload');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (open) {
      checkRole();
      fetchCompanies();
      setStep('upload');
      setZipFile(null);
      setMatches([]);
      setBatchId(null);
      setUploadProgress(0);
      setUploadedCount(0);
      setTemplateId('');
    }
  }, [open]);

  useEffect(() => {
    if (companyId) {
      fetchTemplates();
      fetchProducts();
      setTemplateId('');
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchProducts();
    }
  }, [templateId]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    setIsVibeAdmin(userRole?.role === 'vibe_admin');
    setUserCompanyId(userRole?.company_id || null);

    if (userRole?.role !== 'vibe_admin' && userRole?.company_id) {
      setCompanyId(userRole.company_id);
    }
  };

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setCompanies(data);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('product_templates')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name');
    if (data) setTemplates(data);
  };

  const fetchProducts = async () => {
    let query = supabase
      .from('products')
      .select('id, name, item_id')
      .eq('company_id', companyId);
    
    if (templateId) {
      query = query.eq('template_id', templateId);
    }
    
    const { data } = await query.order('name');
    if (data) setProducts(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      setZipFile(file);
    } else {
      toast.error('Please select a ZIP file');
    }
  };

  const handleProcessZip = async () => {
    if (!zipFile || !companyId || !templateId) return;

    setProcessing(true);

    try {
      const formData = new FormData();
      formData.append('zipFile', zipFile);
      formData.append('companyId', companyId);
      formData.append('templateId', templateId);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('parse-artwork-zip', {
        body: formData,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to process zip');
      }

      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error || 'Processing failed');
      }

      // Transform matches to include user selection fields
      const matchResults: MatchResult[] = data.matches.map((m: any) => ({
        ...m,
        selectedProductId: m.suggestedProductId,
        selectedSku: m.suggestedSku,
        include: m.confidence !== 'none' && m.tempStoragePath, // Auto-include if matched AND uploaded
      }));

      setMatches(matchResults);
      setBatchId(data.batchId);
      setStep('review');

      toast.success(`Found ${data.totalFiles} artwork files, ${data.uploadedFiles} uploaded to temp storage`);

    } catch (error: any) {
      console.error('Error processing zip:', error);
      toast.error(error.message || 'Failed to process zip file');
    } finally {
      setProcessing(false);
    }
  };

  const handleProductChange = (filename: string, productId: string | null) => {
    setMatches(prev => prev.map(m => {
      if (m.filename === filename) {
        const product = products.find(p => p.id === productId);
        return {
          ...m,
          selectedProductId: productId,
          selectedSku: product?.item_id || null,
        };
      }
      return m;
    }));
  };

  const handleIncludeChange = (filename: string, include: boolean) => {
    setMatches(prev => prev.map(m => 
      m.filename === filename ? { ...m, include } : m
    ));
  };

  const handleUploadAll = async () => {
    const toUpload = matches.filter(m => m.include && m.selectedProductId && m.selectedSku && m.tempStoragePath);
    
    if (toUpload.length === 0) {
      toast.error('No files selected for upload');
      return;
    }

    setStep('uploading');
    setUploadProgress(0);
    setUploadedCount(0);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Please log in');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < toUpload.length; i++) {
      const match = toUpload[i];
      
      try {
        if (!match.tempStoragePath) {
          throw new Error('No temp storage path available');
        }

        // Download file from temp storage
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('artwork')
          .download(match.tempStoragePath);

        if (downloadError || !fileBlob) {
          throw new Error(`Failed to download from temp: ${downloadError?.message}`);
        }

        const fileExt = (match.filename.split('.').pop() || '').toLowerCase();
        const isPdf = fileExt === 'pdf';

        // Upload to final storage location
        const storagePath = `${match.selectedSku}/${Date.now()}-${match.filename}`;

        const { error: uploadError } = await supabase.storage
          .from('artwork')
          .upload(storagePath, fileBlob);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('artwork')
          .getPublicUrl(storagePath);

        // Auto-generate PDF thumbnail (first page) for better browsing
        let previewUrl: string | null = null;
        if (isPdf) {
          try {
            const arrayBuffer = await fileBlob.arrayBuffer();
            const thumbBlob = await generatePdfThumbnailFromArrayBuffer(arrayBuffer, { maxWidth: 700 });
            const previewPath = `${match.selectedSku}/preview-${Date.now()}.png`;

            const { error: previewError } = await supabase.storage
              .from('artwork')
              .upload(previewPath, thumbBlob, { contentType: 'image/png' });

            if (!previewError) {
              const { data: { publicUrl: thumbUrl } } = supabase.storage
                .from('artwork')
                .getPublicUrl(previewPath);
              previewUrl = thumbUrl;
            }
          } catch (e) {
            console.warn('Failed to generate PDF thumbnail for', match.filename, e);
          }
        }

        // Create database record
        const { error: insertError } = await supabase
          .from('artwork_files')
          .insert({
            sku: match.selectedSku!.toUpperCase(),
            artwork_url: publicUrl,
            preview_url: previewUrl,
            filename: match.filename,
            artwork_type: defaultArtworkType,
            is_approved: false,
            company_id: companyId,
          });

        if (insertError) throw insertError;

        // Clean up temp file after successful upload
        await supabase.storage
          .from('artwork')
          .remove([match.tempStoragePath]);

        successCount++;
      } catch (error) {
        console.error(`Error uploading ${match.filename}:`, error);
        errorCount++;
      }

      setUploadProgress(Math.round(((i + 1) / toUpload.length) * 100));
      setUploadedCount(i + 1);
    }

    setStep('done');

    if (errorCount === 0) {
      toast.success(`Successfully uploaded ${successCount} artwork files`);
    } else {
      toast.warning(`Uploaded ${successCount} files, ${errorCount} failed`);
    }

    onSuccess?.();
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge className="bg-green-600 text-white">High Match</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 text-white">Medium Match</Badge>;
      case 'low':
        return <Badge variant="secondary">Low Match</Badge>;
      default:
        return <Badge variant="outline">No Match</Badge>;
    }
  };

  const showCompanySelect = isVibeAdmin && !restrictToCompany;
  const includedCount = matches.filter(m => m.include && m.selectedProductId && m.selectedSku).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            AI Bulk Artwork Upload
          </DialogTitle>
          <DialogDescription>
            Upload a ZIP file with artwork and AI will match files to products
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4 py-4">
            {showCompanySelect && (
              <div className="space-y-2">
                <Label>Company *</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {companyId && (
              <div className="space-y-2">
                <Label>Template *</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template (e.g. Vape Bags)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI will only match files to products within this template
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>ZIP File *</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                {zipFile ? (
                  <div className="space-y-2">
                    <FileArchive className="h-12 w-12 mx-auto text-primary" />
                    <p className="font-medium">{zipFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setZipFile(null)}>
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Drop a ZIP file here or click to browse
                    </p>
                    <Input
                      type="file"
                      accept=".zip"
                      onChange={handleFileSelect}
                      className="max-w-xs mx-auto"
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, AI, EPS, PSD, JPG, PNG, GIF, TIF, SVG
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleProcessZip} 
                disabled={!zipFile || !companyId || !templateId || processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Process with AI
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Review AI matches and adjust as needed. {includedCount} of {matches.length} files ready to upload.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  setMatches(prev => prev.map(m => ({ ...m, include: m.confidence !== 'none' })));
                }}>
                  Select All Matched
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  setMatches(prev => prev.map(m => ({ ...m, include: false })));
                }}>
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden" style={{ height: '400px' }}>
              <ScrollArea className="h-[400px]">
                <div className="divide-y">
                  {matches.map((match) => (
                    <MatchRow 
                      key={match.filename}
                      match={match}
                      products={products}
                      onProductChange={handleProductChange}
                      onIncludeChange={handleIncludeChange}
                      getConfidenceBadge={getConfidenceBadge}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleUploadAll} disabled={includedCount === 0}>
                <Upload className="h-4 w-4 mr-2" />
                Upload {includedCount} Files
              </Button>
            </div>
          </div>
        )}

        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="py-8 space-y-6 text-center">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div className="space-y-2">
              <p className="font-medium">Uploading artwork files...</p>
              <p className="text-sm text-muted-foreground">
                {uploadedCount} of {matches.filter(m => m.include).length} files
              </p>
            </div>
            <div className="w-full max-w-md mx-auto bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="py-8 space-y-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
            <div className="space-y-2">
              <p className="font-medium text-lg">Upload Complete!</p>
              <p className="text-sm text-muted-foreground">
                {uploadedCount} artwork files have been uploaded
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Separate component for each match row
const MatchRow = ({ 
  match, 
  products, 
  onProductChange, 
  onIncludeChange,
  getConfidenceBadge 
}: { 
  match: MatchResult;
  products: Product[];
  onProductChange: (filename: string, productId: string | null) => void;
  onIncludeChange: (filename: string, include: boolean) => void;
  getConfidenceBadge: (confidence: string) => JSX.Element;
}) => {
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const selectedProduct = products.find(p => p.id === match.selectedProductId);

  return (
    <div className={cn(
      "p-4 flex items-center gap-4",
      !match.include && "opacity-50"
    )}>
      <Checkbox
        checked={match.include}
        onCheckedChange={(checked) => onIncludeChange(match.filename, !!checked)}
        disabled={!match.selectedProductId || !match.selectedSku}
      />
      
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-sm truncate" title={match.filename}>
          {match.filename}
        </p>
        <div className="flex items-center gap-2">
          {getConfidenceBadge(match.confidence)}
          <span className="text-xs text-muted-foreground truncate">
            {match.reason}
          </span>
        </div>
      </div>

      <div className="w-64">
        <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "w-full justify-between text-left",
                !match.selectedProductId && "text-muted-foreground"
              )}
            >
              <span className="truncate">
                {selectedProduct?.name || "Select product..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command shouldFilter={true}>
              <CommandInput placeholder="Search products..." className="h-10" />
              <CommandList className="max-h-[200px] overflow-y-auto">
                <CommandEmpty>No products found.</CommandEmpty>
                <CommandGroup>
                  {products.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={`${product.item_id || ''} ${product.name}`}
                      onSelect={() => {
                        onProductChange(match.filename, product.id);
                        setProductPopoverOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 flex-shrink-0",
                          match.selectedProductId === product.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{product.name}</span>
                        {product.item_id && (
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {product.item_id}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {match.selectedSku ? (
        <Badge variant="secondary" className="font-mono w-24 justify-center">
          {match.selectedSku}
        </Badge>
      ) : (
        <Badge variant="outline" className="w-24 justify-center text-destructive">
          No SKU
        </Badge>
      )}
    </div>
  );
};

export default BulkArtworkUploadDialog;
