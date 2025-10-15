import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Upload, Plus, CheckCircle2, Circle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
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
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
}

const STAGE_NAMES = [
  { value: 'material', label: 'Material', order: 1 },
  { value: 'print', label: 'Print', order: 2 },
  { value: 'convert', label: 'Convert', order: 3 },
  { value: 'qc', label: 'QC', order: 4 },
  { value: 'shipped', label: 'Shipped', order: 5 },
  { value: 'delivered', label: 'Delivered', order: 6 },
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
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ProductionStage | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  const [updateImage, setUpdateImage] = useState<File | null>(null);
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
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          status,
          companies (
            name
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      // Fetch stages
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
            previous_status,
            new_status,
            created_at
          )
        `)
        .eq('order_id', orderId)
        .order('sequence_order');

      if (stagesError) throw stagesError;
      setStages((stagesData as any) || []);

      // If no stages exist and user is vibe admin, create them
      if ((!stagesData || stagesData.length === 0) && isVibeAdmin) {
        await initializeStages();
      }
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
      const { error } = await (supabase as any)
        .from('production_stages')
        .update({ vendor_id: vendorId || null })
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

      // Upload image if provided
      if (updateImage) {
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

      // Create updates
      const updates = [];

      if (updateNote) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'note',
          note_text: updateNote,
        });
      }

      if (imageUrl) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'image',
          image_url: imageUrl,
        });
      }

      if (newStatus && newStatus !== selectedStage.status) {
        updates.push({
          stage_id: selectedStage.id,
          updated_by: user.id,
          update_type: 'status_change',
          previous_status: selectedStage.status,
          new_status: newStatus,
        });

        // Update stage status
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

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      pending: "outline",
      in_progress: "default",
      completed: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Order not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/production')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold">{order.order_number}</h1>
          <p className="text-muted-foreground">{order.customer_name}</p>
          {isVibeAdmin && <p className="text-sm text-muted-foreground">{order.companies.name}</p>}
        </div>

        {stages.length === 0 && isVibeAdmin && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">No production stages initialized</p>
              <Button onClick={initializeStages}>
                <Plus className="h-4 w-4 mr-2" />
                Initialize Stages
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {STAGE_NAMES.map((stageDef) => {
            const stage = stages.find(s => s.stage_name === stageDef.value);
            if (!stage) return null;

            return (
              <Card key={stage.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      {getStageIcon(stage.status)}
                      <div>
                        <CardTitle>{stageDef.label}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {stage.vendors?.name || 'No vendor assigned'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      {getStatusBadge(stage.status)}
                      <Dialog open={updateDialogOpen && selectedStage?.id === stage.id} onOpenChange={(open) => {
                        setUpdateDialogOpen(open);
                        if (open) {
                          setSelectedStage(stage);
                          setNewStatus(stage.status);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Update
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Update {stageDef.label} Stage</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
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
                            <div>
                              <Label>Add Note</Label>
                              <Textarea
                                value={updateNote}
                                onChange={(e) => setUpdateNote(e.target.value)}
                                placeholder="Add update notes..."
                                rows={3}
                              />
                            </div>
                            <div>
                              <Label>Upload Image</Label>
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setUpdateImage(e.target.files?.[0] || null)}
                              />
                            </div>
                            <Button onClick={handleUpdateStage} disabled={uploading} className="w-full">
                              {uploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Uploading...
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
                  </div>
                </CardHeader>
                <CardContent>
                  {isVibeAdmin && (
                    <div className="mb-4">
                      <Label>Assign Vendor</Label>
                      <Select
                        value={stage.vendor_id || ""}
                        onValueChange={(value) => handleAssignVendor(stage.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No vendor</SelectItem>
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {stage.production_stage_updates.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <h4 className="font-semibold text-sm">Updates:</h4>
                      {stage.production_stage_updates.map((update) => (
                        <div key={update.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start">
                            <Badge variant="outline">{update.update_type.replace('_', ' ')}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(update.created_at).toLocaleString()}
                            </span>
                          </div>
                          {update.note_text && (
                            <p className="text-sm">{update.note_text}</p>
                          )}
                          {update.image_url && (
                            <img
                              src={update.image_url}
                              alt="Stage update"
                              className="rounded-lg max-h-48 object-cover"
                            />
                          )}
                          {update.previous_status && update.new_status && (
                            <p className="text-sm text-muted-foreground">
                              Status changed: {update.previous_status} → {update.new_status}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
