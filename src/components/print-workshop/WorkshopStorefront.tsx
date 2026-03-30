import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Printer,
  Pencil,
  Trash2,
  Copy,
  Package,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Box,
  Search,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PdfThumbnail from "@/components/PdfThumbnail";

interface WorkshopStorefrontProps {
  templates: any[];
  loading: boolean;
  isVibeAdmin: boolean;
  cartItems: { templateId?: string }[];
  onSelectTemplate: (tmpl: any) => void;
  onEditTemplate: (tmpl: any) => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (tmpl: any) => void;
  onNewTemplate: () => void;
  onStartCustomOrder?: () => void;
}

const CATEGORY_ALL = "all";
const CATEGORIES = [
  { key: "all", label: "All Products", icon: Sparkles },
  { key: "label", label: "Labels", icon: Tag },
  { key: "box", label: "Boxes", icon: Box },
  { key: "bag", label: "Bags", icon: ShoppingBag },
] as const;

export function WorkshopStorefront({
  templates,
  loading,
  isVibeAdmin,
  cartItems,
  onSelectTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onNewTemplate,
  onStartCustomOrder,
}: WorkshopStorefrontProps) {
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  const [search, setSearch] = useState("");

  const filtered = templates.filter((t) => {
    if (activeCategory !== CATEGORY_ALL && t.product_type !== activeCategory)
      return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: templates.length,
    label: templates.filter((t) => t.product_type === "label").length,
    box: templates.filter((t) => t.product_type === "box").length,
    bag: templates.filter((t) => t.product_type === "bag").length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <HeroBanner />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse border-0 shadow-sm">
              <CardContent className="p-0">
                <div className="aspect-square bg-muted rounded-t-lg" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeroBanner />

      {/* Category tabs + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl p-1">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCategory === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span
                className={`text-xs ml-0.5 ${
                  activeCategory === key
                    ? "text-primary font-semibold"
                    : "text-muted-foreground/60"
                }`}
              >
                {counts[key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Template grid */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Printer className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {search ? "No matching templates" : "No templates yet"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {search
                ? "Try a different search term"
                : isVibeAdmin
                ? "Create your first template to get started"
                : "Check back soon for available products"}
            </p>
            {isVibeAdmin && !search && (
              <Button onClick={onNewTemplate} className="gap-2">
                <Plus className="h-4 w-4" /> Create Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {/* Start Custom Order card */}
          {onStartCustomOrder && (
            <Card
              className="group cursor-pointer border-dashed border-2 border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all flex items-center justify-center min-h-[280px]"
              onClick={onStartCustomOrder}
            >
              <CardContent className="flex flex-col items-center justify-center text-center p-6">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Start Custom Order</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick a size, upload artwork, and order
                </p>
              </CardContent>
            </Card>
          )}

          {/* Add new template card for admins */}
          {isVibeAdmin && (
            <Card
              className="group cursor-pointer border-dashed border-2 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center min-h-[280px]"
              onClick={onNewTemplate}
            >
              <CardContent className="flex flex-col items-center justify-center text-center p-6">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Plus className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">New Template</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a new product template
                </p>
              </CardContent>
            </Card>
          )}

          {filtered.map((tmpl) => {
            const inCart = cartItems.some((c) => c.templateId === tmpl.id);
            const TypeIcon =
              tmpl.product_type === "box"
                ? Box
                : tmpl.product_type === "bag"
                ? ShoppingBag
                : Tag;

            return (
              <Card
                key={tmpl.id}
                className="group cursor-pointer border-0 shadow-sm hover:shadow-lg transition-all relative overflow-hidden"
                onClick={() => onSelectTemplate(tmpl)}
              >
                {inCart && (
                  <div className="absolute top-3 right-3 z-10">
                    <Badge className="text-[10px] px-2 py-0.5 bg-primary text-primary-foreground gap-1 shadow-sm">
                      <ShoppingCart className="h-2.5 w-2.5" />
                      In Cart
                    </Badge>
                  </div>
                )}
                <CardContent className="p-0">
                  {/* Thumbnail */}
                  <div className="aspect-square bg-gradient-to-br from-muted/30 to-muted/60 flex items-center justify-center overflow-hidden relative">
                    {tmpl.thumbnail_url ? (
                      <img
                        src={tmpl.thumbnail_url}
                        alt={tmpl.name}
                        className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : tmpl.source_pdf_path ? (
                      <PdfThumbnail
                        pdfUrl={supabase.storage.from("print-files").getPublicUrl(tmpl.source_pdf_path).data.publicUrl}
                        alt={tmpl.name}
                        className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-300"
                        maxWidth={400}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <TypeIcon className="h-16 w-16 text-muted-foreground/20" />
                      </div>
                    )}
                    {/* Hover overlay for admin actions */}
                    {isVibeAdmin && (
                      <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 gap-1.5 shadow-sm"
                          onClick={() => onSelectTemplate(tmpl)}
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Customize
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 shadow-sm"
                          onClick={() => onEditTemplate(tmpl)}
                          title="Edit Template"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 shadow-sm"
                          onClick={() => onDuplicateTemplate(tmpl)}
                          title="Duplicate"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 text-destructive shadow-sm"
                          onClick={() => onDeleteTemplate(tmpl.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TypeIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                        {tmpl.product_type}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm leading-tight">
                      {tmpl.name}
                    </h3>
                    {tmpl.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tmpl.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-3">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {tmpl.width_inches}" × {tmpl.height_inches}"
                      </Badge>
                      {tmpl.preset_price_per_unit != null && (
                        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 font-normal">
                          ${Number(tmpl.preset_price_per_unit).toFixed(4)}/ea
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border border-primary/10 p-8 sm:p-10">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl" />

      <div className="relative z-10 max-w-xl">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-4">
          <Printer className="h-3 w-3" />
          Print Workshop
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Design Your Packaging
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-md">
          Browse templates for labels, boxes, and bags. Customize your artwork,
          pick materials, and submit print-on-demand orders — all from your
          browser.
        </p>
        <div className="flex items-center gap-4 mt-5">
          {[
            { icon: Tag, label: "Labels" },
            { icon: Box, label: "Boxes" },
            { icon: ShoppingBag, label: "Bags" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon className="h-4 w-4 text-primary/70" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
