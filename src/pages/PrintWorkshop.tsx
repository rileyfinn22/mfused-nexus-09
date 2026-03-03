import { useEffect, useState, useRef } from "react";
import { Canvas as FabricCanvas } from "fabric";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateBuilder } from "@/components/print-workshop/TemplateBuilder";
import { TemplateEditor } from "@/components/print-workshop/TemplateEditor";
import { OrderPanel } from "@/components/print-workshop/OrderPanel";
import { PrintCart, type CartItem } from "@/components/print-workshop/PrintCart";
import { PrintCheckout } from "@/components/print-workshop/PrintCheckout";
import { SavedDesignIndicator } from "@/components/print-workshop/SavedDesignIndicator";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkshopOrders } from "@/components/print-workshop/WorkshopOrders";
import { Plus, Printer, ArrowLeft, Pencil, Trash2, Copy, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";
import { generatePdfThumbnailFromArrayBuffer } from "@/lib/pdfThumbnail";

type View = "browse" | "build" | "use" | "checkout";

export default function PrintWorkshop() {
  const { isVibeAdmin, activeCompanyId, loading: roleLoading } = useActiveCompany();
  const [view, setView] = useState<View>("browse");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [canvasData, setCanvasData] = useState<any>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const useFabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const [savedDesign, setSavedDesign] = useState<{ thumbnailUrl: string | null; templateName: string; savedAt: Date } | null>(null);

  const captureEditedThumbnail = (): string | null => {
    const canvas = useFabricCanvasRef.current;
    if (!canvas) return null;
    try {
      const guides = canvas.getObjects().filter((o: any) =>
        o.name === "_trimGuide" || o.name === "_snapGuide" || o.name === "_editHighlight"
      );
      guides.forEach((g: any) => g.set({ opacity: 0 }));
      canvas.renderAll();
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 0.5 });
      guides.forEach((g: any) => g.set({ opacity: 1 }));
      canvas.renderAll();
      if (dataUrl && dataUrl !== "data:,") return dataUrl;
    } catch {
      console.warn("Could not capture edited thumbnail");
    }
    return null;
  };

  const fetchTemplates = async () => {
    setLoading(true);
    
    if (isVibeAdmin) {
      // Admins see all templates
      const { data, error } = await supabase
        .from("print_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        toast.error("Failed to load templates");
      } else {
        setTemplates(data || []);
      }
    } else if (activeCompanyId) {
      // Company users see global templates + templates assigned to their company
      const { data: allTemplates, error: tErr } = await supabase
        .from("print_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (tErr) {
        toast.error("Failed to load templates");
        setTemplates([]);
      } else {
        const { data: assignments } = await supabase
          .from("print_template_companies")
          .select("template_id")
          .eq("company_id", activeCompanyId);

        const assignedIds = new Set((assignments || []).map((a: any) => a.template_id));

        const visible = (allTemplates || []).filter(
          (t: any) => t.is_global || assignedIds.has(t.id)
        );
        setTemplates(visible);
      }
    } else {
      setTemplates([]);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (!roleLoading) fetchTemplates();
  }, [roleLoading]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("print_templates").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Template deleted");
      fetchTemplates();
    }
  };

  const handleDuplicateTemplate = async (tmpl: any) => {
    const { id, created_at, updated_at, ...rest } = tmpl;
    const { error } = await supabase.from("print_templates").insert({
      ...rest,
      name: `(Copy) ${tmpl.name}`,
    } as any);
    if (error) {
      toast.error("Failed to duplicate template");
    } else {
      toast.success("Template duplicated");
      fetchTemplates();
    }
  };

  const handleSelectTemplate = (tmpl: any) => {
    setSelectedTemplate(tmpl);
    setCanvasData(tmpl.canvas_data);
    setView("use");
  };

  const handleEditTemplate = (tmpl: any) => {
    setEditingTemplate(tmpl);
    setView("build");
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setView("build");
  };

  const handleBack = () => {
    setView("browse");
    setSelectedTemplate(null);
    setEditingTemplate(null);
    setSavedDesign(null);
    fetchTemplates();
  };

  const handleSaveDesign = async () => {
    if (!selectedTemplate || !canvasData) return;
    setSavingDesign(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const companyId = activeCompanyId || selectedTemplate.company_id;
      const saveId = crypto.randomUUID();

      // Generate print-ready PDF
      let printFileUrl: string | null = null;
      let pdfBlob: Blob | null = null;
      try {
        if (selectedTemplate.source_pdf_path) {
          pdfBlob = await generatePrintReadyPdf({
            sourcePdfPath: selectedTemplate.source_pdf_path,
            canvasData,
            widthInches: selectedTemplate.width_inches,
            heightInches: selectedTemplate.height_inches,
            bleedInches: selectedTemplate.bleed_inches,
          });
        } else {
          pdfBlob = await generateCanvasOnlyPdf({
            canvasData,
            widthInches: selectedTemplate.width_inches,
            heightInches: selectedTemplate.height_inches,
            bleedInches: selectedTemplate.bleed_inches,
          });
        }
        const pdfPath = `saved-designs/${saveId}/print_ready.pdf`;
        const { error: pdfErr } = await supabase.storage
          .from("print-files")
          .upload(pdfPath, pdfBlob, { contentType: "application/pdf" });
        if (!pdfErr) {
          const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(pdfPath);
          printFileUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.warn("Could not generate print file for save", e);
      }

      // Generate thumbnail
      let thumbnailUrl: string | null = null;
      // Try canvas capture first
      const editedThumb = captureEditedThumbnail();
      if (editedThumb && editedThumb.startsWith("data:")) {
        try {
          const res = await fetch(editedThumb);
          const thumbBlob = await res.blob();
          const thumbPath = `saved-designs/${saveId}/thumbnail.png`;
          const { error: thumbErr } = await supabase.storage
            .from("print-files")
            .upload(thumbPath, thumbBlob, { contentType: "image/png" });
          if (!thumbErr) {
            const { data: thumbUrl } = supabase.storage.from("print-files").getPublicUrl(thumbPath);
            thumbnailUrl = thumbUrl.publicUrl;
          }
        } catch {}
      }
      // Fallback: generate from PDF
      if (!thumbnailUrl && pdfBlob) {
        try {
          const pdfBuf = await pdfBlob.arrayBuffer();
          const thumbBlob = await generatePdfThumbnailFromArrayBuffer(pdfBuf, { maxWidth: 400 });
          const thumbPath = `saved-designs/${saveId}/thumbnail.png`;
          const { error: thumbErr } = await supabase.storage
            .from("print-files")
            .upload(thumbPath, thumbBlob, { contentType: "image/png" });
          if (!thumbErr) {
            const { data: thumbUrl } = supabase.storage.from("print-files").getPublicUrl(thumbPath);
            thumbnailUrl = thumbUrl.publicUrl;
          }
        } catch {}
      }

      // Save record to database
      const { error: dbErr } = await supabase.from("design_saves").insert({
        id: saveId,
        company_id: companyId,
        template_id: selectedTemplate.id,
        template_name: selectedTemplate.name,
        canvas_data: canvasData,
        thumbnail_url: thumbnailUrl,
        print_file_url: printFileUrl,
        source_pdf_path: selectedTemplate.source_pdf_path,
        width_inches: selectedTemplate.width_inches,
        height_inches: selectedTemplate.height_inches,
        bleed_inches: selectedTemplate.bleed_inches,
        created_by: user?.id || null,
      } as any);

      if (dbErr) throw dbErr;

      setSavedDesign({
        thumbnailUrl: thumbnailUrl || editedThumb,
        templateName: selectedTemplate.name,
        savedAt: new Date(),
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to save design");
    } finally {
      setSavingDesign(false);
    }
  };

  const handleAddToCart = (item: Omit<CartItem, "id">) => {
    const editedThumb = captureEditedThumbnail();
    const newItem: CartItem = {
      ...item,
      id: crypto.randomUUID(),
      thumbnailUrl: editedThumb || item.thumbnailUrl,
      // For company users, use their active company
      companyId: item.companyId || activeCompanyId,
    };
    setCartItems((prev) => [...prev, newItem]);
    toast.success(`"${item.templateName}" added to cart`);
    setView("browse");
    setSelectedTemplate(null);
  };

  const handleUpdateCartQty = (id: string, quantity: number) => {
    setCartItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  };

  const handleRemoveCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Browse mode
  if (view === "browse") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Printer className="h-6 w-6" />
              Print Workshop
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isVibeAdmin
                ? "Manage templates and process print orders"
                : "Browse and order custom printed products"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PrintCart
              items={cartItems}
              onUpdateQuantity={handleUpdateCartQty}
              onRemoveItem={handleRemoveCartItem}
              onClearCart={handleClearCart}
              onCheckout={() => setView("checkout")}
            />
            {isVibeAdmin && (
              <Button onClick={handleNewTemplate} className="gap-2">
                <Plus className="h-4 w-4" /> New Template
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates" className="gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" />
              {isVibeAdmin ? "Templates" : "Shop"}
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              {isVibeAdmin ? "All Orders" : "My Orders"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="aspect-[4/3] bg-muted rounded-lg mb-3" />
                      <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Printer className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">No templates yet</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    {isVibeAdmin
                      ? "Create your first label template to get started"
                      : "Check back soon for available products"}
                  </p>
                  {isVibeAdmin && (
                    <Button onClick={handleNewTemplate} className="gap-2">
                      <Plus className="h-4 w-4" /> Create Template
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {templates.map((tmpl) => (
                  <Card
                    key={tmpl.id}
                    className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                    onClick={() => handleSelectTemplate(tmpl)}
                  >
                    <CardContent className="p-0">
                      {/* Thumbnail */}
                      <div className="aspect-[4/3] bg-muted/30 rounded-t-lg flex items-center justify-center overflow-hidden border-b border-border">
                        {tmpl.thumbnail_url ? (
                          <img src={tmpl.thumbnail_url} alt={tmpl.name} className="w-full h-full object-contain p-3" />
                        ) : (
                          <Printer className="h-10 w-10 text-muted-foreground/30" />
                        )}
                      </div>
                      {/* Details */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">{tmpl.name}</h3>
                            {tmpl.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
                            )}
                          </div>
                          {/* Admin controls */}
                          {isVibeAdmin && (
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDuplicateTemplate(tmpl)} title="Duplicate">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(tmpl)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeleteTemplate(tmpl.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {tmpl.width_inches}" × {tmpl.height_inches}"
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {tmpl.product_type}
                          </Badge>
                          {tmpl.preset_price_per_unit != null && (
                            <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                              ${Number(tmpl.preset_price_per_unit).toFixed(4)}/ea
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            <WorkshopOrders />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Build mode - admin only
  if (view === "build") {
    if (!isVibeAdmin) {
      setView("browse");
      return null;
    }
    return (
      <TemplateBuilder
        template={editingTemplate}
        onBack={handleBack}
        onSaved={handleBack}
      />
    );
  }

  // Use mode - customize template & add to cart
  if (view === "use" && selectedTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div>
              <h2 className="text-xl font-semibold">{selectedTemplate.name}</h2>
              {selectedTemplate.description && (
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              )}
            </div>
          </div>
          <PrintCart
            items={cartItems}
            onUpdateQuantity={handleUpdateCartQty}
            onRemoveItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onCheckout={() => setView("checkout")}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TemplateEditor
              canvasData={canvasData}
              width={selectedTemplate.width_inches}
              height={selectedTemplate.height_inches}
              bleed={selectedTemplate.bleed_inches}
              onCanvasChange={setCanvasData}
              sourcePdfPath={selectedTemplate.source_pdf_path}
              mode="use"
              fabricCanvasRef={useFabricCanvasRef}
            />
          </div>
          <div>
            <OrderPanel
              template={selectedTemplate}
              canvasData={canvasData}
              onAddToCart={handleAddToCart}
              onSaveDesign={handleSaveDesign}
              isSaving={savingDesign}
              isSaved={!!savedDesign}
            />
          </div>
        </div>

        {/* Floating saved design indicator */}
        {savedDesign && (
          <SavedDesignIndicator
            thumbnailUrl={savedDesign.thumbnailUrl}
            templateName={savedDesign.templateName}
            savedAt={savedDesign.savedAt}
            onDismiss={() => setSavedDesign(null)}
          />
        )}
      </div>
    );
  }

  // Checkout mode
  if (view === "checkout") {
    return (
      <PrintCheckout
        items={cartItems}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onBack={() => setView("browse")}
      />
    );
  }

  return null;
}
