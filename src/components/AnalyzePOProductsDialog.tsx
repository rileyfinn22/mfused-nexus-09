import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Sparkles, Package, Check, FolderTree } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExtractedProduct {
  item_id: string;
  name: string;
  description?: string;
  state?: string;
  cost?: number;
  product_type?: string;
  selected?: boolean;
  suggested_template?: string | null;
  template_id?: string | null;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  state?: string | null;
  price?: number | null;
  cost?: number | null;
}

interface AnalyzePOProductsDialogProps {
  onProductsAdded: () => void;
  selectedCompanyId?: string;
}

export function AnalyzePOProductsDialog({ onProductsAdded, selectedCompanyId }: AnalyzePOProductsDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [analysisHint, setAnalysisHint] = useState<string>("");

  useEffect(() => {
    checkVibeAdmin();
  }, []);

  useEffect(() => {
    if (isVibeAdmin && open) {
      fetchCompanies();
    }
  }, [isVibeAdmin, open]);

  useEffect(() => {
    if (selectedCompanyId) {
      setCompanyId(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const checkVibeAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setIsVibeAdmin(data.role === 'vibe_admin');
      if (data.role !== 'vibe_admin') {
        setCompanyId(data.company_id);
      }
    }
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .neq('name', 'VibePKG')
      .order('name');

    if (!error && data) {
      setCompanies(data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a PDF file to analyze.",
        variant: "destructive",
      });
      return;
    }

    if (isVibeAdmin && !companyId) {
      toast({
        title: "Company required",
        description: "Please select a company.",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId);
      if (analysisHint.trim()) {
        formData.append('analysis_hint', analysisHint.trim());
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-po-products`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze PO');
      }

      if (result.products && result.products.length > 0) {
        // Store templates from the response
        const returnedTemplates: Template[] = result.templates || [];
        setTemplates(returnedTemplates);

        // Match suggested templates to actual template IDs
        const productsWithTemplates = result.products.map((p: ExtractedProduct) => {
          let matchedTemplateId: string | null = null;
          
          if (p.suggested_template) {
            const matchedTemplate = returnedTemplates.find(
              t => t.name.toLowerCase() === p.suggested_template?.toLowerCase()
            );
            if (matchedTemplate) {
              matchedTemplateId = matchedTemplate.id;
            }
          }
          
          return { 
            ...p, 
            selected: true,
            template_id: matchedTemplateId
          };
        });

        setExtractedProducts(productsWithTemplates);
        setCustomerName(result.customer_name);
        setStep("review");
        
        const matchedCount = productsWithTemplates.filter((p: ExtractedProduct) => p.template_id).length;
        toast({
          title: "Analysis complete",
          description: `Found ${result.products.length} products. ${matchedCount} matched to templates.`,
        });
      } else {
        toast({
          title: "No products found",
          description: "The AI couldn't extract any products from this PO.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error analyzing PO:', error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze PO",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleProductSelection = (index: number) => {
    setExtractedProducts(prev => 
      prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p)
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setExtractedProducts(prev => prev.map(p => ({ ...p, selected: checked })));
  };

  const updateProductTemplate = (index: number, templateId: string | null) => {
    setExtractedProducts(prev =>
      prev.map((p, i) => i === index ? { ...p, template_id: templateId } : p)
    );
  };

  const handleImport = async () => {
    const selectedProducts = extractedProducts.filter(p => p.selected);
    
    if (selectedProducts.length === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to import.",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);

    try {
      // Create products with template associations
      const productsToInsert = selectedProducts.map(p => {
        // If a template is selected, get the template's state
        const selectedTemplate = p.template_id ? templates.find(t => t.id === p.template_id) : null;
        
        return {
          company_id: companyId,
          item_id: p.item_id || null,
          name: p.name,
          description: p.description || selectedTemplate?.description || null,
          state: p.state || selectedTemplate?.state || null,
          cost: p.cost || selectedTemplate?.cost || null,
          price: selectedTemplate?.price || null,
          product_type: p.product_type || null,
          template_id: p.template_id || null,
        };
      });

      const { error } = await supabase.from('products').insert(productsToInsert);

      if (error) throw error;

      const withTemplate = selectedProducts.filter(p => p.template_id).length;
      toast({
        title: "Products imported",
        description: `Imported ${selectedProducts.length} products. ${withTemplate} added to templates.`,
      });

      onProductsAdded();
      handleClose();
    } catch (error) {
      console.error('Error importing products:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import products",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setExtractedProducts([]);
    setTemplates([]);
    setCustomerName(null);
    setStep("upload");
    setAnalysisHint("");
    if (!selectedCompanyId && isVibeAdmin) {
      setCompanyId("");
    }
  };

  const selectedCount = extractedProducts.filter(p => p.selected).length;
  const templatedCount = extractedProducts.filter(p => p.selected && p.template_id).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-1.5" />
          AI Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Product Import
          </DialogTitle>
          <DialogDescription>
            Upload a PO (PDF) to extract products and assign them to templates.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4 py-4">
            {isVibeAdmin && (
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

            <div className="space-y-2">
              <Label>Purchase Order PDF</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="po-file-upload"
                />
                <label htmlFor="po-file-upload" className="cursor-pointer">
                  <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  {file ? (
                    <p className="text-sm font-medium">{file.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Click to upload PDF</p>
                      <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Template Matching Hint <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                value={analysisHint}
                onChange={(e) => setAnalysisHint(e.target.value)}
                placeholder="e.g., These are all AZ state products for 2pk Fatty Bags..."
                className="w-full h-20 px-3 py-2 text-sm border rounded-md resize-none bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Help the AI match products to the right templates
              </p>
            </div>

            <Button 
              onClick={handleAnalyze} 
              disabled={!file || analyzing || (isVibeAdmin && !companyId)}
              className="w-full"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze PO
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {customerName && (
              <div className="text-sm text-muted-foreground">
                Customer: <span className="font-medium text-foreground">{customerName}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === extractedProducts.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm">Select all</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedCount} selected · {templatedCount} with templates
              </div>
            </div>

            <ScrollArea className="h-[350px] border rounded-lg">
              <div className="p-2 space-y-2">
                {extractedProducts.map((product, index) => (
                  <Card 
                    key={index}
                    className={`p-3 transition-colors ${
                      product.selected ? 'border-primary/50 bg-primary/5' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={product.selected}
                        onCheckedChange={() => toggleProductSelection(index)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{product.name}</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {product.item_id && (
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{product.item_id}</span>
                          )}
                          {product.state && (
                            <span className="bg-muted px-1.5 py-0.5 rounded">{product.state}</span>
                          )}
                          {product.cost !== undefined && product.cost !== null && (
                            <span>${product.cost.toFixed(3)}</span>
                          )}
                          {product.product_type && (
                            <span className="capitalize">{product.product_type}</span>
                          )}
                        </div>

                        {/* Template dropdown */}
                        <div className="flex items-center gap-2">
                          <FolderTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Select 
                            value={product.template_id || "none"} 
                            onValueChange={(val) => updateProductTemplate(index, val === "none" ? null : val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign to template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                <span className="text-muted-foreground">No template</span>
                              </SelectItem>
                              {templates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name} {template.state && `(${template.state})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {product.template_id && (
                            <Check className="h-4 w-4 text-success shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={selectedCount === 0 || importing}
                className="flex-1"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>Import {selectedCount} Products</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
