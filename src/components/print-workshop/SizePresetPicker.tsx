import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tag, Box, ShoppingBag } from "lucide-react";

export interface PrintPreset {
  id: string;
  product_type: string;
  name: string;
  width_inches: number;
  height_inches: number;
  depth_inches: number;
  bleed_inches: number;
  panel_zones: any[];
  dieline_data: any;
}

interface SizePresetPickerProps {
  productType: string;
  onSelect: (preset: PrintPreset) => void;
}

const TYPE_ICONS: Record<string, typeof Tag> = {
  label: Tag,
  box: Box,
  bag: ShoppingBag,
};

export function SizePresetPicker({ productType, onSelect }: SizePresetPickerProps) {
  const [presets, setPresets] = useState<PrintPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPresets = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("print_presets")
        .select("*")
        .eq("product_type", productType)
        .eq("is_active", true)
        .order("sort_order");
      setPresets(
        (data || []).map((d: any) => ({
          ...d,
          width_inches: Number(d.width_inches),
          height_inches: Number(d.height_inches),
          depth_inches: Number(d.depth_inches),
          bleed_inches: Number(d.bleed_inches),
          panel_zones: Array.isArray(d.panel_zones) ? d.panel_zones : [],
        }))
      );
      setLoading(false);
    };
    fetchPresets();
  }, [productType]);

  const Icon = TYPE_ICONS[productType] || Tag;

  if (loading) return null;
  if (presets.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        Preset Size
      </Label>
      <Select
        onValueChange={(id) => {
          const preset = presets.find((p) => p.id === id);
          if (preset) onSelect(preset);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a standard size…" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                {p.name}
                {p.depth_inches > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {p.depth_inches}"D
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
          <SelectItem value="__custom">Custom Size</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
