import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CustomerAddProductTemplate } from "@/components/CustomerAddProductDialog";

interface CustomerQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  template: CustomerAddProductTemplate;
  onCreated: () => void;
}

/**
 * Buyer's Quick Add inside a folder: one product name per line, every one filed into this
 * folder with its brand and kind. Mirrors the admin Quick Add naming ("<folder> - <name>",
 * applied server-side by create_customer_product).
 */
export function CustomerQuickAddDialog({ open, onOpenChange, companyId, template, onCreated }: CustomerQuickAddDialogProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  const names = useMemo(
    () =>
      Array.from(
        new Set(
          text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [text]
  );

  const previewName = (n: string) =>
    n.toLowerCase().startsWith(template.name.toLowerCase()) ? n : `${template.name} - ${n}`;

  const handleAdd = async () => {
    if (names.length === 0 || !template.brand_id) return;
    setSaving(true);
    const failed: string[] = [];
    try {
      for (const n of names) {
        const { error } = await supabase.rpc("create_customer_product", {
          p_company_id: companyId,
          p_name: n,
          p_brand_id: template.brand_id,
          p_product_type: template.product_type,
          p_description: null,
          p_template_id: template.id,
        });
        if (error) {
          console.error("Quick add failed for", n, error);
          failed.push(n);
        }
      }
      const added = names.length - failed.length;
      if (added > 0) {
        toast({
          title: `${added} product${added === 1 ? "" : "s"} added to ${template.name}`,
          description: failed.length ? `Could not add: ${failed.join(", ")}` : "VibePKG will add pricing and specs on their side.",
          variant: failed.length ? "destructive" : undefined,
        });
        onOpenChange(false);
        onCreated();
      } else {
        toast({ title: "Could not add products", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick add to {template.name}</DialogTitle>
          <DialogDescription>
            One product per line. Each becomes its own SKU in this folder, so each can be ordered in its own quantity.
          </DialogDescription>
        </DialogHeader>

        {!template.brand_id ? (
          <p className="text-sm text-destructive">This folder has no brand yet. Set one under Manage brands first.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cust-quick-add">Product names</Label>
              <Textarea
                id="cust-quick-add"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Orange : DRIVE\nPink : RADIANT\nBlue : FOCUS"}
                rows={6}
                autoFocus
              />
            </div>
            {names.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                <p className="text-muted-foreground mb-1">Will be created as:</p>
                {names.map((n) => (
                  <p key={n} className="font-medium truncate">
                    {previewName(n)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={saving || names.length === 0 || !template.brand_id}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add {names.length > 0 ? names.length : ""} {names.length === 1 ? "product" : "products"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerQuickAddDialog;
