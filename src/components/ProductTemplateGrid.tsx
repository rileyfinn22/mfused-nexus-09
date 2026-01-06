import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { supabase } from "@/integrations/supabase/client";
import { Package, Plus, Pencil, Upload, X, ImageIcon, Copy, Trash2, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
  thumbnail_url: string | null;
  state: string | null;
  product_count?: number;
}

interface ProductTemplateGridProps {
  companyFilter: string;
  isVibeAdmin: boolean;
  onSelectTemplate: (template: ProductTemplate | null) => void;
  selectedTemplate: ProductTemplate | null;
}

export function ProductTemplateGrid({ 
  companyFilter, 
  isVibeAdmin, 
  onSelectTemplate,
  selectedTemplate 
}: ProductTemplateGridProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editState, setEditState] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ProductTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    fetchTemplates();
  }, [companyFilter]);

  const fetchTemplates = async () => {
    try {
      // Fetch templates (when a company is selected, only show that company's templates + global)
      let templatesQuery = supabase
        .from('product_templates')
        .select('*');

      if (companyFilter !== 'all') {
        templatesQuery = templatesQuery.or(`company_id.eq.${companyFilter},company_id.is.null`);
      }

      const { data: templatesData, error: templatesError } = await templatesQuery.order('name');

      if (templatesError) throw templatesError;

      // Fetch product counts for each template (scoped to selected company when filtered)
      const templatesWithCounts = await Promise.all(
        (templatesData || []).map(async (template) => {
          let query = supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', template.id);

          if (companyFilter !== 'all') {
            query = query.eq('company_id', companyFilter);
          }

          const { count } = await query;

          return {
            ...template,
            product_count: count || 0
          };
        })
      );

      setTemplates(templatesWithCounts);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (template: ProductTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description || "");
    setEditPrice(template.price?.toString() || "");
    setEditCost(template.cost?.toString() || "");
    setEditState(template.state || "");
    setImagePreview(template.thumbnail_url);
    setImageFile(null);
    setEditDialogOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Image too large", description: "Maximum size is 5MB", variant: "destructive" });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setSaving(true);

    try {
      let thumbnailUrl = editingTemplate.thumbnail_url;

      // Upload new image if selected
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `templates/${editingTemplate.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, imageFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        thumbnailUrl = publicUrl;
      }

      const { error } = await supabase
        .from('product_templates')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          price: editPrice ? parseFloat(editPrice) : null,
          cost: editCost ? parseFloat(editCost) : null,
          state: editState.trim() || null,
          thumbnail_url: thumbnailUrl
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;

      toast({ title: "Template updated", description: "Changes saved successfully." });
      setEditDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error updating template:', error);
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleDuplicateTemplate = async (template: ProductTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicating(true);

    try {
      const { error } = await supabase
        .from('product_templates')
        .insert({
          name: `${template.name} (Copy)`,
          description: template.description,
          price: template.price,
          cost: template.cost,
          company_id: template.company_id,
          thumbnail_url: template.thumbnail_url
        });

      if (error) throw error;

      toast({ title: "Template duplicated", description: "A copy of the template has been created." });
      fetchTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast({ title: "Error", description: "Failed to duplicate template.", variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  };

  const openDeleteDialog = (template: ProductTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setDeleting(true);

    try {
      // First, unlink products from this template (set template_id to null)
      const { error: unlinkError } = await supabase
        .from('products')
        .update({ template_id: null })
        .eq('template_id', deletingTemplate.id);

      if (unlinkError) throw unlinkError;

      // Then delete the template
      const { error } = await supabase
        .from('product_templates')
        .delete()
        .eq('id', deletingTemplate.id);

      if (error) throw error;

      toast({ title: "Template deleted", description: "The template has been removed." });
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
      
      // Clear selection if deleted template was selected
      if (selectedTemplate?.id === deletingTemplate.id) {
        onSelectTemplate(null);
      }
      
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="aspect-square animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className={cn(
              "group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative",
              selectedTemplate?.id === template.id && "ring-2 ring-primary"
            )}
            onClick={() => onSelectTemplate(template)}
          >
            {/* Admin action buttons */}
            {isVibeAdmin && (
              <div className="absolute top-2 left-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 bg-background/90 backdrop-blur-sm"
                  onClick={(e) => openEditDialog(template, e)}
                  title="Edit template"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 bg-background/90 backdrop-blur-sm"
                  onClick={(e) => handleDuplicateTemplate(template, e)}
                  disabled={duplicating}
                  title="Duplicate template"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 bg-background/90 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => openDeleteDialog(template, e)}
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Template Image/Icon Area */}
            <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
              {template.thumbnail_url ? (
                <img 
                  src={template.thumbnail_url} 
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-16 w-16 text-muted-foreground/30" />
              )}
              
              {/* Product count badge */}
              <Badge 
                variant="secondary" 
                className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm"
              >
                {template.product_count} SKU{template.product_count !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Template Info */}
            <div className="p-3 space-y-1">
              <h3 className="font-medium text-sm leading-snug">{template.name}</h3>
              {template.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {template.description.split('\n')[0]}
                </p>
              )}
            </div>
          </Card>
        ))}

        {/* Add Template Card - Only for vibe_admin */}
        {isVibeAdmin && (
          <Card className="aspect-square border-dashed border-2 flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
            <div className="text-center text-muted-foreground">
              <Plus className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm font-medium">Add Template</p>
            </div>
          </Card>
        )}
      </div>
      ) : (
        /* List View */
        <Card className="overflow-hidden">
          <div className="bg-muted/50 border-b border-border px-4 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1"></div>
              <div className="col-span-4">Template Name</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Products</div>
              <div className="col-span-1">Actions</div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {templates.map((template) => (
              <div
                key={template.id}
                className={cn(
                  "grid grid-cols-12 gap-4 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer items-center",
                  selectedTemplate?.id === template.id && "bg-primary/5"
                )}
                onClick={() => onSelectTemplate(template)}
              >
                <div className="col-span-1">
                  {template.thumbnail_url ? (
                    <img src={template.thumbnail_url} alt={template.name} className="w-10 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="col-span-4 font-medium text-sm">{template.name}</div>
                <div className="col-span-4 text-sm text-muted-foreground truncate">
                  {template.description?.split('\n')[0] || '-'}
                </div>
                <div className="col-span-2">
                  <Badge variant="secondary">{template.product_count} SKUs</Badge>
                </div>
                <div className="col-span-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {isVibeAdmin && (
                    <>
                      <Button variant="ghost" size="sm" onClick={(e) => openEditDialog(template, e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => handleDuplicateTemplate(template, e)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => openDeleteDialog(template, e)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {isVibeAdmin && (
              <div className="px-4 py-3 text-center">
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Template
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Thumbnail Upload */}
            <div className="space-y-2">
              <Label>Thumbnail Image</Label>
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/30">
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-5 w-5"
                        onClick={clearImage}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                    id="template-image"
                  />
                  <Label
                    htmlFor="template-image"
                    className="inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-accent text-sm"
                  >
                    <Upload className="h-4 w-4" />
                    {imagePreview ? "Change Image" : "Upload Image"}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">Max 5MB. JPEG, PNG, or WebP</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Template name"
              />
            </div>

            {/* Price & Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-price">Default Price ($)</Label>
                <Input
                  id="template-price"
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-cost">Default Cost ($)</Label>
                <Input
                  id="template-cost"
                  type="number"
                  step="0.01"
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* State */}
            <div className="space-y-2">
              <Label htmlFor="template-state">State</Label>
              <Input
                id="template-state"
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
                placeholder="e.g., WA, CA, general"
              />
              <p className="text-xs text-muted-foreground">Link this template to a specific state/region</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="template-description">Description / Specs</Label>
              <Textarea
                id="template-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Template description, specifications, etc."
                rows={4}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={saving || !editName.trim()}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.name}"? 
              Products linked to this template will be unlinked but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
