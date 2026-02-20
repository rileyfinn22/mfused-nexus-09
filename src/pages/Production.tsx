import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, CheckCircle2, Clock, Circle, ChevronRight, Factory, CalendarClock, FileText, CalendarDays, Building2, RefreshCw, Truck, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductionProgressBar, ProductionStatusIndicator } from "@/components/ProductionProgressBar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { AddShipmentLegDialog, type LegFormData } from "@/components/AddShipmentLegDialog";
import { getTrackingUrl } from "@/lib/trackingUtils";

// Helper to parse date-only strings (YYYY-MM-DD) as local time, not UTC
const parseDateAsLocal = (dateStr: string | null): Date | undefined => {
  if (!dateStr) return undefined;
  // parseISO handles YYYY-MM-DD as local time when there's no time component
  // But we add explicit handling for date-only strings to avoid timezone shifts
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return parseISO(dateStr);
};

interface ProductionOrder {
  id: string;
  order_number: string;
  customer_name: string;
  order_date: string;
  company_id: string;
  po_number: string | null;
  description: string | null;
  shipping_state: string;
  total: number;
  estimated_delivery_date: string | null;
  order_finalized_at: string | null;
  updated_at: string;
  status: string;
  companies: {
    name: string;
  };
  production_progress?: number;
}

interface Company {
  id: string;
  name: string;
}

export default function Production() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(searchParams.get('company') || 'all');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncSpreadsheetId, setSyncSpreadsheetId] = useState("");
  const [syncSheetName, setSyncSheetName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { activeCompanyId } = useActiveCompany();
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkLegDialogOpen, setBulkLegDialogOpen] = useState(false);

  const toggleOrderSelection = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const clearSelection = () => setSelectedOrderIds(new Set());

  const handleBulkAddShipmentLeg = async (formData: LegFormData, file?: File) => {
    if (selectedOrderIds.size === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const trackingUrl = formData.carrier && formData.tracking_number
        ? getTrackingUrl(formData.carrier, formData.tracking_number) : null;

      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (file) {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `shipment-legs/bulk/${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from('packing-lists')
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from('packing-lists')
          .getPublicUrl(filePath);
        fileUrl = publicUrl;
        fileName = file.name;
      }

      const orderIds = Array.from(selectedOrderIds);
      const { data: existingLegs } = await (supabase as any)
        .from('shipment_legs')
        .select('order_id, leg_number')
        .in('order_id', orderIds);

      const maxLegByOrder: Record<string, number> = {};
      (existingLegs || []).forEach((leg: any) => {
        maxLegByOrder[leg.order_id] = Math.max(maxLegByOrder[leg.order_id] || 0, leg.leg_number);
      });

      const { data: orderData } = await supabase
        .from('orders')
        .select('id, company_id')
        .in('id', orderIds);

      const companyMap: Record<string, string> = {};
      (orderData || []).forEach((o: any) => { companyMap[o.id] = o.company_id; });

      const inserts = orderIds.map(oid => ({
        order_id: oid,
        company_id: companyMap[oid],
        leg_number: (maxLegByOrder[oid] || 0) + 1,
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
        attachment_url: fileUrl,
        attachment_name: fileName,
      }));

      const { error } = await (supabase as any)
        .from('shipment_legs')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Shipping leg added to ${orderIds.length} order${orderIds.length > 1 ? 's' : ''}`,
      });
      clearSelection();
      setBulkLegDialogOpen(false);
    } catch (error: any) {
      console.error('Error bulk adding shipment leg:', error);
      toast({ title: "Error", description: "Failed to add shipping legs", variant: "destructive" });
    }
  };

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (roleChecked && isVibeAdmin) {
      fetchCompanies();
    }
  }, [roleChecked, isVibeAdmin]);

  useEffect(() => {
    if (roleChecked) {
      fetchProductionOrders();
    }
  }, [roleChecked, isVibeAdmin, isVendor, vendorId, selectedCompanyId, activeCompanyId]);

  const handleCompanyChange = (value: string) => {
    setSelectedCompanyId(value);
    if (value === 'all') {
      searchParams.delete('company');
    } else {
      searchParams.set('company', value);
    }
    setSearchParams(searchParams);
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const checkRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRoleChecked(true);
        return;
      }

      // IMPORTANT: users can have multiple role rows (multi-company, admin + company, etc.)
      // so never use .single() / .maybeSingle() here.
      const { data: roleRows, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;

      const roles = (roleRows || []).map((r: any) => String(r.role));
      const vibeAdmin = roles.includes('vibe_admin');
      const vendor = roles.includes('vendor');

      setIsVibeAdmin(vibeAdmin);
      setIsVendor(vendor);

      if (vendor) {
        // Get vendor ID for this user
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        setVendorId(vendorData?.id || null);
      } else {
        setVendorId(null);
      }
    } catch (err) {
      console.error('Error checking role:', err);
    } finally {
      setRoleChecked(true);
    }
  };

  const fetchProductionOrders = async () => {
    try {
      let ordersData: any[] = [];
      let completedOrdersData: any[] = [];

      if (isVendor && vendorId) {
        // Vendors: get orders where they have assigned stages (exclude pull_ship)
        const { data: stages, error: stagesError } = await supabase
          .from('production_stages')
          .select('order_id')
          .eq('vendor_id', vendorId);

        if (stagesError) throw stagesError;

        const orderIds = [...new Set(stages?.map(s => s.order_id) || [])];
        
        if (orderIds.length > 0) {
          // Fetch in-production orders
          const { data, error } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              customer_name,
              order_date,
              company_id,
              po_number,
              description,
              shipping_state,
              total,
              estimated_delivery_date,
              production_progress,
              updated_at,
              status,
              companies (
                name
              )
            `)
            .in('id', orderIds)
            .eq('status', 'in production')
            .neq('order_type', 'pull_ship')
            .is('parent_order_id', null)
            .order('order_date', { ascending: false });

          if (error) throw error;
          ordersData = data || [];

          // Fetch completed orders
          const { data: completedData, error: completedError } = await supabase
            .from('orders')
            .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            description,
            shipping_state,
            total,
            estimated_delivery_date,
            production_progress,
            updated_at,
            status,
            companies (
              name
            )
          `)
          .in('id', orderIds)
          .in('status', ['shipped', 'delivered', 'completed'])
            .neq('order_type', 'pull_ship')
            .is('parent_order_id', null)
            .order('order_date', { ascending: false });

          if (completedError) throw completedError;
          completedOrdersData = completedData || [];
        }
      } else {
        // Admin/Customer: get all production orders (exclude pull_ship and child orders)
        let query = supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            description,
            shipping_state,
            total,
            estimated_delivery_date,
            production_progress,
            order_finalized_at,
            updated_at,
            status,
            companies (
              name
            )
          `)
          .eq('status', 'in production')
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null);

        // Apply company filter
        if (isVibeAdmin) {
          if (selectedCompanyId && selectedCompanyId !== 'all') {
            query = query.eq('company_id', selectedCompanyId);
          }
        } else if (activeCompanyId) {
          query = query.eq('company_id', activeCompanyId);
        }

        const { data, error } = await query.order('order_date', { ascending: false });

        if (error) throw error;
        ordersData = data || [];

        // Fetch completed orders for admin/customer
        let completedQuery = supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_name,
            order_date,
            company_id,
            po_number,
            description,
            shipping_state,
            total,
            estimated_delivery_date,
            production_progress,
            order_finalized_at,
            updated_at,
            status,
            companies (
              name
            )
          `)
          .in('status', ['shipped', 'delivered', 'completed'])
          .neq('order_type', 'pull_ship')
          .is('parent_order_id', null);

        // Apply company filter
        if (isVibeAdmin) {
          if (selectedCompanyId && selectedCompanyId !== 'all') {
            completedQuery = completedQuery.eq('company_id', selectedCompanyId);
          }
        } else if (activeCompanyId) {
          completedQuery = completedQuery.eq('company_id', activeCompanyId);
        }

        const { data: completedData, error: completedError } = await completedQuery.order('order_date', { ascending: false });

        if (completedError) throw completedError;
        completedOrdersData = completedData || [];
      }
      
      // Use production_progress from the database directly
      const ordersWithProgress = ordersData.map(order => ({
        ...order,
        production_progress: order.production_progress ?? 0,
      }));

      // Completed/shipped/delivered orders are always 100% complete
      const completedWithProgress = completedOrdersData.map(order => ({
        ...order,
        production_progress: 100,
      }));
      
      setOrders(ordersWithProgress);
      setCompletedOrders(completedWithProgress);
    } catch (error: any) {
      console.error('Error fetching production orders:', error);
      toast({
        title: "Error",
        description: "Failed to load production orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Weighted progress calculation: PO Sent 5% (admin only), Material 15%, Print 50%, QC 15%, Shipped 10%, Delivered 5%
  const STAGE_WEIGHTS: Record<string, number> = {
    'estimate_sent': 5,
    'art_approved': 5,
    'deposit_paid': 5,
    'order_confirmed': 5,
    'po_sent': 5,
    'materials_ordered': 10,
    'pre_press': 15,
    'proof_approved': 10,
    'vendor_deposit': 5,
    'production_complete': 15,
    'in_transit': 15,
    'delivered': 5,
  };

  const calculateProgress = (stages: any[]) => {
    if (stages.length === 0) return 0;
    
    let totalProgress = 0;
    stages.forEach(stage => {
      const weight = STAGE_WEIGHTS[stage.stage_name] || (100 / stages.length);
      if (stage.status === 'completed') {
        totalProgress += weight;
      } else if (stage.status === 'in_progress') {
        totalProgress += weight * 0.5; // In-progress = 50% of stage weight
      }
    });
    
    return Math.round(totalProgress);
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (isVibeAdmin && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredCompletedOrders = completedOrders.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (isVibeAdmin && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const getProgressStatus = (progress: number) => {
    // Use semantic tokens (no raw Tailwind palette colors)
    if (progress >= 100) return { icon: CheckCircle2, color: 'text-success', label: 'Complete' };
    if (progress > 0) return { icon: Clock, color: 'text-info', label: 'In Progress' };
    return { icon: Circle, color: 'text-muted-foreground', label: 'Pending' };
  };

  const handleUpdateDeliveryDate = async (orderId: string, date: Date | undefined) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null 
        })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));
      setCompletedOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, estimated_delivery_date: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));

      toast({
        title: "Updated",
        description: date ? `Delivery date set to ${format(date, 'MMM d, yyyy')}` : "Delivery set to TBD",
      });
    } catch (error: any) {
      console.error('Error updating delivery date:', error);
      toast({
        title: "Error",
        description: "Failed to update delivery date",
        variant: "destructive",
      });
    }
  };

  const handleUpdateCompletionDate = async (orderId: string, date: Date | undefined) => {
    try {
      // Get current user for tracking who made the change
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: Record<string, any> = { 
        order_finalized_at: date ? format(date, 'yyyy-MM-dd') : null,
        order_finalized: date ? true : false,
        order_finalized_by: date ? user?.id : null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, order_finalized_at: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));
      setCompletedOrders(prev => prev.map(o => 
        o.id === orderId 
          ? { ...o, order_finalized_at: date ? format(date, 'yyyy-MM-dd') : null }
          : o
      ));

      toast({
        title: "Updated",
        description: date ? `Completion date set to ${format(date, 'MMM d, yyyy')}` : "Completion date cleared",
      });
    } catch (error: any) {
      console.error('Error updating completion date:', error);
      toast({
        title: "Error",
        description: "Failed to update completion date",
        variant: "destructive",
      });
    }
  };

  const handleGoogleSheetSync = async () => {
    if (!syncSpreadsheetId.trim()) {
      toast({ title: "Error", description: "Please enter a Spreadsheet ID", variant: "destructive" });
      return;
    }
    const companyId = selectedCompanyId !== 'all' ? selectedCompanyId : activeCompanyId;
    if (!companyId) {
      toast({ title: "Error", description: "Please select a company first", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheet', {
        body: { spreadsheetId: syncSpreadsheetId.trim(), sheetName: syncSheetName.trim() || undefined, companyId },
      });
      if (error) throw error;
      toast({
        title: "Sync Complete",
        description: `Synced ${data.synced} orders, ${data.skipped} skipped`,
      });
      setSyncDialogOpen(false);
      fetchProductionOrders();
    } catch (error: any) {
      console.error('Sync error:', error);
      toast({ title: "Sync Failed", description: error.message || "Failed to sync from Google Sheet", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const OrderCard = ({ order }: { order: ProductionOrder }) => {
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [completionPickerOpen, setCompletionPickerOpen] = useState(false);
    const progress = order.production_progress || 0;
    const status = getProgressStatus(progress);
    const StatusIcon = status.icon;
    const isCompleted = ['shipped', 'delivered', 'completed'].includes(order.status);

    const formatDeliveryDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      const date = parseDateAsLocal(dateStr);
      if (!date) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Compare dates only
      const diffTime = date.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (diffDays < 0) return { text: formatted, status: 'overdue' as const, date };
      if (diffDays <= 7) return { text: formatted, status: 'soon' as const, date };
      return { text: formatted, status: 'normal' as const, date };
    };

    const formatCompletionDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      const date = parseDateAsLocal(dateStr);
      if (!date) return null;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const deliveryInfo = formatDeliveryDate(order.estimated_delivery_date);
    // Use order_finalized_at if available, fallback to updated_at for completed orders
    const completionDate = order.order_finalized_at 
      ? formatCompletionDate(order.order_finalized_at) 
      : (isCompleted ? formatCompletionDate(order.updated_at) : null);
    const deliveryText = deliveryInfo?.text ?? 'TBD';
    const completionText = completionDate ?? '—';
    const dateBadgeVariant = isCompleted ? 'success' : 'outline';
    const isSelected = selectedOrderIds.has(order.id);

    return (
      <div
        className={cn(
          "group border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer relative",
          progress >= 100 ? "border-success/30 bg-success/5" :
          progress > 0 ? "border-info/30 bg-info/5" :
          "border-border bg-card",
          isSelected && "ring-2 ring-primary border-primary/50"
        )}
        onClick={() => navigate(`/production/${order.id}${selectedCompanyId && selectedCompanyId !== 'all' ? `?company=${selectedCompanyId}` : ''}`)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isVibeAdmin && (
                <div onClick={(e) => toggleOrderSelection(order.id, e)} className="flex-shrink-0">
                  <Checkbox
                    checked={isSelected}
                    className="mt-0.5"
                  />
                </div>
              )}
              <span className="font-mono font-bold text-lg text-foreground">{order.order_number}</span>
              {isVibeAdmin && (
                <span className="text-xs text-muted-foreground">({order.companies?.name || '-'})</span>
              )}
            </div>
            
            {/* Description - Prominent */}
            {order.description && (
              <p className="text-sm text-foreground leading-snug line-clamp-2">{order.description}</p>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <ProductionStatusIndicator progress={progress} size="md" />
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {/* Date Badges Row - Side by Side */}
        <div
          className="mt-3 grid grid-cols-2 gap-2"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Delivery Badge - Editable for Vibe Admins */}
          {isVibeAdmin && !isCompleted ? (
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    badgeVariants({ variant: dateBadgeVariant as any }),
                    "w-full text-xs px-2.5 py-1 flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-80",
                    !isCompleted && "bg-background"
                  )}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span className="font-medium">Delivery:</span>
                  <span className="truncate">{deliveryText}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseDateAsLocal(order.estimated_delivery_date)}
                  onSelect={(date) => {
                    handleUpdateDeliveryDate(order.id, date);
                    setDatePickerOpen(false);
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    disabled={!order.estimated_delivery_date}
                    onClick={() => {
                      handleUpdateDeliveryDate(order.id, undefined);
                      setDatePickerOpen(false);
                    }}
                  >
                    Set as TBD
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Badge
              variant={dateBadgeVariant as any}
              className={cn(
                "text-xs px-2.5 py-1 flex items-center justify-center gap-1.5 w-full",
                !isCompleted && "bg-background"
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span className="font-medium">Delivery:</span>
              <span className="truncate">{deliveryText}</span>
            </Badge>
          )}

          {/* Completion Badge - Editable for Vibe Admins */}
          {isVibeAdmin ? (
            <Popover open={completionPickerOpen} onOpenChange={setCompletionPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    badgeVariants({ variant: (isCompleted ? 'success' : 'outline') as any }),
                    "w-full text-xs px-2.5 py-1 flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-80",
                    !isCompleted && "bg-background"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="font-medium">Completion:</span>
                  <span className="truncate">{completionText}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseDateAsLocal(order.order_finalized_at)}
                  onSelect={(date) => {
                    handleUpdateCompletionDate(order.id, date);
                    setCompletionPickerOpen(false);
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    disabled={!order.order_finalized_at}
                    onClick={() => {
                      handleUpdateCompletionDate(order.id, undefined);
                      setCompletionPickerOpen(false);
                    }}
                  >
                    Clear Date
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Badge
              variant={(isCompleted ? 'success' : 'outline') as any}
              className={cn(
                "text-xs px-2.5 py-1 flex items-center justify-center gap-1.5 w-full",
                !isCompleted && "bg-background"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-medium">Completion:</span>
              <span className="truncate">{completionText}</span>
            </Badge>
          )}
        </div>
        <div className="mt-3">
          <ProductionProgressBar progress={progress} size="sm" />
        </div>
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>${order.total?.toFixed(2)}</span>
          <span>{new Date(order.order_date).toLocaleDateString()}</span>
        </div>
      </div>
    );
  };

  const OrderTable = ({ orderList, title, emptyMessage }: { orderList: ProductionOrder[], title: string, emptyMessage: string }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" />
          {title}
          <Badge variant="secondary" className="ml-2">{orderList.length}</Badge>
        </h2>
      </div>
      
      {orderList.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <Circle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderList.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {isVendor ? "My Production Orders" : "Production Tracking"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isVendor 
              ? "View and update your assigned production stages" 
              : "Monitor orders in production and track stage progress"}
          </p>
        </div>
        {isVibeAdmin && (
          <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Google Sheet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sync from Google Sheets</DialogTitle>
                <DialogDescription>
                  Enter the Spreadsheet ID from the URL and optionally a sheet tab name.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Spreadsheet ID</Label>
                  <Input
                    placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    value={syncSpreadsheetId}
                    onChange={(e) => setSyncSpreadsheetId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in the Google Sheets URL between /d/ and /edit
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Sheet Tab Name (optional)</Label>
                  <Input
                    placeholder="e.g. Sheet1"
                    value={syncSheetName}
                    onChange={(e) => setSyncSheetName(e.target.value)}
                  />
                </div>
                {selectedCompanyId === 'all' && !activeCompanyId && (
                  <p className="text-sm text-destructive">Please select a company before syncing.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleGoogleSheetSync} disabled={syncing}>
                  {syncing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {isVibeAdmin && (
          <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-8">
        {/* In Production Orders */}
        <OrderTable 
          orderList={filteredOrders} 
          title="Orders in Production" 
          emptyMessage="No orders in production"
        />

        {/* Completed Orders - Always show section */}
        <OrderTable 
          orderList={filteredCompletedOrders} 
          title="Completed Orders" 
          emptyMessage="No completed orders yet — orders auto-complete when all invoices are paid"
        />
      </div>

      {/* Bulk Action Bar */}
      {isVibeAdmin && selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground rounded-xl shadow-lg px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">
            {selectedOrderIds.size} order{selectedOrderIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setBulkLegDialogOpen(true)}
          >
            <Truck className="h-4 w-4 mr-1.5" />
            Add Shipping Leg
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Bulk Add Shipment Leg Dialog */}
      <AddShipmentLegDialog
        open={bulkLegDialogOpen}
        onOpenChange={setBulkLegDialogOpen}
        onSubmit={handleBulkAddShipmentLeg}
        nextLegNumber={0}
      />
    </div>
  );
}
