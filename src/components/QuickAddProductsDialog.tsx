import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  state: string | null;
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
  
  // Manual fields for when no template is selected
  const [manualState, setManualState] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");
  const [manualCost, setManualCost] = useState<string>("");

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
        .select('id, name, description, price, cost, company_id, state')
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
    
    // If no template selected, require manual state
    if (!selectedTemplate && !manualState) {
      toast.error("Please select a state when not using a template");
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

      // Use template values if selected, otherwise use manual values
      const productDescription = selectedTemplate?.description || null;
      const productCost = selectedTemplate?.cost ?? (manualCost ? parseFloat(manualCost) : null);
      const productPrice = selectedTemplate?.price ?? (manualPrice ? parseFloat(manualPrice) : null);
      const productState = selectedTemplate?.state || manualState;

      for (const name of names) {
        const tempSKU = generateTempSKU();

        const { data: product, error: productError } = await supabase
          .from('products')
          .insert({
            name: name,
            description: productDescription,
            cost: productCost,
            price: productPrice,
            state: productState,
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
      setManualState("");
      setManualPrice("");
      setManualCost("");
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
            Optionally select a template, or manually set state and pricing. Enter product names (one per line) to bulk create.
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
            <Label htmlFor="template">Product Template (Optional)</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template or leave empty" />
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
              <div className="flex gap-4 pt-2 border-t border-border mt-2 flex-wrap">
                {selectedTemplate.price && (
                  <p><span className="text-muted-foreground">Price:</span> ${Number(selectedTemplate.price).toFixed(3)}</p>
                )}
                {isVibeAdmin && selectedTemplate.cost && (
                  <p><span className="text-muted-foreground">Cost:</span> ${Number(selectedTemplate.cost).toFixed(3)}</p>
                )}
                {selectedTemplate.state && (
                  <p><span className="text-muted-foreground">State:</span> {selectedTemplate.state}</p>
                )}
              </div>
            </div>
          )}

          {/* Manual fields when no template selected */}
          {!selectedTemplate && (
            <div className="space-y-4 p-3 border border-border rounded-lg bg-muted/30">
              <p className="text-sm text-muted-foreground font-medium">Manual Product Settings</p>
              
              <div className="space-y-2">
                <Label htmlFor="manualState">State <span className="text-destructive">*</span></Label>
                <Select
                  value={manualState}
                  onValueChange={setManualState}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General (All States)</SelectItem>
                    <SelectItem value="WA">Washington</SelectItem>
                    <SelectItem value="AZ">Arizona</SelectItem>
                    <SelectItem value="NY">New York</SelectItem>
                    <SelectItem value="CA">California</SelectItem>
                    <SelectItem value="MD">Maryland</SelectItem>
                    <SelectItem value="MO">Missouri</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manualPrice">Price (Optional)</Label>
                  <Input
                    id="manualPrice"
                    type="number"
                    step="0.001"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
                {isVibeAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="manualCost">Cost (Optional)</Label>
                    <Input
                      id="manualCost"
                      type="number"
                      step="0.001"
                      value={manualCost}
                      onChange={(e) => setManualCost(e.target.value)}
                      placeholder="0.000"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="skuNames">Product Names <span className="text-destructive">*</span></Label>
            <Textarea
              id="skuNames"
              value={skuNames}
              onChange={(e) => setSkuNames(e.target.value)}
              placeholder="Enter product names, one per line:&#10;Mfused Bag - Blue Dream&#10;Mfused Bag - OG Kush&#10;Mfused Bag - Gelato"
              rows={6}
              required
            />
            <p className="text-xs text-muted-foreground">
              {skuNames.split('\n').filter(n => n.trim()).length} product(s) will be created
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={loading || (isVibeAdmin && !companyId) || (!selectedTemplate && !manualState)} 
            className="w-full"
          >
            {loading ? "Adding..." : "Add Products"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
