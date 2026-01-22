import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Eye, FileText, Trash2, Receipt, CreditCard } from "lucide-react";
import { CreateExpensePODialog } from "@/components/CreateExpensePODialog";
import { VendorBillsSummary } from "@/components/VendorBillsSummary";
import { VendorBillsAgingBuckets } from "@/components/VendorBillsAgingBuckets";
import { VendorPaymentsLedger } from "@/components/VendorPaymentsLedger";
import { VendorBalanceBreakdown } from "@/components/VendorBalanceBreakdown";

const VendorPOs = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pos, setPOs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const vendorFilter = searchParams.get("vendor") || "all";
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poToDelete, setPOToDelete] = useState<any>(null);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  const setVendorFilter = (value: string) => {
    if (value === "all") {
      searchParams.delete("vendor");
    } else {
      searchParams.set("vendor", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

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
      setIsVibeAdmin(role === 'vibe_admin');
    }
  };

  const fetchVendorPOs = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('vendor_pos')
      .select('*, vendors(name), orders(order_number, description), customer_company:companies!vendor_pos_customer_company_id_fkey(name)')
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
      const { error: itemsError } = await supabase
        .from('vendor_po_items')
        .delete()
        .eq('vendor_po_id', poToDelete.id);

      if (itemsError) throw itemsError;

      const { error: poError } = await supabase
        .from('vendor_pos')
        .delete()
        .eq('id', poToDelete.id);

      if (poError) throw poError;

      toast({
        title: "PO Deleted",
        description: "Vendor purchase order has been deleted"
      });

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
      case 'unpaid': return 'destructive';
      case 'partial': return 'default';
      case 'paid': return 'default';
      case 'draft': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'unpaid': return 'Unpaid';
      case 'partial': return 'Partial Paid';
      case 'paid': return 'Paid';
      default: return status.replace('_', ' ');
    }
  };

  // Calculate summary amounts
  const summaryAmounts = useMemo(() => {
    const nonDraftPOs = pos.filter(po => po.status !== 'draft');
    
    const unpaidPOs = nonDraftPOs.filter(po => po.status === 'unpaid' || (!po.total_paid || po.total_paid === 0));
    const partialPOs = nonDraftPOs.filter(po => po.status === 'partial');
    const paidPOs = nonDraftPOs.filter(po => po.status === 'paid');

    const unpaidAmount = unpaidPOs.reduce((sum, po) => {
      const total = po.final_total ?? po.total ?? 0;
      return sum + total;
    }, 0);

    const partialAmount = partialPOs.reduce((sum, po) => {
      const total = po.final_total ?? po.total ?? 0;
      const paid = po.total_paid || 0;
      return sum + (total - paid);
    }, 0);

    const paidAmount = paidPOs.reduce((sum, po) => {
      return sum + (po.total_paid || 0);
    }, 0);

    const totalOutstanding = unpaidAmount + partialAmount;

    return { totalOutstanding, unpaidAmount, partialAmount, paidAmount };
  }, [pos]);

  // Calculate aging buckets
  const agingBuckets = useMemo(() => {
    const today = new Date();
    const nonDraftPOs = pos.filter(po => po.status !== 'draft' && po.status !== 'paid');

    const buckets = [
      { label: 'Current (0-30 days)', amount: 0, count: 0, color: 'hsl(var(--success))' },
      { label: '31-60 days', amount: 0, count: 0, color: 'hsl(var(--warning))' },
      { label: '61-90 days', amount: 0, count: 0, color: 'hsl(217, 91%, 60%)' },
      { label: '90+ days', amount: 0, count: 0, color: 'hsl(var(--destructive))' },
    ];

    nonDraftPOs.forEach(po => {
      const orderDate = new Date(po.order_date);
      const daysDiff = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      const remaining = (po.final_total ?? po.total ?? 0) - (po.total_paid || 0);

      if (daysDiff <= 30) {
        buckets[0].amount += remaining;
        buckets[0].count++;
      } else if (daysDiff <= 60) {
        buckets[1].amount += remaining;
        buckets[1].count++;
      } else if (daysDiff <= 90) {
        buckets[2].amount += remaining;
        buckets[2].count++;
      } else {
        buckets[3].amount += remaining;
        buckets[3].count++;
      }
    });

  return buckets;
  }, [pos]);

  // Calculate vendor balances for breakdown
  const vendorBalances = useMemo(() => {
    const vendorMap = new Map<string, { id: string; name: string; totalOwed: number; totalPaid: number; poCount: number }>();
    
    pos.filter(po => po.status !== 'draft' && po.vendors?.id).forEach(po => {
      const vendorId = po.vendors.id;
      const vendorName = po.vendors.name || 'Unknown';
      const total = po.final_total ?? po.total ?? 0;
      const paid = po.total_paid || 0;
      
      if (!vendorMap.has(vendorId)) {
        vendorMap.set(vendorId, { id: vendorId, name: vendorName, totalOwed: 0, totalPaid: 0, poCount: 0 });
      }
      
      const vendor = vendorMap.get(vendorId)!;
      vendor.totalOwed += total;
      vendor.totalPaid += paid;
      vendor.poCount++;
    });
    
    return Array.from(vendorMap.values()).map(v => ({
      ...v,
      balance: v.totalOwed - v.totalPaid
    }));
  }, [pos]);

  const filteredPOs = pos.filter(po => {
    const matchesSearch = po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (po.vendors?.name && po.vendors.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (po.description && po.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = typeFilter === "all" || 
      (typeFilter === "expense" && po.po_type === "expense") ||
      (typeFilter === "production" && (po.po_type === "production" || !po.po_type));

    // Payment status filter
    let matchesPaymentStatus = true;
    if (paymentStatusFilter !== "all") {
      if (paymentStatusFilter === "unpaid") {
        matchesPaymentStatus = po.status === 'unpaid' || (!po.total_paid || po.total_paid === 0);
      } else {
        matchesPaymentStatus = po.status === paymentStatusFilter;
      }
    }

    // Vendor filter
    const matchesVendor = vendorFilter === "all" || po.vendors?.id === vendorFilter;
    
    return matchesSearch && matchesType && matchesPaymentStatus && matchesVendor;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Bills</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage accounts payable to vendors</p>
        </div>
        {isVibeAdmin && (
          <Button onClick={() => setShowExpenseDialog(true)}>
            <Receipt className="h-4 w-4 mr-2" />
            Create Expense PO
          </Button>
        )}
      </div>

      {/* Summary Tiles */}
      <VendorBillsSummary
        totalOutstanding={summaryAmounts.totalOutstanding}
        unpaidAmount={summaryAmounts.unpaidAmount}
        partialAmount={summaryAmounts.partialAmount}
        paidAmount={summaryAmounts.paidAmount}
        onFilterChange={setPaymentStatusFilter}
        activeFilter={paymentStatusFilter}
      />

      {/* Tabs for Bills and Payments */}
      <Tabs defaultValue="bills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bills" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bills
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Sidebar: Aging + Vendor Breakdown */}
            <div className="lg:col-span-1 space-y-4">
              <VendorBillsAgingBuckets 
                buckets={agingBuckets} 
                totalOutstanding={summaryAmounts.totalOutstanding} 
              />
              <VendorBalanceBreakdown
                vendors={vendorBalances}
                selectedVendorId={vendorFilter}
                onVendorSelect={setVendorFilter}
              />
            </div>

            {/* Bills Table */}
            <div className="lg:col-span-4">
              <Card className="shadow-sm">
                <div className="p-4 border-b">
                  <div className="flex gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search POs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Customer/Order</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center">Loading bills...</TableCell>
                        </TableRow>
                      ) : filteredPOs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center">
                            <div className="py-8">
                              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                              <p className="text-muted-foreground">No vendor bills found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPOs.map((po) => {
                          const total = po.final_total ?? po.total ?? 0;
                          const paid = po.total_paid || 0;
                          const balance = total - paid;

                          return (
                            <TableRow
                              key={po.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => {
                                toast({ title: "Opening PO...", description: po.po_number });
                                navigate(`/vendor-pos/${po.id}`);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  navigate(`/vendor-pos/${po.id}`);
                                }
                              }}
                            >
                              <TableCell className="font-medium">{po.po_number}</TableCell>
                              <TableCell>{po.vendors?.name || 'Unassigned'}</TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>{po.po_type === 'expense' 
                                    ? (po.customer_company?.name || '-')
                                    : (po.orders?.order_number || '-')
                                  }</div>
                                  {po.orders?.description && (
                                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                                      {po.orders.description}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {new Date(po.order_date).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{formatCurrency(total)}</TableCell>
                              <TableCell className="text-success">
                                {paid > 0 ? formatCurrency(paid) : '-'}
                              </TableCell>
                              <TableCell className={balance > 0 ? 'text-destructive font-medium' : ''}>
                                {balance > 0 ? formatCurrency(balance) : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={getStatusColor(po.status)}>
                                  {getStatusLabel(po.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/vendor-pos/${po.id}`);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {isVibeAdmin && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(po);
                                      }}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <VendorPaymentsLedger />
        </TabsContent>
      </Tabs>

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

      {/* Create Expense PO Dialog */}
      <CreateExpensePODialog 
        open={showExpenseDialog} 
        onOpenChange={setShowExpenseDialog}
        onCreated={fetchVendorPOs}
      />
    </div>
  );
};

export default VendorPOs;
