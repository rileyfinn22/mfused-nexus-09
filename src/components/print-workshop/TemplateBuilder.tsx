import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateEditor } from "./TemplateEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

interface TemplateBuilderProps {
  template?: any;
  onBack: () => void;
  onSaved: () => void;
}

export function TemplateBuilder({ template, onBack, onSaved }: TemplateBuilderProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [productType, setProductType] = useState(template?.product_type || "label");
  const [widthInches, setWidthInches] = useState(template?.width_inches || 4);
  const [heightInches, setHeightInches] = useState(template?.height_inches || 6);
  const [bleedInches, setBleedInches] = useState(template?.bleed_inches || 0.125);
  const [presetPrice, setPresetPrice] = useState(template?.preset_price_per_unit || "");
  const [materialOptions, setMaterialOptions] = useState<string[]>(
    template?.material_options || ["Matte", "Gloss", "Kraft"]
  );
  const [newMaterial, setNewMaterial] = useState("");
  const [canvasData, setCanvasData] = useState<any>(template?.canvas_data || null);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState(template?.company_id || "");

  const addMaterial = () => {
    if (newMaterial.trim() && !materialOptions.includes(newMaterial.trim())) {
      setMaterialOptions([...materialOptions, newMaterial.trim()]);
      setNewMaterial("");
    }
  };

  const removeMaterial = (mat: string) => {
    setMaterialOptions(materialOptions.filter((m) => m !== mat));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        product_type: productType,
        width_inches: widthInches,
        height_inches: heightInches,
        bleed_inches: bleedInches,
        preset_price_per_unit: presetPrice ? Number(presetPrice) : null,
        material_options: materialOptions,
        canvas_data: canvasData,
        company_id: companyId || null,
        created_by: user?.id || null,
      };

      if (template?.id) {
        const { error } = await supabase
          .from("print_templates")
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
        toast.success("Template updated");
      } else {
        const { error } = await supabase
          .from("print_templates")
          .insert(payload as any);
        if (error) throw error;
        toast.success("Template created");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h2 className="text-xl font-semibold">
          {template ? "Edit Template" : "New Template"}
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Template Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Compliance Label" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Template description..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Product Type</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="label">Label</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="bag">Bag</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Width (in)</Label>
                <Input type="number" value={widthInches} onChange={(e) => setWidthInches(Number(e.target.value))} step={0.25} min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height (in)</Label>
                <Input type="number" value={heightInches} onChange={(e) => setHeightInches(Number(e.target.value))} step={0.25} min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bleed (in)</Label>
                <Input type="number" value={bleedInches} onChange={(e) => setBleedInches(Number(e.target.value))} step={0.0625} min={0} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preset Price / Unit ($)</Label>
              <Input type="number" value={presetPrice} onChange={(e) => setPresetPrice(e.target.value)} placeholder="Leave blank for quote-based" step={0.01} min={0} />
              <p className="text-xs text-muted-foreground">Leave empty if price needs admin quoting</p>
            </div>

            <div className="space-y-2">
              <Label>Materials</Label>
              <div className="flex flex-wrap gap-1.5">
                {materialOptions.map((mat) => (
                  <span key={mat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                    {mat}
                    <button onClick={() => removeMaterial(mat)} className="hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} placeholder="Add material" className="text-sm" onKeyDown={(e) => e.key === "Enter" && addMaterial()} />
                <Button size="sm" variant="outline" onClick={addMaterial}>Add</Button>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Template"}
            </Button>
          </CardContent>
        </Card>

        {/* Canvas editor */}
        <div className="lg:col-span-2">
          <TemplateEditor
            canvasData={canvasData}
            width={widthInches}
            height={heightInches}
            bleed={bleedInches}
            onCanvasChange={setCanvasData}
            mode="edit"
          />
        </div>
      </div>
    </div>
  );
}
