import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Download, 
  Eye, 
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Package,
  Edit,
  Trash2,
  Link2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/exportUtils";

const Invoices = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin) {
      fetchCompanies();
    }
    fetchInvoices();
  }, [isVibeAdmin]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
  };

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(order_number, customer_name, po_number),
        companies(name)
      `)
      .order('created_at', { ascending: false });
    
    if (data) {
      setInvoices(data);
    }
    setLoading(false);
  };

  const getInvoiceTypeColor = (type: string) => {
    switch (type) {
      case 'deposit': return 'bg-orange-500 text-white';
      case 'partial': return 'bg-blue-500 text-white';
      case 'final': return 'bg-green-500 text-white';
      case 'full': return 'bg-purple-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': return 'text-success';
      case 'open': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': return CheckCircle;
      case 'open': return Clock;
      default: return Clock;
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.orders?.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.orders?.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || invoice.status.toLowerCase() === statusFilter;
    const matchesCompany = companyFilter === "all" || invoice.company_id === companyFilter;
    return matchesSearch && matchesStatus && matchesCompany;
  });

  // Group invoices by parent-child relationships
  const groupedInvoices = filteredInvoices.reduce((acc, invoice) => {
    if (!invoice.parent_invoice_id) {
      // This is a parent invoice or standalone invoice
      acc.push({
        parent: invoice,
        children: filteredInvoices.filter(inv => inv.parent_invoice_id === invoice.id)
      });
    }
    return acc;
  }, [] as Array<{ parent: any; children: any[] }>);

  // Flatten for display purposes (parent then children)
  const displayInvoices = groupedInvoices.flatMap(group => [
    { invoice: group.parent, isParent: group.children.length > 0, isChild: false },
    ...group.children.map(child => ({ invoice: child, isParent: false, isChild: true }))
  ]);

  const totalAmount = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const paidAmount = filteredInvoices.filter(inv => inv.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const openAmount = filteredInvoices.filter(inv => inv.status === 'open').reduce((sum, invoice) => sum + Number(invoice.total), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Invoices & Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage invoices, track payments, and monitor due dates</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredInvoices, 'invoices')}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Amount</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Invoices</p>
          <p className="text-2xl font-semibold mt-1 text-primary">{formatCurrency(openAmount)}</p>
        </div>
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid Amount</p>
          <p className="text-2xl font-semibold mt-1 text-success">{formatCurrency(paidAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice Type Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          className="h-8"
        >
          All Invoices
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const fullInvoices = invoices.filter(inv => !inv.invoice_type || inv.invoice_type === 'full');
            if (fullInvoices.length === 0) {
              toast({ title: "No Full Invoices", description: "No full invoices found" });
            }
          }}
        >
          <Badge className="bg-purple-500 text-white mr-2">Full</Badge>
          {invoices.filter(inv => !inv.invoice_type || inv.invoice_type === 'full').length}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const partialInvoices = invoices.filter(inv => inv.invoice_type === 'partial');
            if (partialInvoices.length === 0) {
              toast({ title: "No Partial Invoices", description: "No partial invoices found" });
            }
          }}
        >
          <Badge className="bg-blue-500 text-white mr-2">Partial</Badge>
          {invoices.filter(inv => inv.invoice_type === 'partial').length}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const finalInvoices = invoices.filter(inv => inv.invoice_type === 'final');
            if (finalInvoices.length === 0) {
              toast({ title: "No Final Invoices", description: "No final invoices found" });
            }
          }}
        >
          <Badge className="bg-green-500 text-white mr-2">Final</Badge>
          {invoices.filter(inv => inv.invoice_type === 'final').length}
        </Button>
      </div>

      {/* Invoices Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Invoice ID</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Shipment</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-1">Amount</div>
            <div className="col-span-1">PO Number</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No invoices found matching your criteria.
            </div>
          ) : (
            displayInvoices.map(({ invoice, isParent, isChild }) => {
              const StatusIcon = getStatusIcon(invoice.status);
              const daysUntilDue = invoice.due_date ? getDaysUntilDue(invoice.due_date) : null;
              
              return (
                <div 
                  key={invoice.id} 
                  className={`grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors ${
                    isChild ? 'bg-muted/30 border-l-4 border-l-blue-500/50' : ''
                  } ${isParent ? 'border-b-2 border-b-blue-500/20' : ''}`}
                >
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      {isChild && (
                        <div className="flex items-center text-muted-foreground mr-1">
                          <div className="w-4 h-px bg-border mr-1"></div>
                          <Package className="h-3 w-3" />
                        </div>
                      )}
                      <div className={`font-medium font-mono text-sm ${isChild ? 'ml-2' : ''}`}>{invoice.invoice_number}</div>
                      {invoice.quickbooks_payment_link && (
                        <Badge 
                          variant="outline" 
                          className="bg-green-500/10 text-green-700 border-green-500/20 text-xs px-1.5 py-0"
                          title="Payment link available"
                        >
                          <Link2 className="h-3 w-3" />
                        </Badge>
                      )}
                      {invoice.parent_invoice_id && (
                        <Badge 
                          variant="outline" 
                          className="bg-blue-500/10 text-blue-700 border-blue-500/20 text-xs px-1.5 py-0"
                          title="Linked to deposit invoice"
                        >
                          Linked
                        </Badge>
                      )}
                    </div>
                    {invoice.orders?.order_number && (
                      <div className="text-xs text-muted-foreground">
                        Order: {invoice.orders.order_number}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <div className="font-medium text-sm">{invoice.companies?.name || 'N/A'}</div>
                    {invoice.orders?.customer_name && (
                      <div className="text-xs text-muted-foreground">
                        {invoice.orders.customer_name}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Badge variant="secondary" className="text-xs">
                      #{invoice.shipment_number || 1}
                    </Badge>
                  </div>
                  <div className="col-span-1">
                    <Badge className={getInvoiceTypeColor(invoice.invoice_type || 'full')}>
                      {(invoice.invoice_type || 'full').charAt(0).toUpperCase() + (invoice.invoice_type || 'full').slice(1)}
                    </Badge>
                  </div>
                  <div className="col-span-1 font-semibold text-sm">{formatCurrency(Number(invoice.total))}</div>
                  <div className="col-span-1 text-sm">{invoice.orders?.po_number || 'N/A'}</div>
                  <div className="col-span-2 text-sm">
                    {invoice.due_date ? (
                      <div className={
                        invoice.status === 'overdue' ? 'text-danger' : 
                        daysUntilDue && daysUntilDue <= 7 ? 'text-warning' : 'text-foreground'
                      }>
                        {new Date(invoice.due_date).toLocaleDateString()}
                        {invoice.status !== 'paid' && daysUntilDue !== null && (
                          <div className="text-xs text-muted-foreground">
                            {daysUntilDue > 0 ? `${daysUntilDue}d remaining` : `${Math.abs(daysUntilDue)}d overdue`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </div>
                  <div className={`col-span-1 text-sm font-medium ${getStatusColor(invoice.status)}`}>
                    <div className="flex items-center gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {invoice.status.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                  <div className="col-span-1 flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0" 
                      title="View Invoice"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/invoices/${invoice.id}`);
                      }}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    {isVibeAdmin && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0" 
                          title="Edit Order"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders/${invoice.order_id}`);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" 
                          title="Delete Invoice"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this invoice? Quantities will be restored.')) {
                              try {
                                // Restore quantities and inventory before deleting
                                // Only for shipment invoices, not deposit invoices
                                if (invoice.invoice_type !== 'deposit') {
                                  const { data: allocations } = await supabase
                                    .from('inventory_allocations')
                                    .select('*')
                                    .eq('invoice_id', invoice.id);

                                  if (allocations && allocations.length > 0) {
                                    for (const allocation of allocations) {
                                      // Restore inventory (only if this allocation has an inventory_id)
                                      if (allocation.inventory_id) {
                                        const { data: currentInv } = await supabase
                                          .from('inventory')
                                          .select('available')
                                          .eq('id', allocation.inventory_id)
                                          .single();

                                        if (currentInv) {
                                          await supabase
                                            .from('inventory')
                                            .update({
                                              available: currentInv.available + allocation.quantity_allocated
                                            })
                                            .eq('id', allocation.inventory_id);
                                        }
                                      }

                                      // Always restore order item shipped_quantity
                                      const { data: currentItem } = await supabase
                                        .from('order_items')
                                        .select('shipped_quantity')
                                        .eq('id', allocation.order_item_id)
                                        .single();

                                      if (currentItem) {
                                        await supabase
                                          .from('order_items')
                                          .update({
                                            shipped_quantity: Math.max(0, (currentItem.shipped_quantity || 0) - allocation.quantity_allocated)
                                          })
                                          .eq('id', allocation.order_item_id);
                                      }

                                      // Delete allocation
                                      await supabase
                                        .from('inventory_allocations')
                                        .delete()
                                        .eq('id', allocation.id);
                                    }
                                  }
                                }

                                // Delete invoice
                                const { error } = await supabase
                                  .from('invoices')
                                  .delete()
                                  .eq('id', invoice.id);
                                
                                if (error) {
                                  console.error('Delete error:', error);
                                  toast({
                                    title: "Error",
                                    description: "Failed to delete invoice: " + error.message,
                                    variant: "destructive"
                                  });
                                } else {
                                  toast({
                                    title: "Success",
                                    description: "Invoice deleted and quantities restored"
                                  });
                                  fetchInvoices();
                                }
                              } catch (err: any) {
                                console.error('Delete exception:', err);
                                toast({
                                  title: "Error",
                                  description: "An error occurred while deleting the invoice",
                                  variant: "destructive"
                                });
                              }
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0" 
                      title="Download Invoice"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Invoices;