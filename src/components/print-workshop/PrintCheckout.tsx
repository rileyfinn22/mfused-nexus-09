import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Download,
  Eye,
  MapPin,
  ShoppingCart,
  Package,
  Image,
  BookOpen,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePrintReadyPdf, generateCanvasOnlyPdf } from "@/lib/printPdfExport";
import { generatePdfThumbnailFromArrayBuffer } from "@/lib/pdfThumbnail";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import type { CartItem } from "./PrintCart";

interface PrintCheckoutProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onBack: () => void;
}

export function PrintCheckout({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onBack,
}: PrintCheckoutProps) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const { activeCompanyId } = useActiveCompany();

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Shipping address state
  const [shippingName, setShippingName] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingZip, setShippingZip] = useState("");

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoadingAddresses(true);
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("company_id", activeCompanyId)
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        setSavedAddresses(data || []);
        // Auto-fill default address
        const def = (data || []).find((a: any) => a.is_default);
        if (def && !shippingName) {
          applyAddress(def);
        }
        setLoadingAddresses(false);
      });
  }, [activeCompanyId]);

  const applyAddress = (addr: any) => {
    setShippingName(addr.name || addr.customer_name || "");
    setShippingStreet(addr.street || "");
    setShippingCity(addr.city || "");
    setShippingState(addr.state || "");
    setShippingZip(addr.zip || "");
  };

  const handleSaveAddress = async () => {
    if (!isShippingValid || !activeCompanyId) return;
    setSavingAddress(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("customer_addresses").insert({
        company_id: activeCompanyId,
        customer_name: shippingName.trim(),
        name: shippingName.trim(),
        street: shippingStreet.trim(),
        city: shippingCity.trim(),
        state: shippingState.trim(),
        zip: shippingZip.trim(),
        address_type: "shipping",
        is_default: savedAddresses.length === 0,
      }).select().single();
      if (error) throw error;
      setSavedAddresses((prev) => [...prev, data]);
      toast.success("Address saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  };

  const hasQuoteItems = items.some((i) => i.pricePerUnit == null);
  const grandTotal = items.reduce(
    (sum, i) => sum + (i.pricePerUnit ?? 0) * i.quantity,
    0
  );

  const isShippingValid =
    shippingName.trim() &&
    shippingStreet.trim() &&
    shippingCity.trim() &&
    shippingState.trim() &&
    shippingZip.trim();

  const handleDownloadPdf = async (item: CartItem) => {
    setGeneratingPdf(item.id);
    try {
      let blob: Blob;
      if (item.sourcePdfPath) {
        blob = await generatePrintReadyPdf({
          sourcePdfPath: item.sourcePdfPath,
          canvasData: item.canvasData,
          widthInches: item.widthInches,
          heightInches: item.heightInches,
          bleedInches: item.bleedInches,
        });
      } else {
        blob = await generateCanvasOnlyPdf({
          canvasData: item.canvasData,
          widthInches: item.widthInches,
          heightInches: item.heightInches,
          bleedInches: item.bleedInches,
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.templateName.replace(/\s+/g, "_")}_print_ready.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handlePreviewPdf = async (item: CartItem) => {
    setGeneratingPdf(item.id);
    try {
      let blob: Blob;
      if (item.sourcePdfPath) {
        blob = await generatePrintReadyPdf({
          sourcePdfPath: item.sourcePdfPath,
          canvasData: item.canvasData,
          widthInches: item.widthInches,
          heightInches: item.heightInches,
          bleedInches: item.bleedInches,
        });
      } else {
        blob = await generateCanvasOnlyPdf({
          canvasData: item.canvasData,
          widthInches: item.widthInches,
          heightInches: item.heightInches,
          bleedInches: item.bleedInches,
        });
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to generate PDF preview");
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handlePlaceOrder = async () => {
    if (!isShippingValid) {
      toast.error("Please fill in all shipping address fields");
      return;
    }
    if (items.length === 0) return;

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const subtotal = items.reduce(
        (s, i) => s + (i.pricePerUnit ?? 0) * i.quantity,
        0
      );

      const { data: woData, error: woError } = await supabase
        .from("workshop_orders")
        .insert({
          order_number: "",
          company_id: items[0].companyId,
          status: hasQuoteItems ? "pending" : "pending",
          subtotal,
          total: subtotal,
          created_by: user?.id || null,
          shipping_name: shippingName.trim(),
          shipping_street: shippingStreet.trim(),
          shipping_city: shippingCity.trim(),
          shipping_state: shippingState.trim(),
          shipping_zip: shippingZip.trim(),
        } as any)
        .select()
        .single();

      if (woError) throw woError;
      const workshopOrderId = woData.id;

      for (const item of items) {
        let printFileUrl: string | null = null;

        try {
          let blob: Blob;
          if (item.sourcePdfPath) {
            blob = await generatePrintReadyPdf({
              sourcePdfPath: item.sourcePdfPath,
              canvasData: item.canvasData,
              widthInches: item.widthInches,
              heightInches: item.heightInches,
              bleedInches: item.bleedInches,
            });
          } else {
            blob = await generateCanvasOnlyPdf({
              canvasData: item.canvasData,
              widthInches: item.widthInches,
              heightInches: item.heightInches,
              bleedInches: item.bleedInches,
            });
          }
          const filePath = `orders/${workshopOrderId}/${crypto.randomUUID()}/print_ready.pdf`;
          const { error: uploadErr } = await supabase.storage
            .from("print-files")
            .upload(filePath, blob, { contentType: "application/pdf" });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from("print-files")
              .getPublicUrl(filePath);
            printFileUrl = urlData.publicUrl;
          }
        } catch (e) {
          console.warn("Could not generate print file for", item.templateName, e);
        }

        // Generate/store thumbnail
        let storedThumbnailUrl: string | null = null;
        
        // Try uploading the cart item's thumbnail (data URL from canvas capture)
        if (item.thumbnailUrl && item.thumbnailUrl.startsWith("data:")) {
          try {
            const res = await fetch(item.thumbnailUrl);
            const thumbBlob = await res.blob();
            const thumbPath = `orders/${workshopOrderId}/${crypto.randomUUID()}/thumbnail.png`;
            const { error: thumbErr } = await supabase.storage
              .from("print-files")
              .upload(thumbPath, thumbBlob, { contentType: "image/png" });
            if (!thumbErr) {
              const { data: thumbUrl } = supabase.storage
                .from("print-files")
                .getPublicUrl(thumbPath);
              storedThumbnailUrl = thumbUrl.publicUrl;
            }
          } catch (e) {
            console.warn("Could not upload data URL thumbnail for", item.templateName, e);
          }
        }

        // Fallback: generate thumbnail from the print-ready PDF
        if (!storedThumbnailUrl && printFileUrl) {
          try {
            const pdfRes = await fetch(printFileUrl);
            const pdfBuf = await pdfRes.arrayBuffer();
            const thumbBlob = await generatePdfThumbnailFromArrayBuffer(pdfBuf, { maxWidth: 400 });
            const thumbPath = `orders/${workshopOrderId}/${crypto.randomUUID()}/thumbnail.png`;
            const { error: thumbErr } = await supabase.storage
              .from("print-files")
              .upload(thumbPath, thumbBlob, { contentType: "image/png" });
            if (!thumbErr) {
              const { data: thumbUrl } = supabase.storage
                .from("print-files")
                .getPublicUrl(thumbPath);
              storedThumbnailUrl = thumbUrl.publicUrl;
            }
          } catch (e) {
            console.warn("Could not generate PDF thumbnail for", item.templateName, e);
          }
        }

        // Final fallback: use the template's existing thumbnail URL directly
        if (!storedThumbnailUrl && item.thumbnailUrl && !item.thumbnailUrl.startsWith("data:")) {
          storedThumbnailUrl = item.thumbnailUrl;
        }

        const { error } = await supabase.from("print_orders").insert({
          workshop_order_id: workshopOrderId,
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
          thumbnail_url: storedThumbnailUrl,
        } as any);

        if (error) throw error;
      }

      toast.success(
        `Order ${woData.order_number} placed with ${items.length} item(s)!`
      );
      onClearCart();
      navigate(`/print-workshop/orders/${workshopOrderId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to Shop
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
            <p>Your cart is empty</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Shop
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Review Your Order</h1>
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""} in your cart
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Line Items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {items.map((item, idx) => (
                <div key={item.id}>
                  {idx > 0 && <Separator />}
                  <div className="p-4 flex gap-4">
                    {/* Artwork Thumbnail */}
                    <div className="shrink-0 w-24 h-24 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.templateName}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Image className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-sm">
                            {item.templateName}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {item.widthInches}" × {item.heightInches}"
                            </Badge>
                            {item.material && (
                              <Badge variant="outline" className="text-xs">
                                {item.material}
                              </Badge>
                            )}
                          </div>
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

                      {/* Qty + Price row */}
                      <div className="flex items-center justify-between gap-4 pt-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">
                            Qty:
                          </Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              onUpdateQuantity(
                                item.id,
                                Math.max(1, Number(e.target.value))
                              )
                            }
                            className="h-8 w-24 text-sm"
                            min={1}
                            step={100}
                          />
                        </div>
                        <div className="text-sm font-medium">
                          {item.pricePerUnit != null ? (
                            <span>
                              ${(item.pricePerUnit * item.quantity).toFixed(2)}
                              <span className="text-xs text-muted-foreground ml-1">
                                (${item.pricePerUnit.toFixed(4)}/ea)
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">
                              Quote needed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* PDF Actions */}
                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          disabled={generatingPdf === item.id}
                          onClick={() => handlePreviewPdf(item)}
                        >
                          {generatingPdf === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          Preview
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          disabled={generatingPdf === item.id}
                          onClick={() => handleDownloadPdf(item)}
                        >
                          <Download className="h-3 w-3" />
                          Download PDF
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: Shipping + Summary */}
        <div className="space-y-4">
          {/* Shipping Address */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedAddresses.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Saved Addresses
                  </Label>
                  <Select
                    onValueChange={(val) => {
                      const addr = savedAddresses.find((a) => a.id === val);
                      if (addr) applyAddress(addr);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Load a saved address…" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedAddresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id}>
                          {addr.name} — {addr.street}, {addr.city}, {addr.state} {addr.zip}
                          {addr.is_default ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Name / Company</Label>
                <Input
                  placeholder="Recipient name"
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Street Address</Label>
                <Input
                  placeholder="123 Main St"
                  value={shippingStreet}
                  onChange={(e) => setShippingStreet(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input
                    placeholder="City"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input
                    placeholder="ST"
                    value={shippingState}
                    onChange={(e) => setShippingState(e.target.value)}
                    maxLength={2}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">ZIP</Label>
                  <Input
                    placeholder="12345"
                    value={shippingZip}
                    onChange={(e) => setShippingZip(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                {isShippingValid ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleSaveAddress}
                    disabled={savingAddress}
                  >
                    {savingAddress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Address
                  </Button>
                ) : (
                  <p className="text-xs text-destructive">
                    All shipping fields are required
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm gap-2"
                  >
                    <span className="text-muted-foreground truncate">
                      {item.templateName} × {item.quantity.toLocaleString()}
                    </span>
                    <span className="shrink-0">
                      {item.pricePerUnit != null
                        ? `$${(item.pricePerUnit * item.quantity).toFixed(2)}`
                        : "TBD"}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex justify-between font-semibold">
                <span>Total</span>
                {hasQuoteItems ? (
                  <span className="text-muted-foreground text-sm italic">
                    Some items need quoting
                  </span>
                ) : (
                  <span className="text-primary">
                    ${grandTotal.toFixed(2)}
                  </span>
                )}
              </div>

              <Button
                onClick={handlePlaceOrder}
                disabled={submitting || !isShippingValid}
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

              <p className="text-xs text-muted-foreground text-center">
                Your order will be reviewed before production begins
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
