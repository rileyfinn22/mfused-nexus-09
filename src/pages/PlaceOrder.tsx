import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Send, Loader2, PackageOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useActiveCompany } from "@/hooks/useActiveCompany";

// Buyer-facing order form. Deliberately narrow: a buyer picks from their own
// company's products, sets quantity and price, and submits. The order is created
// server-side by submit_customer_order() and lands as 'pending' for VibePKG to
// review and process.
//
// This page must never read or render cost/vendor data. Product reads below are
// column-scoped for that reason — no `cost`, no `preferred_vendor_id`, no select('*').

interface BuyerProduct {
  id: string;
  name: string;
  item_id: string | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
}

interface LineItem {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
}

const orderSchema = z.object({
  poNumber: z.string().trim().max(100).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(50).optional().or(z.literal("")),
  shippingName: z.string().trim().min(1, "Shipping name is required").max(200),
  shippingStreet: z.string().trim().min(1, "Street address is required").max(500),
  shippingCity: z.string().trim().min(1, "City is required").max(100),
  shippingState: z.string().trim().min(2, "Use the 2-letter state code").max(2),
  shippingZip: z.string().trim().min(1, "ZIP code is required").max(20),
  memo: z.string().max(1000).optional().or(z.literal("")),
});

const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(),
  productId: "",
  quantity: "1",
  unitPrice: "",
});

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PlaceOrder() {
  const navigate = useNavigate();
  const { activeCompanyId, activeCompanyName, loading: companyLoading } = useActiveCompany();

  const [products, setProducts] = useState<BuyerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [form, setForm] = useState({
    poNumber: "",
    dueDate: "",
    contactEmail: "",
    contactPhone: "",
    shippingName: "",
    shippingStreet: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    billingName: "",
    billingStreet: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    memo: "",
  });

  useEffect(() => {
    if (!activeCompanyId) {
      setProducts([]);
      setProductsLoading(companyLoading);
      return;
    }

    let cancelled = false;
    setProductsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, item_id, description, price, image_url")
        .eq("company_id", activeCompanyId)
        .order("name");

      if (cancelled) return;

      if (error) {
        toast({
          title: "Couldn't load your products",
          description: error.message,
          variant: "destructive",
        });
        setProducts([]);
      } else {
        setProducts(data ?? []);
      }
      setProductsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, companyLoading]);

  const setField = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateLine = (key: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Picking a product seeds the price from the product's list price; the buyer
  // can still override it, which is the point of the price column.
  const onPickProduct = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateLine(key, {
      productId,
      unitPrice: product?.price != null ? String(product.price) : "",
    });
  };

  const lineTotal = (line: LineItem) => {
    const qty = Number(line.quantity);
    const price = Number(line.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
    return qty * price;
  };

  const subtotal = lines.reduce((sum, line) => sum + (line.productId ? lineTotal(line) : 0), 0);

  const handleSubmit = async () => {
    if (!activeCompanyId) {
      toast({
        title: "No company selected",
        description: "Pick a company before placing an order.",
        variant: "destructive",
      });
      return;
    }

    const parsed = orderSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: "Check the order details",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) {
      toast({
        title: "Add at least one product",
        description: "An order needs at least one line item.",
        variant: "destructive",
      });
      return;
    }

    for (const line of filled) {
      const qty = Number(line.quantity);
      const price = Number(line.unitPrice);
      const name = products.find((p) => p.id === line.productId)?.name ?? "this product";

      if (!Number.isInteger(qty) || qty <= 0) {
        toast({
          title: "Check the quantities",
          description: `Quantity for ${name} must be a whole number above zero.`,
          variant: "destructive",
        });
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        toast({
          title: "Check the prices",
          description: `Price for ${name} can't be negative.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_customer_order", {
        p_company_id: activeCompanyId,
        p_items: filled.map((l) => ({
          product_id: l.productId,
          quantity: Number(l.quantity),
          unit_price: Number(l.unitPrice),
        })),
        p_shipping_name: form.shippingName,
        p_shipping_street: form.shippingStreet,
        p_shipping_city: form.shippingCity,
        p_shipping_state: form.shippingState.toUpperCase(),
        p_shipping_zip: form.shippingZip,
        p_po_number: form.poNumber || null,
        p_customer_name: activeCompanyName || null,
        p_customer_email: form.contactEmail || null,
        p_customer_phone: form.contactPhone || null,
        p_due_date: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        p_billing_name: sameAsShipping ? form.shippingName : form.billingName || null,
        p_billing_street: sameAsShipping ? form.shippingStreet : form.billingStreet || null,
        p_billing_city: sameAsShipping ? form.shippingCity : form.billingCity || null,
        p_billing_state: sameAsShipping
          ? form.shippingState.toUpperCase()
          : form.billingState.toUpperCase() || null,
        p_billing_zip: sameAsShipping ? form.shippingZip : form.billingZip || null,
        p_memo: form.memo || null,
      });

      if (error) throw error;

      toast({
        title: "Order submitted",
        description: "It's pending review — VibePKG will confirm pricing and timing.",
      });
      navigate(`/orders/${data}`);
    } catch (err: any) {
      toast({
        title: "Couldn't submit the order",
        description: err?.message ?? "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Place an order</h1>
          <p className="text-sm text-muted-foreground">
            {activeCompanyName ? `Ordering for ${activeCompanyName}. ` : ""}
            Submitted orders go to VibePKG as pending for review.
          </p>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-medium">Products</h2>

        {productsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your products…
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <PackageOpen className="h-8 w-8 opacity-50" />
            <p>No products set up for this company yet.</p>
            <p>Reach out to VibePKG to get your catalog added.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-6 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Product</Label>
                  <Select
                    value={line.productId}
                    onValueChange={(value) => onPickProduct(line.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.item_id ? `${product.item_id} — ` : ""}
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </div>

                <div className="col-span-5 sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  />
                </div>

                <div className="col-span-3 sm:col-span-2 flex items-center justify-between gap-2">
                  <span className="text-sm tabular-nums">
                    {line.productId ? money(lineTotal(line)) : "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add line
            </Button>

            <Separator />

            <div className="flex justify-end gap-6 text-sm">
              <span className="text-muted-foreground">Order total</span>
              <span className="font-medium tabular-nums">{money(subtotal)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-medium">Order details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="poNumber">Your PO number</Label>
            <Input
              id="poNumber"
              value={form.poNumber}
              onChange={(e) => setField("poNumber", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Needed by</Label>
            <Input
              id="dueDate"
              type="date"
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setField("contactEmail", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input
              id="contactPhone"
              value={form.contactPhone}
              onChange={(e) => setField("contactPhone", e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-medium">Ship to</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="shippingName">Name</Label>
            <Input
              id="shippingName"
              value={form.shippingName}
              onChange={(e) => setField("shippingName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="shippingStreet">Street</Label>
            <Input
              id="shippingStreet"
              value={form.shippingStreet}
              onChange={(e) => setField("shippingStreet", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shippingCity">City</Label>
            <Input
              id="shippingCity"
              value={form.shippingCity}
              onChange={(e) => setField("shippingCity", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="shippingState">State</Label>
              <Input
                id="shippingState"
                maxLength={2}
                value={form.shippingState}
                onChange={(e) => setField("shippingState", e.target.value.toUpperCase())}
                placeholder="CA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shippingZip">ZIP</Label>
              <Input
                id="shippingZip"
                value={form.shippingZip}
                onChange={(e) => setField("shippingZip", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="sameAsShipping"
            checked={sameAsShipping}
            onCheckedChange={(checked) => setSameAsShipping(checked === true)}
          />
          <Label htmlFor="sameAsShipping" className="font-normal">
            Billing address is the same
          </Label>
        </div>

        {!sameAsShipping && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="billingName">Billing name</Label>
              <Input
                id="billingName"
                value={form.billingName}
                onChange={(e) => setField("billingName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="billingStreet">Billing street</Label>
              <Input
                id="billingStreet"
                value={form.billingStreet}
                onChange={(e) => setField("billingStreet", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billingCity">Billing city</Label>
              <Input
                id="billingCity"
                value={form.billingCity}
                onChange={(e) => setField("billingCity", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="billingState">State</Label>
                <Input
                  id="billingState"
                  maxLength={2}
                  value={form.billingState}
                  onChange={(e) => setField("billingState", e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billingZip">ZIP</Label>
                <Input
                  id="billingZip"
                  value={form.billingZip}
                  onChange={(e) => setField("billingZip", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-3">
        <Label htmlFor="memo">Notes for VibePKG</Label>
        <Textarea
          id="memo"
          rows={3}
          value={form.memo}
          onChange={(e) => setField("memo", e.target.value)}
          placeholder="Anything we should know about this order"
        />
      </section>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/orders")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || products.length === 0}>
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1.5" />
          )}
          Submit order
        </Button>
      </div>
    </div>
  );
}
