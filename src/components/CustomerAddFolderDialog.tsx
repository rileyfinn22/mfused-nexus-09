import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Loader2, Plus } from "lucide-react";
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
import { orderPickerGroupKey, type OrderPickerConfig } from "@/hooks/useCompanyPortalFeatures";

export interface FolderOption {
  id: string;
  name: string;
  brand_id: string | null;
  product_type: string | null;
}

interface CustomerAddFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  brands: ProductBrand[];
  config: OrderPickerConfig;
  /** The company's existing folders, so a brand + category that already has one reuses it. */
  folders: FolderOption[];
  /** Called with the folder the products went into. */
  onCreated: (folderId: string) => void;
}

const NEW_BRAND = "__new__";
const OTHER = "__other__";

/**
 * Buyer's top-level "Add products": pick (or create) a brand, pick a category, and the
 * products go into the matching folder — created if needed, named "<Brand> <Category>" by
 * default. Brand -> folder -> SKU is how the catalog is organised, so a loose product is
 * never created from here.
 */
export function CustomerAddFolderDialog({
  open,
  onOpenChange,
  companyId,
  brands,
  config,
  folders,
  onCreated,
}: CustomerAddFolderDialogProps) {
  const { toast } = useToast();
  const [brandId, setBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [kind, setKind] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderNameTouched, setFolderNameTouched] = useState(false);
  const [namesText, setNamesText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setBrandId("");
      setNewBrandName("");
      setKind("");
      setFolderName("");
      setFolderNameTouched(false);
      setNamesText("");
    }
  }, [open]);

  const wantsNewBrand = brandId === NEW_BRAND;
  const brandLabel = wantsNewBrand ? newBrandName.trim() : brands.find((b) => b.id === brandId)?.name ?? "";
  const group = config.groups.find((g) => g.key === kind);
  const kindLabel = kind === OTHER ? config.other_label : group?.label ?? "";
  const productType = group ? group.product_types[0] ?? null : null;

  // Existing folder for this brand + category (only for an existing brand). "Other" folders are
  // each their own thing, so one is reused only when the typed name matches it.
  const existingFolder = useMemo(() => {
    if (!brandId || wantsNewBrand || !kind) return null;
    const sameKind = folders.filter((f) => f.brand_id === brandId && orderPickerGroupKey(config, f.product_type) === kind);
    if (kind !== OTHER) return sameKind[0] ?? null;
    const typed = folderName.trim().toLowerCase();
    return typed ? sameKind.find((f) => f.name.trim().toLowerCase() === typed) ?? null : null;
  }, [folders, brandId, wantsNewBrand, kind, config, folderName]);

  // Boxes / Foils name the folder "<Brand> <Category>" until the user edits it. "Other" is a
  // real thing with its own name (inserts, labels, ...), so the customer must type it.
  const isOther = kind === OTHER;
  useEffect(() => {
    if (folderNameTouched) return;
    if (isOther) {
      setFolderName("");
      return;
    }
    setFolderName(brandLabel && kindLabel ? `${brandLabel} ${kindLabel}` : "");
  }, [brandLabel, kindLabel, folderNameTouched, isOther]);

  const names = useMemo(
    () =>
      Array.from(
        new Set(
          namesText
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
    [namesText]
  );

  const canSave =
    kind !== "" &&
    (wantsNewBrand ? newBrandName.trim().length > 0 : brandId !== "") &&
    (existingFolder && !isOther ? true : folderName.trim().length > 0);

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

      let folderId = existingFolder?.id ?? null;
      if (!folderId) {
        const { data, error } = await supabase.rpc("create_customer_template", {
          p_company_id: companyId,
          p_name: folderName.trim(),
          p_brand_id: resolvedBrandId,
          p_product_type: productType,
          p_description: null,
        });
        if (error) throw error;
        folderId = data as string;
      }

      const failed: string[] = [];
      for (const n of names) {
        const { error } = await supabase.rpc("create_customer_product", {
          p_company_id: companyId,
          p_name: n,
          p_brand_id: resolvedBrandId,
          p_product_type: productType,
          p_description: null,
          p_template_id: folderId,
        });
        if (error) {
          console.error("Could not add product", n, error);
          failed.push(n);
        }
      }

      const added = names.length - failed.length;
      toast({
        title: existingFolder ? `Added to ${existingFolder.name}` : `Folder ${folderName.trim()} created`,
        description:
          added > 0
            ? `${added} product${added === 1 ? "" : "s"} added.${failed.length ? ` Could not add: ${failed.join(", ")}` : ""}`
            : "Open the folder and use Quick Add to list its products.",
        variant: failed.length ? "destructive" : undefined,
      });
      onOpenChange(false);
      onCreated(folderId);
    } catch (error) {
      toast({
        title: "Could not add",
        description: (error as { message?: string })?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add products</DialogTitle>
          <DialogDescription>
            Choose the brand and category. Products go into that folder, and each name becomes its own SKU.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Brand <span className="text-destructive">*</span>
              </Label>
              <Select value={brandId} onValueChange={setBrandId}>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-folder-name">
              {isOther ? "What is it?" : "Folder"}
              {isOther && <span className="text-destructive"> *</span>}
            </Label>
            {existingFolder && !isOther ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <FolderPlus className="h-4 w-4 text-muted-foreground" />
                <span>
                  Adding to existing folder <span className="font-medium">{existingFolder.name}</span>
                </span>
              </div>
            ) : (
              <>
                <Input
                  id="cust-folder-name"
                  value={folderName}
                  onChange={(e) => {
                    setFolderNameTouched(true);
                    setFolderName(e.target.value);
                  }}
                  placeholder={isOther ? (brandLabel ? `e.g. ${brandLabel} Inserts` : "e.g. Dissolvd Inserts") : "e.g. Dissolvd Boxes"}
                  disabled={!brandLabel || !kind}
                />
                {isOther && existingFolder && (
                  <p className="text-xs text-muted-foreground">
                    Matches your existing folder <span className="font-medium">{existingFolder.name}</span>. Products will be added to it.
                  </p>
                )}
                {isOther && !existingFolder && (
                  <p className="text-xs text-muted-foreground">
                    This becomes a folder, so it can hold one SKU or several.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-folder-products">Products (one per line, optional)</Label>
            <Textarea
              id="cust-folder-products"
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Orange : DRIVE\nPink : RADIANT"}
              rows={5}
            />
            {names.length > 0 && (folderName.trim() || existingFolder) && (
              <p className="text-xs text-muted-foreground">
                Will be named "{(existingFolder?.name ?? folderName.trim())} - {names[0]}"
                {names.length > 1 ? ` and ${names.length - 1} more` : ""}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} type="button">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving} type="button">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {names.length > 0
              ? `Add ${names.length} ${names.length === 1 ? "product" : "products"}`
              : existingFolder
                ? "Open folder"
                : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerAddFolderDialog;
