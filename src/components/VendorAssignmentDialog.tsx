import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface VendorAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderItems: any[];
  onSuccess: () => void;
}

export const VendorAssignmentDialog = ({ 
  open, 
  onOpenChange, 
  orderId, 
  orderItems,
  onSuccess 
}: VendorAssignmentDialogProps) => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVendorsAndPreferences();
    }
  }, [open, orderItems]);

  const fetchVendorsAndPreferences = async () => {
    setLoading(true);
    
    // Fetch all vendors
    const { data: vendorsData } = await (supabase as any)
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (vendorsData) {
      setVendors(vendorsData);
      
      // Fetch preferred vendors for each product
      const productIds = orderItems.map(item => item.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: preferredData } = await (supabase as any)
          .from('vendor_products')
          .select('product_id, vendor_id')
          .in('product_id', productIds)
          .eq('is_preferred', true);
        
        // Pre-populate with preferred vendors
        const prefMap: Record<string, string> = {};
        orderItems.forEach(item => {
          const pref = preferredData?.find((p: any) => p.product_id === item.product_id);
          if (pref) {
            prefMap[item.id] = pref.vendor_id;
          }
        });
        setAssignments(prefMap);
      }
    }
    
    setLoading(false);
  };

  const handleCreatePOs = async () => {
    setCreating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("User company not found");

      // Group items by vendor
      const vendorGroups: Record<string, any[]> = {};
      orderItems.forEach(item => {
        const vendorId = assignments[item.id];
        if (vendorId) {
          if (!vendorGroups[vendorId]) {
            vendorGroups[vendorId] = [];
          }
          vendorGroups[vendorId].push(item);
        }
      });

      // Create a PO for each vendor
      for (const [vendorId, items] of Object.entries(vendorGroups)) {
        // Generate PO number
        const poNumber = `VPO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Calculate totals
        const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
        
        // Create vendor PO
        const { data: po, error: poError } = await (supabase as any)
          .from('vendor_pos')
          .insert({
            company_id: userRole.company_id,
            vendor_id: vendorId,
            customer_order_id: orderId,
            po_number: poNumber,
            status: 'draft',
            subtotal: subtotal,
            total: subtotal,
            created_by: user.id
          })
          .select()
          .single();

        if (poError) throw poError;

        // Fetch vendor product costs for accurate costing
        const productIds = items.map(i => i.product_id).filter(Boolean);
        const { data: vendorProducts } = await (supabase as any)
          .from('vendor_products')
          .select('product_id, vendor_cost')
          .eq('vendor_id', vendorId)
          .in('product_id', productIds);

        // Create PO items
        const poItems = items.map(item => {
          const vendorProduct = vendorProducts?.find((vp: any) => vp.product_id === item.product_id);
          const unitCost = vendorProduct?.vendor_cost || item.unit_price || 0;
          
          return {
            vendor_po_id: po.id,
            product_id: item.product_id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unit_cost: unitCost,
            total: unitCost * item.quantity
          };
        });

        const { error: itemsError } = await (supabase as any)
          .from('vendor_po_items')
          .insert(poItems);

        if (itemsError) throw itemsError;
      }

      toast({
        title: "Success",
        description: `Created ${Object.keys(vendorGroups).length} vendor PO(s)`
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating vendor POs:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create vendor POs",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Vendors to Products</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Assign a vendor for each product. Multiple vendors will create separate POs.
            </p>
            
            {orderItems.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {item.sku} • Qty: {item.quantity}
                  </p>
                </div>
                <div className="w-64">
                  <Select
                    value={assignments[item.id]}
                    onValueChange={(value) => setAssignments({...assignments, [item.id]: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreatePOs}
                disabled={creating || Object.keys(assignments).length === 0}
              >
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Vendor PO(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};