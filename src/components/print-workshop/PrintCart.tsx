import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePrintReadyPdf } from "@/lib/printPdfExport";

export interface CartItem {
  id: string;
  templateId: string;
  templateName: string;
  canvasData: any;
  material: string;
  quantity: number;
  pricePerUnit: number | null;
  thumbnailUrl: string | null;
  sourcePdfPath: string | null;
  widthInches: number;
  heightInches: number;
  bleedInches: number;
  companyId: string | null;
}

interface PrintCartProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
}

export function PrintCart({ items, onUpdateQuantity, onRemoveItem, onClearCart }: PrintCartProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasQuoteItems = items.some((i) => i.pricePerUnit == null);
  const grandTotal = items.reduce((sum, i) => sum + (i.pricePerUnit ?? 0) * i.quantity, 0);

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const item of items) {
        let printFileUrl: string | null = null;

        if (item.sourcePdfPath) {
          try {
            const blob = await generatePrintReadyPdf({
              sourcePdfPath: item.sourcePdfPath,
              canvasData: item.canvasData,
              widthInches: item.widthInches,
              heightInches: item.heightInches,
              bleedInches: item.bleedInches,
            });
            const filePath = `orders/${crypto.randomUUID()}/print_ready.pdf`;
            const { error: uploadErr } = await supabase.storage
              .from("print-files")
              .upload(filePath, blob, { contentType: "application/pdf" });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from("print-files").getPublicUrl(filePath);
              printFileUrl = urlData.publicUrl;
            }
          } catch (e) {
            console.warn("Could not generate print file for", item.templateName, e);
          }
        }

        const { error } = await supabase.from("print_orders").insert({
          company_id: item.companyId,
          print_template_id: item.templateId,
          template_name: item.templateName,
          canvas_data: item.canvasData,
          material: item.material,
          quantity: item.quantity,
          price_per_unit: item.pricePerUnit,
          total: item.pricePerUnit ? item.pricePerUnit * item.quantity : 0,
          status: item.pricePerUnit ? "approved" : "pending_quote",
          created_by: user?.id || null,
          print_file_url: printFileUrl,
        } as any);

        if (error) throw error;
      }

      toast.success(`${items.length} print order(s) placed successfully!`);
      onClearCart();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <ShoppingCart className="h-4 w-4" />
          Cart
          {items.length > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {items.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Print Cart ({items.length})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Your cart is empty
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 py-4">
              {items.map((item) => (
                <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {item.thumbnailUrl && (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.templateName}
                        className="h-14 w-14 object-contain rounded border border-border shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.templateName}</p>
                      {item.material && (
                        <p className="text-xs text-muted-foreground">{item.material}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive shrink-0"
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Qty:</span>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => onUpdateQuantity(item.id, Math.max(1, Number(e.target.value)))}
                        className="h-7 w-20 text-xs"
                        min={1}
                        step={100}
                      />
                    </div>
                    <div className="text-sm font-medium text-right">
                      {item.pricePerUnit != null
                        ? `$${(item.pricePerUnit * item.quantity).toFixed(2)}`
                        : "Quote needed"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{items.length} item(s)</span>
                {hasQuoteItems ? (
                  <span className="text-muted-foreground italic">Some items need quoting</span>
                ) : (
                  <span className="font-semibold text-primary">${grandTotal.toFixed(2)}</span>
                )}
              </div>
              <Button
                onClick={handlePlaceOrder}
                disabled={submitting}
                className="w-full gap-2"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Placing Order...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    Place Order ({items.length} items)
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
