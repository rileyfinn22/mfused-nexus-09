import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Upload, Plus, CalendarClock, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductionStageTimeline } from "@/components/ProductionStageTimeline";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
  description: string | null;
  estimated_delivery_date: string | null;
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

const STAGE_NAMES = [
  { value: 'production_proceeding_part_1', label: 'Production Proceeding (Part 1)', order: 1 },
  { value: 'production_proceeding_part_2', label: 'Production Proceeding (Part 2)', order: 2 },
  { value: 'complete_qc', label: 'Completed & QC', order: 3 },
  { value: 'shipped', label: 'Shipped', order: 4 },
  { value: 'delivered', label: 'Delivered', order: 5 },
];

export default function ProductionDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    checkRole();
    fetchOrderAndStages();
    fetchVendors();
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
    setIsCustomer(roles.includes('admin') || roles.includes('customer'));
  };

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .order('name');
    setVendors(data || []);
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
      if (isVibeAdmin && updateFile) {
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

      if (fileUrl && isVibeAdmin) {
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
        <Button variant="ghost" size="sm" onClick={() => navigate('/production')}>
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
                  {new Date(order.estimated_delivery_date).toLocaleDateString('en-US', { 
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
          onVendorAssign={handleAssignVendor}
          vendors={vendors}
          isVibeAdmin={isVibeAdmin}
          isVendor={isVendor}
          isCustomer={isCustomer}
        />
      )}

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isCustomer ? 'Add Note to' : 'Update'} {selectedStageDef?.label} Stage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(isVibeAdmin || isVendor) && (
              <div>
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
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
              <Label>Add Note</Label>
              <Textarea
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder="Add update notes..."
                rows={3}
              />
            </div>
            {(isVibeAdmin || isVendor) && (
              <div>
                <Label>Upload Image</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUpdateImage(e.target.files?.[0] || null)}
                />
              </div>
            )}
            {isVibeAdmin && (
              <div>
                <Label>Upload Document (PDF/Excel)</Label>
                <Input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
                />
              </div>
            )}
            <Button onClick={handleUpdateStage} disabled={uploading} className="w-full">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {isCustomer ? 'Add Note' : 'Save Update'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
