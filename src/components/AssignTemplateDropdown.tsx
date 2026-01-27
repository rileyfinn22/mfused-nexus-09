import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Layers, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  state: string | null;
}

interface AssignTemplateDropdownProps {
  productId: string;
  currentTemplateId: string | null;
  companyId?: string;
  onTemplateAssigned: () => void;
}

export function AssignTemplateDropdown({
  productId,
  currentTemplateId,
  companyId,
  onTemplateAssigned,
}: AssignTemplateDropdownProps) {
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [companyId]);

  const fetchTemplates = async () => {
    try {
      let query = supabase
        .from("product_templates")
        .select("id, name, description, price, cost, state")
        .order("name");

      if (companyId) {
        query = query.or(`company_id.eq.${companyId},company_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const handleAssignTemplate = async (template: ProductTemplate | null) => {
    setLoading(true);
    try {
      const updateData: Record<string, any> = {
        template_id: template?.id || null,
      };

      // When assigning a template, also update the description and state
      if (template) {
        updateData.description = template.description;
        if (template.state) {
          updateData.state = template.state;
        }
      }

      const { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", productId);

      if (error) throw error;

      toast.success(
        template
          ? `Assigned to "${template.name}" template`
          : "Template removed"
      );
      onTemplateAssigned();
    } catch (error) {
      console.error("Error assigning template:", error);
      toast.error("Failed to assign template");
    } finally {
      setLoading(false);
    }
  };

  const currentTemplate = templates.find((t) => t.id === currentTemplateId);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <DropdownMenu>
        <HoverCardTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={loading}
              title={currentTemplate ? `Template: ${currentTemplate.name}` : "Assign template"}
            >
              <Layers
                className={`h-3.5 w-3.5 ${
                  currentTemplateId ? "text-primary" : "text-muted-foreground"
                }`}
              />
            </Button>
          </DropdownMenuTrigger>
        </HoverCardTrigger>
        <HoverCardContent 
          align="start" 
          side="top" 
          className="w-64 p-3"
          sideOffset={5}
        >
          {currentTemplate ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{currentTemplate.name}</p>
              {currentTemplate.description && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  {currentTemplate.description}
                </p>
              )}
              {(currentTemplate.price || currentTemplate.cost) && (
                <div className="flex gap-3 text-xs mt-2">
                  {currentTemplate.price && (
                    <span>Price: ${currentTemplate.price.toFixed(3)}</span>
                  )}
                  {currentTemplate.cost && (
                    <span className="text-muted-foreground">Cost: ${currentTemplate.cost.toFixed(3)}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No template assigned. Click to assign one.</p>
          )}
        </HoverCardContent>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Assign Template</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {currentTemplateId && (
            <>
              <DropdownMenuItem
                onClick={() => handleAssignTemplate(null)}
                className="text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Template
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {templates.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              No templates available
            </div>
          ) : (
            templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onClick={() => handleAssignTemplate(template)}
                className="flex items-center justify-between"
              >
                <span className="truncate">{template.name}</span>
                {template.id === currentTemplateId && (
                  <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </HoverCard>
  );
}
