import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ProductBrand } from "@/hooks/useBrandFilter";
import type { OrderPickerConfig } from "@/hooks/useCompanyPortalFeatures";

export interface CustomerAddProductTemplate {
  id: string;
  name: string;
  brand_id: string | null;
  /** The kind the folder's products already have (products.product_type), if known. */
  product_type: string | null;
}

interface CustomerAddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  brands: ProductBrand[];
  /** Kinds (Boxes / Foils / Other) come from the company's order_picker config. */
  config: OrderPickerConfig;
  /**
   * When adding from inside a folder: brand and category are taken from the folder and the
   * product is filed straight into it.
   */
  template?: CustomerAddProductTemplate | null;
  /** Called after a product (and any new brand) is created so the caller can refetch. */
  onCreated: () => void;
}

const NEW_BRAND = "__new__";
const OTHER = "__other__";

/**
 * The buyer's own "Add product": name, brand, kind and description. Pricing, cost, vendor and
 * specs are VibePKG's to fill in afterwards, so they are deliberately not here. Creation goes
 * through the create_customer_product RPC (buyers have no insert grant on products).
 */
export function CustomerAddProductDialog({
  open,
  onOpenChange,
  companyId,
  brands,
  config,
  template,
  onCreated,
}: CustomerAddProductDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [kind, setKind] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const kindForType = (productType: string | null | undefined) => {
    const t = (productType || "").toLowerCase();
    if (!t) return "";
    const group = config.groups.find((g) => g.product_types.includes(t));
    return group ? group.key : OTHER;
  };

  useEffect(() => {
    if (!open) {
      setName("");
      setBrandId("");
      setNewBrandName("");
      setKind("");
      setDescription("");
      return;
    }
    // Opened from inside a folder: brand and category are the folder's.
    if (template) {
      setBrandId(template.brand_id || "");
      setKind(kindForType(template.product_type));
    }
  }, [open, template]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockedToTemplate = !!template;
  const wantsNewBrand = brandId === NEW_BRAND;
  const canSave =
    name.trim().length > 0 &&
    kind !== "" &&
    (wantsNewBrand ? newBrandName.trim().length > 0 : brandId !== "");

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let resolvedBrandId = brandId;

      if (wantsNewBrand) {
        const { data: brand, error: brandError } = await supabase
          .from("product_brands")
          .insert({ company_id: companyId, name: newBrandName.trim(), sort_order: brands.length + 1 })
          .select("id")
          .single();
        if (brandError) {
          const code = (brandError as { code?: string }).code;
          throw new Error(code === "23505" ? "A brand with that name already exists." : brandError.message);
        }
        resolvedBrandId = brand.id;
      }

      // The stored product_type is the first type the chosen group lists; "Other" stores none.
      const group = config.groups.find((g) => g.key === kind);
      const productType = group ? group.product_types[0] ?? null : null;

      const { error } = await supabase.rpc("create_customer_product", {
        p_company_id: companyId,
        p_name: name.trim(),
        p_brand_id: resolvedBrandId,
        p_product_type: productType,
        p_description: description.trim() || null,
        p_template_id: template?.id ?? null,
      });
      if (error) throw error;

      toast({
        title: "Product added",
        description: "VibePKG will add pricing and specs on their side.",
      });
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Could not add product",
        description: (error as { message?: string })?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{template ? `Add product to ${template.name}` : "Add product"}</DialogTitle>
          <DialogDescription>
            {template
              ? "One product per design, so each can be ordered in its own quantity. VibePKG adds pricing and specs afterwards."
              : "Tell us what it is and which brand it belongs to. VibePKG adds pricing and specs afterwards."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-product-name">
              Product name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cust-product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BPC-157 box"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>
              Brand <span className="text-destructive">*</span>
            </Label>
            <Select value={brandId} onValueChange={setBrandId} disabled={lockedToTemplate && !!template?.brand_id}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_BRAND}>
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> New brand
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {wantsNewBrand && (
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="New brand name"
                aria-label="New brand name"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Category <span className="text-destructive">*</span>
            </Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {config.groups.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.label}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>{config.other_label}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-product-description">Description</Label>
            <Textarea
              id="cust-product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Size, material, finish, anything VibePKG should know"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} type="button">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving} type="button">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerAddProductDialog;
