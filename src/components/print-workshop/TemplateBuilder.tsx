import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TemplateEditor } from "./TemplateEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import type { Canvas as FabricCanvas } from "fabric";

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
  const [sourcePdfPath, setSourcePdfPath] = useState<string>(template?.source_pdf_path || "");
  const [saving, setSaving] = useState(false);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [isGlobal, setIsGlobal] = useState(template?.is_global || false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [assignedCompanyIds, setAssignedCompanyIds] = useState<string[]>([]);

  useEffect(() => {
    // Fetch all companies for assignment
    supabase.from("companies").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      setCompanies(data || []);
    });
    // Fetch existing assignments
    if (template?.id) {
      supabase.from("print_template_companies").select("company_id").eq("template_id", template.id).then(({ data }) => {
        setAssignedCompanyIds((data || []).map((r: any) => r.company_id));
      });
    }
  }, [template?.id]);

  const generateThumbnail = async (): Promise<string | null> => {
    try {
      // Strategy 1: Try capturing from Fabric canvas
      const canvas = fabricCanvasRef.current;
      if (canvas) {
        // Hide guides before capturing
        const guides = canvas.getObjects().filter((o: any) =>
          o.name === "_trimGuide" || o.name === "_snapGuide" || o.name === "_editHighlight"
        );
        guides.forEach((g: any) => g.set({ opacity: 0 }));
        canvas.renderAll();

        let dataUrl: string | null = null;
        try {
          dataUrl = canvas.toDataURL({ format: "png", multiplier: 0.5 });
        } catch {
          console.warn("Fabric toDataURL failed (tainted canvas), falling back to PDF thumbnail");
        }

        // Restore guides
        guides.forEach((g: any) => g.set({ opacity: 1 }));
        canvas.renderAll();

        if (dataUrl && dataUrl !== "data:,") {
          return await uploadThumbnailBlob(dataUrl);
        }
      }

      // Strategy 2: Generate thumbnail from the source PDF
      if (sourcePdfPath) {
        const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(sourcePdfPath);
        const cacheBustedUrl = `${urlData.publicUrl}${urlData.publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(sourcePdfPath)}-${Date.now()}`;
        const resp = await fetch(cacheBustedUrl, { cache: "no-store" });
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const { generatePdfThumbnailFromArrayBuffer } = await import("@/lib/pdfThumbnail");
          const pdfBlob = await generatePdfThumbnailFromArrayBuffer(buf, { maxWidth: 400 });
          const blobUrl = URL.createObjectURL(pdfBlob);
          const result = await uploadThumbnailBlob(blobUrl, pdfBlob);
          URL.revokeObjectURL(blobUrl);
          return result;
        }
      }

      return null;
    } catch (err) {
      console.warn("Thumbnail generation failed:", err);
      return null;
    }
  };

  const uploadThumbnailBlob = async (dataUrl: string, existingBlob?: Blob): Promise<string | null> => {
    try {
      const blob = existingBlob || await (await fetch(dataUrl)).blob();
      const fileName = `thumbnails/${template?.id || crypto.randomUUID()}_thumb.png`;
      const { error: uploadError } = await supabase.storage
        .from("print-files")
        .upload(fileName, blob, { upsert: true, contentType: "image/png" });
      if (uploadError) {
        console.warn("Thumbnail upload failed:", uploadError);
        return null;
      }
      const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(fileName);
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch (err) {
      console.warn("Thumbnail upload failed:", err);
      return null;
    }
  };

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
      const sanitizedCanvasData = canvasData
        ? (() => {
            const data = JSON.parse(JSON.stringify(canvasData));
            if (Array.isArray(data.objects)) {
              data.objects = data.objects.filter((obj: any) => {
                if (obj?.name !== "pdf_background") return true;
                const src = typeof obj?.src === "string" ? obj.src : "";
                return !sourcePdfPath && !src.startsWith("blob:");
              });
            }
            if (data?.backgroundImage?.src?.startsWith("blob:")) {
              delete data.backgroundImage;
            }
            return data;
          })()
        : null;

      // Generate thumbnail from current canvas
      const thumbnailUrl = await generateThumbnail();

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        product_type: productType,
        width_inches: widthInches,
        height_inches: heightInches,
        bleed_inches: bleedInches,
        preset_price_per_unit: presetPrice ? Number(presetPrice) : null,
        material_options: materialOptions,
        canvas_data: sanitizedCanvasData,
        source_pdf_path: sourcePdfPath || null,
        thumbnail_url: thumbnailUrl || template?.thumbnail_url || null,
        company_id: template?.company_id || null,
        created_by: user?.id || null,
        is_global: isGlobal,
      };

      let templateId = template?.id;

      if (template?.id) {
        const { error } = await supabase
          .from("print_templates")
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("print_templates")
          .insert(payload as any)
          .select("id")
          .single();
        if (error) throw error;
        templateId = inserted.id;
      }

      // Sync company assignments
      if (templateId) {
        // Delete existing assignments
        await supabase.from("print_template_companies").delete().eq("template_id", templateId);
        // Insert new ones
        if (assignedCompanyIds.length > 0) {
          const rows = assignedCompanyIds.map((cid) => ({
            template_id: templateId,
            company_id: cid,
          }));
          await supabase.from("print_template_companies").insert(rows as any);
        }
      }

      toast.success(template?.id ? "Template updated" : "Template created");
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

            {/* Company Assignment */}
            <div className="space-y-2 border-t pt-4">
              <Label className="font-semibold">Company Access</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_global"
                  checked={isGlobal}
                  onCheckedChange={(c) => setIsGlobal(!!c)}
                />
                <label htmlFor="is_global" className="text-sm">Available to all companies</label>
              </div>
              {!isGlobal && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                  {companies.map((co) => (
                    <div key={co.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`co-${co.id}`}
                        checked={assignedCompanyIds.includes(co.id)}
                        onCheckedChange={(checked) => {
                          setAssignedCompanyIds((prev) =>
                            checked
                              ? [...prev, co.id]
                              : prev.filter((id) => id !== co.id)
                          );
                        }}
                      />
                      <label htmlFor={`co-${co.id}`} className="text-sm">{co.name}</label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {isGlobal ? "All companies can see this template" : `${assignedCompanyIds.length} company(s) selected`}
              </p>
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
            onSourcePdfChange={setSourcePdfPath}
            sourcePdfPath={sourcePdfPath}
            mode="edit"
            fabricCanvasRef={fabricCanvasRef}
          />
        </div>
      </div>
    </div>
  );
}
