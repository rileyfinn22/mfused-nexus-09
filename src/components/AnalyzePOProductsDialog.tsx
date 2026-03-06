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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Sparkles, Package, Check, FolderTree, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ExtractedProduct {
  name: string;
  description?: string;
  state?: string;
  cost?: number;
  product_type?: string;
  selected?: boolean;
  suggested_template?: string | null;
  template_id?: string | null;
  matchStatus?: 'existing' | 'new';
  existingProductId?: string | null;
  // Editable fields for new products
  editName?: string;
  editState?: string;
  editCost?: number | null;
  editDescription?: string;
  editProductType?: string;
  expanded?: boolean;
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

function normalizeName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
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
  const [inputMode, setInputMode] = useState<"pdf" | "text">("pdf");
  const [textInput, setTextInput] = useState<string>("");

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
    if (inputMode === "pdf" && !file) {
      toast({ title: "No file selected", description: "Please select a PDF file to analyze.", variant: "destructive" });
      return;
    }

    if (inputMode === "text" && !textInput.trim()) {
      toast({ title: "No text provided", description: "Please paste some text to analyze.", variant: "destructive" });
      return;
    }

    if (isVibeAdmin && !companyId) {
      toast({ title: "Company required", description: "Please select a company.", variant: "destructive" });
      return;
    }

    setAnalyzing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let response;
      
      if (inputMode === "pdf") {
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('company_id', companyId);
        if (analysisHint.trim()) {
          formData.append('analysis_hint', analysisHint.trim());
        }

        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-po-products`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session?.access_token}` },
            body: formData,
          }
        );
      } else {
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-po-products`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text_content: textInput.trim(),
              company_id: companyId,
              analysis_hint: analysisHint.trim() || undefined,
            }),
          }
        );
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze');
      }

      if (result.products && result.products.length > 0) {
        const returnedTemplates: Template[] = result.templates || [];
        setTemplates(returnedTemplates);

        // Fetch existing products for this company to detect repeats
        const { data: existingProducts } = await supabase
          .from('products')
          .select('id, name')
          .eq('company_id', companyId);

        const existingMap = new Map<string, string>();
        (existingProducts || []).forEach(p => {
          existingMap.set(normalizeName(p.name), p.id);
        });

        const normalizeTemplate = (value: string) =>
          (value || '')
            .toLowerCase()
            .replace(/\b(sleeves)\b/g, 'sleeve')
            .replace(/\b(bags)\b/g, 'bag')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        const productsWithStatus = result.products.map((p: ExtractedProduct) => {
          let matchedTemplateId: string | null = null;

          if (p.template_id) {
            matchedTemplateId = p.template_id;
          } else if (p.suggested_template) {
            const wanted = normalizeTemplate(p.suggested_template);
            let matchedTemplate = returnedTemplates.find(t => normalizeTemplate(t.name) === wanted);
            if (!matchedTemplate) {
              matchedTemplate = returnedTemplates.find(t => {
                const cand = normalizeTemplate(t.name);
                return cand.includes(wanted) || wanted.includes(cand);
              });
            }
            if (matchedTemplate) {
              matchedTemplateId = matchedTemplate.id;
            }
          }

          // Check if product already exists
          const normalized = normalizeName(p.name);
          const existingId = existingMap.get(normalized) || null;
          const isExisting = !!existingId;

          return {
            ...p,
            selected: !isExisting, // New items selected by default, existing unselected
            template_id: matchedTemplateId,
            matchStatus: isExisting ? 'existing' as const : 'new' as const,
            existingProductId: existingId,
            // Pre-fill editable fields for new items
            editName: p.name,
            editState: p.state || '',
            editCost: p.cost ?? null,
            editDescription: p.description || '',
            editProductType: p.product_type || '',
            expanded: false,
          };
        });

        setExtractedProducts(productsWithStatus);
        setCustomerName(result.customer_name);
        setStep("review");
        
        const newCount = productsWithStatus.filter((p: ExtractedProduct) => p.matchStatus === 'new').length;
        const existingCount = productsWithStatus.filter((p: ExtractedProduct) => p.matchStatus === 'existing').length;
        toast({
          title: "Analysis complete",
          description: `Found ${result.products.length} products: ${newCount} new, ${existingCount} already in catalog.`,
        });
      } else {
        toast({
          title: "No products found",
          description: "The AI couldn't extract any products from the input.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error analyzing:', error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze",
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

  const toggleExpanded = (index: number) => {
    setExtractedProducts(prev =>
      prev.map((p, i) => i === index ? { ...p, expanded: !p.expanded } : p)
    );
  };

  const updateEditField = (index: number, field: string, value: any) => {
    setExtractedProducts(prev =>
      prev.map((p, i) => i === index ? { ...p, [field]: value } : p)
    );
  };

  const stripAnyTemplatePrefix = (name: string, allTemplates: Template[], keepTemplateId?: string | null) => {
    let n = String(name || '').trim();
    if (!n) return n;

    for (const t of allTemplates) {
      if (keepTemplateId && t.id === keepTemplateId) continue;
      const prefix = `${t.name} - `;
      if (n.startsWith(prefix)) return n.slice(prefix.length).trim();
      // Also strip close variants (e.g. "AZ Sleeve - " vs template "AZ Sleeves")
      const baseNoS = t.name.replace(/s$/i, '');
      const variantPrefix = `${baseNoS} - `;
      if (n.toLowerCase().startsWith(variantPrefix.toLowerCase())) {
        return n.slice(variantPrefix.length).trim();
      }
    }
    return n;
  };

  const handleImport = async () => {
    const selectedProducts = extractedProducts.filter(p => p.selected);
    
    if (selectedProducts.length === 0) {
      toast({ title: "No products selected", description: "Please select at least one product to import.", variant: "destructive" });
      return;
    }

    setImporting(true);

    try {
      const productsToInsert = selectedProducts.map(p => {
        const selectedTemplate = p.template_id ? templates.find(t => t.id === p.template_id) : null;
        
        // Use edited fields for new products
        const productName = p.matchStatus === 'new' ? (p.editName || p.name) : p.name;
        const productState = p.matchStatus === 'new' ? (p.editState || p.state || null) : (p.state || null);
        const productCost = p.matchStatus === 'new' ? (p.editCost ?? p.cost ?? null) : (p.cost ?? null);
        const productDescription = p.matchStatus === 'new' ? (p.editDescription || p.description || null) : (p.description || null);
        const productType = p.matchStatus === 'new' ? (p.editProductType || p.product_type || null) : (p.product_type || null);
        
        let finalName = productName;
        if (selectedTemplate) {
          const templatePrefix = `${selectedTemplate.name} - `;
          if (!String(productName || '').startsWith(templatePrefix)) {
            const baseName = stripAnyTemplatePrefix(productName, templates, selectedTemplate.id);
            finalName = `${selectedTemplate.name} - ${baseName}`;
          }
        }
        
        return {
          company_id: companyId,
          name: finalName,
          description: selectedTemplate?.description || productDescription || null,
          state: selectedTemplate?.state || productState || null,
          cost: productCost || selectedTemplate?.cost || null,
          price: selectedTemplate?.price || null,
          product_type: productType || null,
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
    setInputMode("pdf");
    setTextInput("");
    if (!selectedCompanyId && isVibeAdmin) {
      setCompanyId("");
    }
  };

  const selectedCount = extractedProducts.filter(p => p.selected).length;
  const newCount = extractedProducts.filter(p => p.matchStatus === 'new').length;
  const existingCount = extractedProducts.filter(p => p.matchStatus === 'existing').length;
  const selectedNewCount = extractedProducts.filter(p => p.selected && p.matchStatus === 'new').length;

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
            Upload a PDF or paste text to extract products and assign them to templates.
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

            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "pdf" | "text")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pdf" className="flex items-center gap-1.5">
                  <FileUp className="h-4 w-4" />
                  PDF Upload
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Paste Text
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="pdf" className="mt-4">
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
              </TabsContent>
              
              <TabsContent value="text" className="mt-4">
                <div className="space-y-2">
                  <Label>Paste Product List</Label>
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste product names from email, order, or any text...&#10;&#10;Example:&#10;SKU-001 Blueberry Kush 1g Bag&#10;SKU-002 OG Cookie 2.5g Bag&#10;..."
                    className="min-h-[150px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste from emails, spreadsheets, or any text containing product names
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label>Template Matching Hint <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={analysisHint}
                onChange={(e) => setAnalysisHint(e.target.value)}
                placeholder="e.g., These are all AZ state products for 2pk Fatty Bags..."
                className="h-20 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Help the AI match products to the right templates
              </p>
            </div>

            <Button 
              onClick={handleAnalyze} 
              disabled={(inputMode === "pdf" ? !file : !textInput.trim()) || analyzing || (isVibeAdmin && !companyId)}
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
                  Analyze {inputMode === "pdf" ? "PO" : "Text"}
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
                  {existingCount} existing
                </Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                  {newCount} new
                </Badge>
                <span>· {selectedCount} selected</span>
              </div>
            </div>

            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="p-2 space-y-2">
                {extractedProducts.map((product, index) => (
                  <Card 
                    key={index}
                    className={`p-3 transition-colors ${
                      product.selected 
                        ? product.matchStatus === 'existing' 
                          ? 'border-green-300 bg-green-500/5 dark:border-green-700' 
                          : 'border-primary/50 bg-primary/5' 
                        : 'opacity-60'
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
                          {product.matchStatus === 'existing' ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 shrink-0 text-[10px] px-1.5 py-0">
                              Existing
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300 dark:text-orange-400 dark:border-orange-700 shrink-0 text-[10px] px-1.5 py-0">
                              New
                            </Badge>
                          )}
                        </div>

                        {product.matchStatus === 'existing' && !product.selected && (
                          <p className="text-xs text-muted-foreground italic">Already in your catalog</p>
                        )}
                        
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
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
                            value={product.template_id || "single"} 
                            onValueChange={(val) => updateProductTemplate(index, val === "single" ? null : val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign to template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">
                                <span className="flex items-center gap-1.5">
                                  <Package className="h-3 w-3" />
                                  Single Product (no template)
                                </span>
                              </SelectItem>
                              {templates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name} {template.state && `(${template.state})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {product.template_id ? (
                            <Check className="h-4 w-4 text-success shrink-0" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Single</span>
                          )}
                        </div>

                        {/* Inline edit for new products */}
                        {product.matchStatus === 'new' && product.selected && (
                          <Collapsible open={product.expanded} onOpenChange={() => toggleExpanded(index)}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                                {product.expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                                Edit details
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Name</Label>
                                  <Input
                                    value={product.editName || ''}
                                    onChange={(e) => updateEditField(index, 'editName', e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">State</Label>
                                  <Input
                                    value={product.editState || ''}
                                    onChange={(e) => updateEditField(index, 'editState', e.target.value)}
                                    className="h-7 text-xs"
                                    placeholder="e.g., AZ, CA"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Cost</Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={product.editCost ?? ''}
                                    onChange={(e) => updateEditField(index, 'editCost', e.target.value ? parseFloat(e.target.value) : null)}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Type</Label>
                                  <Input
                                    value={product.editProductType || ''}
                                    onChange={(e) => updateEditField(index, 'editProductType', e.target.value)}
                                    className="h-7 text-xs"
                                    placeholder="e.g., bag, sleeve"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Description</Label>
                                <Textarea
                                  value={product.editDescription || ''}
                                  onChange={(e) => updateEditField(index, 'editDescription', e.target.value)}
                                  className="h-14 text-xs resize-none"
                                />
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
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
                  <>Import {selectedCount} Products ({selectedNewCount} new)</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
