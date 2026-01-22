import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Download, Plus, Upload, FileText, Package, CheckCircle2, Circle, Truck, Edit, AlertCircle, X, Loader2, Paperclip, Trash2, Lock, Sparkles, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VendorAssignmentDialog } from "@/components/VendorAssignmentDialog";
import { CreateShipmentInvoiceDialog } from "@/components/CreateShipmentInvoiceDialog";
import { ProductionStageTimeline } from "@/components/ProductionStageTimeline";
import { cn } from "@/lib/utils";

import { generateInvoiceNumber } from "@/lib/invoiceUtils";


const STAGE_DEFINITIONS = [
  { value: 'production_proceeding_part_1', label: 'Material Order and Securing', order: 1, weight: 20 },
  { value: 'production_proceeding_part_2', label: 'Print and Converting', order: 2, weight: 50 },
  { value: 'complete_qc', label: 'Packing and QC', order: 3, weight: 15 },
  { value: 'shipped', label: 'Shipped', order: 4, weight: 10 },
  { value: 'delivered', label: 'Delivered', order: 5, weight: 5 },
];

// Keep STAGE_NAMES for backward compatibility
const STAGE_NAMES = STAGE_DEFINITIONS;

const OrderDetail = () => {
  const {
    orderId
  } = useParams();
  const navigate = useNavigate();
  const [vibeNotes, setVibeNotes] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [artApproved, setArtApproved] = useState(false);
  const [orderFinalized, setOrderFinalized] = useState(false);
  const [vibeProcessed, setVibeProcessed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedOrder, setEditedOrder] = useState<any>({});
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [productionStages, setProductionStages] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [stageUpdates, setStageUpdates] = useState<{[key: string]: any[]}>({});
  const [isVendor, setIsVendor] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [stageNotes, setStageNotes] = useState<{[key: string]: string}>({});
  const [stageImages, setStageImages] = useState<{[key: string]: File | null}>({});
  const [stageFiles, setStageFiles] = useState<{[key: string]: File | null}>({});
  const [updatingStages, setUpdatingStages] = useState<{[key: string]: boolean}>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [newItemProductId, setNewItemProductId] = useState<string>('');
  const [newItemQuantity, setNewItemQuantity] = useState<number>(1);
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [productSearch, setProductSearch] = useState<string>('');
  const [vibeAttachments, setVibeAttachments] = useState<any[]>([]);
  const [vibeAttachmentFile, setVibeAttachmentFile] = useState<File | null>(null);
  const [vibeAttachmentNote, setVibeAttachmentNote] = useState('');
  const [uploadingVibeAttachment, setUploadingVibeAttachment] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Re-upload PO states
  const [showReuploadDialog, setShowReuploadDialog] = useState(false);
  const [reuploadFiles, setReuploadFiles] = useState<File[]>([]);
  const [reuploadTextInput, setReuploadTextInput] = useState('');
  const [reuploadInputMode, setReuploadInputMode] = useState<'pdf' | 'text'>('pdf');
  const [reuploadAnalysisHint, setReuploadAnalysisHint] = useState('');
  const [analyzingReupload, setAnalyzingReupload] = useState(false);
  const [unmatchedPoItems, setUnmatchedPoItems] = useState<any[]>([]);
  const [matchingProductId, setMatchingProductId] = useState<Record<string, string>>({});
  const [openCombobox, setOpenCombobox] = useState<Record<string, boolean>>({});
  
  // Order attachments states
  const [orderAttachments, setOrderAttachments] = useState<any[]>([]);
  const [uploadingOrderAttachment, setUploadingOrderAttachment] = useState(false);
  const [orderAttachmentDescription, setOrderAttachmentDescription] = useState('');

  useEffect(() => {
    checkAdminStatus();
    if (orderId) {
      fetchOrder();
      fetchProductionStages();
      fetchVendors();
      fetchInvoices();
      fetchVibeAttachments();
      fetchOrderAttachments();
    }
  }, [orderId]);

  useEffect(() => {
    if (order?.company_id) {
      fetchProducts(order.company_id);
    }
  }, [order?.company_id]);

  const fetchProducts = async (companyId?: string) => {
    if (!companyId) return;
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (data) setProducts(data);
  };
  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      const role = data?.role as string;
      setIsAdmin(role === 'admin' || role === 'vibe_admin');
      setIsVibeAdmin(role === 'vibe_admin');
      setIsVendor(role === 'vendor');
      // Company-side users (admin/customer/company) should see the simplified customer view
      setIsCustomer(role === 'admin' || role === 'customer' || role === 'company');

      if (role === 'vendor') {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setVendorId(vendorData?.id || null);
      }
    }
  };
  const fetchOrder = async () => {
    setLoading(true);
    const {
      data,
      error
    } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .order('line_number', { ascending: true, nullsFirst: false, foreignTable: 'order_items' })
      .single();
    if (!error && data) {
      setOrder(data);
      setEditedOrder(data);
      setEditedItems(data.order_items || []);
      setVibeProcessed(data.vibe_processed || false);
      setOrderFinalized(data.order_finalized || false);
      
      // Check artwork approval status for all products in order
      if (data.order_items && data.order_items.length > 0) {
        const productIds = data.order_items.map((item: any) => item.product_id);
        const { data: artworkData } = await supabase
          .from('artwork_files')
          .select('is_approved, sku')
          .in('sku', data.order_items.map((item: any) => item.sku));
        
        // All products must have approved artwork
        const allApproved = data.order_items.every((item: any) => 
          artworkData?.some((art: any) => art.sku === item.sku && art.is_approved)
        );
        setArtApproved(allApproved);
      }
    }
    setLoading(false);
  };

  const fetchProductionStages = async () => {
    let stagesQuery = supabase
      .from('production_stages')
      .select('*, vendors(name)')
      .eq('order_id', orderId)
      .order('sequence_order');

    // Vendors only see their assigned stages
    if (isVendor && vendorId) {
      stagesQuery = stagesQuery.eq('vendor_id', vendorId);
    }

    const { data, error } = await stagesQuery;
    
    if (!error && data) {
      setProductionStages(data);
      
      // Fetch updates for each stage
      const updates: {[key: string]: any[]} = {};
      for (const stage of data) {
        const { data: stageUpdatesData } = await supabase
          .from('production_stage_updates')
          .select('*')
          .eq('stage_id', stage.id)
          .order('created_at', { ascending: false });
        
        if (stageUpdatesData) {
          updates[stage.id] = stageUpdatesData;
        }
      }
      setStageUpdates(updates);
    }
  };

  const fetchVendors = async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setVendors(data);
    }
  };

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('shipment_number');
    
    if (data) {
      setInvoices(data);
    }
  };

  const fetchVibeAttachments = async () => {
    const { data } = await supabase
      .from('vibe_note_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    
    if (data) {
      setVibeAttachments(data);
    }
  };

  const handleUploadVibeAttachment = async () => {
    if (!vibeAttachmentFile && !vibeAttachmentNote.trim()) {
      toast({ title: "Error", description: "Please add a note or select a file", variant: "destructive" });
      return;
    }

    setUploadingVibeAttachment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let fileName = null;
      let fileType = null;
      let originalFileName = null;

      // Only upload file if one was selected
      if (vibeAttachmentFile) {
        const fileExt = vibeAttachmentFile.name.split('.').pop();
        fileName = `${orderId}/${Date.now()}.${fileExt}`;
        fileType = vibeAttachmentFile.type;
        originalFileName = vibeAttachmentFile.name;

        const { error: uploadError } = await supabase.storage
          .from('vibe-attachments')
          .upload(fileName, vibeAttachmentFile);

        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase
        .from('vibe_note_attachments')
        .insert({
          order_id: orderId,
          file_url: fileName || '', // Empty string for note-only entries
          file_name: originalFileName || 'Note',
          file_type: fileType,
          uploaded_by: user.id,
          note: vibeAttachmentNote.trim() || null,
        });

      if (insertError) throw insertError;

      toast({ title: "Success", description: vibeAttachmentFile ? "Attachment uploaded" : "Note added" });
      setVibeAttachmentFile(null);
      setVibeAttachmentNote('');
      fetchVibeAttachments();
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setUploadingVibeAttachment(false);
    }
  };

  const handleDeleteVibeAttachment = async (attachmentId: string, filePath: string) => {
    if (!confirm('Delete this attachment?')) return;

    try {
      await supabase.storage.from('vibe-attachments').remove([filePath]);
      await supabase.from('vibe_note_attachments').delete().eq('id', attachmentId);
      toast({ title: "Deleted", description: "Attachment removed" });
      fetchVibeAttachments();
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDownloadVibeAttachment = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage
      .from('vibe-attachments')
      .createSignedUrl(filePath, 3600, { download: fileName });

    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
    } else {
      toast({ title: "Error", description: "Failed to download", variant: "destructive" });
    }
  };

  // Order Attachments Functions
  const fetchOrderAttachments = async () => {
    const { data } = await supabase
      .from('order_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    
    if (data) {
      setOrderAttachments(data);
    }
  };

  const handleUploadOrderAttachment = async (file: File) => {
    if (!file) return;

    setUploadingOrderAttachment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const filePath = `${orderId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('po-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('order_attachments')
        .insert({
          order_id: orderId,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          description: orderAttachmentDescription.trim() || null,
          uploaded_by: user.id,
        });

      if (insertError) throw insertError;

      toast({ title: "Success", description: "Attachment uploaded" });
      setOrderAttachmentDescription('');
      fetchOrderAttachments();
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast({ title: "Error", description: "Failed to upload attachment", variant: "destructive" });
    } finally {
      setUploadingOrderAttachment(false);
    }
  };

  const handleDeleteOrderAttachment = async (attachmentId: string, filePath: string) => {
    if (!confirm('Delete this attachment?')) return;

    try {
      await supabase.storage.from('po-documents').remove([filePath]);
      await supabase.from('order_attachments').delete().eq('id', attachmentId);
      toast({ title: "Deleted", description: "Attachment removed" });
      fetchOrderAttachments();
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDownloadOrderAttachment = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage
      .from('po-documents')
      .createSignedUrl(filePath, 3600, { download: fileName });

    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
    } else {
      toast({ title: "Error", description: "Failed to download", variant: "destructive" });
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

      const { error } = await supabase
        .from('production_stages')
        .insert(stagesToCreate);

      if (error) throw error;
      
      await fetchProductionStages();
      
      toast({
        title: "Success",
        description: "Production stages initialized successfully",
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

  const calculateProductionProgress = () => {
    if (productionStages.length === 0) return 0;
    // Each stage contributes 20% max: 10% for in_progress, 20% for completed
    const maxPerStage = 100 / productionStages.length;
    const progressPerStage = maxPerStage / 2; // Half for in_progress, full for completed
    
    let totalProgress = 0;
    productionStages.forEach(stage => {
      if (stage.status === 'completed') {
        totalProgress += maxPerStage; // Full 20% (or proportional amount)
      } else if (stage.status === 'in_progress') {
        totalProgress += progressPerStage; // Half = 10% (or proportional amount)
      }
    });
    
    return Math.round(totalProgress);
  };

  const handleStageStatusChange = async (stageId: string, newStatus: string) => {
    // Both vendors and vibe admins can update stage status
    if (!isVibeAdmin && !isVendor) return;

    // Vendors can only update their own stages
    if (isVendor) {
      const stage = productionStages.find(s => s.id === stageId);
      if (!stage || stage.vendor_id !== vendorId) {
        toast({
          title: "Error",
          description: "You can only update your assigned stages",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      setUpdatingStages(prev => ({ ...prev, [stageId]: true }));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let imageUrl = null;

      // Upload image if provided
      if (stageImages[stageId]) {
        const fileExt = stageImages[stageId]!.name.split('.').pop();
        const fileName = `${stageId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('production-images')
          .upload(fileName, stageImages[stageId]!);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('production-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Upload file (PDF/Excel) if provided - admin only
      let fileUrl = null;
      let uploadedFileName = null;
      if (isVibeAdmin && stageFiles[stageId]) {
        const file = stageFiles[stageId]!;
        uploadedFileName = file.name;
        const fileExt = file.name.split('.').pop();
        const fileName = `${stageId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('production-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('production-images')
          .getPublicUrl(fileName);

        fileUrl = publicUrl;
      }

      // Update stage status
      const { error } = await supabase
        .from('production_stages')
        .update({ status: newStatus })
        .eq('id', stageId);

      if (error) throw error;

      // Create updates
      const updates = [];

      // Status change update
      updates.push({
        stage_id: stageId,
        updated_by: user.id,
        update_type: 'status_change',
        previous_status: productionStages.find(s => s.id === stageId)?.status,
        new_status: newStatus,
        note_text: stageNotes[stageId] || null,
        image_url: imageUrl,
        file_url: fileUrl,
        file_name: uploadedFileName,
      });

      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('production_stage_updates')
          .insert(updates);

        if (updateError) throw updateError;
      }

      // Clear note, image and file for this stage
      setStageNotes(prev => ({ ...prev, [stageId]: "" }));
      setStageImages(prev => ({ ...prev, [stageId]: null }));
      setStageFiles(prev => ({ ...prev, [stageId]: null }));

      toast({
        title: "Stage Updated",
        description: "Production stage has been updated successfully"
      });
      fetchProductionStages();
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast({
        title: "Error",
        description: "Failed to update stage",
        variant: "destructive"
      });
    } finally {
      setUpdatingStages(prev => ({ ...prev, [stageId]: false }));
    }
  };

  // Check if a sub-stage is completed by looking for the auto-note marker
  const isSubstageComplete = (stageId: string, substageKey: string) => {
    const updates = stageUpdates[stageId] || [];
    const noteMarker = `<!--${substageKey.toUpperCase()}-->`;
    return updates.some(u => u.note_text?.includes(noteMarker));
  };

  // Delete a production stage update
  const handleDeleteStageUpdate = async (updateId: string, stageId: string) => {
    if (!confirm('Delete this update?')) return;
    
    try {
      const { error } = await supabase
        .from('production_stage_updates')
        .delete()
        .eq('id', updateId);
      
      if (error) throw error;
      
      toast({ title: "Deleted", description: "Update removed" });
      fetchProductionStages();
    } catch (error) {
      console.error('Error deleting update:', error);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  // Format note text for display (strips hidden markers)
  const formatNoteText = (noteText: string) => {
    return noteText.replace(/<!--[A-Z_]+-->/g, '');
  };

  // Handle sub-stage completion with auto-note
  const handleSubstageComplete = async (stageId: string, substage: { key: string; label: string; percent: number }) => {
    if (!isVibeAdmin) return;
    
    // Check if already completed
    if (isSubstageComplete(stageId, substage.key)) {
      toast({
        title: "Already Completed",
        description: `${substage.label} has already been marked as complete`,
      });
      return;
    }

    try {
      setUpdatingStages(prev => ({ ...prev, [stageId]: true }));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Ensure stage is at least in_progress
      const stage = productionStages.find(s => s.id === stageId);
      if (stage?.status === 'pending') {
        await supabase
          .from('production_stages')
          .update({ status: 'in_progress' })
          .eq('id', stageId);
      }

      // Create auto-note with hidden marker for detection + clean display text
      const noteText = `<!--${substage.key.toUpperCase()}-->${substage.label} Complete`;
      
      const { error } = await supabase
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
      
      fetchProductionStages();
    } catch (error: any) {
      console.error('Error completing sub-stage:', error);
      toast({
        title: "Error",
        description: "Failed to update sub-stage",
        variant: "destructive"
      });
    } finally {
      setUpdatingStages(prev => ({ ...prev, [stageId]: false }));
    }
  };

  const handleAssignVendor = async (stageId: string, vendorId: string) => {
    if (!isVibeAdmin) return;

    const actualVendorId = vendorId === 'none' ? null : vendorId;
    const { error } = await supabase
      .from('production_stages')
      .update({ vendor_id: actualVendorId })
      .eq('id', stageId);

    if (!error) {
      toast({
        title: "Vendor Assigned",
        description: "Vendor has been assigned to the stage"
      });
      fetchProductionStages();
    } else {
      toast({
        title: "Error",
        description: "Failed to assign vendor",
        variant: "destructive"
      });
    }
  };

  const handleInternalNotesChange = async (stageId: string, notes: string) => {
    if (!isVibeAdmin) return;
    
    try {
      const { error } = await supabase
        .from('production_stages')
        .update({ internal_notes: notes })
        .eq('id', stageId);

      if (error) throw error;

      toast({
        title: "Saved",
        description: "Internal notes updated",
      });
      
      fetchProductionStages();
    } catch (error: any) {
      console.error('Error saving internal notes:', error);
      toast({
        title: "Error",
        description: "Failed to save internal notes",
        variant: "destructive",
      });
    }
  };

  // Placeholder for update dialog - ProductionStageTimeline handles updates inline
  const handleOpenUpdateDialog = () => {};

  const handleAddVibeNote = async () => {
    if (!vibeNotes.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get current notes or initialize empty array
    const currentNotes = order.vibenotes || [];
    
    // Create new note object
    const newNote = {
      author: user.email || 'Unknown',
      date: new Date().toLocaleString(),
      text: vibeNotes.trim()
    };

    // Add new note to the array
    const updatedNotes = [...currentNotes, newNote];

    // Update order in database
    const { error } = await supabase
      .from('orders')
      .update({ vibenotes: updatedNotes })
      .eq('id', orderId);

    if (!error) {
      toast({
        title: "Vibe Note Added",
        description: "Your note has been saved to the order."
      });
      setVibeNotes("");
      fetchOrder(); // Refresh order to show new note
    } else {
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
  };

  const handleOrderFinalized = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        order_finalized: true,
        order_finalized_at: new Date().toISOString(),
        order_finalized_by: user.id
      })
      .eq('id', orderId);

    if (!error) {
      setOrderFinalized(true);
      toast({
        title: "Order Finalized",
        description: "Order has been approved and finalized."
      });
      fetchOrder();
    }
  };

  const handleVibeProcessed = async () => {
    if (!isAdmin) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('orders')
      .update({ 
        vibe_processed: true,
        vibe_processed_at: new Date().toISOString(),
        vibe_processed_by: user.id
      })
      .eq('id', orderId);

    if (!error) {
      // Check if invoice already exists
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!existingInvoice) {
        // Create invoice with status "Final Review" using order number
        const invoiceNumber = generateInvoiceNumber(order.order_number, 1);
        const { error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            company_id: order.company_id,
            order_id: orderId,
            invoice_number: invoiceNumber,
            status: 'final_review',
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            created_by: user.id
          });

        if (invoiceError) {
          toast({
            title: "Warning",
            description: "Order processed but invoice creation failed",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Order Processed",
            description: "Order marked as Vibe Processed and invoice created with Final Review status."
          });
        }
      } else {
        toast({
          title: "Order Processed",
          description: "Order has been marked as Vibe Processed."
        });
      }
      
      setVibeProcessed(true);
      fetchOrder();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (!error) {
      // If moving to production, automatically create invoice and mark as vibe processed
      if (newStatus === 'in production' && isVibeAdmin) {
        await handleVibeProcessed();
      }
      
      toast({
        title: "Status Updated",
        description: `Order status changed to ${newStatus}`
      });
      fetchOrder();
    } else {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive"
      });
    }
  };

  const handleSaveOrder = async () => {
    if (!isAdmin && !isVibeAdmin) return;
    if (isSaving) return; // Prevent multiple clicks

    setIsSaving(true);
    try {
      // Find items to delete (in original but not in edited)
      const originalItemIds = (order.order_items || []).map((item: any) => item.id);
      const editedItemIds = editedItems.filter(item => !item.isNew).map(item => item.id);
      const itemsToDelete = originalItemIds.filter((id: string) => !editedItemIds.includes(id));
      const existingItems = editedItems.filter(item => !item.isNew);
      const newItems = editedItems.filter(item => item.isNew);

      // PHASE 1: Delete, Insert, and fetch vendor PO items in parallel
      const phase1Promises: Promise<any>[] = [];

      // Delete removed items
      if (itemsToDelete.length > 0) {
        phase1Promises.push(
          (async () => {
            await supabase
              .from('vendor_po_items')
              .update({ order_item_id: null })
              .in('order_item_id', itemsToDelete);
            await supabase.from('order_items').delete().in('id', itemsToDelete);
          })()
        );
      }

      // Insert new items
      if (newItems.length > 0) {
        const itemsToInsert = newItems.map(item => ({
          order_id: orderId,
          product_id: item.product_id,
          sku: item.sku,
          item_id: item.item_id,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: Number(item.quantity) * Number(item.unit_price),
          shipped_quantity: 0
        }));
        phase1Promises.push(
          (async () => { await supabase.from('order_items').insert(itemsToInsert); })()
        );
      }

      // Fetch all vendor PO items for existing order items in one query
      const existingItemIds = existingItems.map(item => item.id);
      let allVendorPoItems: any[] = [];
      if (existingItemIds.length > 0) {
        phase1Promises.push(
          (async () => {
            const { data } = await supabase
              .from('vendor_po_items')
              .select('id, vendor_po_id, unit_cost, order_item_id')
              .in('order_item_id', existingItemIds);
            allVendorPoItems = data || [];
          })()
        );
      }

      await Promise.all(phase1Promises);

      // Calculate new totals
      const newSubtotal = editedItems.reduce((sum, item) => 
        sum + (Number(item.quantity) * Number(item.unit_price)), 0
      );
      const newTotal = newSubtotal + Number(editedOrder.tax || 0);

      // PHASE 2: Update all existing items, vendor PO items, order, and invoice in parallel
      const phase2Promises: Promise<any>[] = [];

      // Update existing order items in parallel
      for (const item of existingItems) {
        const newItemTotal = Number(item.quantity) * Number(item.unit_price);
        phase2Promises.push(
          (async () => {
            await supabase
              .from('order_items')
              .update({
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: newItemTotal,
                description: item.description,
                item_id: item.item_id,
                name: item.name
              })
              .eq('id', item.id);
          })()
        );

        // Update linked vendor_po_items
        const linkedPoItems = allVendorPoItems.filter(poi => poi.order_item_id === item.id);
        for (const poItem of linkedPoItems) {
          const poItemTotal = Number(item.quantity) * Number(poItem.unit_cost);
          phase2Promises.push(
            (async () => {
              await supabase
                .from('vendor_po_items')
                .update({
                  quantity: item.quantity,
                  name: item.name,
                  sku: item.sku || item.item_id,
                  total: poItemTotal
                })
                .eq('id', poItem.id);
            })()
          );
        }
      }

      phase2Promises.push(
        (async () => {
          await supabase
            .from('orders')
            .update({
              customer_name: editedOrder.customer_name,
              customer_email: editedOrder.customer_email,
              customer_phone: editedOrder.customer_phone,
              shipping_name: editedOrder.shipping_name,
              shipping_street: editedOrder.shipping_street,
              shipping_city: editedOrder.shipping_city,
              shipping_state: editedOrder.shipping_state,
              shipping_zip: editedOrder.shipping_zip,
              billing_name: editedOrder.billing_name,
              billing_street: editedOrder.billing_street,
              billing_city: editedOrder.billing_city,
              billing_state: editedOrder.billing_state,
              billing_zip: editedOrder.billing_zip,
              po_number: editedOrder.po_number,
              memo: editedOrder.memo,
              estimated_delivery_date: editedOrder.estimated_delivery_date,
              subtotal: newSubtotal,
              total: newTotal
            })
            .eq('id', orderId);
        })()
      );

      // Update blanket invoice in parallel
      phase2Promises.push(
        (async () => {
          await supabase
            .from('invoices')
            .update({
              subtotal: newSubtotal,
              total: newTotal + Number(editedOrder.shipping_cost || 0)
            })
            .eq('order_id', orderId)
            .eq('invoice_type', 'blanket')
            .is('deleted_at', null);
        })()
      );

      await Promise.all(phase2Promises);

      // PHASE 3: Recalculate vendor PO totals in parallel
      const affectedPoIds = [...new Set(allVendorPoItems.map(poi => poi.vendor_po_id))];
      if (affectedPoIds.length > 0) {
        const poUpdatePromises = affectedPoIds.map(async (poId) => {
          const { data: poItems } = await supabase
            .from('vendor_po_items')
            .select('total')
            .eq('vendor_po_id', poId);
          
          if (poItems) {
            const poTotal = poItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
            await supabase.from('vendor_pos').update({ total: poTotal }).eq('id', poId);
          }
        });
        await Promise.all(poUpdatePromises);
      }

      toast({
        title: "Order Updated",
        description: "Order, vendor POs, and invoices synced successfully"
      });
      setIsEditMode(false);
      fetchOrder();
      fetchInvoices();
    } catch (error: any) {
      console.error('Error saving order:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemPriceChange = (itemId: string, newPrice: number) => {
    setEditedItems(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, unit_price: newPrice, total: Number(item.quantity) * newPrice }
          : item
      )
    );
  };

  const handleItemQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    
    setEditedItems(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, quantity: newQuantity, total: newQuantity * Number(item.unit_price) }
          : item
      )
    );
  };

  const handleDeleteItem = (itemId: string) => {
    setEditedItems(items => items.filter(item => item.id !== itemId));
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === editedItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(editedItems.map(item => item.id)));
    }
  };

  const handleBulkPriceUpdate = () => {
    if (selectedItemIds.size === 0 || !bulkPrice) return;
    const newPrice = parseFloat(bulkPrice);
    if (isNaN(newPrice)) return;
    
    setEditedItems(items =>
      items.map(item =>
        selectedItemIds.has(item.id)
          ? { ...item, unit_price: newPrice, total: Number(item.quantity) * newPrice }
          : item
      )
    );
    setSelectedItemIds(new Set());
    setBulkPrice('');
    toast({
      title: "Prices Updated",
      description: `Updated ${selectedItemIds.size} item(s) to $${newPrice.toFixed(2)}`
    });
  };

  const handleAddItem = () => {
    const product = products.find(p => p.id === newItemProductId);
    if (!product) return;

    const newItem = {
      id: `new-${Date.now()}`,
      order_id: orderId,
      product_id: product.id,
      sku: product.item_id || product.id.slice(0, 8),
      item_id: product.item_id || null,
      name: product.name,
      description: product.description || '',
      quantity: newItemQuantity,
      unit_price: newItemPrice || product.price || 0,
      total: newItemQuantity * (newItemPrice || product.price || 0),
      shipped_quantity: 0,
      isNew: true
    };

    setEditedItems(items => [...items, newItem]);
    setShowAddItemDialog(false);
    setNewItemProductId('');
    setNewItemQuantity(1);
    setNewItemPrice(0);
  };
  const handleDownloadPackingList = () => {
    toast({
      title: "Downloading Packing List",
      description: "Generating packing list PDF..."
    });
  };
  const handleDownloadInvoice = () => {
    toast({
      title: "Downloading Invoice",
      description: "Generating invoice PDF..."
    });
  };

  // Re-upload PO handlers
  const handleReuploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    
    for (const file of files) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a PDF file`,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(file);
    }
    
    if (validFiles.length > 0) {
      setReuploadFiles(prev => [...prev, ...validFiles]);
    }
    e.target.value = '';
  };

  const handleReuploadAnalyze = async () => {
    if (reuploadInputMode === 'pdf' && reuploadFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one PDF file to analyze",
        variant: "destructive",
      });
      return;
    }
    if (reuploadInputMode === 'text' && !reuploadTextInput.trim()) {
      toast({
        title: "No text provided",
        description: "Please paste some text to analyze",
        variant: "destructive",
      });
      return;
    }

    setAnalyzingReupload(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let allNewItems: any[] = [];
      let allUnmatched: any[] = [];

      if (reuploadInputMode === 'pdf' && reuploadFiles.length > 0) {
        // Process each file
        for (const file of reuploadFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('po-documents')
            .upload(fileName, file);

          if (uploadError) {
            console.error(`Error uploading ${file.name}:`, uploadError);
            continue;
          }

          // Trigger AI analysis
          const { data, error } = await supabase.functions.invoke('analyze-po', {
            body: { 
              pdfPath: fileName,
              companyId: order.company_id,
              filename: file.name,
              orderType: 'standard',
              returnProductsOnly: true,
              analysisHint: reuploadAnalysisHint.trim() || undefined
            }
          });

          if (error) {
            console.error(`Error analyzing ${file.name}:`, error);
            continue;
          }

          // Process extracted items from this file
          if (data?.items && Array.isArray(data.items)) {
            for (const item of data.items) {
              if (item.product_id) {
                const product = products.find(p => p.id === item.product_id);
                allNewItems.push({
                  id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  order_id: orderId,
                  product_id: item.product_id,
                  sku: item.item_id || product?.item_id || item.product_id.slice(0, 8),
                  item_id: item.item_id || product?.item_id || null,
                  name: item.name || product?.name || 'Unknown Product',
                  description: item.description || product?.description || '',
                  quantity: item.quantity || 1,
                  unit_price: item.unit_price || product?.price || 0,
                  total: (item.quantity || 1) * (item.unit_price || product?.price || 0),
                  shipped_quantity: 0,
                  isNew: true
                });
              } else {
                allUnmatched.push(item);
              }
            }
          }
        }
      } else {
        // Text analysis
        const { data, error } = await supabase.functions.invoke('analyze-po', {
          body: { 
            textContent: reuploadTextInput,
            companyId: order.company_id,
            orderType: 'standard',
            returnProductsOnly: true,
            analysisHint: reuploadAnalysisHint.trim() || undefined
          }
        });

        if (error) throw error;

        // Process extracted items
        if (data?.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item.product_id) {
              const product = products.find(p => p.id === item.product_id);
              allNewItems.push({
                id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                order_id: orderId,
                product_id: item.product_id,
                sku: item.item_id || product?.item_id || item.product_id.slice(0, 8),
                item_id: item.item_id || product?.item_id || null,
                name: item.name || product?.name || 'Unknown Product',
                description: item.description || product?.description || '',
                quantity: item.quantity || 1,
                unit_price: item.unit_price || product?.price || 0,
                total: (item.quantity || 1) * (item.unit_price || product?.price || 0),
                shipped_quantity: 0,
                isNew: true
              });
            } else {
              allUnmatched.push(item);
            }
          }
        }
      }

      // Add new items to edited items
      if (allNewItems.length > 0) {
        setEditedItems(prev => [...prev, ...allNewItems]);
        setIsEditMode(true);
      }
      
      if (allUnmatched.length > 0) {
        setUnmatchedPoItems(prev => [...prev, ...allUnmatched]);
      }

      toast({
        title: "PO Analyzed",
        description: `Added ${allNewItems.length} item(s). ${allUnmatched.length > 0 ? `${allUnmatched.length} item(s) need manual matching.` : ''}`,
      });

      // Close dialog and reset
      setShowReuploadDialog(false);
      setReuploadFiles([]);
      setReuploadTextInput('');
      setReuploadAnalysisHint('');

    } catch (error: any) {
      console.error('Error analyzing PO:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setAnalyzingReupload(false);
    }
  };

  const handleMatchUnmatchedItem = (index: number) => {
    const productId = matchingProductId[`unmatched-${index}`];
    if (!productId) return;

    const item = unmatchedPoItems[index];
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newItem = {
      id: `new-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      order_id: orderId,
      product_id: product.id,
      sku: product.item_id || product.id.slice(0, 8),
      item_id: product.item_id || null,
      name: product.name,
      description: product.description || '',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || product.price || 0,
      total: (item.quantity || 1) * (item.unit_price || product.price || 0),
      shipped_quantity: 0,
      isNew: true
    };

    setEditedItems(prev => [...prev, newItem]);
    setUnmatchedPoItems(prev => prev.filter((_, i) => i !== index));
    setMatchingProductId(prev => {
      const updated = { ...prev };
      delete updated[`unmatched-${index}`];
      return updated;
    });
    setIsEditMode(true);

    toast({
      title: "Item Matched",
      description: `Added ${product.name} to order`,
    });
  };

  const handleRemoveUnmatchedItem = (index: number) => {
    setUnmatchedPoItems(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading order...</p>
      </div>;
  }
  if (!order) {
    return <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Order not found</p>
      </div>;
  }
  const displayItems = isEditMode ? editedItems : (order.order_items || []);
  const subtotal = isEditMode 
    ? displayItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unit_price)), 0)
    : (order.subtotal || 0);
  const total = isEditMode
    ? subtotal + Number(order.tax || 0)
    : (order.total || 0);
  return <div className="max-w-7xl mx-auto">
      {/* Process Order Banner for Draft/Pending Orders */}
      {isVibeAdmin && (order.status === 'draft' || order.status === 'pending' || order.status === 'pending_pull') && (
        <div className="mb-6 p-4 bg-blue-500/10 border-2 border-blue-500 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-600">Order Ready to Process</h3>
              <p className="text-sm text-muted-foreground">This order is pending and ready to be moved to production</p>
            </div>
            <Button 
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleStatusChange('in production')}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Process Order → Production
            </Button>
          </div>
        </div>
      )}
      
      {/* Header with Back Button and Action Buttons */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
        <div className="flex gap-3">
          {/* Edit button logic:
              - Vibe admins can edit pending/in production orders
              - Company admins can only edit draft orders */}
          {(() => {
            const canEdit = isVibeAdmin 
              ? (order.status === 'pending' || order.status === 'pending_pull' || order.status === 'in production')
              : (isAdmin && order.status === 'draft');
            
            if (!canEdit) return null;
            
            return isEditMode ? (
              <>
                <Button variant="outline" onClick={() => {
                  setIsEditMode(false);
                  setEditedOrder(order);
                  setEditedItems(order.order_items || []);
                }} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveOrder} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setIsEditMode(true)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Order
              </Button>
            );
          })()}
          {isVibeAdmin && (
            <>
              <Button variant="outline" onClick={() => setShowReuploadDialog(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Re-upload PO
              </Button>
              <Button variant="outline" onClick={() => setShowVendorDialog(true)}>
                <Package className="h-4 w-4 mr-2" />
                Assign Vendors
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handleDownloadPackingList}>
            <Download className="h-4 w-4 mr-2" />
            Packing List
          </Button>
          <Button variant="outline" onClick={handleDownloadInvoice}>
            <Download className="h-4 w-4 mr-2" />
            Invoice
          </Button>
        </div>
      </div>

      {/* Re-upload PO Dialog */}
      <Dialog open={showReuploadDialog} onOpenChange={setShowReuploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Re-upload Customer PO
            </DialogTitle>
            <DialogDescription>
              Upload a new PO PDF or paste text to add/update order items using AI analysis.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={reuploadInputMode} onValueChange={(v) => setReuploadInputMode(v as 'pdf' | 'text')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
              <TabsTrigger value="text">Paste Text</TabsTrigger>
            </TabsList>
            
            <TabsContent value="pdf" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Select PDF Files</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleReuploadFileSelect}
                    className="flex-1"
                  />
                </div>
                {reuploadFiles.length > 0 && (
                  <div className="space-y-1">
                    {reuploadFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        {file.name}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setReuploadFiles(prev => prev.filter((_, i) => i !== index))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setReuploadFiles([])}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Paste PO Text</Label>
                <Textarea
                  value={reuploadTextInput}
                  onChange={(e) => setReuploadTextInput(e.target.value)}
                  placeholder="Paste order items here..."
                  className="min-h-[150px]"
                />
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="space-y-2">
            <Label>Analysis Hint (Optional)</Label>
            <Input
              value={reuploadAnalysisHint}
              onChange={(e) => setReuploadAnalysisHint(e.target.value)}
              placeholder="e.g., NY state products, Anthos brand..."
            />
            <p className="text-xs text-muted-foreground">
              Help the AI match products by providing context about state, brand, or product type.
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReuploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReuploadAnalyze} disabled={analyzingReupload}>
              {analyzingReupload ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze & Add Items
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Assignment Dialog */}
      {isVibeAdmin && order?.order_items && (
        <VendorAssignmentDialog
          open={showVendorDialog}
          onOpenChange={setShowVendorDialog}
          orderId={orderId || ''}
          orderItems={order.order_items.filter((item: any) => item.product_id !== null)}
          onSuccess={fetchOrder}
        />
      )}

      {/* Unmatched PO Items Section */}
      {unmatchedPoItems.length > 0 && (
        <Card className="mb-6 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                Unmatched PO Items ({unmatchedPoItems.length})
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              These items from the PO couldn't be automatically matched. Select a product to add them to the order.
            </p>
            <div className="space-y-3">
              {unmatchedPoItems.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                  <div className="flex-1">
                    <p className="font-medium">{item.name || item.raw_name || 'Unknown Item'}</p>
                    <p className="text-sm text-muted-foreground">
                      Qty: {item.quantity || 1} {item.unit_price ? `• $${item.unit_price.toFixed(2)}` : ''}
                    </p>
                  </div>
                  <Popover open={openCombobox[`unmatched-${index}`]} onOpenChange={(open) => setOpenCombobox(prev => ({ ...prev, [`unmatched-${index}`]: open }))}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[200px] justify-between">
                        {matchingProductId[`unmatched-${index}`] 
                          ? products.find(p => p.id === matchingProductId[`unmatched-${index}`])?.name?.slice(0, 20) + '...'
                          : 'Select product...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search products..." />
                        <CommandList>
                          <CommandEmpty>No product found.</CommandEmpty>
                          <CommandGroup>
                            {products.slice(0, 50).map((product) => (
                              <CommandItem
                                key={product.id}
                                value={product.name}
                                onSelect={() => {
                                  setMatchingProductId(prev => ({ ...prev, [`unmatched-${index}`]: product.id }));
                                  setOpenCombobox(prev => ({ ...prev, [`unmatched-${index}`]: false }));
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    matchingProductId[`unmatched-${index}`] === product.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex-1">
                                  <p className="text-sm">{product.name}</p>
                                  {product.item_id && (
                                    <p className="text-xs text-muted-foreground">{product.item_id}</p>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="sm"
                    onClick={() => handleMatchUnmatchedItem(index)}
                    disabled={!matchingProductId[`unmatched-${index}`]}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveUnmatchedItem(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Checklist */}
      <Card className="mb-6 shadow-md">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Order Status Checklist</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              {artApproved ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Art Approved</p>
                <p className="text-sm text-muted-foreground">
                  {artApproved ? "All artwork approved" : "Pending artwork approval"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {orderFinalized ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Order Finalized Approval</p>
                <p className="text-sm text-muted-foreground">
                  {orderFinalized ? "Order approved by customer" : "Pending customer approval"}
                </p>
              </div>
              {!orderFinalized && (order?.status === 'draft' || order?.status === 'pending') && (
                <Button size="sm" onClick={handleOrderFinalized}>
                  Approve Order
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {vibeProcessed ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">Vibe Processed</p>
                <p className="text-sm text-muted-foreground">
                  {vibeProcessed ? "Order reviewed and approved" : "Pending admin review"}
                </p>
              </div>
              {isVibeAdmin && !vibeProcessed && (
                <Button size="sm" onClick={handleVibeProcessed}>
                  Mark as Processed
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Order Card - ERP Style */}
      <Card className="shadow-lg">
        <CardContent className="p-0">
          {/* Order Header Section */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-table-border p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Order #{order.order_number}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>Order Date: {new Date(order.order_date || order.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  {isEditMode ? (
                    <div className="flex items-center gap-2">
                      <span>Est. Delivery:</span>
                      <Input
                        type="date"
                        value={editedOrder.estimated_delivery_date || ''}
                        onChange={(e) => setEditedOrder({...editedOrder, estimated_delivery_date: e.target.value || null})}
                        className="h-7 w-40 text-sm"
                      />
                    </div>
                  ) : (
                    <span className={`${
                      order.estimated_delivery_date && new Date(order.estimated_delivery_date) < new Date() 
                        ? 'text-red-600 font-medium' 
                        : order.estimated_delivery_date && (new Date(order.estimated_delivery_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) <= 7
                          ? 'text-amber-600 font-medium'
                          : ''
                    }`}>
                      Est. Delivery: {order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString() : 'Not set'}
                    </span>
                  )}
                  {order.quote_id && (
                    <>
                      <span>•</span>
                      <Button 
                        variant="link" 
                        className="h-auto p-0 text-sm text-primary"
                        onClick={() => navigate(`/quotes/${order.quote_id}`)}
                      >
                        View Source Quote
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <Badge className="text-sm px-4 py-1.5 mb-2 capitalize">{order.status}</Badge>
                {isEditMode ? (
                  <Input
                    value={editedOrder.po_number || ''}
                    onChange={(e) => setEditedOrder({...editedOrder, po_number: e.target.value})}
                    placeholder="PO Number"
                    className="text-sm mt-2"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">PO #: {order.po_number || '-'}</p>
                )}
              </div>
            </div>

            {/* Customer & Address Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-background/80 backdrop-blur rounded-lg p-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Customer</h3>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.customer_name}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_name: e.target.value})}
                      placeholder="Customer Name"
                    />
                    <Input
                      value={editedOrder.customer_email || ''}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_email: e.target.value})}
                      placeholder="Email"
                    />
                    <Input
                      value={editedOrder.customer_phone || ''}
                      onChange={(e) => setEditedOrder({...editedOrder, customer_phone: e.target.value})}
                      placeholder="Phone"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_email || '-'}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_phone || '-'}</p>
                  </>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ship To</h3>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.shipping_name}
                      onChange={(e) => setEditedOrder({...editedOrder, shipping_name: e.target.value})}
                      placeholder="Name"
                    />
                    <Input
                      value={editedOrder.shipping_street}
                      onChange={(e) => setEditedOrder({...editedOrder, shipping_street: e.target.value})}
                      placeholder="Street"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editedOrder.shipping_city}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_city: e.target.value})}
                        placeholder="City"
                      />
                      <Input
                        value={editedOrder.shipping_state}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_state: e.target.value})}
                        placeholder="ST"
                        className="w-20"
                      />
                      <Input
                        value={editedOrder.shipping_zip}
                        onChange={(e) => setEditedOrder({...editedOrder, shipping_zip: e.target.value})}
                        placeholder="ZIP"
                        className="w-28"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.shipping_name}</p>
                    <p className="text-sm text-muted-foreground">{order.shipping_street}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
                    </p>
                  </>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Bill To</h3>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editedOrder.billing_name || editedOrder.shipping_name}
                      onChange={(e) => setEditedOrder({...editedOrder, billing_name: e.target.value})}
                      placeholder="Name"
                    />
                    <Input
                      value={editedOrder.billing_street || editedOrder.shipping_street}
                      onChange={(e) => setEditedOrder({...editedOrder, billing_street: e.target.value})}
                      placeholder="Street"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editedOrder.billing_city || editedOrder.shipping_city}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_city: e.target.value})}
                        placeholder="City"
                      />
                      <Input
                        value={editedOrder.billing_state || editedOrder.shipping_state}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_state: e.target.value})}
                        placeholder="ST"
                        className="w-20"
                      />
                      <Input
                        value={editedOrder.billing_zip || editedOrder.shipping_zip}
                        onChange={(e) => setEditedOrder({...editedOrder, billing_zip: e.target.value})}
                        placeholder="ZIP"
                        className="w-28"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.billing_name || order.shipping_name}</p>
                    <p className="text-sm text-muted-foreground">{order.billing_street || order.shipping_street}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.billing_city || order.shipping_city}, {order.billing_state || order.shipping_state} {order.billing_zip || order.shipping_zip}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Order Fulfillment Status Section */}
          {!isEditMode && (
            <div className="p-8 border-t border-table-border bg-gradient-to-b from-primary/5 to-transparent">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Fulfillment Status
              </h2>
              
              {(() => {
                const totalOrdered = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
                const totalShipped = order.order_items?.reduce((sum: number, item: any) => sum + (item.shipped_quantity || 0), 0) || 0;
                const fulfillmentProgress = totalOrdered > 0 ? Math.min((totalShipped / totalOrdered) * 100, 100) : 0;
                
                return (
                  <>
                    {/* Item-by-Item Breakdown */}
                    <div className="border border-table-border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-table-header">
                            <TableHead>Item</TableHead>
                            <TableHead>Item #</TableHead>
                            <TableHead className="text-right">Ordered</TableHead>
                            <TableHead className="text-right">Shipped</TableHead>
                            <TableHead className="w-48">Progress</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.order_items?.map((item: any) => {
                            const shipped = item.shipped_quantity || 0;
                            const itemProgress = Math.min((shipped / item.quantity) * 100, 100);
                            
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="font-mono text-xs">{item.item_id}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right font-medium">{shipped}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={itemProgress} className="h-2 flex-1" />
                                    <span className="text-xs text-muted-foreground w-12 text-right">
                                      {itemProgress.toFixed(0)}%
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Items Table - ERP Style */}
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-4">
              Items
              {isEditMode && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Editing Mode - Adjust quantities and prices as needed)
                </span>
              )}
            </h2>

            {/* Bulk Price Update Section - Only in Edit Mode */}
            {isEditMode && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-end gap-3">
                  <div className="w-40">
                    <label className="text-sm font-medium mb-1.5 block">Bulk Unit Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleBulkPriceUpdate}
                    disabled={selectedItemIds.size === 0 || !bulkPrice}
                    className="px-6"
                  >
                    Update {selectedItemIds.size} Selected
                  </Button>
                  {selectedItemIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedItemIds(new Set())}
                    >
                      Clear Selection
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="border border-table-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-table-header">
                    {isEditMode && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedItemIds.size === displayItems.length && displayItems.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {isEditMode && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayItems.map((item: any, index: number) => (
                    <TableRow key={item.id || index} className={selectedItemIds.has(item.id) ? 'bg-primary/5' : ''}>
                      {isEditMode && (
                        <TableCell>
                          <Checkbox
                            checked={selectedItemIds.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="w-12 h-12 bg-muted rounded border border-table-border flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.item_id || '-'}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs">{item.description || '-'}</TableCell>
                      <TableCell className="text-right">
                        {isEditMode ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => handleItemQuantityChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-24 text-right"
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditMode ? (
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => handleItemPriceChange(item.id, parseFloat(e.target.value) || 0)}
                            className="w-28 text-right"
                          />
                        ) : (
                          `$${item.unit_price?.toFixed(3)}`
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">${item.total?.toFixed(2)}</TableCell>
                      {isEditMode && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Add Item Button */}
            {isEditMode && (
              <div className="mt-4">
                <Button variant="outline" onClick={() => setShowAddItemDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line Item
                </Button>
              </div>
            )}

            {/* Totals Section - Right Aligned */}
            <div className="flex justify-end mt-6">
              <div className="w-80 space-y-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-lg">Total:</span>
                  <span className="font-bold text-xl">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Memo Section */}
            {(order.memo || isEditMode) && (
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Memo</h3>
                {isEditMode ? (
                  <Textarea
                    value={editedOrder.memo || ''}
                    onChange={(e) => setEditedOrder({...editedOrder, memo: e.target.value})}
                    placeholder="Add order memo..."
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{order.memo}</p>
                )}
              </div>
            )}

            {/* Shipments & Invoices Section - Enhanced */}
            {isVibeAdmin && (
              <div className="mt-8 p-6 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Shipments & Invoices
                    </h3>
                    {invoices.length > 0 && (() => {
                      const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
                      const billingProgress = (totalBilled / order.total) * 100;
                      return (
                        <p className="text-sm text-muted-foreground mt-1">
                          {invoices.length} shipment(s) • ${totalBilled.toFixed(2)} billed ({billingProgress.toFixed(1)}% of order total)
                        </p>
                      );
                    })()}
                  </div>
                  <Button onClick={() => setShowShipmentDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Shipment Invoice
                  </Button>
                </div>
                
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shipment invoices created yet. Create your first one to start billing.</p>
                ) : (
                  <div className="space-y-3">
                    {invoices.map((invoice, idx) => (
                      <div 
                        key={invoice.id} 
                        className="p-4 bg-background rounded-lg border border-table-border hover:border-primary/40 transition-colors cursor-pointer" 
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
                                {invoice.shipment_number}
                              </div>
                              {idx < invoices.length - 1 && (
                                <div className="w-0.5 h-8 bg-table-border mt-2"></div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{invoice.invoice_number}</span>
                                <Badge className={
                                  invoice.invoice_type === 'partial' ? 'bg-blue-500 text-white' :
                                  'bg-purple-500 text-white'
                                }>
                                  {invoice.invoice_type?.toUpperCase() || 'FULL'}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {invoice.status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Created: {new Date(invoice.created_at).toLocaleDateString()}</span>
                                {invoice.shipping_cost > 0 && (
                                  <span>• Shipping: ${Number(invoice.shipping_cost).toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">${Number(invoice.total).toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">{invoice.billed_percentage?.toFixed(1)}% of order</p>
                            {(() => {
                              const cumulativeBilled = invoices.slice(0, idx + 1).reduce((sum, inv) => sum + Number(inv.total), 0);
                              const cumulativePercent = (cumulativeBilled / order.total) * 100;
                              return (
                                <p className="text-xs text-primary font-medium mt-1">
                                  Cumulative: {cumulativePercent.toFixed(1)}%
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <CreateShipmentInvoiceDialog
              open={showShipmentDialog}
              onOpenChange={setShowShipmentDialog}
              order={{
                ...order,
                // Keep the exact same item ordering the user sees on the Order page
                order_items: displayItems,
              }}
              onSuccess={() => {
                fetchInvoices();
                fetchOrder();
              }}
            />


            {/* Terms and Conditions */}
            <div className="mt-8 p-6 bg-muted/30 rounded-lg border border-table-border">
              <h3 className="text-sm font-semibold mb-3">Terms and Conditions</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Payment Terms:</strong> {order.terms}</p>
                <div className="space-y-1 pl-4">
                  <p>• Payment is due according to the terms specified above</p>
                  <p>• Late payments may incur additional fees</p>
                  <p>• All prices are in USD unless otherwise specified</p>
                </div>
                <p className="pt-2"><strong>Order Acceptance:</strong> All orders are subject to acceptance and availability</p>
                <p><strong>Shipping & Delivery:</strong> Delivery dates are estimates only. Risk of loss passes to buyer upon delivery to carrier</p>
                <p><strong>Returns:</strong> Custom orders cannot be cancelled once production begins. Standard items may be returned within 30 days</p>
                <p><strong>Liability:</strong> Our liability is limited to the purchase price of the products</p>
              </div>
            </div>
          </div>

          {/* Vibe Notes Section */}
          <div className="border-t border-table-border bg-muted/30 p-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Vibe Notes</h2>
            </div>
            
            <div className="mb-6">
              {/* Vibe Notes - All Users Can Add */}
              <div className="p-4 bg-background rounded-lg border border-table-border">
                <h3 className="font-medium text-sm mb-3">Add Vibe Note</h3>
                <Textarea placeholder="Add a note..." value={vibeNotes} onChange={e => setVibeNotes(e.target.value)} rows={3} className="mb-2" />
                <Button onClick={handleAddVibeNote} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </div>

            {/* Display Vibe Notes (Visible to All) */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Notes</h3>
              {!order.vibenotes || order.vibenotes.length === 0 ? <p className="text-sm text-muted-foreground p-4 bg-background rounded border border-table-border">
                  No vibe notes yet
                </p> : order.vibenotes?.map((note: any, index: number) => <div key={index} className="p-4 bg-background rounded-lg border border-table-border">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium text-primary">{note.author}</span>
                      <span className="text-xs text-muted-foreground">{note.date}</span>
                    </div>
                    <p className="text-sm">{note.text}</p>
                  </div>)}
            </div>
          </div>

          {/* Order Attachments Section */}
          <div className="border-t border-table-border bg-muted/30 p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Order Attachments</h2>
                {(orderAttachments.length > 0 || order.po_pdf_path) && (
                  <Badge variant="secondary">{orderAttachments.length + (order.po_pdf_path ? 1 : 0)}</Badge>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Description (optional)"
                    value={orderAttachmentDescription}
                    onChange={(e) => setOrderAttachmentDescription(e.target.value)}
                    className="w-48"
                  />
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadOrderAttachment(file);
                        e.target.value = '';
                      }}
                      disabled={uploadingOrderAttachment}
                    />
                    <Button variant="outline" size="sm" disabled={uploadingOrderAttachment} asChild>
                      <span>
                        {uploadingOrderAttachment ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Add Attachment
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>

            {/* Attachments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Original PO - if exists */}
              {order.po_pdf_path && (
                <div className="p-4 bg-background rounded-lg border border-border flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-14 rounded border border-border bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">Purchase Order (Original)</p>
                    <p className="text-xs text-muted-foreground mb-2">Primary PO document</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={async () => {
                        const fileName =
                          typeof order.po_pdf_path === "string"
                            ? order.po_pdf_path.split("/").pop() || "purchase-order.pdf"
                            : "purchase-order.pdf";

                        const { data } = await supabase.storage
                          .from("po-documents")
                          .createSignedUrl(order.po_pdf_path, 3600, {
                            download: fileName,
                          });

                        if (data?.signedUrl) {
                          window.location.href = data.signedUrl;
                        } else {
                          toast({
                            title: "Error",
                            description: "Failed to load PO",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}

              {/* Additional Attachments */}
              {orderAttachments.map((attachment) => (
                <div key={attachment.id} className="p-4 bg-background rounded-lg border border-border flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-14 rounded border border-border bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" title={attachment.file_name}>{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {attachment.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleDownloadOrderAttachment(attachment.file_path, attachment.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteOrderAttachment(attachment.id, attachment.file_path)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {!order.po_pdf_path && orderAttachments.length === 0 && (
                <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                  <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No attachments yet</p>
                  {isAdmin && <p className="text-xs mt-1">Click "Add Attachment" to upload files</p>}
                </div>
              )}
            </div>
          </div>

          {/* Internal Vibe Notes with Attachments - Only for Vibe Admins when in production */}
          {isVibeAdmin && order.status === 'in production' && (
            <div className="border-t border-table-border bg-amber-50/50 dark:bg-amber-950/20 p-8">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="h-5 w-5 text-amber-600" />
                <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-400">Internal Vibe Notes</h2>
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">Admin Only</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                These notes and attachments are only visible to Vibe Admins.
              </p>

              {/* Upload Section */}
              <div className="p-4 bg-background rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
                <h3 className="font-medium text-sm mb-3">Add Attachment</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">File</Label>
                    <Input
                      type="file"
                      onChange={(e) => setVibeAttachmentFile(e.target.files?.[0] || null)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Note</Label>
                    <Textarea
                      value={vibeAttachmentNote}
                      onChange={(e) => setVibeAttachmentNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleUploadVibeAttachment();
                        }
                      }}
                      placeholder="Add a note (press Enter to submit, Shift+Enter for new line)..."
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleUploadVibeAttachment}
                    disabled={(!vibeAttachmentFile && !vibeAttachmentNote.trim()) || uploadingVibeAttachment}
                    size="sm"
                  >
                    {uploadingVibeAttachment ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    ) : vibeAttachmentFile ? (
                      <><Paperclip className="h-4 w-4 mr-2" />Upload Attachment</>
                    ) : (
                      <><Plus className="h-4 w-4 mr-2" />Add Note</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Attachments List */}
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Attachments ({vibeAttachments.length})</h3>
                {vibeAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 bg-background rounded border border-amber-200 dark:border-amber-800">
                    No internal attachments yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {vibeAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-3 bg-background rounded-lg border border-amber-200 dark:border-amber-800"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-amber-600" />
                          <div>
                            <p className="text-sm font-medium">{attachment.file_name}</p>
                            {attachment.note && (
                              <p className="text-xs text-muted-foreground">{attachment.note}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {new Date(attachment.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadVibeAttachment(attachment.file_url, attachment.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteVibeAttachment(attachment.id, attachment.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Production Stages Section */}
          {order.status === 'in production' && (
            <div className="border-t border-table-border bg-muted/30 p-8">
              {productionStages.length === 0 ? (
                <div className="text-center py-8 p-4 bg-background rounded-lg border border-table-border">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-4">No production stages have been set up for this order yet.</p>
                  {isVibeAdmin && (
                    <Button onClick={initializeStages}>
                      <Plus className="h-4 w-4 mr-2" />
                      Initialize Production Stages
                    </Button>
                  )}
                </div>
              ) : (
                <ProductionStageTimeline
                  stages={productionStages.map(stage => ({
                    ...stage,
                    production_stage_updates: stageUpdates[stage.id] || []
                  }))}
                  stageDefinitions={STAGE_DEFINITIONS}
                  onUpdateClick={handleOpenUpdateDialog}
                  onQuickStatusChange={async (stageId, newStatus) => {
                    await handleStageStatusChange(stageId, newStatus);
                  }}
                  onSubstageComplete={handleSubstageComplete}
                  onDeleteUpdate={async (updateId) => {
                    // Find the stage this update belongs to
                    for (const stageId of Object.keys(stageUpdates)) {
                      const updates = stageUpdates[stageId];
                      if (updates?.find(u => u.id === updateId)) {
                        await handleDeleteStageUpdate(updateId, stageId);
                        break;
                      }
                    }
                  }}
                  onInternalNotesChange={handleInternalNotesChange}
                  onVendorAssign={handleAssignVendor}
                  vendors={vendors}
                  isVibeAdmin={isVibeAdmin}
                  isVendor={isVendor}
                  isCustomer={isCustomer}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>Production Image</DialogTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setPreviewImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="p-4 overflow-auto">
            {previewImage && (
              <img 
                src={previewImage} 
                alt="Production preview" 
                className="w-full h-auto rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={(open) => {
        setShowAddItemDialog(open);
        if (!open) {
          setProductSearch('');
          setNewItemProductId('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <div className="relative">
                <Input
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {products
                    .filter(p => 
                      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                      (p.item_id && p.item_id.toLowerCase().includes(productSearch.toLowerCase()))
                    )
                    .map((product) => (
                      <div
                        key={product.id}
                        className={`px-3 py-2 cursor-pointer hover:bg-accent ${
                          newItemProductId === product.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => {
                          setNewItemProductId(product.id);
                          setNewItemPrice(product.price || 0);
                          setProductSearch(product.name + (product.item_id ? ` (${product.item_id})` : ''));
                        }}
                      >
                        <div className="text-sm font-medium">{product.name}</div>
                        {product.item_id && (
                          <div className="text-xs text-muted-foreground">{product.item_id}</div>
                        )}
                      </div>
                    ))}
                  {products.filter(p => 
                    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                    (p.item_id && p.item_id.toLowerCase().includes(productSearch.toLowerCase()))
                  ).length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No products found</div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Price</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddItem} disabled={!newItemProductId}>
                Add Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>;
};
export default OrderDetail;