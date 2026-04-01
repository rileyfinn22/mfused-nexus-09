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

      {/* Shipping Details - Spreadsheet Style */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Shipping Details</CardTitle>
          <div className="flex gap-2">
            {legs.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => { legs.forEach((l) => saveLeg(l)); }} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                Save All
              </Button>
            )}
            <Button size="sm" onClick={addLeg}>
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {legs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No shipping legs yet. Click "Add Row" to begin.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">#</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Label</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">B/L NO / Tracking</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Vessel & Voyage</th>
                     <th className="px-1 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">ETD</th>
                     <th className="px-1 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">ETA</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Carrier</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Status</th>
                     <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"></th>
                   </tr>
                </thead>
                <tbody>
                  {legs.map((leg) => (
                    <tr key={leg.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-2 py-1.5 text-muted-foreground font-mono">{leg.leg_number}</td>
                       <td className="px-1 py-1">
                         <Input className="h-7 text-xs min-w-[100px]" value={leg.label || ""} onChange={(e) => updateLeg(leg.id, "label", e.target.value)} placeholder="Ocean Freight" />
                       </td>
                       <td className="px-1 py-1">
                         <div className="flex items-center gap-1">
                           <Input className="h-7 text-xs min-w-[130px] font-mono" value={leg.bl_number || ""} onChange={(e) => { updateLeg(leg.id, "bl_number", e.target.value); updateLeg(leg.id, "tracking_number", e.target.value); }} placeholder="MATS7211514000" />
                           {leg.carrier && leg.bl_number && (
                             <a href={getTrackingUrl(leg.carrier, leg.bl_number)} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                               <ExternalLink className="h-3 w-3" />
                             </a>
                           )}
                         </div>
                       </td>
                       <td className="px-1 py-1">
                         <Input className="h-7 text-xs min-w-[140px]" value={leg.vessel_voyage || ""} onChange={(e) => updateLeg(leg.id, "vessel_voyage", e.target.value)} placeholder="MATSON OAHU/130E" />
                       </td>
                       <td className="px-0.5 py-1">
                         <Input className="h-7 text-xs w-[95px]" type="date" value={leg.etd ? leg.etd.split("T")[0] : (leg.shipped_date ? leg.shipped_date.split("T")[0] : "")} onChange={(e) => { updateLeg(leg.id, "etd", e.target.value || null); updateLeg(leg.id, "shipped_date", e.target.value || null); }} />
                       </td>
                       <td className="px-0.5 py-1">
                         <Input className="h-7 text-xs w-[95px]" type="date" value={leg.estimated_arrival ? leg.estimated_arrival.split("T")[0] : ""} onChange={(e) => updateLeg(leg.id, "estimated_arrival", e.target.value || null)} />
                       </td>
                       <td className="px-1 py-1">
                         <Input className="h-7 text-xs min-w-[80px]" value={leg.carrier || ""} onChange={(e) => updateLeg(leg.id, "carrier", e.target.value)} placeholder="Matson" list={`carrier-${leg.id}`} />
                         <datalist id={`carrier-${leg.id}`}>
                           {CARRIERS.map((c) => <option key={c.value} value={c.label} />)}
                         </datalist>
                       </td>
                       <td className="px-1 py-1">
                         <Select value={leg.status} onValueChange={(v) => updateLeg(leg.id, "status", v)}>
                           <SelectTrigger className="h-7 text-xs min-w-[90px]"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="pending">Pending</SelectItem>
                             <SelectItem value="in_transit">In Transit</SelectItem>
                             <SelectItem value="delivered">Delivered</SelectItem>
                             <SelectItem value="cleared">Cleared</SelectItem>
                           </SelectContent>
                         </Select>
                       </td>
                       <td className="px-1 py-1">
                         <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteLeg(leg.id)}>
                           <Trash2 className="h-3 w-3" />
                         </Button>
                       </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Attachments & Notes below table */}
          {legs.length > 0 && (
             <div className="p-4 space-y-3 border-t">
               {legs.map((leg) => (
                 <div key={`extra-${leg.id}`} className="flex items-start gap-3">
                   <span className="text-xs text-muted-foreground font-mono shrink-0 pt-2 w-6">#{leg.leg_number}</span>
                   <div className="flex-1 space-y-2">
                     <div className="flex items-center gap-3">
                       <label className="cursor-pointer shrink-0">
                         <Input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(leg.id, f); }} />
                         <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                           <Upload className="h-3 w-3" />
                           Attach file
                         </div>
                       </label>
                       {leg.attachment_name && (
                         <button onClick={() => leg.attachment_url && viewAttachment(leg.attachment_url)} className="text-xs text-primary hover:underline flex items-center gap-1">
                           <Paperclip className="h-3 w-3 shrink-0" />
                           {leg.attachment_name}
                         </button>
                       )}
                     </div>
                     <Textarea
                       className="text-xs min-h-[32px]"
                       value={leg.notes || ""}
                       onChange={(e) => updateLeg(leg.id, "notes", e.target.value)}
                       placeholder="Notes for this leg..."
                       rows={1}
                     />
                   </div>
                 </div>
               ))}
             </div>
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
