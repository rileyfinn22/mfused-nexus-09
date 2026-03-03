import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart, DollarSign, Download } from "lucide-react";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";
import type { CartItem } from "./PrintCart";

interface OrderPanelProps {
  template: any;
  canvasData: any;
  onAddToCart: (item: Omit<CartItem, "id">) => void;
}

export function OrderPanel({ template, canvasData, onAddToCart }: OrderPanelProps) {
  const [material, setMaterial] = useState<string>(
    (template.material_options as string[])?.[0] || ""
  );
  const [quantity, setQuantity] = useState(100);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const hasPresetPrice = template.preset_price_per_unit != null;
  const pricePerUnit = hasPresetPrice ? Number(template.preset_price_per_unit) : null;
  const total = pricePerUnit ? pricePerUnit * quantity : null;
  const hasSourcePdf = !!template.source_pdf_path;

  const handleGeneratePrintFile = async () => {
    setGeneratingPdf(true);
    try {
      let blob: Blob;
      if (hasSourcePdf) {
        blob = await generatePrintReadyPdf({
          sourcePdfPath: template.source_pdf_path,
          canvasData,
          widthInches: template.width_inches,
          heightInches: template.height_inches,
          bleedInches: template.bleed_inches,
        });
      } else {
        blob = await generateCanvasOnlyPdf({
          canvasData,
          widthInches: template.width_inches,
          heightInches: template.height_inches,
          bleedInches: template.bleed_inches,
        });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.replace(/\s+/g, "_")}_print_ready.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Print-ready PDF generated!");
    } catch (err: any) {
      console.error("Print PDF export error:", err);
      toast.error(err.message || "Failed to generate print-ready PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleAddToCart = () => {
    if (!material && materials.length > 0) {
      toast.error("Please select a material");
      return;
    }
    if (quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }

    onAddToCart({
      templateId: template.id,
      templateName: template.name,
      canvasData,
      material,
      quantity,
      pricePerUnit,
      thumbnailUrl: template.thumbnail_url,
      sourcePdfPath: template.source_pdf_path,
      widthInches: template.width_inches,
      heightInches: template.height_inches,
      bleedInches: template.bleed_inches,
      companyId: template.company_id,
    });
  };

  const materials = (template.material_options as string[]) || [];

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Order Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {materials.length > 0 && (
          <div className="space-y-2">
            <Label>Material</Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>
                {materials.map((mat: string) => (
                  <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            min={1}
            step={100}
          />
        </div>

        <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-1.5">
          {hasPresetPrice ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price per unit</span>
                <span>${pricePerUnit!.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quantity</span>
                <span>{quantity.toLocaleString()}</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-primary">${total!.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-2">
              <DollarSign className="h-4 w-4 inline mr-1" />
              Price will be quoted by an admin
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {template.width_inches}" × {template.height_inches}" {template.product_type}
          </Label>
        </div>

        <Button
          onClick={handleGeneratePrintFile}
          disabled={generatingPdf}
          variant="outline"
          className="w-full gap-2"
        >
          <Download className="h-4 w-4" />
          {generatingPdf ? "Generating..." : "Download Print-Ready PDF"}
        </Button>

        <Button
          onClick={handleAddToCart}
          className="w-full gap-2"
          size="lg"
        >
          <ShoppingCart className="h-4 w-4" />
          Add to Cart
        </Button>
      </CardContent>
    </Card>
  );
}
