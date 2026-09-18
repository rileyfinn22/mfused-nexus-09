import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Plus,
  AlertTriangle,
  Edit,
  Trash2,
  Package,
  LayoutGrid,
  List,
  Layers,
  Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "@/components/AddProductDialog";
import { AnalyzePOProductsDialog } from "@/components/AnalyzePOProductsDialog";
import { QuickAddProductsDialog } from "@/components/QuickAddProductsDialog";
import { TemplateProductsView } from "@/components/TemplateProductsView";
import { AssignTemplateDropdown } from "@/components/AssignTemplateDropdown";
import SignedImage from "@/components/SignedImage";
import { useToast } from "@/hooks/use-toast";
import { isLegacyGeneratedTemplateMockupUrl, isUsableArtworkPreviewUrl } from "@/lib/artworkPreview";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { getCached, setCached } from "@/lib/pageCache";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { BrandSelect } from "@/components/BrandSelect";
import { ManageBrandsDialog } from "@/components/ManageBrandsDialog";
import { KindSelect } from "@/components/KindSelect";
import { CustomerAddProductDialog, type CustomerAddProductTemplate } from "@/components/CustomerAddProductDialog";
import { CustomerQuickAddDialog } from "@/components/CustomerQuickAddDialog";
import { CustomerAddFolderDialog } from "@/components/CustomerAddFolderDialog";
import { useCompanyPortalFeatures } from "@/hooks/useCompanyPortalFeatures";
import { useKindFilter } from "@/hooks/useKindFilter";

interface Product {
  id: string;
  name: string;
  description: string | null;
  state: string;
  cost: number | null;
  price: number | null;
  image_url: string | null;
  item_id?: string | null;
  customer_item_id?: string | null;
  sku?: string;
  states: ProductState[];
  template_id?: string | null;
  brand_id?: string | null;
  product_type?: string | null;
}

interface ProductState {
  id: string;
  state: string;
  specs: string | null;
  artwork_status: string;
  status: string;
}

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
  thumbnail_url: string | null;
  state: string | null;
  brand_id?: string | null;
  product_type?: string | null;
  product_count?: number;
}

const Products = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompanyId, isVibeAdmin } = useActiveCompany();
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [artworkStatus, setArtworkStatus] = useState<Record<string, boolean>>({});
  const [artworkThumbnails, setArtworkThumbnails] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [companies, setCompanies] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);

  // Brands are per company: a customer's active company, or the company a vibe admin filtered to.
  const brandCompanyId = isVibeAdmin ? (companyFilter !== 'all' ? companyFilter : null) : activeCompanyId;
  const {
    brands,
    refresh: refreshBrands,
    brandFilter,
    setBrandFilter,
    matches: matchesBrand,
    brandName,
  } = useBrandFilter(brandCompanyId);
  const [manageBrandsOpen, setManageBrandsOpen] = useState(false);
  // Kind filter (Boxes / Foils / Other) only for companies with order_picker groups configured.
  const { orderPicker: kindConfig } = useCompanyPortalFeatures(brandCompanyId);
  const { kindFilter, setKindFilter, matches: matchesKind, matchesAny: matchesAnyKind } = useKindFilter(brandCompanyId, kindConfig);
  // Buyers of brand-organised catalogs may add their own products (name, brand, kind, description).
  const [customerAddOpen, setCustomerAddOpen] = useState(false);
  // Set when "Add product" was opened from a folder, so brand/kind are pre-filled and it files there.
  const [customerAddTemplate, setCustomerAddTemplate] = useState<CustomerAddProductTemplate | null>(null);
  const [templateRefreshToken, setTemplateRefreshToken] = useState(0);
  const [customerQuickAddOpen, setCustomerQuickAddOpen] = useState(false);
  // Top-level "Add products": brand + category -> folder (created or reused) -> SKUs.
  const [customerFolderOpen, setCustomerFolderOpen] = useState(false);
  const canCustomerAddProduct = !isVibeAdmin && !!kindConfig && !!brandCompanyId;

  // A folder's kind: its own product_type, else the most common type of what it holds.
  const templateProductType = (template: ProductTemplate): string | null => {
    if (template.product_type) return template.product_type;
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      if (p.template_id === template.id && p.product_type) {
        counts[p.product_type] = (counts[p.product_type] || 0) + 1;
      }
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  };

  const templateForCustomerAdd = (template: ProductTemplate): CustomerAddProductTemplate => ({
    id: template.id,
    name: template.name,
    brand_id: template.brand_id ?? null,
    product_type: templateProductType(template),
  });

  const openCustomerAdd = (template: ProductTemplate | null) => {
    setCustomerAddTemplate(template ? templateForCustomerAdd(template) : null);
    setCustomerAddOpen(true);
  };

  const afterCustomerCreate = () => {
    refreshBrands();
    fetchProducts();
    fetchTemplates();
    setTemplateRefreshToken((n) => n + 1);
  };

  // Template edit dialog (for vibe admins)
  const [templateEditOpen, setTemplateEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [templateEditBrandId, setTemplateEditBrandId] = useState("");
  const [templateEditName, setTemplateEditName] = useState("");
  const [templateEditDescription, setTemplateEditDescription] = useState("");
  const [templateEditPrice, setTemplateEditPrice] = useState("");
  const [templateEditCost, setTemplateEditCost] = useState("");
  const [templateEditState, setTemplateEditState] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  // Create template dialog (for vibe admins)
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplatePrice, setNewTemplatePrice] = useState("");
  const [newTemplateCost, setNewTemplateCost] = useState("");
  const [newTemplateState, setNewTemplateState] = useState("");
  const [newTemplateCompanyId, setNewTemplateCompanyId] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Duplicate template dialog
  const [duplicateTemplateOpen, setDuplicateTemplateOpen] = useState(false);
  const [templateToDuplicate, setTemplateToDuplicate] = useState<ProductTemplate | null>(null);
  const [duplicateTargetCompanyId, setDuplicateTargetCompanyId] = useState("");
  const [duplicateTemplateLoading, setDuplicateTemplateLoading] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // Open template from URL param (e.g. after editing a product)
  useEffect(() => {
    const templateParam = searchParams.get('template');
    if (templateParam && templates.length > 0 && !selectedTemplate) {
      const found = templates.find(t => t.id === templateParam);
      if (found) {
        setSelectedTemplate(found);
        // Clear the param so it doesn't re-trigger
        searchParams.delete('template');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [templates, searchParams]);

  useEffect(() => {
    fetchProducts();
    fetchTemplates();
    fetchArtworkMetadata();
    if (isVibeAdmin) {
      fetchCompanies();
    }
  }, [isVibeAdmin, companyFilter, activeCompanyId]);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCompanies(data);
    }
  };

  // Cache scope: the company being viewed. Hydrating from the cache means a return visit
  // shows the last result at once while the fetch below refreshes it.
  const cacheScope = isVibeAdmin ? `admin:${companyFilter}` : `company:${activeCompanyId ?? ''}`;

  const fetchProducts = async () => {
    // Don't fetch until we have an active company (prevents showing all companies' data)
    if (!isVibeAdmin && !activeCompanyId) return;

    const cachedProducts = getCached<Product[]>(`products:list:${cacheScope}`);
    if (cachedProducts) {
      setProducts(cachedProducts);
      setLoading(false);
    }

    try {
      // Companion rows come back embedded in the same request. This used to be dozens of
      // extra chunked round-trips (product_states / inventory / product_costs).
      let query = supabase
        .from('products')
        .select('*, product_states(*), inventory(sku), product_costs(cost)')
        .order('created_at', { ascending: false })
        .limit(50000);

      // For vibe admins: use URL company filter if set
      // For regular users: always filter by their active company
      if (isVibeAdmin) {
        if (companyFilter !== 'all') {
          query = query.eq('company_id', companyFilter);
        }
      } else {
        query = query.eq('company_id', activeCompanyId);
      }

      const { data: productsData, error: productsError } = await query;

      if (productsError) throw productsError;

      const productCostMap: Record<string, number | null> = {};
      const statesByProduct = new Map<string, any[]>();
      const skuByProduct = new Map<string, string>();
      (productsData || []).forEach((p: any) => {
        const costRow = Array.isArray(p.product_costs) ? p.product_costs[0] : p.product_costs;
        productCostMap[p.id] = costRow?.cost ?? null;
        statesByProduct.set(p.id, p.product_states || []);
        const invRow = (p.inventory || []).find((row: any) => row?.sku);
        if (invRow) skuByProduct.set(p.id, invRow.sku);
      });



      const productsWithStates = (productsData || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        state: product.state,
        cost: productCostMap[product.id] ?? null,
        price: product.price,
        image_url: product.image_url,
        item_id: product.item_id,
        sku: skuByProduct.get(product.id),
        states: statesByProduct.get(product.id) || [],
        template_id: product.template_id,
        brand_id: product.brand_id ?? null,
        product_type: product.product_type ?? null,
      }));

      setProducts(productsWithStates);
      setCached(`products:list:${cacheScope}`, productsWithStates);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    if (!isVibeAdmin && !activeCompanyId) return;

    const cachedTemplates = getCached<ProductTemplate[]>(`products:templates:${cacheScope}`);
    if (cachedTemplates) setTemplates(cachedTemplates);

    try {
      let templatesQuery = supabase
        .from('product_templates')
        .select('*');

      if (isVibeAdmin) {
        if (companyFilter !== 'all') {
          templatesQuery = templatesQuery.or(`company_id.eq.${companyFilter},company_id.is.null`);
        }
      } else if (activeCompanyId) {
        templatesQuery = templatesQuery.or(`company_id.eq.${activeCompanyId},company_id.is.null`);
      }

      const { data: templatesData, error: templatesError } = await templatesQuery.order('name');

      if (templatesError) throw templatesError;

      // Product counts per template. Template IDs are chunked (long `in.(...)` filters
      // 400 out) and an explicit high limit avoids the default 1000-row cap.
      const templateIds = (templatesData || []).map((t: any) => t.id);
      const chunkIds = (arr: string[], size = 150): string[][] => {
        const out: string[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };
      const templateIdChunks = chunkIds(templateIds);

      // Template cost moved to companion table product_template_costs
      const templateCostMap: Record<string, number | null> = {};
      if (templateIds.length > 0) {
        const costChunks = await Promise.all(
          templateIdChunks.map(async (ids) => {
            const { data } = await (supabase as any)
              .from('product_template_costs')
              .select('template_id, cost')
              .in('template_id', ids)
              .limit(100000);
            return data || [];
          })
        );
        costChunks.flat().forEach((row: any) => {
          templateCostMap[row.template_id] = row.cost;
        });
      }

      // Per-folder SKU counts used to be one HEAD request per template (146 of them for the
      // admin view). fetchProducts already loads every product in scope, so the counts are
      // derived from that list at render time instead (see templateCounts below).
      const templatesWithCounts = (templatesData || []).map((template: any) => ({
        ...template,
        cost: templateCostMap[template.id] ?? null,
      }));

      setTemplates(templatesWithCounts);
      setCached(`products:templates:${cacheScope}`, templatesWithCounts);

    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchArtworkMetadata = async () => {
    const cachedArt = getCached<{ status: Record<string, boolean>; thumbs: Record<string, string> }>(`products:art:${cacheScope}`);
    if (cachedArt) {
      setArtworkStatus(cachedArt.status);
      setArtworkThumbnails(cachedArt.thumbs);
    }
    try {
      let artQuery = supabase
        .from('artwork_files')
        .select('sku, filename, preview_url, artwork_url, is_approved')
        .order('is_approved', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50000);
      // Only the company being viewed; this used to pull every company's rows on each visit.
      if (isVibeAdmin) {
        if (companyFilter !== 'all') artQuery = artQuery.eq('company_id', companyFilter);
      } else if (activeCompanyId) {
        artQuery = artQuery.eq('company_id', activeCompanyId);
      }
      const { data, error } = await artQuery;

      if (error) throw error;

      const statusMap: Record<string, boolean> = {};
      const thumbnailMap: Record<string, string> = {};
      data?.forEach((artwork) => {
        if (!statusMap[artwork.sku] || artwork.is_approved) {
          statusMap[artwork.sku] = artwork.is_approved;
        }

        if (thumbnailMap[artwork.sku]) return;

        if (isUsableArtworkPreviewUrl(artwork.filename, artwork.preview_url)) {
          thumbnailMap[artwork.sku] = artwork.preview_url;
          return;
        }

        if (artwork.artwork_url) {
          thumbnailMap[artwork.sku] = artwork.artwork_url;
        }
      });
      setArtworkStatus(statusMap);
      setArtworkThumbnails(thumbnailMap);
      setCached(`products:art:${cacheScope}`, { status: statusMap, thumbs: thumbnailMap });
    } catch (error) {
      console.error('Error fetching artwork metadata:', error);
    }
  };

  const hasApprovedArtwork = (sku?: string) => {
    if (!sku) return false;
    return artworkStatus[sku] === true;
  };

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleSelectProduct = (productId: string, checked: boolean) => {
    const newSelected = new Set(selectedProducts);
    if (checked) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedProducts.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setSelectedProducts(new Set([productId]));
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const idsToDelete = productToDelete ? [productToDelete] : Array.from(selectedProducts);
    
    if (idsToDelete.length === 0) return;

    try {
      for (const id of idsToDelete) {
        // Unlink product from order_items to avoid foreign key constraint violation
        await supabase
          .from('order_items')
          .update({ product_id: null })
          .eq('product_id', id);
        
        // Delete related records
        await supabase.from('product_states').delete().eq('product_id', id);
        await supabase.from('inventory').delete().eq('product_id', id);
        
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
      }

      toast({
        title: "Products deleted",
        description: `Successfully deleted ${idsToDelete.length} product(s).`,
      });

      setSelectedProducts(new Set());
      fetchProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      toast({
        title: "Error",
        description: "Failed to delete products. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const handleDuplicateProduct = async (product: Product) => {
    try {
      const tempSKU = `VB-${Math.floor(10000 + Math.random() * 90000)}`;
      
      // Get the company_id from the original product
      const { data: originalProduct } = await supabase
        .from('products')
        .select('company_id')
        .eq('id', product.id)
        .single();
      
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({
          name: `${product.name} (Copy)`,
          description: product.description,
          price: product.price,
          state: product.state,
          item_id: tempSKU,
          template_id: product.template_id || null,
          company_id: originalProduct?.company_id
        })
        .select()
        .single();

      if (error) throw error;

      // Cost moved to companion table product_costs
      if (newProduct) {
        await (supabase as any)
          .from('product_costs')
          .upsert({ product_id: newProduct.id, cost: product.cost ?? null }, { onConflict: 'product_id' });
      }

      toast({
        title: "Product duplicated",
        description: "Product has been duplicated successfully.",
      });

      fetchProducts();
      fetchTemplates();
    } catch (error) {
      console.error('Error duplicating product:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate product.",
        variant: "destructive",
      });
    }
  };

  const handleEditTemplate = (template: ProductTemplate) => {
    setEditingTemplate(template);
    setTemplateEditName(template.name);
    setTemplateEditDescription(template.description || "");
    setTemplateEditPrice(template.price != null ? template.price.toString() : "");
    setTemplateEditCost(template.cost != null ? template.cost.toString() : "");
    setTemplateEditState(template.state || "");
    setTemplateEditBrandId(template.brand_id || "");
    setTemplateEditOpen(true);
  };

  // The brand picker in the template dialog only knows the brands of `brandCompanyId`, so it is
  // offered only when that is the template's own company (customer view, or admin filtered to it).
  const canEditTemplateBrand = !!editingTemplate && !!brandCompanyId && editingTemplate.company_id === brandCompanyId;

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    if (!templateEditName.trim()) {
      toast({
        title: "Template name required",
        description: "Please enter a template name.",
        variant: "destructive",
      });
      return;
    }

    setTemplateSaving(true);
    try {
      const updates = {
        name: templateEditName.trim(),
        description: templateEditDescription.trim() || null,
        price: templateEditPrice ? parseFloat(templateEditPrice) : null,
        state: templateEditState.trim() || null,
        // Products in the template follow this via the cascade trigger.
        ...(canEditTemplateBrand ? { brand_id: templateEditBrandId || null } : {}),
      };

      const { data, error } = await supabase
        .from("product_templates")
        .update(updates)
        .eq("id", editingTemplate.id)
        .select("id, name, description, price, company_id, thumbnail_url, state, brand_id")
        .single();

      if (error) throw error;

      // Template cost moved to companion table product_template_costs
      const newTemplateCostValue = templateEditCost ? parseFloat(templateEditCost) : null;
      await (supabase as any)
        .from("product_template_costs")
        .upsert({ template_id: editingTemplate.id, cost: newTemplateCostValue }, { onConflict: 'template_id' });

      toast({ title: "Template updated", description: "Changes saved successfully." });

      // Keep selectedTemplate in sync (so TemplateProductsView header updates too)
      if (selectedTemplate?.id === editingTemplate.id && data) {
        setSelectedTemplate({ ...selectedTemplate, ...data, cost: newTemplateCostValue });
      }

      setTemplateEditOpen(false);
      setEditingTemplate(null);
      fetchTemplates();
      if (canEditTemplateBrand) fetchProducts();
    } catch (error) {
      console.error("Error updating template:", error);
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDuplicateTemplate = (template: ProductTemplate) => {
    setTemplateToDuplicate(template);
    setDuplicateTargetCompanyId(template.company_id ?? "");
    setDuplicateTemplateOpen(true);
  };

  const handleConfirmDuplicateTemplate = async () => {
    if (!templateToDuplicate || !duplicateTargetCompanyId) return;

    try {
      setDuplicateTemplateLoading(true);

      const { data: newTemplate, error } = await supabase
        .from('product_templates')
        .insert({
          name: `${templateToDuplicate.name} (Copy)`,
          description: templateToDuplicate.description,
          price: templateToDuplicate.price,
          company_id: duplicateTargetCompanyId,
          thumbnail_url: templateToDuplicate.thumbnail_url,
          state: templateToDuplicate.state,
        })
        .select()
        .single();

      if (error) throw error;

      // Template cost moved to companion table product_template_costs
      if (newTemplate) {
        await (supabase as any)
          .from('product_template_costs')
          .upsert({ template_id: newTemplate.id, cost: templateToDuplicate.cost ?? null }, { onConflict: 'template_id' });
      }

      toast({
        title: "Template duplicated",
        description: "Template has been duplicated successfully.",
      });

      setDuplicateTemplateOpen(false);
      setTemplateToDuplicate(null);
      setDuplicateTargetCompanyId("");
      fetchTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    } finally {
      setDuplicateTemplateLoading(false);
    }
  };

  const handleDeleteTemplate = async (template: ProductTemplate) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"? Products will be unlinked from this template.`)) {
      return;
    }

    try {
      // First, unlink products from this template
      await supabase
        .from('products')
        .update({ template_id: null })
        .eq('template_id', template.id);

      // Then delete the template
      const { error } = await supabase
        .from('product_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: "Template has been deleted successfully.",
      });

      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    
    const targetCompanyId = companyFilter !== 'all' ? companyFilter : newTemplateCompanyId;
    
    if (!targetCompanyId) {
      toast({
        title: "Company required",
        description: "Please select a company for this template.",
        variant: "destructive",
      });
      return;
    }
    
    setCreatingTemplate(true);
    try {
      const { data: newTemplate, error } = await supabase.from('product_templates').insert({
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() || null,
        price: newTemplatePrice ? parseFloat(newTemplatePrice) : null,
        state: newTemplateState.trim() || null,
        company_id: targetCompanyId,
      })
        .select()
        .single();

      if (error) throw error;

      // Template cost moved to companion table product_template_costs
      if (newTemplate) {
        await (supabase as any)
          .from('product_template_costs')
          .upsert({ template_id: newTemplate.id, cost: newTemplateCost ? parseFloat(newTemplateCost) : null }, { onConflict: 'template_id' });
      }

      toast({
        title: "Template created",
        description: `"${newTemplateName}" has been created.`,
      });

      setCreateTemplateOpen(false);
      setNewTemplateName("");
      setNewTemplateDescription("");
      setNewTemplatePrice("");
      setNewTemplateCost("");
      setNewTemplateState("");
      setNewTemplateCompanyId("");
      fetchTemplates();
    } catch (error) {
      console.error('Error creating template:', error);
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    } finally {
      setCreatingTemplate(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-success';
      case 'pending': return 'text-warning';
      case 'revision': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const filteredProducts = products.filter(product =>
    matchesBrand(product.brand_id) && matchesKind(product.product_type) && (
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (product.customer_item_id && product.customer_item_id.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  // SKUs per folder, from the products already loaded (replaces a query per folder).
  const templateCounts = products.reduce<Record<string, number>>((acc, p) => {
    if (p.template_id) acc[p.template_id] = (acc[p.template_id] || 0) + 1;
    return acc;
  }, {});

  // The kinds a folder counts as: its own product_type, else the types of what it holds.
  // An untyped, empty folder is [null], which the kind filter reads as "Other".
  const templateKinds = (template: ProductTemplate): (string | null)[] => {
    if (template.product_type) return [template.product_type];
    const inside = products.filter(p => p.template_id === template.id).map(p => p.product_type ?? null);
    return inside.length > 0 ? inside : [null];
  };

  const filteredTemplates = templates.filter(template =>
    matchesBrand(template.brand_id) &&
    matchesAnyKind(templateKinds(template)) && (
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  // SKUs per brand for the chip counts (every product carries its brand, template or not).
  const brandCounts = products.reduce<Record<string, number>>((acc, p) => {
    const key = p.brand_id || 'none';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const isFiltering = !!searchQuery || brandFilter !== 'all' || kindFilter !== 'all';
  const emptyHint = isFiltering
    ? 'Try adjusting your search or filters.'
    : isVibeAdmin
      ? 'Add your first product to get started.'
      : 'Products VibePKG sets up for you will appear here.';

  const getTemplateDisplayThumbnail = (template: ProductTemplate) => {
    const templateProducts = products.filter((product) => product.template_id === template.id);

    for (const product of templateProducts) {
      const artworkThumbnail =
        (product.item_id && artworkThumbnails[product.item_id]) ||
        (product.sku && artworkThumbnails[product.sku]);

      if (artworkThumbnail) {
        return artworkThumbnail;
      }
    }

    if (template.thumbnail_url && !isLegacyGeneratedTemplateMockupUrl(template.thumbnail_url)) {
      return template.thumbnail_url;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Buyer "Add product" dialog; rendered in both the folder view and the catalog view below.
  const customerAddDialog = canCustomerAddProduct && kindConfig && brandCompanyId ? (
    <CustomerAddProductDialog
      open={customerAddOpen}
      onOpenChange={(open) => {
        setCustomerAddOpen(open);
        if (!open) setCustomerAddTemplate(null);
      }}
      companyId={brandCompanyId}
      brands={brands}
      config={kindConfig}
      template={customerAddTemplate}
      onCreated={afterCustomerCreate}
    />
  ) : null;

  // If a template is selected, show the template products view
  if (selectedTemplate) {
    return (
      <div className="space-y-6">
        <TemplateProductsView
          template={selectedTemplate}
          companyFilter={companyFilter}
          isVibeAdmin={isVibeAdmin}
          onBack={() => setSelectedTemplate(null)}
          artworkThumbnails={artworkThumbnails}
          artworkStatus={artworkStatus}
          onCustomerAddProduct={canCustomerAddProduct ? () => openCustomerAdd(selectedTemplate) : undefined}
          onCustomerQuickAdd={canCustomerAddProduct ? () => setCustomerQuickAddOpen(true) : undefined}
          refreshToken={templateRefreshToken}
          onArtworkAdded={fetchArtworkMetadata}
        />
        {customerAddDialog}
        {canCustomerAddProduct && brandCompanyId && (
          <CustomerQuickAddDialog
            open={customerQuickAddOpen}
            onOpenChange={setCustomerQuickAddOpen}
            companyId={brandCompanyId}
            template={templateForCustomerAdd(selectedTemplate)}
            onCreated={afterCustomerCreate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight leading-7">Products</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isVibeAdmin && viewMode === "list" && selectedProducts.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete ({selectedProducts.size})
            </Button>
          )}
          {isVibeAdmin && viewMode === "list" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) setSelectedProducts(new Set());
              }}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              {isEditMode ? "Done" : "Edit"}
            </Button>
          )}
          {isVibeAdmin && (
            <>
              <Button 
                variant="outline" 
                onClick={() => setCreateTemplateOpen(true)}
                title="Create new template"
              >
                <Layers className="h-4 w-4 mr-1.5" />
                Add Template
              </Button>
              <AnalyzePOProductsDialog 
                onProductsAdded={fetchProducts}
                selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
              />
              <QuickAddProductsDialog 
                onProductsAdded={fetchProducts}
                selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
              />
              <AddProductDialog
                onProductAdded={fetchProducts}
                selectedCompanyId={isVibeAdmin && companyFilter !== 'all' ? companyFilter : undefined}
              />
            </>
          )}
          {canCustomerAddProduct && (
            <Button onClick={() => setCustomerFolderOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Products
            </Button>
          )}
        </div>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          {isVibeAdmin && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Brand filter: only companies that use brands see this */}
          <BrandSelect
            brands={brands}
            value={brandFilter}
            onChange={setBrandFilter}
            counts={brandCounts}
            onManage={brandCompanyId ? () => setManageBrandsOpen(true) : undefined}
            showWhenEmpty={isVibeAdmin}
          />
          <KindSelect config={kindConfig} value={kindFilter} onChange={setKindFilter} />
        </div>

        {/* View Toggle */}
        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Grid
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4 mr-1.5" />
            List
          </Button>
        </div>
      </div>

      {/* Unified Grid View */}
      {viewMode === "grid" && (
        <div className="space-y-4">
          {filteredTemplates.length === 0 && filteredProducts.filter(p => !p.template_id).length === 0 ? (
            <div className="empty-state py-14">
              <p className="text-sm font-medium text-foreground">No products found</p>
              <p className="text-sm mt-1">{emptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {/* Templates (folders) first */}
              {filteredTemplates.map((template) => (
                <Card
                  key={`tmpl-${template.id}`}
                  className="group cursor-pointer overflow-hidden transition-all hover:border-foreground/25 relative"
                  onClick={() => setSelectedTemplate(template)}
                >
                  {/* Count badge (top-left) */}
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-sm shadow-sm"
                    title={`${templateCounts[template.id] || 0} SKU${(templateCounts[template.id] || 0) !== 1 ? 's' : ''} in this template`}
                  >
                    <Layers className="h-3 w-3 mr-1" />
                    {templateCounts[template.id] || 0}
                  </Badge>

                  {/* Buyer: add a product straight into this folder */}
                  {canCustomerAddProduct && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 z-10 h-7 w-7 bg-background/90 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); openCustomerAdd(template); }}
                      title={`Add a product to ${template.name}`}
                      aria-label={`Add a product to ${template.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Admin action buttons (top-right) */}
                  {isVibeAdmin && (
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/90 backdrop-blur-sm shadow-sm"
                        onClick={(e) => { e.stopPropagation(); handleEditTemplate(template); }}
                        title="Edit template"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/90 backdrop-blur-sm shadow-sm"
                        onClick={(e) => { e.stopPropagation(); handleDuplicateTemplate(template); }}
                        title="Duplicate to company"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                        title="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Template Image/Icon Area */}
                  <div className="aspect-square bg-muted/40 flex items-center justify-center relative overflow-hidden">
                    {getTemplateDisplayThumbnail(template) ? (
                      <SignedImage
                        src={getTemplateDisplayThumbnail(template) || undefined}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="h-16 w-16 text-muted-foreground/30" />
                    )}
                  </div>

                  {/* Template Info */}
                  <div className="p-3 space-y-1">
                    <h3 className="font-medium text-sm leading-snug truncate">{template.name}</h3>
                    {brandName(template.brand_id) && (
                      <p className="text-xs text-muted-foreground truncate">{brandName(template.brand_id)}</p>
                    )}
                    {template.state && (
                      <Badge variant="outline" className="text-xs">{template.state}</Badge>
                    )}
                  </div>
                </Card>
              ))}

              {/* Individual products (no template) */}
              {filteredProducts.filter(p => !p.template_id).map((product) => (
                <Card
                  key={`prod-${product.id}`}
                  className="group cursor-pointer overflow-hidden transition-all hover:border-foreground/25 relative"
                  onClick={() => navigate(`/products/edit/${product.id}`)}
                >
                  {/* Product Image/Icon Area */}
                  <div className="aspect-square bg-muted/40 flex items-center justify-center relative overflow-hidden">
                    {(product.item_id && artworkThumbnails[product.item_id]) || (product.sku && artworkThumbnails[product.sku]) ? (
                      <SignedImage src={(product.item_id && artworkThumbnails[product.item_id]) || artworkThumbnails[product.sku!]} alt={product.name} className="w-full h-full object-cover" />

                    ) : product.image_url ? (
                      <SignedImage src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-16 w-16 text-muted-foreground/30" />
                    )}

                    {product.sku && !hasApprovedArtwork(product.sku) && (
                      <div className="absolute top-2 left-2">
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      </div>
                    )}

                    {product.state && (
                      <Badge
                        variant="outline"
                        className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm text-xs"
                      >
                        {product.state}
                      </Badge>
                    )}

                    {isVibeAdmin && (
                      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <AssignTemplateDropdown
                          productId={product.id}
                          currentTemplateId={product.template_id || null}
                          companyId={companyFilter !== 'all' ? companyFilter : undefined}
                          onTemplateAssigned={() => { fetchProducts(); fetchTemplates(); }}
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); handleDuplicateProduct(product); }}
                          title="Duplicate product"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(product.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-3 space-y-1">
                    <h3 className="font-medium text-sm leading-snug truncate">{product.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {product.item_id || product.id.slice(0, 8)}
                    </p>
                    {product.customer_item_id && (
                      <p className="text-xs text-muted-foreground truncate">
                        CID: {product.customer_item_id}
                      </p>
                    )}
                    {brandName(product.brand_id) && (
                      <p className="text-xs text-muted-foreground truncate">{brandName(product.brand_id)}</p>
                    )}
                    <p className="text-sm font-medium">
                      {isVibeAdmin
                        ? (product.cost ? `$${product.cost.toFixed(3)}` : '—')
                        : (product.price ? `$${product.price.toFixed(3)}` : '—')}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Products Table/List View */}
      {viewMode === "list" && (
        <Card className="overflow-hidden">
          {/* Table Header */}
          <div className="bg-muted/50 border-b border-border px-4 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isEditMode && (
                <div className="col-span-1 flex items-center">
                  <Checkbox
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </div>
              )}
              <div className={cn("flex items-center", isEditMode ? "col-span-1" : "col-span-1")}></div>
              <div className={cn(isEditMode ? "col-span-2" : "col-span-2")}>Product ID</div>
              <div className="col-span-1">Preview</div>
              <div className="col-span-4">Name</div>
              <div className="col-span-2">State</div>
              <div className="col-span-1">{isVibeAdmin ? 'Cost' : 'Price'}</div>
              {!isEditMode && <div className="col-span-1">Actions</div>}
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredProducts.length === 0 ? (
              <div className="empty-state py-14">
                <p className="text-sm font-medium text-foreground">No products found</p>
                <p className="text-sm mt-1">{emptyHint}</p>
              </div>
            ) : (
              filteredProducts.map((product) => {
                const isExpanded = expandedProducts.includes(product.id);
                
                return (
                  <div key={product.id}>
                    <div 
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer items-center"
                      onClick={() => toggleExpanded(product.id)}
                    >
                      {isEditMode && (
                        <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                          />
                        </div>
                      )}
                      <div className={cn("flex items-center", isEditMode ? "col-span-1" : "col-span-1")}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className={cn("font-mono text-xs flex flex-col gap-0.5", isEditMode ? "col-span-2" : "col-span-2")}>
                        <div className="flex items-center gap-2">
                          <span className="truncate">{product.item_id || `${product.id.slice(0, 8)}...`}</span>
                          {product.sku && !hasApprovedArtwork(product.sku) && (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                          )}
                        </div>
                        {product.customer_item_id && (
                          <span className="truncate text-muted-foreground">CID: {product.customer_item_id}</span>
                        )}
                      </div>
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        {/* Priority: 1. Artwork thumbnail, 2. Product image_url, 3. Package icon */}
                        {(product.item_id && artworkThumbnails[product.item_id]) || (product.sku && artworkThumbnails[product.sku]) ? (
                          <SignedImage
                            src={(product.item_id && artworkThumbnails[product.item_id]) || artworkThumbnails[product.sku!]}
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => navigate(`/artwork?search=${encodeURIComponent(product.item_id || product.sku || '')}`)}
                          />

                        ) : product.image_url ? (
                          <SignedImage
                            src={product.image_url} 
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => navigate(`/products/edit/${product.id}`)}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded-md border border-border flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="col-span-4 min-w-0">
                        <span className="text-sm font-medium truncate block">{product.name}</span>
                        {brandName(product.brand_id) && (
                          <span className="text-xs text-muted-foreground truncate block">{brandName(product.brand_id)}</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="text-xs">{product.state}</Badge>
                      </div>
                      <div className="col-span-1 text-sm font-medium">
                        {isVibeAdmin 
                          ? (product.cost ? `$${product.cost.toFixed(3)}` : '—')
                          : (product.price ? `$${product.price.toFixed(3)}` : '—')}
                      </div>
                      {!isEditMode && (
                        <div className="col-span-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {isVibeAdmin && (
                            <>
                              <AssignTemplateDropdown
                                productId={product.id}
                                currentTemplateId={product.template_id || null}
                                companyId={companyFilter !== 'all' ? companyFilter : undefined}
                                onTemplateAssigned={() => {
                                  fetchProducts();
                                  fetchTemplates();
                                }}
                              />
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => handleDuplicateProduct(product)}
                                title="Duplicate product"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => navigate(`/products/edit/${product.id}`)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {isVibeAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-danger"
                              onClick={() => handleDeleteClick(product.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded State Details */}
                    {isExpanded && product.states.length > 0 && (
                      <div className="bg-muted/30 border-t border-border">
                        <div className="px-8 py-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">State Variants</p>
                          {product.states.map((state) => (
                            <div key={state.id} className="flex items-center gap-4 text-sm py-1.5">
                              <Badge variant="outline" className="text-xs min-w-[40px] justify-center">{state.state}</Badge>
                              <span className={cn("text-xs font-medium", getStatusColor(state.status))}>{state.status}</span>
                              {state.specs && <span className="text-xs text-muted-foreground">{state.specs}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}


      {/* Edit Template Dialog */}
      <Dialog
        open={templateEditOpen}
        onOpenChange={(open) => {
          setTemplateEditOpen(open);
          if (!open) setEditingTemplate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
            <DialogDescription>
              Update template details. (Products already assigned to this template are unaffected unless you
              re-apply the template to them.)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template name</Label>
              <Input value={templateEditName} onChange={(e) => setTemplateEditName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={templateEditDescription}
                onChange={(e) => setTemplateEditDescription(e.target.value)}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1.250"
                  value={templateEditPrice}
                  onChange={(e) => setTemplateEditPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 0.850"
                  value={templateEditCost}
                  onChange={(e) => setTemplateEditCost(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>State (optional)</Label>
              <Input
                placeholder="e.g. AZ"
                value={templateEditState}
                onChange={(e) => setTemplateEditState(e.target.value)}
              />
            </div>

            {canEditTemplateBrand && brands.length > 0 && (
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select
                  value={templateEditBrandId || "__none__"}
                  onValueChange={(v) => setTemplateEditBrandId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No brand</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Products in this template move with it.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateEditOpen(false)} disabled={templateSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={templateSaving || !templateEditName.trim()}>
              {templateSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={createTemplateOpen} onOpenChange={setCreateTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a new product template for organizing related SKUs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {companyFilter === 'all' && (
              <div className="space-y-2">
                <Label>Company <span className="text-destructive">*</span></Label>
                <Select value={newTemplateCompanyId} onValueChange={setNewTemplateCompanyId}>
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
              <Label>Template name <span className="text-destructive">*</span></Label>
              <Input 
                value={newTemplateName} 
                onChange={(e) => setNewTemplateName(e.target.value)} 
                placeholder="e.g., 1g Disposable Vape"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Template description for all products in this group..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1.250"
                  value={newTemplatePrice}
                  onChange={(e) => setNewTemplatePrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 0.850"
                  value={newTemplateCost}
                  onChange={(e) => setNewTemplateCost(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>State</Label>
              <Select value={newTemplateState} onValueChange={setNewTemplateState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state (optional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="General">General (All States)</SelectItem>
                  <SelectItem value="AL">Alabama</SelectItem>
                  <SelectItem value="AK">Alaska</SelectItem>
                  <SelectItem value="AZ">Arizona</SelectItem>
                  <SelectItem value="AR">Arkansas</SelectItem>
                  <SelectItem value="CA">California</SelectItem>
                  <SelectItem value="CO">Colorado</SelectItem>
                  <SelectItem value="CT">Connecticut</SelectItem>
                  <SelectItem value="DE">Delaware</SelectItem>
                  <SelectItem value="FL">Florida</SelectItem>
                  <SelectItem value="GA">Georgia</SelectItem>
                  <SelectItem value="HI">Hawaii</SelectItem>
                  <SelectItem value="ID">Idaho</SelectItem>
                  <SelectItem value="IL">Illinois</SelectItem>
                  <SelectItem value="IN">Indiana</SelectItem>
                  <SelectItem value="IA">Iowa</SelectItem>
                  <SelectItem value="KS">Kansas</SelectItem>
                  <SelectItem value="KY">Kentucky</SelectItem>
                  <SelectItem value="LA">Louisiana</SelectItem>
                  <SelectItem value="ME">Maine</SelectItem>
                  <SelectItem value="MD">Maryland</SelectItem>
                  <SelectItem value="MA">Massachusetts</SelectItem>
                  <SelectItem value="MI">Michigan</SelectItem>
                  <SelectItem value="MN">Minnesota</SelectItem>
                  <SelectItem value="MS">Mississippi</SelectItem>
                  <SelectItem value="MO">Missouri</SelectItem>
                  <SelectItem value="MT">Montana</SelectItem>
                  <SelectItem value="NE">Nebraska</SelectItem>
                  <SelectItem value="NV">Nevada</SelectItem>
                  <SelectItem value="NH">New Hampshire</SelectItem>
                  <SelectItem value="NJ">New Jersey</SelectItem>
                  <SelectItem value="NM">New Mexico</SelectItem>
                  <SelectItem value="NY">New York</SelectItem>
                  <SelectItem value="NC">North Carolina</SelectItem>
                  <SelectItem value="ND">North Dakota</SelectItem>
                  <SelectItem value="OH">Ohio</SelectItem>
                  <SelectItem value="OK">Oklahoma</SelectItem>
                  <SelectItem value="OR">Oregon</SelectItem>
                  <SelectItem value="PA">Pennsylvania</SelectItem>
                  <SelectItem value="RI">Rhode Island</SelectItem>
                  <SelectItem value="SC">South Carolina</SelectItem>
                  <SelectItem value="SD">South Dakota</SelectItem>
                  <SelectItem value="TN">Tennessee</SelectItem>
                  <SelectItem value="TX">Texas</SelectItem>
                  <SelectItem value="UT">Utah</SelectItem>
                  <SelectItem value="VT">Vermont</SelectItem>
                  <SelectItem value="VA">Virginia</SelectItem>
                  <SelectItem value="WA">Washington</SelectItem>
                  <SelectItem value="WV">West Virginia</SelectItem>
                  <SelectItem value="WI">Wisconsin</SelectItem>
                  <SelectItem value="WY">Wyoming</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTemplateOpen(false)} disabled={creatingTemplate}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={creatingTemplate || !newTemplateName.trim() || (companyFilter === 'all' && !newTemplateCompanyId)}>
              {creatingTemplate ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Template Dialog */}
      <Dialog
        open={duplicateTemplateOpen}
        onOpenChange={(open) => {
          setDuplicateTemplateOpen(open);
          if (!open) {
            setTemplateToDuplicate(null);
            setDuplicateTargetCompanyId("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Template</DialogTitle>
            <DialogDescription>
              Choose which company should own the new template copy. Products linked to the original will not be copied.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Company</Label>
            <Select value={duplicateTargetCompanyId} onValueChange={setDuplicateTargetCompanyId}>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateTemplateOpen(false)} disabled={duplicateTemplateLoading}>
              Cancel
            </Button>
            <Button onClick={handleConfirmDuplicateTemplate} disabled={duplicateTemplateLoading || !duplicateTargetCompanyId}>
              {duplicateTemplateLoading ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {customerAddDialog}
      {canCustomerAddProduct && kindConfig && brandCompanyId && (
        <CustomerAddFolderDialog
          open={customerFolderOpen}
          onOpenChange={setCustomerFolderOpen}
          companyId={brandCompanyId}
          brands={brands}
          config={kindConfig}
          folders={templates
            .filter((t) => t.company_id === brandCompanyId)
            .map((t) => ({ id: t.id, name: t.name, brand_id: t.brand_id ?? null, product_type: templateProductType(t) }))}
          onCreated={(folderId) => {
            afterCustomerCreate();
            // Open the folder once the refreshed template list arrives (handled by the ?template= effect).
            searchParams.set('template', folderId);
            setSearchParams(searchParams, { replace: true });
          }}
        />
      )}

      {/* Brands */}
      {brandCompanyId && (
        <ManageBrandsDialog
          open={manageBrandsOpen}
          onOpenChange={setManageBrandsOpen}
          companyId={brandCompanyId}
          brands={brands}
          onChanged={() => {
            refreshBrands();
            fetchProducts();
            fetchTemplates();
          }}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedProducts.size} product(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Products;
