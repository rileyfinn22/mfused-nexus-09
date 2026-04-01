import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Ship, Plus, Trash2, Save, Upload, Paperclip, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { CARRIERS, getTrackingUrl } from "@/lib/trackingUtils";

interface OrderDetail {
  id: string;
  order_number: string;
  po_number: string | null;
  description: string | null;
  customer_name: string;
  status: string;
  company_id: string;
  shipping_name: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
}

interface OrderItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  shipped_quantity: number;
  description: string | null;
}

interface ShipmentLeg {
  id: string;
  leg_number: number;
  leg_type: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  bl_number: string | null;
  vessel_voyage: string | null;
  etd: string | null;
  estimated_arrival: string | null;
  ctns: number | null;
  pcs_per_ctn: number | null;
  qty_pcs: number | null;
  ddp_method: string | null;
  notes: string | null;
  status: string;
  shipped_date: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
}

export default function ForwarderOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [legs, setLegs] = useState<ShipmentLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orderId) fetchAll();
  }, [orderId]);

  const fetchAll = async () => {
    try {
      const [orderRes, itemsRes, legsRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, po_number, description, customer_name, status, company_id, shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip").eq("id", orderId!).single(),
        supabase.from("order_items").select("id, name, sku, quantity, shipped_quantity, description").eq("order_id", orderId!),
        (supabase as any).from("shipment_legs").select("*").eq("order_id", orderId!).order("leg_number"),
      ]);

      if (orderRes.error) throw orderRes.error;
      setOrder(orderRes.data);
      setItems(itemsRes.data || []);
      setLegs(legsRes.data || []);
    } catch (err) {
      console.error("Error fetching order:", err);
      toast({ title: "Error", description: "Failed to load order", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addLeg = async () => {
    if (!order) return;
    const nextNum = legs.length + 1;
    try {
      const { data, error } = await (supabase as any)
        .from("shipment_legs")
        .insert({
          order_id: order.id,
          company_id: order.company_id,
          leg_number: nextNum,
          leg_type: "international",
          label: "International Freight",
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      setLegs((prev) => [...prev, data]);
      toast({ title: "Leg added", description: `Shipping leg #${nextNum} added` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const updateLeg = (legId: string, field: string, value: any) => {
    setLegs((prev) =>
      prev.map((l) => (l.id === legId ? { ...l, [field]: value } : l))
    );
  };

  const saveLeg = async (leg: ShipmentLeg) => {
    setSaving(true);
    try {
      const trackingUrl = leg.carrier && leg.tracking_number
        ? getTrackingUrl(leg.carrier, leg.tracking_number)
        : leg.tracking_url;

      const { error } = await (supabase as any)
        .from("shipment_legs")
        .update({
          leg_type: leg.leg_type,
          label: leg.label,
          origin: leg.origin,
          destination: leg.destination,
          carrier: leg.carrier,
          tracking_number: leg.tracking_number,
          tracking_url: trackingUrl,
          bl_number: leg.bl_number,
          vessel_voyage: leg.vessel_voyage,
          etd: leg.etd,
          estimated_arrival: leg.estimated_arrival,
          ctns: leg.ctns,
          pcs_per_ctn: leg.pcs_per_ctn,
          qty_pcs: leg.qty_pcs,
          ddp_method: leg.ddp_method,
          notes: leg.notes,
          status: leg.status,
          shipped_date: leg.shipped_date,
        })
        .eq("id", leg.id);

      if (error) throw error;
      toast({ title: "Saved", description: `Leg #${leg.leg_number} updated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteLeg = async (legId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("shipment_legs")
        .delete()
        .eq("id", legId);
      if (error) throw error;
      setLegs((prev) => prev.filter((l) => l.id !== legId));
      toast({ title: "Deleted", description: "Shipping leg removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const uploadAttachment = async (legId: string, file: File) => {
    try {
      const path = `forwarder/${orderId}/${legId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("packing-lists")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("packing-lists")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      await (supabase as any)
        .from("shipment_legs")
        .update({ attachment_url: path, attachment_name: file.name })
        .eq("id", legId);

      updateLeg(legId, "attachment_url", path);
      updateLeg(legId, "attachment_name", file.name);
      toast({ title: "Uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const viewAttachment = async (path: string) => {
    const { data } = await supabase.storage
      .from("packing-lists")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return <div className="p-6">Order not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/forwarder/orders")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ship className="h-6 w-6" />
            Order #{order.order_number}
          </h1>
          <p className="text-muted-foreground">
            {order.customer_name} {order.po_number && `• PO: ${order.po_number}`}
          </p>
        </div>
        <Badge className="ml-auto">{order.status}</Badge>
      </div>

      {/* Ship To + Description */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ship To</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{order.shipping_name}</p>
            <p>{order.shipping_street}</p>
            <p>{order.shipping_city}, {order.shipping_state} {order.shipping_zip}</p>
          </CardContent>
        </Card>
        {order.description && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {order.description}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Shipping Legs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Shipping Details</CardTitle>
          <Button size="sm" onClick={addLeg}>
            <Plus className="h-4 w-4 mr-1" />
            Add Shipping Leg
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {legs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No shipping legs yet. Click "Add Shipping Leg" to begin.
            </p>
          ) : (
            legs.map((leg) => (
              <div key={leg.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Leg #{leg.leg_number}: {leg.label || leg.leg_type}</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => saveLeg(leg)} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteLeg(leg.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Row 1: Type, Status, Label */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={leg.leg_type} onValueChange={(v) => updateLeg(leg.id, "leg_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="international">International</SelectItem>
                        <SelectItem value="customs">Customs</SelectItem>
                        <SelectItem value="domestic">Domestic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={leg.status} onValueChange={(v) => updateLeg(leg.id, "status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_transit">In Transit</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cleared">Cleared</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Label</Label>
                    <Input value={leg.label || ""} onChange={(e) => updateLeg(leg.id, "label", e.target.value)} placeholder="e.g. Ocean Freight" />
                  </div>
                </div>

                {/* Row 2: Origin, Destination */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Origin</Label>
                    <Input value={leg.origin || ""} onChange={(e) => updateLeg(leg.id, "origin", e.target.value)} placeholder="Shanghai, China" />
                  </div>
                  <div>
                    <Label className="text-xs">Destination</Label>
                    <Input value={leg.destination || ""} onChange={(e) => updateLeg(leg.id, "destination", e.target.value)} placeholder="Los Angeles, CA" />
                  </div>
                </div>

                {/* Row 3: Ocean Freight Fields - B/L, Vessel, DDP */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">B/L Number</Label>
                    <Input value={leg.bl_number || ""} onChange={(e) => updateLeg(leg.id, "bl_number", e.target.value)} placeholder="MATS7211514000" />
                  </div>
                  <div>
                    <Label className="text-xs">Vessel & Voyage</Label>
                    <Input value={leg.vessel_voyage || ""} onChange={(e) => updateLeg(leg.id, "vessel_voyage", e.target.value)} placeholder="MATSON OAHU/130E" />
                  </div>
                  <div>
                    <Label className="text-xs">DDP / Shipping Method</Label>
                    <Input value={leg.ddp_method || ""} onChange={(e) => updateLeg(leg.id, "ddp_method", e.target.value)} placeholder="sea freight" />
                  </div>
                </div>

                {/* Row 4: Carton details */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">CTNS (Cartons)</Label>
                    <Input type="number" value={leg.ctns ?? ""} onChange={(e) => updateLeg(leg.id, "ctns", e.target.value ? parseInt(e.target.value) : null)} placeholder="167" />
                  </div>
                  <div>
                    <Label className="text-xs">PCS/CTN</Label>
                    <Input type="number" value={leg.pcs_per_ctn ?? ""} onChange={(e) => updateLeg(leg.id, "pcs_per_ctn", e.target.value ? parseInt(e.target.value) : null)} placeholder="240" />
                  </div>
                  <div>
                    <Label className="text-xs">QTY PCS (Total)</Label>
                    <Input type="number" value={leg.qty_pcs ?? ""} onChange={(e) => updateLeg(leg.id, "qty_pcs", e.target.value ? parseInt(e.target.value) : null)} placeholder="40080" />
                  </div>
                </div>

                {/* Row 5: Carrier & Tracking */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Carrier</Label>
                    <Input
                      value={leg.carrier || ""}
                      onChange={(e) => updateLeg(leg.id, "carrier", e.target.value)}
                      placeholder="FedEx, UPS, Matson..."
                      list={`carrier-${leg.id}`}
                    />
                    <datalist id={`carrier-${leg.id}`}>
                      {CARRIERS.map((c) => (
                        <option key={c.value} value={c.label} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label className="text-xs">Tracking Number</Label>
                    <Input value={leg.tracking_number || ""} onChange={(e) => updateLeg(leg.id, "tracking_number", e.target.value)} placeholder="Enter tracking #" />
                    {leg.carrier && leg.tracking_number && (
                      <a
                        href={getTrackingUrl(leg.carrier, leg.tracking_number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Track
                      </a>
                    )}
                  </div>
                </div>

                {/* Row 6: Dates */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Shipped / ETD</Label>
                    <Input type="date" value={leg.etd ? leg.etd.split("T")[0] : (leg.shipped_date ? leg.shipped_date.split("T")[0] : "")} onChange={(e) => { updateLeg(leg.id, "etd", e.target.value || null); updateLeg(leg.id, "shipped_date", e.target.value || null); }} />
                  </div>
                  <div>
                    <Label className="text-xs">ETA</Label>
                    <Input type="date" value={leg.estimated_arrival ? leg.estimated_arrival.split("T")[0] : ""} onChange={(e) => updateLeg(leg.id, "estimated_arrival", e.target.value || null)} />
                  </div>
                  <div>
                    <Label className="text-xs">Attachment</Label>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer">
                        <Input
                          type="file"
                          className="hidden"
                          accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadAttachment(leg.id, f);
                          }}
                        />
                        <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                          <Upload className="h-3 w-3" />
                          Upload
                        </div>
                      </label>
                      {leg.attachment_name && (
                        <button
                          onClick={() => leg.attachment_url && viewAttachment(leg.attachment_url)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Paperclip className="h-3 w-3" />
                          {leg.attachment_name}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={leg.notes || ""}
                    onChange={(e) => updateLeg(leg.id, "notes", e.target.value)}
                    placeholder="Shipping notes..."
                    rows={2}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Order Items - compact at bottom */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Order Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="text-xs py-2">Product</TableHead>
                <TableHead className="text-xs py-2">SKU</TableHead>
                <TableHead className="text-xs py-2">Qty</TableHead>
                <TableHead className="text-xs py-2">Shipped</TableHead>
                <TableHead className="text-xs py-2">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <TableCell className="font-medium py-1.5 text-xs">{item.name}</TableCell>
                  <TableCell className="font-mono py-1.5 text-xs">{item.sku}</TableCell>
                  <TableCell className="py-1.5 text-xs">{item.quantity}</TableCell>
                  <TableCell className="py-1.5 text-xs">{item.shipped_quantity}</TableCell>
                  <TableCell className="text-muted-foreground py-1.5 text-xs">
                    {item.description || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
