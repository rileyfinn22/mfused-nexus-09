import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateBuilder } from "@/components/print-workshop/TemplateBuilder";
import { TemplateEditor } from "@/components/print-workshop/TemplateEditor";
import { OrderPanel } from "@/components/print-workshop/OrderPanel";
import { PrintCart, type CartItem } from "@/components/print-workshop/PrintCart";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { Plus, Printer, ArrowLeft, Pencil, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";

type View = "browse" | "build" | "use";

export default function PrintWorkshop() {
  const { isVibeAdmin, loading: roleLoading } = useActiveCompany();
  const [view, setView] = useState<View>("browse");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [canvasData, setCanvasData] = useState<any>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("print_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load templates");
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!roleLoading && isVibeAdmin) fetchTemplates();
  }, [roleLoading, isVibeAdmin]);

  // Gate: vibe_admin only
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (!isVibeAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Access restricted to internal admins.
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
    fetchTemplates();
  };

  const handleAddToCart = (item: Omit<CartItem, "id">) => {
    const newItem: CartItem = { ...item, id: crypto.randomUUID() };
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
              Create and customize label templates for on-demand printing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PrintCart
              items={cartItems}
              onUpdateQuantity={handleUpdateCartQty}
              onRemoveItem={handleRemoveCartItem}
              onClearCart={handleClearCart}
            />
            <Button onClick={handleNewTemplate} className="gap-2">
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-32 bg-muted rounded mb-4" />
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
                Create your first label template to get started
              </p>
              <Button onClick={handleNewTemplate} className="gap-2">
                <Plus className="h-4 w-4" /> Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <Card
                key={tmpl.id}
                className="group cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleSelectTemplate(tmpl)}
              >
                <CardContent className="p-4">
                  <div className="h-32 bg-muted/50 rounded-lg mb-3 flex items-center justify-center border border-border">
                    {tmpl.thumbnail_url ? (
                      <img src={tmpl.thumbnail_url} alt={tmpl.name} className="max-h-full object-contain rounded" />
                    ) : (
                      <Printer className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{tmpl.name}</h3>
                      {tmpl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {tmpl.width_inches}" × {tmpl.height_inches}"
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {tmpl.product_type}
                        </Badge>
                        {tmpl.preset_price_per_unit && (
                          <Badge variant="default" className="text-xs">
                            ${Number(tmpl.preset_price_per_unit).toFixed(4)}/ea
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Build mode
  if (view === "build") {
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
            />
          </div>
          <div>
            <OrderPanel
              template={selectedTemplate}
              canvasData={canvasData}
              onAddToCart={handleAddToCart}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
