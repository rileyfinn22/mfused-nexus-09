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

interface TemplateProduct {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  cost: number | null;
  price: number | null;
  preferred_vendor_id: string | null;
  company_id: string;
}

export function QuickAddProductsDialog({ onProductsAdded, selectedCompanyId }: QuickAddProductsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<TemplateProduct[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [skuNames, setSkuNames] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companyId, setCompanyId] = useState<string>(selectedCompanyId || "");
  const { syncProduct, checkConnection } = useQuickBooksAutoSync();

  const selectedTemplate = products.find(p => p.id === selectedTemplateId);

  useEffect(() => {
    if (open) {
      checkRole();
    }
  }, [open]);

  useEffect(() => {
    if (selectedCompanyId) {
      setCompanyId(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (open && (companyId || !isVibeAdmin)) {
      fetchProducts();
    }
  }, [open, companyId, isVibeAdmin]);

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

  const fetchProducts = async () => {
    try {
      let query = supabase
        .from('products')
        .select('id, name, description, state, cost, price, preferred_vendor_id, company_id')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const generateTempSKU = () => {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `VB-${randomDigits}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTemplate) {
      toast.error("Please select a template product");
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

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const finalCompanyId = isVibeAdmin ? companyId : selectedTemplate.company_id;
      
      if (!finalCompanyId) {
        toast.error("Please select a company");
        setLoading(false);
        return;
      }

      const createdProducts: string[] = [];

      for (const name of names) {
        const tempSKU = generateTempSKU();

        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            name: name,
            description: selectedTemplate.description,
            state: selectedTemplate.state,
            cost: selectedTemplate.cost,
            price: selectedTemplate.price,
            preferred_vendor_id: selectedTemplate.preferred_vendor_id,
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
            Select a template product, then enter multiple product names (one per line) to bulk create products with the same description and price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company selection for vibe_admin */}
          {isVibeAdmin && (
            <div className="space-y-2">
              <Label htmlFor="company">Company <span className="text-destructive">*</span></Label>
              <Select
                value={companyId}
                onValueChange={(value) => {
                  setCompanyId(value);
                  setSelectedTemplateId("");
                }}
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
            <Label htmlFor="template">Template Product <span className="text-destructive">*</span></Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              required
              disabled={isVibeAdmin && !companyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a product as template" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isVibeAdmin && !companyId && (
              <p className="text-xs text-muted-foreground">Select a company first</p>
            )}
          </div>

          {selectedTemplate && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Description:</span> {selectedTemplate.description || 'None'}</p>
              <p><span className="text-muted-foreground">State:</span> {selectedTemplate.state || 'None'}</p>
              <p><span className="text-muted-foreground">Price:</span> {selectedTemplate.price ? `$${selectedTemplate.price.toFixed(3)}` : 'None'}</p>
              {isVibeAdmin && (
                <p><span className="text-muted-foreground">Cost:</span> {selectedTemplate.cost ? `$${selectedTemplate.cost.toFixed(3)}` : 'None'}</p>
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

          <Button type="submit" disabled={loading || !selectedTemplateId} className="w-full">
            {loading ? "Adding..." : "Add Products"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
