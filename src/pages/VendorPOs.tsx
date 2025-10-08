import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Eye, FileText, Trash2 } from "lucide-react";

const VendorPOs = () => {
  const navigate = useNavigate();
  const [pos, setPOs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poToDelete, setPOToDelete] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchVendorPOs();
  }, []);

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
    }
  };

  const fetchVendorPOs = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('vendor_pos')
      .select('*, vendors(name), orders(order_number)')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setPOs(data);
    }
    setLoading(false);
  };

  const handleDeleteClick = (po: any) => {
    setPOToDelete(po);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!poToDelete) return;

    try {
      // First delete all vendor PO items
      const { error: itemsError } = await supabase
        .from('vendor_po_items')
        .delete()
        .eq('vendor_po_id', poToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the vendor PO
      const { error: poError } = await supabase
        .from('vendor_pos')
        .delete()
        .eq('id', poToDelete.id);

      if (poError) throw poError;

      toast({
        title: "PO Deleted",
        description: "Vendor purchase order has been deleted"
      });

      // Refresh the list
      fetchVendorPOs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor PO",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setPOToDelete(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'submitted': return 'default';
      case 'confirmed': return 'default';
      case 'in_production': return 'default';
      case 'received': return 'default';
      case 'cancelled': return 'destructive';
      default: return 'secondary';
    }
  };

  const filteredPOs = pos.filter(po => 
    po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (po.vendors?.name && po.vendors.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage purchase orders to vendors</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search POs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Customer Order</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">Loading POs...</TableCell>
                </TableRow>
              ) : filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    <div className="py-8">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No vendor POs found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.vendors?.name || 'Unassigned'}</TableCell>
                    <TableCell>
                      {po.orders?.order_number || '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(po.order_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {po.expected_delivery_date 
                        ? new Date(po.expected_delivery_date).toLocaleDateString()
                        : '-'
                      }
                    </TableCell>
                    <TableCell>${po.total?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(po.status)}>
                        {po.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigate(`/vendor-pos/${po.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteClick(po)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor PO</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete vendor PO {poToDelete?.po_number}? This will also delete all associated items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VendorPOs;