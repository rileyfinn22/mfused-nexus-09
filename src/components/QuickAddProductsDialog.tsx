import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";

interface QuickAddProductsDialogProps {
  onProductsAdded: () => void;
  selectedCompanyId?: string;
}

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
}

export function QuickAddProductsDialog({ onProductsAdded, selectedCompanyId }: QuickAddProductsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [skuNames, setSkuNames] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companyId, setCompanyId] = useState<string>(selectedCompanyId || "");
  const { syncProduct, checkConnection } = useQuickBooksAutoSync();

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  useEffect(() => {
    if (open) {
      checkRole();
      fetchTemplates();
    }
  }, [open]);

  useEffect(() => {
    if (selectedCompanyId) {
      setCompanyId(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    const vibeAdmin = userRole?.role === 'vibe_admin';
    setIsVibeAdmin(vibeAdmin);
    
    if (vibeAdmin) {
      fetchCompanies();
    } else if (userRole?.company_id) {
      setCompanyId(userRole.company_id);
    }
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setCompanies(data);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('product_templates')
        .select('id, name, description, price, cost, company_id')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const generateTempSKU = () => {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `VB-${randomDigits}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }

    const names = skuNames
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (names.length === 0) {
      toast.error("Please enter at least one product name");
      return;
    }

    if (names.length > 100) {
      toast.error("Maximum 100 products at a time");
      return;
    }

    const finalCompanyId = isVibeAdmin ? companyId : companyId;
    
    if (!finalCompanyId) {
      toast.error("Please select a company");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const createdProducts: string[] = [];

      for (const name of names) {
        const tempSKU = generateTempSKU();

        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            name: name,
            description: selectedTemplate.description,
            cost: selectedTemplate.cost,
            price: selectedTemplate.price,
            item_id: tempSKU,
            company_id: finalCompanyId
          })
          .select()
          .single();

        if (productError) {
          console.error('Error creating product:', productError);
          continue;
        }

        createdProducts.push(product.id);
      }

      // Auto-sync to QuickBooks if connected
      const isConnected = await checkConnection();
      if (isConnected && createdProducts.length > 0) {
        for (const productId of createdProducts) {
          await syncProduct(productId);
        }
      }

      toast.success(`Successfully added ${createdProducts.length} products`);
      
      setOpen(false);
      setSkuNames("");
      setSelectedTemplateId("");
      if (!selectedCompanyId) setCompanyId("");
      onProductsAdded();
    } catch (error) {
      console.error('Error adding products:', error);
      toast.error("Failed to add products");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Zap className="mr-2 h-4 w-4" />
          Quick Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Add Products</DialogTitle>
          <DialogDescription>
            Select a product template, then enter multiple product names (one per line) to bulk create products with the template's description and price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company selection for vibe_admin */}
          {isVibeAdmin && (
            <div className="space-y-2">
              <Label htmlFor="company">Company <span className="text-destructive">*</span></Label>
              <Select
                value={companyId}
                onValueChange={setCompanyId}
                required
              >
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
            <Label htmlFor="template">Product Template <span className="text-destructive">*</span></Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a product template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium">{selectedTemplate.name}</p>
              <p className="text-muted-foreground whitespace-pre-line text-xs">{selectedTemplate.description || 'No description'}</p>
              {(selectedTemplate.price || selectedTemplate.cost) && (
                <div className="flex gap-4 pt-2 border-t border-border mt-2">
                  {selectedTemplate.price && (
                    <p><span className="text-muted-foreground">Price:</span> ${Number(selectedTemplate.price).toFixed(3)}</p>
                  )}
                  {isVibeAdmin && selectedTemplate.cost && (
                    <p><span className="text-muted-foreground">Cost:</span> ${Number(selectedTemplate.cost).toFixed(3)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="skuNames">Product Names <span className="text-destructive">*</span></Label>
            <Textarea
              id="skuNames"
              value={skuNames}
              onChange={(e) => setSkuNames(e.target.value)}
              placeholder="Enter product names, one per line:&#10;Mfused Bag - Blue Dream&#10;Mfused Bag - OG Kush&#10;Mfused Bag - Gelato"
              rows={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              {skuNames.split('\n').filter(n => n.trim()).length} product(s) will be created
            </p>
          </div>

          <Button type="submit" disabled={loading || !selectedTemplateId || (isVibeAdmin && !companyId)} className="w-full">
            {loading ? "Adding..." : "Add Products"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
