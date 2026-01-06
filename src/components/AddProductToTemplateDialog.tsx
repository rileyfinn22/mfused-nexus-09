import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import { useQuickBooksAutoSync } from "@/hooks/useQuickBooksAutoSync";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
}

interface AddProductToTemplateDialogProps {
  template: ProductTemplate;
  companyId?: string;
  onProductsAdded: () => void;
}

export function AddProductToTemplateDialog({ 
  template, 
  companyId,
  onProductsAdded 
}: AddProductToTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [skuNames, setSkuNames] = useState("");
  const { syncProduct, checkConnection } = useQuickBooksAutoSync();

  const generateTempSKU = () => {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `VB-${randomDigits}`;
  };

  const handleAIParse = async () => {
    if (!skuNames.trim()) {
      toast.error("Please enter some text to parse");
      return;
    }

    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-product-names', {
        body: { text: skuNames }
      });

      if (error) throw error;

      if (data.products && data.products.length > 0) {
        setSkuNames(data.products.join('\n'));
        toast.success(`Found ${data.products.length} product names`);
      } else {
        toast.info("No product names found in the text");
      }
    } catch (error) {
      console.error('Error parsing product names:', error);
      toast.error("Failed to parse product names");
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    if (!companyId) {
      toast.error("Please select a company first");
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
            description: template.description,
            cost: template.cost,
            price: template.price,
            item_id: tempSKU,
            template_id: template.id,
            company_id: companyId
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Products
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Products to {template.name}</DialogTitle>
          <DialogDescription>
            Paste product names, order text, or emails - AI will extract product names automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-medium">{template.name}</p>
            <p className="text-muted-foreground whitespace-pre-line text-xs line-clamp-4">
              {template.description || 'No description'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="skuNames">Product Names <span className="text-destructive">*</span></Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={handleAIParse}
                disabled={parsing || !skuNames.trim()}
              >
                {parsing ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1.5" />
                )}
                AI Parse
              </Button>
            </div>
            <Textarea
              id="skuNames"
              value={skuNames}
              onChange={(e) => setSkuNames(e.target.value)}
              placeholder="Paste order text, emails, or product lists:&#10;&#10;Peach Halos - 1000&#10;Stars & Stripesicles - 1000&#10;Pink Burzt - 1000&#10;&#10;Or just enter product names separated by commas or new lines"
              rows={10}
              required
            />
            <p className="text-xs text-muted-foreground">
              {skuNames.split('\n').filter(n => n.trim()).length} line(s) • Click "AI Parse" to extract product names from pasted text
            </p>
          </div>

          <Button type="submit" disabled={loading || !companyId} className="w-full">
            {loading ? "Adding..." : "Add Products"}
          </Button>

          {!companyId && (
            <p className="text-xs text-destructive text-center">
              Please select a company from the filters to add products
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
