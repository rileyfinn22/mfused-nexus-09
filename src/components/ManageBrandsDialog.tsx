import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Search, Layers, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ProductBrand } from "@/hooks/useBrandFilter";

export interface BrandAssignableTemplate {
  id: string;
  name: string;
  brand_id: string | null;
}

export interface BrandAssignableProduct {
  id: string;
  name: string;
  item_id: string | null;
  brand_id: string | null;
}

interface ManageBrandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  brands: ProductBrand[];
  /** Templates belonging to `companyId`. Their products follow the template's brand. */
  templates: BrandAssignableTemplate[];
  /** Products with no template; they carry a brand of their own. */
  looseProducts: BrandAssignableProduct[];
  /** Called after any brand row or assignment changes so the caller can refetch. */
  onChanged: () => void;
}

const NONE = "__none__";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";

/**
 * Brands are the client's own catalog organisation, so company members and vibe admins get
 * the same controls here. Creating, renaming and deleting go straight to product_brands under
 * RLS; assigning goes through the set_template_brand / set_product_brand RPCs because buyers
 * have no update grant on products or templates.
 */
export function ManageBrandsDialog({
  open,
  onOpenChange,
  companyId,
  brands,
  templates,
  looseProducts,
  onChanged,
}: ManageBrandsDialogProps) {
  const { toast } = useToast();
  const [newBrandName, setNewBrandName] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<ProductBrand | null>(null);
  const [assignSearch, setAssignSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setNewBrandName("");
      setAssignSearch("");
      setDraftNames({});
    }
  }, [open]);

  const describeError = (error: unknown, fallback: string) => {
    if (isUniqueViolation(error)) return "A brand with that name already exists.";
    const message = (error as { message?: string })?.message;
    return message || fallback;
  };

  const handleCreate = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { error } = await supabase
        .from("product_brands")
        .insert({ company_id: companyId, name, sort_order: brands.length + 1 });
      if (error) throw error;
      setNewBrandName("");
      onChanged();
    } catch (error) {
      toast({ title: "Could not add brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (brand: ProductBrand) => {
    const draft = (draftNames[brand.id] ?? brand.name).trim();
    if (!draft || draft === brand.name) {
      setDraftNames((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
      return;
    }
    setBusyId(brand.id);
    try {
      const { error } = await supabase.from("product_brands").update({ name: draft }).eq("id", brand.id);
      if (error) throw error;
      setDraftNames((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
      onChanged();
    } catch (error) {
      toast({ title: "Could not rename brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!brandToDelete) return;
    setBusyId(brandToDelete.id);
    try {
      const { error } = await supabase.from("product_brands").delete().eq("id", brandToDelete.id);
      if (error) throw error;
      toast({ title: "Brand removed", description: `Products that were in ${brandToDelete.name} are now unbranded.` });
      setBrandToDelete(null);
      onChanged();
    } catch (error) {
      toast({ title: "Could not remove brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const assignTemplate = async (templateId: string, value: string) => {
    setBusyId(templateId);
    try {
      const { error } = await supabase.rpc("set_template_brand", {
        p_template_id: templateId,
        p_brand_id: value === NONE ? null : value,
      });
      if (error) throw error;
      onChanged();
    } catch (error) {
      toast({ title: "Could not assign brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const assignProduct = async (productId: string, value: string) => {
    setBusyId(productId);
    try {
      const { error } = await supabase.rpc("set_product_brand", {
        p_product_id: productId,
        p_brand_id: value === NONE ? null : value,
      });
      if (error) throw error;
      onChanged();
    } catch (error) {
      toast({ title: "Could not assign brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const q = assignSearch.trim().toLowerCase();
  const visibleTemplates = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  const visibleProducts = q
    ? looseProducts.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.item_id && p.item_id.toLowerCase().includes(q))
      )
    : looseProducts;
  const showAssignSearch = templates.length + looseProducts.length > 8;

  const brandSelect = (value: string | null, onValueChange: (v: string) => void, disabled: boolean) => (
    <Select value={value ?? NONE} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-44 text-xs">
        <SelectValue placeholder="No brand" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No brand</SelectItem>
        {brands.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Brands</DialogTitle>
            <DialogDescription>
              Group your catalog by the brand it is made for. Products, artwork and the order picker can
              then be narrowed to one brand at a time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            {/* Brand list */}
            <section className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your brands</Label>

              {brands.length === 0 ? (
                <p className="text-sm text-muted-foreground">No brands yet. Add the first one below.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {brands.map((brand) => (
                    <div key={brand.id} className="flex items-center gap-2 px-3 py-2">
                      <Input
                        value={draftNames[brand.id] ?? brand.name}
                        onChange={(e) => setDraftNames((prev) => ({ ...prev, [brand.id]: e.target.value }))}
                        onBlur={() => handleRename(brand)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === "Escape") {
                            setDraftNames((prev) => {
                              const next = { ...prev };
                              delete next[brand.id];
                              return next;
                            });
                          }
                        }}
                        className="h-8 flex-1"
                        disabled={busyId === brand.id}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setBrandToDelete(brand)}
                        disabled={busyId === brand.id}
                        title="Remove brand"
                        type="button"
                      >
                        {busyId === brand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="New brand name, e.g. Curapeptix"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  className="h-9"
                />
                <Button onClick={handleCreate} disabled={creating || !newBrandName.trim()} type="button">
                  {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Add
                </Button>
              </div>
            </section>

            {/* Assignment */}
            {brands.length > 0 && (templates.length > 0 || looseProducts.length > 0) && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Assign to brands</Label>
                  {showAssignSearch && (
                    <div className="relative w-56">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Find a template or product"
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                {visibleTemplates.length > 0 && (
                  <div className="rounded-md border divide-y">
                    {visibleTemplates.map((template) => (
                      <div key={template.id} className="flex items-center gap-3 px-3 py-2">
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{template.name}</p>
                          <p className="text-xs text-muted-foreground">Template. Its products follow this brand.</p>
                        </div>
                        {brandSelect(template.brand_id, (v) => assignTemplate(template.id, v), busyId === template.id)}
                      </div>
                    ))}
                  </div>
                )}

                {visibleProducts.length > 0 && (
                  <div className="rounded-md border divide-y">
                    {visibleProducts.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 px-3 py-2">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{product.item_id || "No SKU"}</p>
                        </div>
                        {brandSelect(product.brand_id, (v) => assignProduct(product.id, v), busyId === product.id)}
                      </div>
                    ))}
                  </div>
                )}

                {visibleTemplates.length === 0 && visibleProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing matches that search.</p>
                )}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!brandToDelete} onOpenChange={(o) => !o && setBrandToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {brandToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              No products or artwork are deleted. Anything in this brand simply becomes unbranded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ManageBrandsDialog;
