import { useState, useEffect, useRef } from "react";
import PdfThumbnail from "@/components/PdfThumbnail";
import SignedImage from "@/components/SignedImage";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Search, 
  Plus, 
  Download, 
  Eye, 
  CheckCircle,
  Clock,
  FileImage,
  Trash2,
  ArrowLeft,
  Package,
  LayoutGrid,
  List,
  ImageIcon,
  FileArchive,
  FileCode,
  Edit,
  Loader2,
  Upload
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadStorageObject } from "@/lib/storageUrl";
import { describeArtworkUploadError, uploadArtworkFile } from "@/lib/artworkUpload";
import { useToast } from "@/hooks/use-toast";
import { buildManualArtworkPreviewPath, createFlatArtworkPreviewFromArtwork, isLegacyGeneratedTemplateMockupUrl } from "@/lib/artworkPreview";
import AddArtworkDialog from "@/components/AddArtworkDialog";
import BulkArtworkUploadDialog from "@/components/BulkArtworkUploadDialog";
import ArtworkViewerDialog, { getArtworkThumbnail } from "@/components/ArtworkViewerDialog";
import { cn } from "@/lib/utils";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { BrandSelect } from "@/components/BrandSelect";
import { ManageBrandsDialog } from "@/components/ManageBrandsDialog";
import { FilterBar } from "@/components/layout/FilterBar";
import { SummaryStrip } from "@/components/layout/SummaryStrip";
import { EmptyState } from "@/components/layout/EmptyState";
import { KindSelect } from "@/components/KindSelect";
import { useCompanyPortalFeatures } from "@/hooks/useCompanyPortalFeatures";
import { useKindFilter } from "@/hooks/useKindFilter";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  brand_id?: string | null;
  product_type?: string | null;
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  template_id: string | null;
  company_id: string;
  image_url: string | null;
  brand_id?: string | null;
}

interface ArtworkFile {
  id: string;
  sku: string;
  filename: string;
  artwork_url: string;
  preview_url: string | null;
  is_approved: boolean;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  company_id: string;
  artwork_type: string;
  /** When someone at VibePKG first opened the file. Null = nobody has looked yet. */
  opened_at: string | null;
}

interface Company {
  id: string;
  name: string;
}

type ArtworkStatus = 'approved' | 'pending' | 'no_art';

interface CustomerArtworkTabProps {
  isVibeAdmin: boolean;
  userCompanyId: string | null;
  companies: Company[];
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  onFileOpened?: () => void;
}

export function CustomerArtworkTab({ 
  isVibeAdmin, 
  userCompanyId, 
  companies, 
  companyFilter,
  onCompanyFilterChange,
  onFileOpened,
}: CustomerArtworkTabProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Template/Product hierarchy (same as Vibe Proofs)
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkFile[]>([]);
  
  // Artwork counts per product SKU
  const [artworkCounts, setArtworkCounts] = useState<Record<string, { total: number; approved: number; pending: number }>>({});

  // "Action needed" = a customer file that has not been opened by VibePKG yet, or whose
  // SKU has no vibe proof. The blue dot shows wherever that count is above zero.
  const [skuNeedsAction, setSkuNeedsAction] = useState<Record<string, number>>({});
  const [skuHasProof, setSkuHasProof] = useState<Record<string, boolean>>({});
  const [templateSkus, setTemplateSkus] = useState<Record<string, string[]>>({});

  // Template artwork status
  const [templateStatus, setTemplateStatus] = useState<Record<string, ArtworkStatus>>({});
  const [templateDerivedThumbnails, setTemplateDerivedThumbnails] = useState<Record<string, string>>({});
  // First usable customer-art thumbnail / PDF per SKU, used on product tiles
  const [skuArtThumbnails, setSkuArtThumbnails] = useState<Record<string, string>>({});
  const [skuArtPdfUrls, setSkuArtPdfUrls] = useState<Record<string, string>>({});
  
  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editThumbnailDialogOpen, setEditThumbnailDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ArtworkFile | null>(null);
  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  
  const { toast } = useToast();

  // Brand filter follows the one chosen on Products (persisted per company).
  const brandCompanyId = isVibeAdmin ? (companyFilter !== 'all' ? companyFilter : null) : userCompanyId;
  const { brands, brandFilter, setBrandFilter, matches: matchesBrand, brandName, refresh: refreshBrands } = useBrandFilter(brandCompanyId);
  const [manageBrandsOpen, setManageBrandsOpen] = useState(false);
  // SKUs per brand for the dropdown counts (same numbers as the Products page).
  const [brandCounts, setBrandCounts] = useState<Record<string, number>>({});
  // Kind filter (Boxes / Foils / Other) only for companies with order_picker groups configured.
  const { orderPicker: kindConfig } = useCompanyPortalFeatures(brandCompanyId);
  const { kindFilter, setKindFilter, matchesAny: matchesAnyKind } = useKindFilter(brandCompanyId, kindConfig);
  const [templateProductTypes, setTemplateProductTypes] = useState<Record<string, (string | null)[]>>({});

  // "+" on a product tile: pick a file and it is attached to that product right there, no
  // dropdown to find the product in. One hidden input serves every tile; the product whose
  // "+" was clicked is remembered until the file dialog comes back.
  const tileFileInputRef = useRef<HTMLInputElement>(null);
  const [tileUploadTarget, setTileUploadTarget] = useState<Product | null>(null);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);

  const startTileUpload = (product: Product) => {
    if (!product.item_id) {
      toast({
        title: "No SKU",
        description: "This product has no SKU, so artwork cannot be attached to it yet.",
        variant: "destructive",
      });
      return;
    }
    setTileUploadTarget(product);
    if (tileFileInputRef.current) {
      tileFileInputRef.current.value = "";
      tileFileInputRef.current.click();
    }
  };

  const handleTileFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const product = tileUploadTarget;
    if (!file || !product?.item_id) return;
    setUploadingProductId(product.id);
    try {
      await uploadArtworkFile({
        file,
        sku: product.item_id,
        companyId: product.company_id,
        artworkType: "customer",
      });
      toast({ title: "Artwork added", description: `${file.name} attached to ${product.item_id}` });
      handleUploadSuccess();
    } catch (err) {
      console.error("Error uploading artwork:", err);
      toast({ title: "Upload failed", description: describeArtworkUploadError(err), variant: "destructive" });
    } finally {
      setUploadingProductId(null);
      setTileUploadTarget(null);
    }
  };

  const tileFileInput = (
    <input
      ref={tileFileInputRef}
      type="file"
      className="hidden"
      onChange={handleTileFileChosen}
    />
  );

  const tileAddButton = (product: Product, className = "absolute bottom-2 right-2") => (
    <Button
      variant="secondary"
      size="sm"
      className={`${className} h-8 w-8 p-0 shadow-md`}
      title={product.item_id ? "Add customer art to this product" : "This product has no SKU"}
      disabled={uploadingProductId === product.id}
      onClick={(e) => {
        e.stopPropagation();
        startTileUpload(product);
      }}
    >
      {uploadingProductId === product.id ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
    </Button>
  );

  useEffect(() => {
    fetchTemplates();
  }, [companyFilter, isVibeAdmin, userCompanyId]);

  useEffect(() => {
    if (selectedTemplate) {
      fetchProductsForTemplate();
    }
  }, [selectedTemplate, companyFilter]);

  useEffect(() => {
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  }, [selectedProduct]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      
      // Get templates that have products
      let productsQuery = supabase
        .from('products')
        .select('template_id, item_id, image_url, brand_id, product_type')
        .limit(50000);
      
      if (!isVibeAdmin && userCompanyId) {
        productsQuery = productsQuery.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        productsQuery = productsQuery.eq('company_id', companyFilter);
      }
      
      const { data: productsData } = await productsQuery;
      setTemplateProductTypes(
        (productsData || []).reduce<Record<string, (string | null)[]>>((acc, p) => {
          if (p.template_id) (acc[p.template_id] ||= []).push(p.product_type ?? null);
          return acc;
        }, {})
      );
      setBrandCounts(
        (productsData || []).reduce<Record<string, number>>((acc, p) => {
          const key = p.brand_id || 'none';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {})
      );
      const templateIds = [...new Set(productsData?.filter(p => p.template_id).map(p => p.template_id))];
      
      // Fetch templates
      const { data: templatesData } = await supabase
        .from('product_templates')
        .select('*')
        .in('id', templateIds.length > 0 ? templateIds : ['none'])
        .order('name');
      
      // Fetch every artwork row: customer files drive the counts and thumbnails, vibe
      // proofs only tell us which SKUs already have a proof (for the blue dot).
      let artworkQuery = supabase
        .from('artwork_files')
        .select('sku, artwork_type, is_approved, preview_url, artwork_url, filename, opened_at')
        .limit(50000);
      
      if (!isVibeAdmin && userCompanyId) {
        artworkQuery = artworkQuery.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        artworkQuery = artworkQuery.eq('company_id', companyFilter);
      }
      
      const { data: allArtworkData } = await artworkQuery;
      const hasProof: Record<string, boolean> = {};
      (allArtworkData || []).forEach((art) => {
        if (art.artwork_type !== 'customer') hasProof[art.sku] = true;
      });
      const artworkData = (allArtworkData || []).filter((art) => art.artwork_type === 'customer');

      const counts: Record<string, { total: number; approved: number; pending: number }> = {};
      const needsAction: Record<string, number> = {};
      const skuThumbnails: Record<string, string | null> = {};
      const skuPdfUrls: Record<string, string> = {};


      artworkData?.forEach((art) => {
        if (!counts[art.sku]) {
          counts[art.sku] = { total: 0, approved: 0, pending: 0 };
        }
        counts[art.sku].total++;
        if (art.is_approved) {
          counts[art.sku].approved++;
        } else {
          counts[art.sku].pending++;
        }
        if (!art.opened_at) {
          needsAction[art.sku] = (needsAction[art.sku] || 0) + 1;
        }

        if (!skuThumbnails[art.sku]) {
          const thumbnail = getArtworkThumbnail({
            preview_url: art.preview_url,
            artwork_url: art.artwork_url,
            filename: art.filename,
          });

          if (thumbnail.type === 'image' && thumbnail.src) {
            skuThumbnails[art.sku] = thumbnail.src;
          }
        }

        if (!skuPdfUrls[art.sku] && art.filename && /\.pdf$/i.test(art.filename)) {
          skuPdfUrls[art.sku] = art.artwork_url;
        }
      });
      setArtworkCounts(counts);
      setSkuNeedsAction(needsAction);
      setSkuHasProof(hasProof);
      setSkuArtThumbnails(
        Object.fromEntries(
          Object.entries(skuThumbnails).filter(([, v]) => !!v) as [string, string][]
        )
      );
      setSkuArtPdfUrls(skuPdfUrls);

      // Calculate template status based on product artwork
      const templateStatusMap: Record<string, ArtworkStatus> = {};
      const templateSkuMap: Record<string, string[]> = {};
      const derivedThumbs: Record<string, string> = {};

      templatesData?.forEach((template) => {
        const templateProducts = productsData?.filter((p) => p.template_id === template.id) || [];
        const templateSkus = templateProducts.map((p) => p.item_id).filter(Boolean) as string[];
        templateSkuMap[template.id] = templateSkus;

        let hasApproved = false;
        let hasPending = false;

        templateSkus.forEach((sku) => {
          if (counts[sku]) {
            if (counts[sku].approved > 0) hasApproved = true;
            if (counts[sku].pending > 0) hasPending = true;
          }

          if (!derivedThumbs[template.id] && skuThumbnails[sku]) {
            derivedThumbs[template.id] = skuThumbnails[sku]!;
          }
        });

        if (!derivedThumbs[template.id]) {
          for (const product of templateProducts) {
            if (product.image_url) {
              derivedThumbs[template.id] = product.image_url;
              break;
            }
          }
        }
        
        if (hasApproved && !hasPending) {
          templateStatusMap[template.id] = 'approved';
        } else if (hasPending || hasApproved) {
          templateStatusMap[template.id] = 'pending';
        } else {
          templateStatusMap[template.id] = 'no_art';
        }
      });

      setTemplateStatus(templateStatusMap);
      setTemplateSkus(templateSkuMap);
      setTemplateDerivedThumbnails(derivedThumbs);
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsForTemplate = async () => {
    if (!selectedTemplate) return;
    
    try {
      let query = supabase
        .from('products')
        .select('id, name, item_id, template_id, company_id, image_url')
        .eq('template_id', selectedTemplate.id)
        .order('name');
      
      if (!isVibeAdmin && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (isVibeAdmin && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
      
      const { data } = await query;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchArtworkForProduct = async () => {
    if (!selectedProduct?.item_id) return;
    
    try {
      const { data } = await supabase
        .from('artwork_files')
        .select('*')
        .eq('sku', selectedProduct.item_id)
        .eq('artwork_type', 'customer')
        .order('created_at', { ascending: false });
      
      setArtworkFiles(data || []);
    } catch (error) {
      console.error('Error fetching artwork:', error);
    }
  };

  const handleUploadSuccess = () => {
    fetchTemplates();
    if (selectedProduct) {
      fetchArtworkForProduct();
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      await downloadStorageObject('artwork', url, filename);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  // Stamp the first time a VibePKG admin views or downloads a customer file. Once it is
  // opened and its SKU has a vibe proof, the file stops counting toward the blue dot.
  const markOpened = async (file: ArtworkFile) => {
    if (!isVibeAdmin || file.opened_at) return;
    const openedAt = new Date().toISOString();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('artwork_files')
        .update({ opened_at: openedAt, opened_by: user?.id ?? null })
        .eq('id', file.id)
        .is('opened_at', null);
      if (error) throw error;
    } catch (error) {
      console.warn('Could not mark customer art as opened', error);
      return;
    }
    setArtworkFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, opened_at: openedAt } : f)));
    setSelectedFile((prev) => (prev && prev.id === file.id ? { ...prev, opened_at: openedAt } : prev));
    setSkuNeedsAction((prev) => ({ ...prev, [file.sku]: Math.max(0, (prev[file.sku] || 0) - 1) }));
    onFileOpened?.();
  };

  const openFile = (file: ArtworkFile) => {
    setSelectedFile(file);
    setPreviewDialogOpen(true);
    void markOpened(file);
  };

  const fileNeedsAction = (file: ArtworkFile) => !file.opened_at;
  const productNeedsAction = (sku: string | null) => !!sku && (skuNeedsAction[sku] || 0) > 0;
  const templateNeedsAction = (templateId: string) =>
    (templateSkus[templateId] || []).some((sku) => (skuNeedsAction[sku] || 0) > 0);

  /** The blue "action needed" dot: customer art not yet opened, or SKU still without a vibe proof. */
  const actionDot = (title = "New customer art — not opened yet") => (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full bg-info ring-2 ring-background shrink-0"
      title={title}
      aria-label={title}
    />
  );


  const handleDelete = async () => {
    if (!selectedFile) return;

    try {
      const artworkPath = selectedFile.artwork_url.split('/artwork/')[1];
      if (artworkPath) {
        await supabase.storage.from('artwork').remove([artworkPath]);
      }

      if (selectedFile.preview_url) {
        const previewPath = selectedFile.preview_url.split('/artwork/')[1];
        if (previewPath) {
          await supabase.storage.from('artwork').remove([previewPath]);
        }
      }

      const { error } = await supabase
        .from('artwork_files')
        .delete()
        .eq('id', selectedFile.id);

      if (error) throw error;

      setDeleteDialogOpen(false);
      setSelectedFile(null);

      toast({
        title: "Deleted",
        description: "Customer art file has been deleted",
      });

      fetchArtworkForProduct();
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting artwork:', error);
      toast({
        title: "Error",
        description: "Failed to delete artwork. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditThumbnail = async () => {
    if (!selectedFile) {
      toast({
        title: "Missing file",
        description: "Please select an artwork file",
        variant: "destructive",
      });
      return;
    }

    try {
      let publicUrl: string;

      if (newThumbnailFile) {
        const fileExt = newThumbnailFile.name.split('.').pop();
        const fileName = buildManualArtworkPreviewPath(selectedFile.sku, fileExt);
        
        const { error: uploadError } = await supabase.storage
          .from('artwork')
          .upload(fileName, newThumbnailFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl: uploadedUrl } } = supabase.storage
          .from('artwork')
          .getPublicUrl(fileName);

        publicUrl = uploadedUrl;
      } else {
        publicUrl = await createFlatArtworkPreviewFromArtwork({
          artworkUrl: selectedFile.artwork_url,
          filename: selectedFile.filename,
          sku: selectedFile.sku,
          contextLabel: selectedFile.filename,
        });
      }

      const { error: updateError } = await supabase
        .from('artwork_files')
        .update({ preview_url: publicUrl })
        .eq('id', selectedFile.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: newThumbnailFile
          ? "Thumbnail updated successfully"
          : "Flat proof preview generated successfully",
      });

      setEditThumbnailDialogOpen(false);
      setNewThumbnailFile(null);
      fetchArtworkForProduct();
    } catch (error) {
      console.error('Error updating thumbnail:', error);
      toast({
        title: "Update failed",
        description: "Failed to update thumbnail",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    if (selectedProduct) {
      setSelectedProduct(null);
      setArtworkFiles([]);
    } else if (selectedTemplate) {
      setSelectedTemplate(null);
      setProducts([]);
    }
  };

  const getProductArtworkCount = (sku: string | null) => {
    if (!sku) return { total: 0, approved: 0, pending: 0 };
    return artworkCounts[sku] || { total: 0, approved: 0, pending: 0 };
  };
  
  const getProductArtworkStatus = (sku: string | null): ArtworkStatus => {
    if (!sku) return 'no_art';
    const counts = artworkCounts[sku];
    if (!counts || counts.total === 0) return 'no_art';
    if (counts.approved > 0 && counts.pending === 0) return 'approved';
    return 'pending';
  };
  
  const getStatusBadge = (status: ArtworkStatus) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-success text-success-foreground border-0">
            <CheckCircle className="h-3 w-3 mr-1" />
            Complete
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-info text-info-foreground border-0">
            <Clock className="h-3 w-3 mr-1" />
            Customer Art Uploaded
          </Badge>
        );
      case 'no_art':
        return (
          <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
            <ImageIcon className="h-3 w-3 mr-1" />
            No Customer Art
          </Badge>
        );
    }
  };

  const getDisplayName = (productName: string) => {
    if (!selectedTemplate) return productName;
    const prefix = `${selectedTemplate.name} - `;
    if (productName.startsWith(prefix)) {
      return productName.substring(prefix.length);
    }
    return productName;
  };

  const getTemplateDisplayThumbnail = (template: ProductTemplate) => {
    if (templateDerivedThumbnails[template.id]) {
      return templateDerivedThumbnails[template.id];
    }

    if (template.thumbnail_url && !isLegacyGeneratedTemplateMockupUrl(template.thumbnail_url)) {
      return template.thumbnail_url;
    }

    return null;
  };

  // Get all artwork stats
  const totalArtwork = Object.values(artworkCounts).reduce((sum, c) => sum + c.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // PRODUCT ARTWORK VIEW
  if (selectedProduct) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{getDisplayName(selectedProduct.name)}</h1>
              <p className="text-sm text-muted-foreground font-mono">
                SKU: {selectedProduct.item_id || 'No SKU'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => startTileUpload(selectedProduct)}
              disabled={uploadingProductId === selectedProduct.id}
            >
              {uploadingProductId === selectedProduct.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload File
            </Button>
            <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add with Notes
            </Button>
          </div>
        </div>
        {tileFileInput}

        {/* Artwork Grid */}
        {artworkFiles.length === 0 ? (
          <Card className="p-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium mb-2">No customer art files</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload customer-provided artwork for this product
            </p>
            <Button onClick={() => startTileUpload(selectedProduct)} disabled={uploadingProductId === selectedProduct.id}>
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworkFiles.map((file) => (
              <Card key={file.id} className="overflow-hidden hover:border-foreground/25 transition-colors group">
                <div
                  className="relative w-full aspect-square bg-muted overflow-hidden cursor-pointer"
                  onClick={() => openFile(file)}
                >
                  {(() => {
                    const thumbnail = getArtworkThumbnail(file);
                    if (thumbnail.type === 'image' && thumbnail.src) {
                      return (
                        <SignedImage
                          src={thumbnail.src}
                          alt={file.sku}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      );
                    } else if (thumbnail.type === 'pdf') {
                      return (
                        <PdfThumbnail 
                          pdfUrl={file.artwork_url} 
                          alt={file.sku}
                          className="w-full h-full object-cover"
                        />
                      );
                    } else {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
                          <FileCode className="h-12 w-12 text-muted-foreground mb-2" />
                          <Badge variant="secondary" className="text-xs">
                            {thumbnail.label} File
                          </Badge>
                        </div>
                      );
                    }
                  })()}
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setEditThumbnailDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  
                  <Badge className="absolute top-2 left-2 bg-info text-info-foreground border-0">
                    Customer Art
                  </Badge>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {fileNeedsAction(file) && actionDot("Not opened yet")}
                    <h3 className="font-semibold text-base truncate" title={file.filename}>
                      {file.filename}
                    </h3>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {new Date(file.created_at).toLocaleDateString()}
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFile(file);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markOpened(file);
                        handleDownload(file.artwork_url, file.filename);
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add Artwork Dialog - pre-filled with product, default to customer artwork */}
        <AddArtworkDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onSuccess={handleUploadSuccess}
          defaultProductId={selectedProduct.id}
          defaultSku={selectedProduct.item_id || ''}
          defaultCompanyId={selectedProduct.company_id}
          defaultArtworkType="customer"
        />

        {/* Artwork Viewer Dialog */}
        <ArtworkViewerDialog
          open={previewDialogOpen}
          onOpenChange={setPreviewDialogOpen}
          file={selectedFile}
          onDownload={handleDownload}
        />

        {/* Edit Thumbnail Dialog */}
        <Dialog open={editThumbnailDialogOpen} onOpenChange={setEditThumbnailDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Thumbnail</DialogTitle>
              <DialogDescription>
                Upload a replacement thumbnail, or auto-generate a clean flat proof preview from {selectedFile?.filename}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedFile?.preview_url && (
                <div>
                  <Label>Current Thumbnail</Label>
                  <SignedImage src={selectedFile.preview_url} alt="Current thumbnail" className="w-full h-48 object-cover rounded border mt-2" />
                </div>
              )}
              <div>
                <Label htmlFor="newThumbnail">Replacement Thumbnail Image</Label>
                <Input id="newThumbnail" type="file" accept="image/*" onChange={(e) => setNewThumbnailFile(e.target.files?.[0] || null)} className="mt-2" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEditThumbnail} className="flex-1" disabled={!selectedFile}>
                  {newThumbnailFile ? 'Update Thumbnail' : 'Auto-Generate Flat Proof'}
                </Button>
                <Button variant="outline" onClick={() => { setEditThumbnailDialogOpen(false); setNewThumbnailFile(null); }} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Customer Art</DialogTitle>
              <DialogDescription>Are you sure you want to permanently delete {selectedFile?.filename}? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button onClick={handleDelete} className="flex-1" variant="destructive">Delete Permanently</Button>
              <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setSelectedFile(null); }} className="flex-1">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // PRODUCTS LIST VIEW (when template is selected)
  if (selectedTemplate) {
    const filteredProducts = products.filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.item_id && product.item_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedTemplate.name}</h1>
              <p className="text-sm text-muted-foreground">
                {products.length} product{products.length !== 1 ? 's' : ''} in this template
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer Art
            </Button>
          </div>
        </div>
        {tileFileInput}
        <p className="text-sm text-muted-foreground -mt-2">
          Click the <Plus className="inline h-3.5 w-3.5 align-text-bottom" /> on a product to attach a file to it directly.
        </p>

        {/* Search */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Products Grid/List */}
        {filteredProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium mb-2">No products found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try adjusting your search' : 'No products in this template'}
            </p>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const artCount = getProductArtworkCount(product.item_id);
              const status = getProductArtworkStatus(product.item_id);
              const artThumb = product.item_id ? skuArtThumbnails[product.item_id] : undefined;
              const artPdf = product.item_id ? skuArtPdfUrls[product.item_id] : undefined;
              const tileImage = artThumb || product.image_url;
              return (
                <Card
                  key={product.id}
                  className="group cursor-pointer overflow-hidden transition-all hover:border-foreground/25"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-square bg-muted/40 flex items-center justify-center relative">
                    {tileImage ? (
                      <SignedImage src={tileImage} alt={product.name} className="w-full h-full object-cover" />
                    ) : artPdf ? (
                      <PdfThumbnail pdfUrl={artPdf} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-16 w-16 text-muted-foreground/30" />
                    )}
                    
                    {/* Status badge */}
                    <div className="absolute top-2 left-2">
                      {getStatusBadge(status)}
                    </div>

                    {/* Artwork count badge */}
                    {artCount.total > 0 && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {artCount.total}
                        </Badge>
                      </div>
                    )}

                    {/* Attach a file to this product without leaving the grid */}
                    {tileAddButton(product)}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {productNeedsAction(product.item_id) && actionDot()}
                      <h3 className="font-medium text-sm truncate">{getDisplayName(product.name)}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{product.item_id || 'No SKU'}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="bg-muted/50 border-b px-4 py-3">
              <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase">
                <div className="col-span-1"></div>
                <div className="col-span-4">Product</div>
                <div className="col-span-3">SKU</div>
                <div className="col-span-2">Customer Art</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1 text-right">Add</div>
              </div>
            </div>
            <div className="divide-y">
              {filteredProducts.map((product) => {
                const artCount = getProductArtworkCount(product.item_id);
                return (
                  <div
                    key={product.id}
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer items-center"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="col-span-1">
                      {(product.item_id && skuArtThumbnails[product.item_id]) || product.image_url ? (
                        <SignedImage
                          src={(product.item_id && skuArtThumbnails[product.item_id]) || product.image_url!}
                          alt={product.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <Package className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 font-medium text-sm truncate flex items-center gap-2 min-w-0">
                      {productNeedsAction(product.item_id) && actionDot()}
                      <span className="truncate">{getDisplayName(product.name)}</span>
                    </div>
                    <div className="col-span-3 text-sm font-mono text-muted-foreground">{product.item_id || '-'}</div>
                    <div className="col-span-2">
                      {artCount.total > 0 ? (
                        <Badge variant="secondary">{artCount.total} file{artCount.total !== 1 ? 's' : ''}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                    <div className="col-span-1">
                      {getStatusBadge(getProductArtworkStatus(product.item_id))}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {tileAddButton(product, "")}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Add Artwork Dialog */}
        <AddArtworkDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onSuccess={handleUploadSuccess}
          defaultCompanyId={companyFilter !== 'all' ? companyFilter : undefined}
          defaultArtworkType="customer"
        />
      </div>
    );
  }

  // TEMPLATE GRID VIEW (default)
  const filteredTemplates = templates.filter(t =>
    matchesBrand(t.brand_id) &&
    matchesAnyKind(t.product_type ? [t.product_type] : (templateProductTypes[t.id]?.length ? templateProductTypes[t.id] : [null])) &&
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-base font-semibold">Customer art</h2>
          <p className="text-muted-foreground text-sm">
            Upload customer-provided artwork for Vibe to proof. Browse by template and product.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkUploadDialogOpen(true)}>
            <FileArchive className="h-4 w-4 mr-2" />
            AI Bulk Upload
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer Art
          </Button>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: "Files", value: totalArtwork },
          { label: "Products with art", value: Object.keys(artworkCounts).length, tone: "muted" },
          { label: "Folders", value: templates.length, tone: "muted" },
        ]}
      />


      <FilterBar search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Search folders" }}>
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
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={onCompanyFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FilterBar>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <EmptyState
            title="No folders to show"
            hint="Customer art is kept per product inside its folder. Add products first, or clear the filters."
            action={
              <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add customer art
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTemplates.map((template) => {
            const templateThumbnail = getTemplateDisplayThumbnail(template);

            return (
            <Card
              key={template.id}
              className="group cursor-pointer overflow-hidden transition-all hover:border-foreground/25"
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="aspect-square bg-muted/40 flex items-center justify-center relative overflow-hidden">
                {templateThumbnail ? (
                  <SignedImage src={templateThumbnail} alt={template.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-16 w-16 text-muted-foreground/30" />
                )}
                {/* Status badge */}
                <div className="absolute top-2 left-2">
                  {getStatusBadge(templateStatus[template.id] || 'no_art')}
                </div>
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  {templateNeedsAction(template.id) && actionDot()}
                  <h3 className="font-medium text-sm leading-snug">{template.name}</h3>
                </div>
                {brandName(template.brand_id) && (
                  <p className="text-xs text-muted-foreground truncate">{brandName(template.brand_id)}</p>
                )}
                {template.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description.split('\n')[0]}
                  </p>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {brandCompanyId && (
        <ManageBrandsDialog
          open={manageBrandsOpen}
          onOpenChange={setManageBrandsOpen}
          companyId={brandCompanyId}
          brands={brands}
          onChanged={() => {
            refreshBrands();
            fetchTemplates();
          }}
        />
      )}

      {/* Add Artwork Dialog */}
      <AddArtworkDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        defaultCompanyId={companyFilter !== 'all' ? companyFilter : undefined}
        defaultArtworkType="customer"
      />

      {/* Bulk Upload Dialog */}
      <BulkArtworkUploadDialog
        open={bulkUploadDialogOpen}
        onOpenChange={setBulkUploadDialogOpen}
        onSuccess={handleUploadSuccess}
        restrictToCompany={companyFilter !== 'all' ? companyFilter : undefined}
        defaultArtworkType="customer"
      />
    </div>
  );
}
