import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Upload, Plus, CalendarClock, FileText, Package, Truck, CheckCircle2, AlertCircle, StickyNote, MessageSquare, Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { ProductionStageTimeline } from "@/components/ProductionStageTimeline";
import { ShipmentTracker, type ShipmentLeg } from "@/components/ShipmentTracker";
import { AddShipmentLegDialog, type LegFormData } from "@/components/AddShipmentLegDialog";
import { getTrackingUrl } from "@/lib/trackingUtils";
import { cn } from "@/lib/utils";
interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
  description: string | null;
  estimated_delivery_date: string | null;
  production_progress: number | null;
  production_notes: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
  companies: {
    name: string;
  };
}

interface ProductionStage {
  id: string;
  stage_name: string;
  status: string;
  vendor_id: string | null;
  sequence_order: number;
  internal_notes: string | null;
  vendors: {
    name: string;
  } | null;
  production_stage_updates: StageUpdate[];
}

interface StageUpdate {
  id: string;
  update_type: string;
  note_text: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
}

interface Shipment {
  id: string;
  invoice_number: string;
  shipment_number: number | null;
  invoice_type: string | null;
  status: string;
  total: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  shipped_quantity: number;
}

const STAGE_DEFINITIONS = [
  { value: 'estimate_sent', label: 'Estimate Sent', order: 0, weight: 5, adminOnly: true },
  { value: 'art_approved', label: 'Art Approved', order: 1, weight: 5, adminOnly: true },
  { value: 'deposit_paid', label: 'Deposit Paid', order: 2, weight: 5, adminOnly: true },
  { value: 'order_confirmed', label: 'Order Confirmed', order: 3, weight: 5, adminOnly: true },
  { value: 'po_sent', label: 'PO Sent', order: 4, weight: 5, adminOnly: true },
  { value: 'materials_ordered', label: 'Materials Ordered', order: 5, weight: 10 },
  { value: 'pre_press', label: 'Pre-Press', order: 6, weight: 15 },
  { value: 'proof_approved', label: 'Proof Approved', order: 7, weight: 10 },
  { value: 'vendor_deposit', label: 'Vendor Deposit', order: 8, weight: 5, adminOnly: true },
  { value: 'production_complete', label: 'Production Complete', order: 9, weight: 15 },
  { value: 'in_transit', label: 'In Transit', order: 10, weight: 15 },
  { value: 'delivered', label: 'Delivered', order: 11, weight: 5 },
];

// Keep STAGE_NAMES for backward compatibility
const STAGE_NAMES = STAGE_DEFINITIONS;

function ProductionNotesSection({ order, onUpdate }: { 
  order: Order; 
  onUpdate: (updates: Partial<Pick<Order, 'production_notes' | 'is_delayed' | 'delay_reason'>>) => void;
}) {
  const [notes, setNotes] = useState(order.production_notes || "");
  const [isDelayed, setIsDelayed] = useState(order.is_delayed || false);
  const [delayReason, setDelayReason] = useState(order.delay_reason || "");
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    onUpdate({ 
      production_notes: notes || null, 
      is_delayed: isDelayed, 
      delay_reason: isDelayed ? (delayReason || null) : null 
    });
    setDirty(false);
  };

  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Production Notes</h3>
        </div>
        {dirty && (
          <Button size="sm" onClick={handleSave}>Save</Button>
        )}
      </div>
      <Textarea
        placeholder="Add production notes visible on the detail page…"
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
        className="min-h-[60px] text-sm"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isDelayed}
            onChange={(e) => { setIsDelayed(e.target.checked); setDirty(true); }}
            className="rounded border-border"
          />
          <AlertCircle className={cn("h-4 w-4", isDelayed ? "text-destructive" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Mark as Delayed</span>
        </label>
      </div>
      {isDelayed && (
        <Input
          placeholder="Reason for delay…"
          value={delayReason}
          onChange={(e) => { setDelayReason(e.target.value); setDirty(true); }}
          className="text-sm"
        />
      )}
    </div>
  );
}

interface ProductionComment {
  id: string;
  author_name: string;
  author_role: string;
  message: string;
  created_at: string;
}

function ProductionCommentsThread({ orderId, isVibeAdmin }: { orderId: string; isVibeAdmin: boolean }) {
  const [comments, setComments] = useState<ProductionComment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('production_comments')
      .select('id, author_name, author_role, message, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const roles = (profile || []).map((r: any) => String(r.role));
      const role = roles.includes('vibe_admin') ? 'admin' : 'customer';
      const name = user.email?.split('@')[0] || 'User';

      const { error } = await (supabase as any)
        .from('production_comments')
        .insert({
          order_id: orderId,
          user_id: user.id,
          author_name: name,
          author_role: role,
          message: newMessage.trim(),
        });

      if (error) throw error;
      setNewMessage("");
      await fetchComments();
    } catch (error: any) {
      console.error('Error posting comment:', error);
      toast({ title: "Error", description: "Failed to post message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-medium text-sm">Updates & Messages</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{comments.length}</Badge>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Start a conversation.</p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-lg p-3 text-sm max-w-[85%]",
                c.author_role === 'admin'
                  ? "bg-primary/10 border border-primary/20 ml-auto"
                  : "bg-muted border border-border"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-xs">
                  {c.author_name}
                </span>
                <Badge variant={c.author_role === 'admin' ? 'default' : 'outline'} className="text-[9px] px-1.5 py-0">
                  {c.author_role === 'admin' ? 'Team' : 'Customer'}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' '}
                  {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-foreground whitespace-pre-wrap">{c.message}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <Input
          placeholder="Type a message or request an update…"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          className="text-sm"
          disabled={sending}
        />
        <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function ProductionDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyFilter = searchParams.get('company');
  const [order, setOrder] = useState<Order | null>(null);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ProductionStage | null>(null);
  const [selectedStageDef, setSelectedStageDef] = useState<typeof STAGE_NAMES[0] | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  const [updateImage, setUpdateImage] = useState<File | null>(null);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [shipmentLegs, setShipmentLegs] = useState<ShipmentLeg[]>([]);
  const [addLegDialogOpen, setAddLegDialogOpen] = useState(false);

  useEffect(() => {
    checkRole();
    fetchOrderAndStages();
    fetchVendors();
    fetchFulfillmentData();
    fetchShipmentLegs();
  }, [orderId]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const roles = data?.map(r => r.role as string) || [];
    setIsVibeAdmin(roles.includes('vibe_admin'));
    setIsVendor(roles.includes('vendor'));
    // Company-side users (admin/customer/company) should see the simplified customer view.
    setIsCustomer(roles.includes('admin') || roles.includes('customer') || roles.includes('company'));
  };

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .order('name');
    setVendors(data || []);
  };

  const fetchFulfillmentData = async () => {
    try {
      // Fetch shipments (invoices with shipment info)
      const { data: shipmentsData } = await supabase
        .from('invoices')
        .select('id, invoice_number, shipment_number, invoice_type, status, total, created_at')
        .eq('order_id', orderId)
        .is('deleted_at', null)
        .order('shipment_number', { ascending: true });

      setShipments(shipmentsData || []);

      // Fetch order items with shipped quantities
      const { data: itemsData } = await supabase
        .from('order_items')
        .select('id, sku, name, quantity, shipped_quantity')
        .eq('order_id', orderId)
        .order('line_number', { ascending: true });

      setOrderItems(itemsData || []);
    } catch (error: any) {
      console.error('Error fetching fulfillment data:', error);
    }
  };

  const fetchShipmentLegs = async () => {
    try {
      const { data } = await (supabase as any)
        .from('shipment_legs')
        .select('*')
        .eq('order_id', orderId)
        .order('leg_number', { ascending: true });
      setShipmentLegs(data || []);
    } catch (error: any) {
      console.error('Error fetching shipment legs:', error);
    }
  };

  const uploadShipmentFile = async (file: File, legId: string): Promise<{ url: string; name: string } | null> => {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `shipment-legs/${orderId}/${legId}-${Date.now()}-${sanitizedName}`;
    const { error: uploadError } = await supabase.storage
      .from('packing-lists')
      .upload(filePath, file);
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('packing-lists')
      .getPublicUrl(filePath);

    return { url: publicUrl, name: file.name };
  };

  const handleAddShipmentLeg = async (formData: LegFormData, file?: File) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !order) throw new Error("Not authenticated");

      const companyId = await getOrderCompanyId();
      if (!companyId) throw new Error("Company not found");

      const trackingUrl = formData.carrier && formData.tracking_number
        ? getTrackingUrl(formData.carrier, formData.tracking_number) : null;

      const legId = crypto.randomUUID();

      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;
      if (file) {
        const result = await uploadShipmentFile(file, legId);
        if (result) {
          attachmentUrl = result.url;
          attachmentName = result.name;
        }
      }

      const { error } = await (supabase as any)
        .from('shipment_legs')
        .insert({
          id: legId,
          order_id: orderId,
          company_id: companyId,
          leg_number: shipmentLegs.length + 1,
          leg_type: formData.leg_type,
          label: formData.label || null,
          carrier: formData.carrier || null,
          tracking_number: formData.tracking_number || null,
          tracking_url: trackingUrl,
          origin: formData.origin || null,
          destination: formData.destination || null,
          shipped_date: formData.shipped_date || null,
          estimated_arrival: formData.estimated_arrival || null,
          status: 'pending',
          notes: formData.notes || null,
          created_by: user.id,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        });

      if (error) throw error;
      await fetchShipmentLegs();
      toast({ title: "Success", description: "Shipping leg added" });
    } catch (error: any) {
      console.error('Error adding shipment leg:', error);
      toast({ title: "Error", description: "Failed to add shipping leg", variant: "destructive" });
    }
  };

  const handleLegAttachmentUpload = async (legId: string, file: File) => {
    try {
      const result = await uploadShipmentFile(file, legId);
      if (!result) throw new Error("Upload failed");

      const { error } = await (supabase as any)
        .from('shipment_legs')
        .update({ attachment_url: result.url, attachment_name: result.name })
        .eq('id', legId);
      if (error) throw error;
      await fetchShipmentLegs();
      toast({ title: "Success", description: "Attachment uploaded" });
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast({ title: "Error", description: "Failed to upload attachment", variant: "destructive" });
    }
  };

  const getOrderCompanyId = async () => {
    const { data } = await supabase
      .from('orders')
      .select('company_id')
      .eq('id', orderId)
      .single();
    return data?.company_id;
  };

  const handleLegStatusChange = async (legId: string, newStatus: string) => {
    try {
      const { error } = await (supabase as any)
        .from('shipment_legs')
        .update({ status: newStatus })
        .eq('id', legId);
      if (error) throw error;
      await fetchShipmentLegs();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleLegArrivalChange = async (legId: string, date: string | null) => {
    try {
      const updateData: any = { actual_arrival: date || null };
      if (date) {
        updateData.status = 'delivered';
      }
      const { error } = await (supabase as any)
        .from('shipment_legs')
        .update(updateData)
        .eq('id', legId);
      if (error) throw error;
      await fetchShipmentLegs();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to update arrival", variant: "destructive" });
    }
  };

  const handleDeleteLeg = async (legId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('shipment_legs')
        .delete()
        .eq('id', legId);
      if (error) throw error;
      await fetchShipmentLegs();
      toast({ title: "Leg deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to delete leg", variant: "destructive" });
    }
  };

  const handleLegNotesChange = async (legId: string, notes: string) => {
    try {
      const { error } = await (supabase as any)
        .from('shipment_legs')
        .update({ notes })
        .eq('id', legId);
      if (error) throw error;
      await fetchShipmentLegs();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to update notes", variant: "destructive" });
    }
  };

  const fetchOrderAndStages = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          status,
          description,
          estimated_delivery_date,
          production_progress,
          production_notes,
          is_delayed,
          delay_reason,
          companies (
            name
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      const { data: stagesData, error: stagesError } = await (supabase as any)
        .from('production_stages')
        .select(`
          id,
          stage_name,
          status,
          vendor_id,
          sequence_order,
          internal_notes,
          vendors (
            name
          ),
          production_stage_updates (
            id,
            update_type,
            note_text,
            image_url,
            file_url,
            file_name,
            previous_status,
            new_status,
            created_at
          )
        `)
        .eq('order_id', orderId)
        .order('sequence_order');

      if (stagesError) throw stagesError;
      setStages((stagesData as any) || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load production data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeStages = async () => {
    try {
      const stagesToCreate = STAGE_NAMES.map(stage => ({
        order_id: orderId,
        stage_name: stage.value,
        sequence_order: stage.order,
        status: 'pending'
      }));

      const { error } = await (supabase as any)
        .from('production_stages')
        .insert(stagesToCreate);

      if (error) throw error;
      await fetchOrderAndStages();
      toast({
        title: "Success",
        description: "Production stages initialized",
      });
    } catch (error: any) {
      console.error('Error initializing stages:', error);
      toast({
        title: "Error",
        description: "Failed to initialize stages",
        variant: "destructive",
      });
    }
  };

  const handleAssignVendor = async (stageId: string, vendorId: string) => {
    try {
      const actualVendorId = vendorId === 'none' ? null : vendorId;
      const { error } = await (supabase as any)
        .from('production_stages')
        .update({ vendor_id: actualVendorId })
        .eq('id', stageId);

      if (error) throw error;
      await fetchOrderAndStages();
      toast({
        title: "Success",
        description: "Vendor assigned",
      });
    } catch (error: any) {
      console.error('Error assigning vendor:', error);
      toast({
        title: "Error",
        description: "Failed to assign vendor",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStage = async () => {
    if (!selectedStage) return;

    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let imageUrl = null;

      if (updateImage && (isVibeAdmin || isVendor)) {
        const fileExt = updateImage.name.split('.').pop();
        const fileName = `${selectedStage.id}-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('production-images')
          .upload(fileName, updateImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('production-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      let fileUrl = null;
      let uploadedFileName = null;
      if ((isVibeAdmin || isCustomer) && updateFile) {
        uploadedFileName = updateFile.name;
        const fileExt = updateFile.name.split('.').pop();
        const fileName = `${selectedStage.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('production-images')
          .upload(fileName, updateFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('production-images')
          .getPublicUrl(fileName);

        fileUrl = publicUrl;
      }

      const updates = [];

      if (updateNote) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'note',
          note_text: updateNote,
        });
      }

      if (imageUrl && (isVibeAdmin || isVendor)) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'image',
          image_url: imageUrl,
        });
      }

      if (fileUrl && (isVibeAdmin || isCustomer)) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'file',
          file_url: fileUrl,
          file_name: uploadedFileName,
        });
      }

      if (newStatus && newStatus !== selectedStage.status && (isVibeAdmin || isVendor)) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'status_change',
          previous_status: selectedStage.status,
          new_status: newStatus,
        });

        const { error: statusError } = await (supabase as any)
          .from('production_stages')
          .update({ status: newStatus })
          .eq('id', selectedStage.id);

        if (statusError) throw statusError;
      }

      if (updates.length > 0) {
        const { error } = await (supabase as any)
          .from('production_stage_updates')
          .insert(updates);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Stage updated successfully",
      });

      setUpdateDialogOpen(false);
      setUpdateNote("");
      setUpdateImage(null);
      setUpdateFile(null);
      setNewStatus("");
      setSelectedStage(null);
      await fetchOrderAndStages();
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({
        title: "Error",
        description: "Failed to update stage",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleOpenUpdateDialog = (stage: ProductionStage, stageDef: typeof STAGE_NAMES[0]) => {
    setSelectedStage(stage);
    setSelectedStageDef(stageDef);
    setNewStatus(stage.status);
    setUpdateDialogOpen(true);
  };

  const handleQuickStatusChange = async (stageId: string, newStatus: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const stage = stages.find(s => s.id === stageId);
      if (!stage) throw new Error("Stage not found");

      // Update stage status
      const { error: statusError } = await (supabase as any)
        .from('production_stages')
        .update({ status: newStatus })
        .eq('id', stageId);

      if (statusError) throw statusError;

      // Create status change update record
      const { error: updateError } = await (supabase as any)
        .from('production_stage_updates')
        .insert({
          stage_id: stageId,
          updated_by: user.id,
          update_type: 'status_change',
          previous_status: stage.status,
          new_status: newStatus,
        });

      if (updateError) throw updateError;

      await fetchOrderAndStages();
      toast({
        title: "Success",
        description: `Stage updated to ${newStatus.replace('_', ' ')}`,
      });
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({
        title: "Error",
        description: "Failed to update stage",
        variant: "destructive",
      });
    }
  };

  const handleSubstageComplete = async (stageId: string, substage: { key: string; label: string; percent: number }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const stage = stages.find(s => s.id === stageId);
      if (!stage) throw new Error("Stage not found");

      // Check if already completed
      const noteMarker = `<!--${substage.key.toUpperCase()}-->`;
      const alreadyComplete = stage.production_stage_updates.some(u => u.note_text?.includes(noteMarker));
      
      if (alreadyComplete) {
        toast({
          title: "Already Completed",
          description: `${substage.label} has already been marked as complete`,
        });
        return;
      }

      // Ensure stage is at least in_progress
      if (stage.status === 'pending') {
        await (supabase as any)
          .from('production_stages')
          .update({ status: 'in_progress' })
          .eq('id', stageId);
      }

      // Create auto-note with hidden marker for detection + clean display text
      const noteText = `<!--${substage.key.toUpperCase()}-->${substage.label} Complete`;
      
      const { error } = await (supabase as any)
        .from('production_stage_updates')
        .insert({
          stage_id: stageId,
          updated_by: user.id,
          update_type: 'note',
          note_text: noteText,
        });

      if (error) throw error;

      toast({
        title: "Sub-stage Complete",
        description: `${substage.label} marked as complete`,
      });
      
      await fetchOrderAndStages();
    } catch (error: any) {
      console.error('Error completing substage:', error);
      toast({
        title: "Error",
        description: "Failed to complete sub-stage",
        variant: "destructive",
      });
    }
  };

  const handleCustomSubstageAdd = async (stageId: string, label: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const stage = stages.find(s => s.id === stageId);
      if (!stage) throw new Error("Stage not found");

      // Ensure stage is at least in_progress
      if (stage.status === 'pending') {
        await (supabase as any)
          .from('production_stages')
          .update({ status: 'in_progress' })
          .eq('id', stageId);
      }

      // Create custom note with marker for detection
      const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const noteText = `<!--CUSTOM_${key.toUpperCase()}-->${label}`;
      
      const { error } = await (supabase as any)
        .from('production_stage_updates')
        .insert({
          stage_id: stageId,
          updated_by: user.id,
          update_type: 'note',
          note_text: noteText,
        });

      if (error) throw error;

      toast({
        title: "Custom Note Added",
        description: `"${label}" added to stage`,
      });
      
      await fetchOrderAndStages();
    } catch (error: any) {
      console.error('Error adding custom substage:', error);
      toast({
        title: "Error",
        description: "Failed to add custom note",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('production_stage_updates')
        .delete()
        .eq('id', updateId);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Activity update removed successfully",
      });
      
      await fetchOrderAndStages();
    } catch (error: any) {
      console.error('Error deleting update:', error);
      toast({
        title: "Error",
        description: "Failed to delete update",
        variant: "destructive",
      });
    }
  };

  const handleInternalNotesChange = async (stageId: string, notes: string) => {
    try {
      const { error } = await (supabase as any)
        .from('production_stages')
        .update({ internal_notes: notes })
        .eq('id', stageId);

      if (error) throw error;

      // Update local state
      setStages(prev => prev.map(s => 
        s.id === stageId ? { ...s, internal_notes: notes } : s
      ));

      toast({
        title: "Saved",
        description: "Internal notes updated",
      });
    } catch (error: any) {
      console.error('Error saving internal notes:', error);
      toast({
        title: "Error",
        description: "Failed to save internal notes",
        variant: "destructive",
      });
    }
  };

  // Handle slider-based progress change - just stores the percentage, no stage auto-updates
  const handleProgressSliderChange = async (targetPercent: number) => {
    try {
      if (!orderId) return;

      const { error } = await supabase
        .from('orders')
        .update({ production_progress: targetPercent })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state so the slider reflects the new value
      setOrder(prev => prev ? { ...prev, production_progress: targetPercent } : prev);

      toast({
        title: "Progress Updated",
        description: `Production set to ${targetPercent}%`,
      });
    } catch (error: any) {
      console.error('Error updating progress:', error);
      toast({
        title: "Error",
        description: "Failed to update progress",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/production${companyFilter ? `?company=${companyFilter}` : ''}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Production
        </Button>
      </div>

      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{order.order_number}</h1>
            <p className="text-muted-foreground mt-1">{order.customer_name}</p>
            {isVibeAdmin && (
              <Badge variant="outline" className="mt-2">{order.companies.name}</Badge>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge 
              variant={order.status === 'in production' ? 'default' : 'secondary'}
              className="capitalize"
            >
              {order.status.replace('_', ' ')}
            </Badge>
            {order.estimated_delivery_date && (
              <div className="flex items-center gap-1.5 text-sm">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Est. Delivery:</span>
                <span className="font-medium">
                  {(() => {
                    const [y, m, d] = order.estimated_delivery_date!.split('-').map(Number);
                    return new Date(y, m - 1, d);
                  })().toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Description - Prominent Display */}
        {order.description && (
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50">
            <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{order.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Production Notes & Delay Section */}
      {isVibeAdmin && (
        <ProductionNotesSection
          order={order}
          onUpdate={(updates) => {
            supabase
              .from('orders')
              .update(updates as any)
              .eq('id', order.id)
              .then(({ error }) => {
                if (error) {
                  toast({ title: "Error", description: "Failed to save", variant: "destructive" });
                } else {
                  setOrder(prev => prev ? { ...prev, ...updates } : prev);
                  toast({ title: "Saved", description: "Production notes updated" });
                }
              });
          }}
        />
      )}
      {!isVibeAdmin && (order.production_notes || order.is_delayed) && (
        <div className="border border-border rounded-xl p-4 bg-card space-y-3">
          {order.is_delayed && (
            <div className="flex items-center gap-2 text-destructive">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
              </span>
              <span className="text-sm font-medium">Delayed</span>
              {order.delay_reason && (
                <span className="text-sm text-foreground font-normal">— {order.delay_reason}</span>
              )}
            </div>
          )}
          {order.production_notes && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StickyNote className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-sm">Production Notes</h3>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{order.production_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Shared Comments Thread */}
      <ProductionCommentsThread orderId={order.id} isVibeAdmin={isVibeAdmin} />
      <ShipmentTracker
        legs={shipmentLegs}
        isVibeAdmin={isVibeAdmin}
        onStatusChange={isVibeAdmin ? handleLegStatusChange : undefined}
        onActualArrivalChange={isVibeAdmin ? handleLegArrivalChange : undefined}
        onAddLeg={isVibeAdmin ? () => setAddLegDialogOpen(true) : undefined}
        onAttachmentUpload={isVibeAdmin ? handleLegAttachmentUpload : undefined}
        onDeleteLeg={isVibeAdmin ? handleDeleteLeg : undefined}
        onNotesChange={isVibeAdmin ? handleLegNotesChange : undefined}
      />

      <AddShipmentLegDialog
        open={addLegDialogOpen}
        onOpenChange={setAddLegDialogOpen}
        onSubmit={handleAddShipmentLeg}
        nextLegNumber={shipmentLegs.length + 1}
      />

      {/* Production Stages Section */}
      {stages.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <p className="text-muted-foreground mb-4">No production stages initialized</p>
          {isVibeAdmin && (
            <Button onClick={initializeStages}>
              <Plus className="h-4 w-4 mr-2" />
              Initialize Stages
            </Button>
          )}
        </div>
      ) : (
        <ProductionStageTimeline
          stages={stages}
          stageDefinitions={STAGE_NAMES}
          onUpdateClick={handleOpenUpdateDialog}
          onQuickStatusChange={isVibeAdmin || isVendor ? handleQuickStatusChange : undefined}
          onSubstageComplete={isVibeAdmin || isVendor ? handleSubstageComplete : undefined}
          onCustomSubstageAdd={isVibeAdmin || isVendor ? handleCustomSubstageAdd : undefined}
          onDeleteUpdate={isVibeAdmin ? handleDeleteUpdate : undefined}
          onInternalNotesChange={isVibeAdmin ? handleInternalNotesChange : undefined}
          onVendorAssign={isVibeAdmin ? handleAssignVendor : undefined}
          onProgressSliderChange={isVibeAdmin ? handleProgressSliderChange : undefined}
          savedProgress={order?.production_progress ?? undefined}
          vendors={vendors}
          isVibeAdmin={isVibeAdmin}
          isVendor={isVendor}
          isCustomer={isCustomer}
        />
      )}

      {/* Fulfillment Section */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Fulfillment Status</h2>
            {shipments.length > 0 && (
              <Badge variant="secondary" className="ml-2">{shipments.length} Shipment{shipments.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </div>

        {orderItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No items in this order</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Items Fulfillment Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-table-header">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3 text-right">Shipped</th>
                    <th className="px-4 py-3 text-right">Remaining</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orderItems.map((item) => {
                    const remaining = item.quantity - item.shipped_quantity;
                    const isFullyShipped = remaining <= 0;
                    const isPartiallyShipped = item.shipped_quantity > 0 && remaining > 0;
                    
                    return (
                      <tr key={item.id} className="hover:bg-table-row-hover transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm">{item.sku}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">{item.name}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium">{item.quantity.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "text-sm font-medium",
                            isFullyShipped ? "text-success" : isPartiallyShipped ? "text-warning" : "text-muted-foreground"
                          )}>
                            {item.shipped_quantity.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "text-sm font-medium",
                            remaining > 0 ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {remaining.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isFullyShipped ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Complete
                            </Badge>
                          ) : isPartiallyShipped ? (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                              Partial
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Pending
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Shipments List */}
            {shipments.length > 0 && (
              <div className="p-4 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Shipment History</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {shipments.map((shipment) => (
                    <div 
                      key={shipment.id} 
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/invoices/${shipment.id}`)}
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        shipment.status === 'paid' ? "bg-success/10" : "bg-primary/10"
                      )}>
                        <Package className={cn(
                          "h-4 w-4",
                          shipment.status === 'paid' ? "text-success" : "text-primary"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium truncate">{shipment.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          Shipment #{shipment.shipment_number || 1} • ${shipment.total.toLocaleString()}
                        </p>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs capitalize",
                          shipment.status === 'paid' && "bg-success/10 text-success border-success/30",
                          shipment.status === 'open' && "bg-info/10 text-info border-info/30"
                        )}
                      >
                        {shipment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={updateDialogOpen} onOpenChange={(open) => {
        setUpdateDialogOpen(open);
        if (!open) {
          setSelectedStage(null);
          setSelectedStageDef(null);
          setUpdateNote("");
          setUpdateImage(null);
          setUpdateFile(null);
          setNewStatus("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Update {selectedStageDef?.label} Stage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Status Change */}
            {(isVibeAdmin || isVendor) && selectedStage && (
              <div>
                <Label>Stage Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Note <span className="text-muted-foreground font-normal">(visible to customers)</span></Label>
              <Textarea
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder="Type your note here... This will be visible to customers."
                rows={4}
              />
            </div>
            <div>
              <Label>Attach File (optional)</Label>
              <Input
                type="file"
                accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
              />
              {updateFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {updateFile.name}
                </p>
              )}
            </div>
            <Button onClick={handleUpdateStage} disabled={uploading || (!updateNote.trim() && !updateFile && newStatus === selectedStage?.status)} className="w-full">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Save Update
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
