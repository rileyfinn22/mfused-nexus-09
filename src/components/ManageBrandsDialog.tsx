import { useCallback, useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 *
 * Self-contained: loads the company's templates and loose products itself, so any page
 * (Products, Artwork, ...) can open it without owning that data.
 */
export function ManageBrandsDialog({
  open,
  onOpenChange,
  companyId,
  brands,
  onChanged,
}: ManageBrandsDialogProps) {
  const { toast } = useToast();
  const [newBrandName, setNewBrandName] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<ProductBrand | null>(null);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<BrandAssignableTemplate[]>([]);
  const [looseProducts, setLooseProducts] = useState<BrandAssignableProduct[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const [{ data: t, error: tErr }, { data: p, error: pErr }] = await Promise.all([
        supabase.from("product_templates").select("id, name, brand_id").eq("company_id", companyId).order("name"),
        supabase
          .from("products")
          .select("id, name, item_id, brand_id")
          .eq("company_id", companyId)
          .is("template_id", null)
          .order("name")
          .limit(5000),
      ]);
      if (tErr) throw tErr;
      if (pErr) throw pErr;
      setTemplates((t as BrandAssignableTemplate[]) || []);
      setLooseProducts((p as BrandAssignableProduct[]) || []);
    } catch (error) {
      console.error("Error loading items for brand assignment:", error);
    } finally {
      setLoadingItems(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (open) {
      loadItems();
    } else {
      setNewBrandName("");
      setSearch("");
      setDraftNames({});
    }
  }, [open, loadItems]);

  const changed = () => {
    loadItems();
    onChanged();
  };

  const describeError = (error: unknown, fallback: string) => {
    if (isUniqueViolation(error)) return "A brand with that name already exists.";
    const message = (error as { message?: string })?.message;
    return message || fallback;
  };

  const clearDraft = (id: string) =>
    setDraftNames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

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
      changed();
    } catch (error) {
      toast({ title: "Could not add brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (brand: ProductBrand) => {
    const draft = (draftNames[brand.id] ?? brand.name).trim();
    if (!draft || draft === brand.name) {
      clearDraft(brand.id);
      return;
    }
    setBusyId(brand.id);
    try {
      const { error } = await supabase.from("product_brands").update({ name: draft }).eq("id", brand.id);
      if (error) throw error;
      clearDraft(brand.id);
      changed();
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
      changed();
    } catch (error) {
      toast({ title: "Could not remove brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const assign = async (kind: "template" | "product", id: string, value: string) => {
    setBusyId(id);
    try {
      const brandId = value === NONE ? null : value;
      const { error } =
        kind === "template"
          ? await supabase.rpc("set_template_brand", { p_template_id: id, p_brand_id: brandId })
          : await supabase.rpc("set_product_brand", { p_product_id: id, p_brand_id: brandId });
      if (error) throw error;
      changed();
    } catch (error) {
      toast({ title: "Could not assign brand", description: describeError(error, "Please try again."), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visibleBrands = q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;
  const visibleTemplates = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  const visibleProducts = q
    ? looseProducts.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.item_id && p.item_id.toLowerCase().includes(q))
      )
    : looseProducts;

  const countFor = (brandId: string) =>
    templates.filter((t) => t.brand_id === brandId).length + looseProducts.filter((p) => p.brand_id === brandId).length;

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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Brands</DialogTitle>
            <DialogDescription>
              The brands you order packaging for. Products, artwork and the order picker can be filtered to one brand.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search brands, templates or products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Tabs defaultValue="brands" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="self-start">
              <TabsTrigger value="brands">Brands ({brands.length})</TabsTrigger>
              <TabsTrigger value="assign" disabled={brands.length === 0}>
                Assignments ({templates.length + looseProducts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="brands" className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="New brand name"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                />
                <Button onClick={handleCreate} disabled={creating || !newBrandName.trim()} type="button">
                  {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Add
                </Button>
              </div>

              {brands.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No brands yet.</p>
              ) : visibleBrands.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No brand matches that search.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {visibleBrands.map((brand) => {
                    const n = countFor(brand.id);
                    return (
                      <div key={brand.id} className="flex items-center gap-3 px-3 py-2">
                        <Input
                          value={draftNames[brand.id] ?? brand.name}
                          onChange={(e) => setDraftNames((prev) => ({ ...prev, [brand.id]: e.target.value }))}
                          onBlur={() => handleRename(brand)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                            if (e.key === "Escape") clearDraft(brand.id);
                          }}
                          className="h-8 flex-1 border-transparent bg-transparent px-2 hover:border-input focus:border-input"
                          disabled={busyId === brand.id}
                          aria-label={`Rename ${brand.name}`}
                        />
                        <span className="text-xs text-muted-foreground tabular-nums w-24 text-right shrink-0">
                          {n} {n === 1 ? "item" : "items"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => setBrandToDelete(brand)}
                          disabled={busyId === brand.id}
                          title="Remove brand"
                          type="button"
                        >
                          {busyId === brand.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Click a name to rename it. Removing a brand never deletes products or artwork.</p>
            </TabsContent>

            <TabsContent value="assign" className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-3">
              {loadingItems && templates.length === 0 && looseProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
              ) : visibleTemplates.length === 0 && visibleProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {q ? "Nothing matches that search." : "No templates or products to assign yet."}
                </p>
              ) : (
                <div className="rounded-md border divide-y">
                  {visibleTemplates.map((template) => (
                    <div key={template.id} className="flex items-center gap-3 px-3 py-2">
                      <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{template.name}</p>
                        <p className="text-xs text-muted-foreground">Template</p>
                      </div>
                      {brandSelect(template.brand_id, (v) => assign("template", template.id, v), busyId === template.id)}
                    </div>
                  ))}
                  {visibleProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 px-3 py-2">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{product.item_id || "No SKU"}</p>
                      </div>
                      {brandSelect(product.brand_id, (v) => assign("product", product.id, v), busyId === product.id)}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Products inside a template take the template's brand.</p>
            </TabsContent>
          </Tabs>
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
