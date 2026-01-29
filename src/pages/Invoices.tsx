import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertCircle,
  Receipt
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/lib/exportUtils";
import { generateInvoicePDF } from "@/lib/invoicePdfUtils";
import { EditableDescription } from "@/components/EditableDescription";
import { CustomerStatementTab } from "@/components/CustomerStatementTab";
import { useActiveCompany } from "@/hooks/useActiveCompany";

const Invoices = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompanyId, isVibeAdmin } = useActiveCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Read company filter from URL, default to "all" (only for vibe admins)
  const companyFilter = searchParams.get("company") || "all";
  const [isCompanyUser, setIsCompanyUser] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [userCompanyName, setUserCompanyName] = useState<string>("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [collapsedWhileFiltering, setCollapsedWhileFiltering] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedCompletedInvoices, setExpandedCompletedInvoices] = useState<Set<string>>(new Set());

  // Update URL when company filter changes
  const setCompanyFilter = (value: string) => {
    if (value === "all") {
      searchParams.delete("company");
    } else {
      searchParams.set("company", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  useEffect(() => {
    if (isVibeAdmin) {
      fetchCompanies();
    }
    fetchInvoices();
  }, [isVibeAdmin, activeCompanyId, companyFilter]);

  // Clear collapsed state when filter changes
  useEffect(() => {
    setCollapsedWhileFiltering(new Set());
  }, [statusFilter]);

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchInvoices = async () => {
    setLoading(true);
    let query = supabase
      .from('invoices')
      .select(`
        *,
        orders(order_number, customer_name, po_number, description),
        companies(name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // For vibe admins: use URL company filter if set
    // For regular users: always filter by their active company
    if (isVibeAdmin) {
      if (companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
    } else if (activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    const { data, error } = await query;
    
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

  const getComputedStatus = (invoice: any): 'paid' | 'due' | 'billed' | 'open' => {
    const status = String(invoice?.status || '').toLowerCase();

    if (status === 'paid') return 'paid';
    
    // For blanket/parent invoices, check if children fully cover and are all paid
    const isBlanket = !invoice.parent_invoice_id && (invoice.invoice_type === 'full' || !invoice.invoice_type);
    if (isBlanket) {
      const children = invoices.filter(inv => inv.parent_invoice_id === invoice.id);
      if (children.length > 0) {
        // Check if all children are paid
        const allChildrenPaid = children.every(child => {
          const childStatus = String(child?.status || '').toLowerCase();
          return childStatus === 'paid';
        });
        
        // Check if children cover the blanket total
        const childrenTotal = children.reduce((sum, child) => sum + (Number(child.total) || 0), 0);
        const blanketTotal = Number(invoice.total) || 0;
        const childrenCoverBlanket = childrenTotal >= blanketTotal;
        
        if (allChildrenPaid && childrenCoverBlanket) {
          return 'paid';
        }
      }
    }
    
    if (status === 'due') return 'due';

    if (status === 'billed') {
      if (invoice?.due_date) {
        const daysUntilDue = getDaysUntilDue(invoice.due_date);
        if (daysUntilDue <= 0) return 'due';
      }
      return 'billed';
    }

    // Treat anything else (open/pending/etc.) as OPEN for display purposes
    return 'open';
  };

  const getStatusDisplay = (invoice: any) => {
    return getComputedStatus(invoice).toUpperCase();
  };

  const parseDateAsLocalDay = (value: string) => {
    // If backend stores YYYY-MM-DD, parse as *local* date to avoid timezone shifts.
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      return new Date(y, mo, d);
    }
    return new Date(value);
  };

  const getDaysUntilDue = (dueDate: string) => {
    // Compare by calendar day (local) to avoid time-of-day / timezone surprises
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = parseDateAsLocalDay(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const toggleExpanded = (invoiceId: string, childrenMatchFilter: boolean = false) => {
    if (childrenMatchFilter) {
      // When filtering, track collapsed state separately
      setCollapsedWhileFiltering(prev => {
        const newSet = new Set(prev);
        if (newSet.has(invoiceId)) {
          newSet.delete(invoiceId);
        } else {
          newSet.add(invoiceId);
        }
        return newSet;
      });
    } else {
      // Normal expand/collapse behavior
      setExpandedInvoices(prev => {
        const newSet = new Set(prev);
        if (newSet.has(invoiceId)) {
          newSet.delete(invoiceId);
        } else {
          newSet.add(invoiceId);
        }
        return newSet;
      });
    }
  };

  const hasOverdueChildren = (parentId: string) => {
    const children = invoices.filter(inv => inv.parent_invoice_id === parentId);
    return children.some(child => getComputedStatus(child) === 'due');
  };

  // Get the highest priority status from child invoices
  // Priority: due > billed > open > paid
  const getChildrenPriorityStatus = (parentId: string): 'paid' | 'due' | 'billed' | 'open' | null => {
    const children = invoices.filter(inv => inv.parent_invoice_id === parentId);
    if (children.length === 0) return null;

    const hasDue = children.some(child => getComputedStatus(child) === 'due');
    if (hasDue) return 'due';

    const hasBilled = children.some(child => getComputedStatus(child) === 'billed');
    if (hasBilled) return 'billed';

    const hasOpen = children.some(child => getComputedStatus(child) === 'open');
    if (hasOpen) return 'open';

    // If all children are paid
    const allPaid = children.every(child => getComputedStatus(child) === 'paid');
    if (allPaid) return 'paid';

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
    
    // Status filter logic (includes billed invoices that are past due => treated as DUE)
    let matchesStatus = true;
    if (statusFilter !== "all") {
      const computedStatus = getComputedStatus(invoice);
      
      // For parent invoices, also check if any children match the filter
      if (!invoice.parent_invoice_id) {
        const children = invoices.filter(inv => inv.parent_invoice_id === invoice.id);
        const childrenMatch = children.some(child => getComputedStatus(child) === statusFilter);
        matchesStatus = computedStatus === statusFilter || childrenMatch;
      } else {
        matchesStatus = computedStatus === statusFilter;
      }
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
  // Auto-expand parents when filtering by status and children match that status (but allow manual collapse)
  const displayInvoices = invoiceGroups.flatMap(group => {
    const childrenMatchFilter = statusFilter !== "all" && group.children.some(child => getComputedStatus(child) === statusFilter);
    
    // Determine if expanded: manually expanded, OR (children match filter AND not manually collapsed)
    const isExpanded = expandedInvoices.has(group.parent.id) || 
      (childrenMatchFilter && !collapsedWhileFiltering.has(group.parent.id));
    
    const items = [{ 
      invoice: group.parent, 
      isParent: true, 
      isChild: false, 
      hasChildren: group.children.length > 0,
      isExpanded,
      childrenMatchFilter
    }];
    
    if (isExpanded) {
      items.push(...group.children.map(child => ({ 
        invoice: child, 
        isParent: false, 
        isChild: true, 
        hasChildren: false,
        isExpanded: false,
        childrenMatchFilter: false
      })));
    }
    
    return items;
  });

  // Calculate OPEN amount - total of blanket orders minus all payments (including child invoices)
  const openAmount = filteredInvoices
    .filter(inv => {
      const isBlanket = inv.invoice_type === 'full' || !inv.invoice_type;
      const isNotPaid = getComputedStatus(inv) !== 'paid';
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

  // Calculate BILLED amount - invoices that are billed and NOT past due
  const billedAmount = filteredInvoices
    .filter(inv => getComputedStatus(inv) === 'billed')
    .reduce((sum, invoice) => {
      const remaining = Number(invoice.total) - (Number(invoice.total_paid) || 0);
      return sum + remaining;
    }, 0);

  // Calculate DUE amount - invoices that are past due (including billed invoices past due date)
  const dueAmount = filteredInvoices
    .filter(inv => getComputedStatus(inv) === 'due')
    .reduce((sum, invoice) => {
      const remaining = Number(invoice.total) - (Number(invoice.total_paid) || 0);
      return sum + remaining;
    }, 0);

  // Get completed invoices - blanket invoices where all children are paid and cover full amount
  const completedInvoices = invoices.filter(invoice => {
    // Only blanket/parent invoices (not child invoices)
    if (invoice.parent_invoice_id) return false;
    const isBlanket = invoice.invoice_type === 'full' || !invoice.invoice_type;
    if (!isBlanket) return false;
    
    // Check if computed status is 'paid' (meaning children cover and are all paid)
    return getComputedStatus(invoice) === 'paid';
  });

  // Group completed invoices with their children
  const completedInvoiceGroups = completedInvoices.map(parent => ({
    parent,
    children: invoices
      .filter(inv => inv.parent_invoice_id === parent.id)
      .sort((a, b) => (a.shipment_number || 0) - (b.shipment_number || 0))
  }));

  // Create display list for completed invoices
  const displayCompletedInvoices = completedInvoiceGroups.flatMap(group => {
    const isExpanded = expandedCompletedInvoices.has(group.parent.id);
    
    const items = [{ 
      invoice: group.parent, 
      isParent: true, 
      isChild: false, 
      hasChildren: group.children.length > 0,
      isExpanded,
      childrenMatchFilter: false
    }];
    
    if (isExpanded) {
      items.push(...group.children.map(child => ({ 
        invoice: child, 
        isParent: false, 
        isChild: true, 
        hasChildren: false,
        isExpanded: false,
        childrenMatchFilter: false
      })));
    }
    
    return items;
  });

  const toggleCompletedExpanded = (invoiceId: string) => {
    setExpandedCompletedInvoices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  };

  // Filter out completed invoices from the main display (only when not filtering by 'paid')
  const activeInvoiceGroups = invoiceGroups.filter(group => 
    getComputedStatus(group.parent) !== 'paid' || statusFilter === 'paid'
  );

  // Create display list for active invoices (excluding completed unless filtering by paid)
  const displayActiveInvoices = activeInvoiceGroups.flatMap(group => {
    const childrenMatchFilter = statusFilter !== "all" && group.children.some(child => getComputedStatus(child) === statusFilter);
    
    const isExpanded = expandedInvoices.has(group.parent.id) || 
      (childrenMatchFilter && !collapsedWhileFiltering.has(group.parent.id));
    
    const items = [{ 
      invoice: group.parent, 
      isParent: true, 
      isChild: false, 
      hasChildren: group.children.length > 0,
      isExpanded,
      childrenMatchFilter
    }];
    
    if (isExpanded) {
      items.push(...group.children.map(child => ({ 
        invoice: child, 
        isParent: false, 
        isChild: true, 
        hasChildren: false,
        isExpanded: false,
        childrenMatchFilter: false
      })));
    }
    
    return items;
  });

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

      <Tabs defaultValue="invoices" className="space-y-6">
        <TabsList>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-2" />
            Invoices
          </TabsTrigger>
          {isCompanyUser && (
            <TabsTrigger value="statement">
              <Receipt className="h-4 w-4 mr-2" />
              Statement
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="invoices" className="space-y-6">
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
            displayActiveInvoices.map(({ invoice, isParent, isChild, hasChildren, isExpanded, childrenMatchFilter }) => {
              const StatusIcon = getStatusIcon(invoice);
              const daysUntilDue = invoice.due_date ? getDaysUntilDue(invoice.due_date) : null;
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
                            toggleExpanded(invoice.id, childrenMatchFilter);
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
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                          {invoice.orders?.description || <span className="text-muted-foreground">-</span>}
                        </div>
                        {isChild && invoice.description && (
                          <div className="pl-3 border-l border-border text-xs text-foreground whitespace-pre-wrap break-words">
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
                          // Fetch order data
                          const { data: orderData } = await supabase
                            .from('orders')
                            .select(`
                              *,
                              order_items (*)
                            `)
                            .eq('id', invoice.order_id)
                            .single();
                          
                          if (!orderData) return;

                          // Fetch inventory allocations for THIS specific invoice
                          const { data: allocationsData } = await supabase
                            .from('inventory_allocations')
                            .select(`
                              quantity_allocated,
                              order_items (
                                id, sku, name, unit_price, line_number
                              )
                            `)
                            .eq('invoice_id', invoice.id);

                          // Build the correct items list based on allocations
                          let itemsForPdf = orderData.order_items || [];
                          
                          if (allocationsData && allocationsData.length > 0) {
                            // Use allocated quantities for this specific invoice
                            itemsForPdf = allocationsData
                              .sort((a, b) => (a.order_items?.line_number ?? 999) - (b.order_items?.line_number ?? 999))
                              .map((alloc: any) => ({
                                ...alloc.order_items,
                                quantity: alloc.quantity_allocated,
                                unit_price: alloc.order_items?.unit_price || 0
                              }));
                          }

                          // Create order data with correct items
                          const orderForPdf = {
                            ...orderData,
                            order_items: itemsForPdf
                          };
                          
                          await generateInvoicePDF(invoice, orderForPdf);
                          toast({
                            title: "Success",
                            description: "Invoice PDF downloaded"
                          });
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

      {/* Completed Invoices Section */}
      {statusFilter !== 'paid' && completedInvoices.length > 0 && (
        <div className="mt-8">
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 bg-success/10 hover:bg-success/20 rounded-xl border border-success/30"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <span className="font-semibold text-success">Completed Orders</span>
              <Badge variant="outline" className="border-success/50 text-success">
                {completedInvoices.length}
              </Badge>
            </div>
            {showCompleted ? (
              <ChevronDown className="h-5 w-5 text-success" />
            ) : (
              <ChevronRight className="h-5 w-5 text-success" />
            )}
          </Button>

          {showCompleted && (
            <div className="border border-success/30 rounded-xl bg-card shadow-sm overflow-hidden mt-2">
              {/* Table Header */}
              <div className="bg-success/10 border-b border-success/30">
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
                {displayCompletedInvoices.map(({ invoice, isParent, isChild, hasChildren, isExpanded }) => {
                  const StatusIcon = CheckCircle;
                  
                  return (
                    <div 
                      key={invoice.id} 
                      className={`grid grid-cols-12 gap-4 px-4 py-3 transition-colors cursor-pointer ${
                        isChild ? 'bg-muted/60 border-l-4 border-l-success/50' : 'hover:bg-muted/50'
                      } ${isChild ? '' : 'even:bg-muted/40'}`}
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                    >
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          {isParent && hasChildren && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 gap-1 border-success/40 bg-success/5 hover:bg-success/10 text-success/80"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompletedExpanded(invoice.id);
                              }}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-success" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-success" />
                              )}
                            </Button>
                          )}
                          {isChild && <div className="w-4 h-4 flex items-center justify-center ml-1"><Package className="h-3 w-3 text-success/60" /></div>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${isChild ? 'text-sm text-muted-foreground' : ''}`}>
                              {invoice.invoice_number}
                            </span>
                            {!isChild && invoice.quickbooks_sync_status === 'synced' && (
                              <Badge variant="outline" className="text-xs border-success/50 text-success">
                                <Link2 className="h-3 w-3 mr-1" />
                                QB
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center">
                        <span className="text-sm text-muted-foreground">
                          {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className="text-sm truncate">{(invoice as any).companies?.name}</span>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className="text-sm text-muted-foreground truncate">
                          {invoice.description || invoice.orders?.description || '-'}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center">
                        <span className="font-medium">{formatCurrency(invoice.total || 0)}</span>
                      </div>
                      <div className="col-span-1 flex items-center">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="h-4 w-4 text-success" />
                          <span className="font-semibold text-sm text-success">PAID</span>
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center">
                        {invoice.invoice_type === 'partial' ? (
                          <Badge className="bg-info text-white">Shipped</Badge>
                        ) : (
                          <Badge className="bg-primary text-primary-foreground">Blanket</Badge>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center gap-1">
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
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0" 
                          title="Download Invoice"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const { data: orderData } = await supabase
                                .from('orders')
                                .select(`*, order_items (*)`)
                                .eq('id', invoice.order_id)
                                .single();
                              
                              if (!orderData) return;

                              const { data: allocationsData } = await supabase
                                .from('inventory_allocations')
                                .select(`quantity_allocated, order_items (id, sku, name, unit_price, line_number)`)
                                .eq('invoice_id', invoice.id);

                              let itemsForPdf = orderData.order_items || [];
                              
                              if (allocationsData && allocationsData.length > 0) {
                                itemsForPdf = allocationsData
                                  .sort((a, b) => (a.order_items?.line_number ?? 999) - (b.order_items?.line_number ?? 999))
                                  .map((alloc: any) => ({
                                    ...alloc.order_items,
                                    quantity: alloc.quantity_allocated,
                                    unit_price: alloc.order_items?.unit_price || 0
                                  }));
                              }

                              const orderForPdf = { ...orderData, order_items: itemsForPdf };
                              await generateInvoicePDF(invoice, orderForPdf);
                              toast({ title: "Success", description: "Invoice PDF downloaded" });
                            } catch (error) {
                              console.error('Download error:', error);
                              toast({ title: "Error", description: "Failed to download invoice", variant: "destructive" });
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
        </TabsContent>

        {isCompanyUser && userCompanyId && (
          <TabsContent value="statement">
            <CustomerStatementTab 
              companyId={userCompanyId} 
              companyName={userCompanyName} 
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Invoices;