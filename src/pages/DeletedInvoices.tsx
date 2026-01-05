import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  RotateCcw,
  Eye,
  Clock,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
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

const DeletedInvoices = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (roleChecked && isVibeAdmin) {
      fetchCompanies();
      fetchDeletedInvoices();
    }
  }, [isVibeAdmin, roleChecked]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
    setRoleChecked(true);
  };

  // Redirect non-vibe_admin users
  if (roleChecked && !isVibeAdmin) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/invoices')}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  const fetchDeletedInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        orders(order_number, customer_name, po_number),
        companies(name)
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    
    if (data) {
      setInvoices(data);
    }
    setLoading(false);
  };

  const handleRestore = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoices')
      .update({ deleted_at: null })
      .eq('id', invoiceId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to restore invoice",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Invoice restored successfully"
      });
      fetchDeletedInvoices();
    }
  };

  const handlePermanentDelete = async () => {
    if (!invoiceToDelete) return;

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceToDelete);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to permanently delete invoice",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Invoice permanently deleted"
      });
      fetchDeletedInvoices();
    }
    setDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.orders?.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.orders?.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCompany = companyFilter === "all" || invoice.company_id === companyFilter;
    return matchesSearch && matchesCompany;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/invoices')}
          >
            ← Back to Invoices
          </Button>
        </div>
        <h1 className="text-2xl font-semibold">Deleted Invoices Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recover or permanently delete archived invoices
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deleted invoices..."
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
      </div>

      {/* Deleted Invoices Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Invoice ID</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-1">Amount</div>
            <div className="col-span-2">Deleted At</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading deleted invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No deleted invoices found.
            </div>
          ) : (
            filteredInvoices.map((invoice) => (
              <div 
                key={invoice.id} 
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
              >
                <div className="col-span-2">
                  <div className="font-medium font-mono text-base">{invoice.invoice_number}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-sm">{invoice.companies?.name}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-sm">{invoice.orders?.customer_name}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-sm font-medium">{formatCurrency(invoice.total)}</span>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(invoice.deleted_at)}
                  </div>
                </div>
                <div className="col-span-1">
                  <Badge className={invoice.invoice_type === 'full' ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white'}>
                    {invoice.invoice_type || 'full'}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(invoice.id)}
                      title="Restore"
                      className="text-green-600 hover:text-green-700"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInvoiceToDelete(invoice.id);
                        setDeleteDialogOpen(true);
                      }}
                      title="Permanently Delete"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the invoice and all associated data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-red-600 hover:bg-red-700">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeletedInvoices;