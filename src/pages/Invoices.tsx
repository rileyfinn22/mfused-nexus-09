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
  Link2,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/exportUtils";
import { generateInvoicePDF } from "@/lib/invoicePdfUtils";
import { EditableDescription } from "@/components/EditableDescription";

const Invoices = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

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
        orders(order_number, customer_name, po_number, description),
        companies(name)
      `)
      .is('deleted_at', null) // Only show non-deleted invoices
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
    if (status === 'PAID') return 'text-green-600 dark:text-green-400';
    if (status === 'DUE') return 'text-red-600 dark:text-red-400';
    if (status === 'BILLED') return 'text-blue-600 dark:text-blue-400';
    if (status === 'OPEN') return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  };

  const getStatusIcon = (invoice: any) => {
    const status = getStatusDisplay(invoice);
    if (status === 'PAID') return CheckCircle;
    if (status === 'DUE') return AlertTriangle;
    if (status === 'BILLED') return FileText;
    return Clock;
  };

  const getStatusDisplay = (invoice: any) => {
    if (invoice.status === 'paid') return 'PAID';
    if (invoice.status === 'due') return 'DUE';
    if (invoice.status === 'billed') return 'BILLED';
    return 'OPEN';
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const toggleExpanded = (invoiceId: string) => {
    setExpandedInvoices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  };

  const hasOverdueChildren = (parentId: string) => {
    const children = invoices.filter(inv => inv.parent_invoice_id === parentId);
    return children.some(child => {
      if (child.status === 'open' || child.status === 'pending') {
        if (child.due_date) {
          const daysUntilDue = getDaysUntilDue(child.due_date);
          return daysUntilDue < 0;
        }
      }
      return false;
    });
  };

  // Get the highest priority status from child invoices
  // Priority: due > billed > open
  const getChildrenPriorityStatus = (parentId: string): 'due' | 'billed' | 'open' | null => {
    const children = invoices.filter(inv => inv.parent_invoice_id === parentId);
    if (children.length === 0) return null;
    
    const hasDue = children.some(child => child.status === 'due');
    if (hasDue) return 'due';
    
    const hasBilled = children.some(child => child.status === 'billed');
    if (hasBilled) return 'billed';
    
    const hasOpen = children.some(child => child.status === 'open');
    if (hasOpen) return 'open';
    
    return null;
  };

  const hasDueChildren = (parentId: string) => {
    const children = invoices.filter(inv => inv.parent_invoice_id === parentId);
    return children.some(child => 
      child.status === 'open' && child.quickbooks_sync_status === 'synced'
    );
  };

  const handleInvoiceDescriptionChange = async (invoiceId: string, description: string) => {
    const { error } = await supabase
      .from("invoices")
      .update({ description: description || null })
      .eq("id", invoiceId);

    if (error) {
      console.error("Error updating invoice description:", error);
      return;
    }

    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, description: description || null } : inv))
    );
  };

  const handleOrderDescriptionChange = async (orderId: string, description: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ description: description || null })
      .eq("id", orderId);

    if (error) {
      console.error("Error updating order description:", error);
      return;
    }

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.order_id === orderId
          ? { ...inv, orders: { ...(inv.orders || {}), description: description || null } }
          : inv
      )
    );
  };

  // Using centralized formatCurrency from @/lib/utils
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
    
    // Status filter logic - now uses the actual status field
    let matchesStatus = true;
    if (statusFilter === "paid") {
      matchesStatus = invoice.status === 'paid';
    } else if (statusFilter === "due") {
      matchesStatus = invoice.status === 'due';
    } else if (statusFilter === "billed") {
      matchesStatus = invoice.status === 'billed';
    } else if (statusFilter === "open") {
      matchesStatus = invoice.status === 'open';
    }
    
    const matchesCompany = companyFilter === "all" || invoice.company_id === companyFilter;
    return matchesSearch && matchesStatus && matchesCompany;
  });

  // Group related invoices (blanket + partials)
  const invoiceGroups = filteredInvoices
    .filter(inv => !inv.parent_invoice_id) // Only parent invoices
    .map(parent => ({
      parent,
      children: filteredInvoices
        .filter(inv => inv.parent_invoice_id === parent.id)
        .sort((a, b) => (a.shipment_number || 0) - (b.shipment_number || 0)) // Sort children by shipment number
    }));

  // Create display list based on expansion state
  const displayInvoices = invoiceGroups.flatMap(group => {
    const items = [{ invoice: group.parent, isParent: true, isChild: false, hasChildren: group.children.length > 0 }];
    
    // Only show children if parent is expanded
    if (expandedInvoices.has(group.parent.id)) {
      items.push(...group.children.map(child => ({ invoice: child, isParent: false, isChild: true, hasChildren: false })));
    }
    
    return items;
  });

  // Calculate OPEN amount - total of blanket orders minus all payments (including child invoices)
  const openAmount = filteredInvoices
    .filter(inv => {
      const isBlanket = inv.invoice_type === 'full' || !inv.invoice_type;
      const isNotPaid = inv.status !== 'paid';
      return isBlanket && isNotPaid;
    })
    .reduce((sum, invoice) => {
      // Get all child invoices for this parent
      const childInvoices = invoices.filter(inv => inv.parent_invoice_id === invoice.id);
      // Sum payments on parent and all children
      const parentPaid = Number(invoice.total_paid) || 0;
      const childrenPaid = childInvoices.reduce((childSum, child) => 
        childSum + (Number(child.total_paid) || 0), 0);
      const totalPaid = parentPaid + childrenPaid;
      // Calculate remaining: parent total minus all payments
      const remaining = Number(invoice.total) - totalPaid;
      return sum + remaining;
    }, 0);

  // Calculate BILLED amount - sum of all invoices with status = 'billed' (synced to QB, pending due date)
  const billedAmount = filteredInvoices
    .filter(inv => inv.status === 'billed')
    .reduce((sum, invoice) => {
      const remaining = Number(invoice.total) - (Number(invoice.total_paid) || 0);
      return sum + remaining;
    }, 0);

  // Calculate DUE amount - sum of all invoices with status = 'due'
  const dueAmount = filteredInvoices
    .filter(inv => inv.status === 'due')
    .reduce((sum, invoice) => {
      const remaining = Number(invoice.total) - (Number(invoice.total_paid) || 0);
      return sum + remaining;
    }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Invoices & Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage invoices, track payments, and monitor due dates</p>
        </div>
        <div className="flex gap-2">
          {isVibeAdmin && (
            <Button size="sm" variant="outline" onClick={() => navigate('/invoices/deleted')}>
              <Trash2 className="h-4 w-4 mr-2" />
              Deleted Archive
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredInvoices, 'invoices')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Orders Total</p>
          <p className="text-2xl font-bold mt-2 text-warning">{formatCurrency(openAmount)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Billed Pending Due</p>
          <p className="text-2xl font-bold mt-2 text-info">{formatCurrency(billedAmount)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Amount</p>
          <p className="text-2xl font-bold mt-2 text-danger">{formatCurrency(dueAmount)}</p>
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
            <SelectItem value="billed">Billed</SelectItem>
            <SelectItem value="due">Due</SelectItem>
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
              toast({ title: "No Blanket Invoices", description: "No blanket invoices found" });
            }
          }}
        >
          <Badge className="bg-purple-500 text-white mr-2">Blanket</Badge>
          {invoices.filter(inv => !inv.invoice_type || inv.invoice_type === 'full').length}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const partialInvoices = invoices.filter(inv => inv.invoice_type === 'partial');
            if (partialInvoices.length === 0) {
              toast({ title: "No Shipped Invoices", description: "No shipped invoices found" });
            }
          }}
        >
          <Badge className="bg-blue-500 text-white mr-2">Shipped</Badge>
          {invoices.filter(inv => inv.invoice_type === 'partial').length}
        </Button>
      </div>

      {/* Invoices Table */}
      <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="bg-muted border-b-2 border-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Invoice ID</div>
            <div className="col-span-1">Due Date</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-2">Description</div>
            <div className="col-span-1">Amount</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No invoices found matching your criteria.
            </div>
          ) : (
            displayInvoices.map(({ invoice, isParent, isChild, hasChildren }) => {
              const StatusIcon = getStatusIcon(invoice);
              const daysUntilDue = invoice.due_date ? getDaysUntilDue(invoice.due_date) : null;
              const isExpanded = expandedInvoices.has(invoice.id);
              const showOverdueAlert = isParent && hasChildren && hasOverdueChildren(invoice.id);
              
              // Get priority status from children for parent display
              const childrenPriorityStatus = isParent && hasChildren ? getChildrenPriorityStatus(invoice.id) : null;
              const displayStatus = childrenPriorityStatus 
                ? childrenPriorityStatus.toUpperCase() 
                : getStatusDisplay(invoice);
              
              // Determine dropdown button color based on children priority status
              const getDropdownButtonColors = () => {
                if (childrenPriorityStatus === 'due') {
                  return 'border-red-400/40 bg-red-500/5 hover:bg-red-500/10 text-red-500/80';
                }
                if (childrenPriorityStatus === 'billed') {
                  return 'border-blue-400/40 bg-blue-500/5 hover:bg-blue-500/10 text-blue-500/80';
                }
                return `border-muted-foreground/20 ${isExpanded ? 'bg-muted/50 border-muted-foreground/30' : 'hover:bg-muted/30'}`;
              };
              
              return (
                <div 
                  key={invoice.id} 
                  className={`grid grid-cols-12 gap-4 px-4 py-3 transition-colors cursor-pointer ${
                    isChild ? 'bg-muted/60 border-l-4 border-l-primary/50' : 'hover:bg-muted/50'
                  } ${isChild ? '' : 'even:bg-muted/40'}`}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      {isParent && hasChildren && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={`h-7 px-2 gap-1 ${getDropdownButtonColors()}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(invoice.id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className={`h-4 w-4 ${childrenPriorityStatus === 'due' ? 'text-red-600' : childrenPriorityStatus === 'billed' ? 'text-blue-600' : 'text-primary'}`} />
                          ) : (
                            <ChevronRight className={`h-4 w-4 ${childrenPriorityStatus === 'due' ? 'text-red-600' : childrenPriorityStatus === 'billed' ? 'text-blue-600' : 'text-primary'}`} />
                          )}
                          <span className={`text-xs font-medium ${childrenPriorityStatus === 'due' ? 'text-red-600' : childrenPriorityStatus === 'billed' ? 'text-blue-600' : 'text-primary'}`}>
                            {invoices.filter(inv => inv.parent_invoice_id === invoice.id).length}
                          </span>
                        </Button>
                      )}
                      {isChild && (
                        <div className="flex items-center text-blue-500 mr-1">
                          <div className="w-3 h-px bg-blue-400 mr-1"></div>
                          <Package className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <div className={`font-medium font-mono text-base ${isChild ? 'ml-1' : ''} ${!isParent || !hasChildren ? 'ml-10' : ''}`}>{invoice.invoice_number}</div>
                      {showOverdueAlert && (
                        <Badge 
                          variant="outline" 
                          className="bg-red-500/10 text-red-700 border-red-500/20 text-xs px-1.5 py-0 animate-pulse"
                          title="Contains overdue invoices"
                        >
                          <AlertCircle className="h-3 w-3" />
                        </Badge>
                      )}
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
                  <div className="col-span-1 text-sm text-muted-foreground truncate">
                    {(() => {
                      // For parent invoices, check if any child has a due date and show the soonest
                      if (isParent && hasChildren) {
                        const childInvoices = invoices.filter(inv => inv.parent_invoice_id === invoice.id);
                        const childDueDates = childInvoices
                          .filter(inv => inv.due_date)
                          .map(inv => new Date(inv.due_date))
                          .sort((a, b) => a.getTime() - b.getTime());
                        
                        if (childDueDates.length > 0) {
                          return (
                            <span className="whitespace-nowrap" title={`${childDueDates[0].toLocaleDateString()} (Partial)`}>
                              {childDueDates[0].toLocaleDateString()}
                              <span className="text-[10px] text-muted-foreground/70"> (P)</span>
                            </span>
                          );
                        }
                      }
                      return invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-';
                    })()}
                  </div>
                  <div className="col-span-2">
                    <div className="font-medium text-sm">
                      {invoice.companies?.name || 'N/A'}
                    </div>
                  </div>
                  <div className="col-span-2">
                    {isVibeAdmin ? (
                      <div className="space-y-2">
                        <EditableDescription
                          value={invoice.orders?.description}
                          placeholder="Add description…"
                          onSave={(text) => {
                            if (!invoice.order_id) return;
                            return handleOrderDescriptionChange(invoice.order_id, text);
                          }}
                        />

                        {isChild && (
                          <div className="pl-3 border-l border-border">
                            <EditableDescription
                              value={invoice.description}
                              placeholder="Add invoice description…"
                              className="text-xs"
                              onSave={(text) => handleInvoiceDescriptionChange(invoice.id, text)}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          {invoice.orders?.description || "-"}
                        </div>
                        {isChild && invoice.description && (
                          <div className="pl-3 border-l border-border text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {invoice.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 font-semibold text-sm">{formatCurrency(Number(invoice.total))}</div>
                  <div className="col-span-1 text-sm font-medium">
                    <div className="flex items-center gap-1">
                      <StatusIcon className={`h-3 w-3 ${getStatusColor(displayStatus)}`} />
                      <span className={getStatusColor(displayStatus)}>{displayStatus}</span>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <Badge className={getInvoiceTypeColor(invoice.invoice_type || 'full')}>
                      {invoice.invoice_type === 'full' || !invoice.invoice_type ? 'Blanket' : invoice.invoice_type === 'partial' ? 'Shipped' : (invoice.invoice_type.charAt(0).toUpperCase() + invoice.invoice_type.slice(1))}
                    </Badge>
                  </div>
                  <div className="col-span-2 flex gap-1">
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
                                const isDeposit = invoice.notes && invoice.notes.includes('deposit payment');
                                if (!isDeposit) {
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

                                // Don't delete payments or allocations - just soft delete the invoice
                                // This preserves the full history for the audit log
                                
                                // Soft delete invoice instead of hard delete
                                const { error } = await supabase
                                  .from('invoices')
                                  .update({ deleted_at: new Date().toISOString() })
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
                                    description: "Invoice moved to deleted archive. Quantities have been restored and you can restore the invoice from the archive."
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
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          // Fetch order items for the PDF
                          const { data: orderData } = await supabase
                            .from('orders')
                            .select(`
                              *,
                              order_items (*)
                            `)
                            .eq('id', invoice.order_id)
                            .single();
                          
                          if (orderData) {
                            await generateInvoicePDF(invoice, orderData);
                            toast({
                              title: "Success",
                              description: "Invoice PDF downloaded"
                            });
                          }
                        } catch (error) {
                          console.error('Download error:', error);
                          toast({
                            title: "Error",
                            description: "Failed to download invoice",
                            variant: "destructive"
                          });
                        }
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