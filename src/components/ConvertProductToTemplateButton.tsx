import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { convertProductToTemplate } from "@/lib/productTemplateConversion";

interface Props {
  productId: string;
  productName: string;
  onConverted: (templateId: string) => void;
  iconOnly?: boolean;
  disabled?: boolean;
}

export function ConvertProductToTemplateButton({ productId, productName, onConverted, iconOnly, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(productName);
  const [converting, setConverting] = useState(false);

  const convert = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const templateId = await convertProductToTemplate(productId, name);
      setOpen(false);
      toast.success("Template created with the original product as its first SKU");
      onConverted(templateId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not convert product");
    } finally {
      setConverting(false);
    }
  };

  return (
    <span onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant={iconOnly ? "secondary" : "outline"}
        size={iconOnly ? "icon" : "sm"}
        className={iconOnly ? "h-8 w-8" : undefined}
        disabled={disabled}
        title={disabled ? "Save changes before converting" : "Convert to template"}
        aria-label={`Convert ${productName} to template`}
        onClick={() => { setName(productName); setOpen(true); }}
      >
        <Layers className={iconOnly ? "h-4 w-4" : "h-4 w-4 mr-2"} />
        {!iconOnly && "Convert to template"}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!converting) setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to template</DialogTitle>
            <DialogDescription>
              {productName} will remain the first SKU. Its item number, artwork, past orders and invoices stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`template-name-${productId}`}>Template name</Label>
            <Input id={`template-name-${productId}`} value={name} onChange={(event) => setName(event.target.value)} disabled={converting} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={converting}>Cancel</Button>
            <Button type="button" onClick={convert} disabled={converting || !name.trim()}>
              {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {converting ? "Converting…" : "Convert to template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}