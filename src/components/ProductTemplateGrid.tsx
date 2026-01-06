import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Package, ArrowLeft, Plus, Edit, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  company_id: string | null;
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
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="aspect-square animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {templates.map((template) => (
        <Card
          key={template.id}
          className={cn(
            "group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50",
            selectedTemplate?.id === template.id && "ring-2 ring-primary"
          )}
          onClick={() => onSelectTemplate(template)}
        >
          {/* Template Image/Icon Area */}
          <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative">
            <Package className="h-16 w-16 text-muted-foreground/30" />
            
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
            <h3 className="font-medium text-sm truncate">{template.name}</h3>
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
  );
}
