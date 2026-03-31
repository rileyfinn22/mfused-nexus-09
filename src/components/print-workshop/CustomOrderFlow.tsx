import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Tag, Box, ShoppingBag, Ruler, Palette } from "lucide-react";
import { SizePresetPicker, type PrintPreset } from "./SizePresetPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomOrderFlowProps {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  onStartEditor: (config: {
    productType: string;
    widthInches: number;
    heightInches: number;
    depthInches: number;
    bleedInches: number;
    panelZones: any[];
  }) => void;
}

const PRODUCT_TYPES = [
  { key: "label", label: "Label", icon: Tag, desc: "Flat labels & stickers for products" },
  { key: "box", label: "Box", icon: Box, desc: "Custom printed boxes & packaging" },
  { key: "bag", label: "Bag", icon: ShoppingBag, desc: "Printed bags & pouches" },
] as const;

export function CustomOrderFlow({ onBack, onStartEditor }: CustomOrderFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [productType, setProductType] = useState<string>("");
  const [widthInches, setWidthInches] = useState(4);
  const [heightInches, setHeightInches] = useState(6);
  const [depthInches, setDepthInches] = useState(0);
  const [bleedInches, setBleedInches] = useState(0.125);
  const [panelZones, setPanelZones] = useState<any[]>([]);
  const [sizeMode, setSizeMode] = useState<"preset" | "custom">("preset");

  const handlePresetSelect = (preset: PrintPreset) => {
    setWidthInches(preset.width_inches);
    setHeightInches(preset.height_inches);
    setDepthInches(preset.depth_inches);
    setBleedInches(preset.bleed_inches);
    setPanelZones(preset.panel_zones || []);
    setSizeMode("preset");
  };

  const canProceed = step === 1 ? !!productType : widthInches > 0 && heightInches > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={step === 1 ? onBack : () => setStep(1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> {step === 1 ? "Back" : "Product Type"}
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Start Custom Order</h2>
          <p className="text-sm text-muted-foreground">
            Step {step} of 2: {step === 1 ? "Choose product type" : "Select size"}
          </p>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-2 justify-center">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all ${
              s === step ? "w-8 bg-primary" : s < step ? "w-2 bg-primary/60" : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PRODUCT_TYPES.map(({ key, label, icon: Icon, desc }) => (
            <Card
              key={key}
              className={`cursor-pointer transition-all hover:shadow-md ${
                productType === key
                  ? "ring-2 ring-primary border-primary"
                  : "hover:border-primary/30"
              }`}
              onClick={() => setProductType(key)}
            >
              <CardContent className="flex flex-col items-center text-center p-6 gap-3">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-colors ${
                  productType === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="font-semibold">{label}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {step === 2 && productType && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4" /> Select Size
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SizePresetPicker
              productType={productType}
              onSelect={handlePresetSelect}
            />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or enter custom dimensions</span>
              </div>
            </div>

            <div className={`grid gap-3 ${productType !== "label" ? "grid-cols-4" : "grid-cols-3"}`}>
              <div className="space-y-1">
                <Label className="text-xs">Width (in)</Label>
                <Input
                  type="number"
                  value={widthInches}
                  onChange={(e) => { setWidthInches(Number(e.target.value)); setSizeMode("custom"); }}
                  step={0.25}
                  min={1}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height (in)</Label>
                <Input
                  type="number"
                  value={heightInches}
                  onChange={(e) => { setHeightInches(Number(e.target.value)); setSizeMode("custom"); }}
                  step={0.25}
                  min={1}
                />
              </div>
              {productType !== "label" && (
                <div className="space-y-1">
                  <Label className="text-xs">Depth (in)</Label>
                  <Input
                    type="number"
                    value={depthInches}
                    onChange={(e) => { setDepthInches(Number(e.target.value)); setSizeMode("custom"); }}
                    step={0.25}
                    min={0}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Bleed (in)</Label>
                <Input
                  type="number"
                  value={bleedInches}
                  onChange={(e) => { setBleedInches(Number(e.target.value)); setSizeMode("custom"); }}
                  step={0.0625}
                  min={0}
                />
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Flat layout:</strong> {widthInches}" × {heightInches}"
                {productType !== "label" && depthInches > 0 && ` × ${depthInches}" deep`}
                {" · "}Bleed: {bleedInches}"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        {step === 1 && (
          <Button onClick={() => setStep(2)} disabled={!productType} className="gap-2">
            Next: Select Size <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 2 && (
          <Button
            onClick={() => onStartEditor({
              productType,
              widthInches,
              heightInches,
              depthInches,
              bleedInches,
              panelZones,
            })}
            disabled={!canProceed}
            className="gap-2"
          >
            <Palette className="h-4 w-4" /> Open Editor
          </Button>
        )}
      </div>
    </div>
  );
}
