import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  Building2,
  Calendar,
  Truck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string | null;
  company_id: string;
  status: string;
  total: number;
  valid_until: string | null;
  created_at: string;
  company?: { name: string };
  parent_quote_id?: string | null;
}

interface Company {
  id: string;
  name: string;
}

const Quotes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isVibeAdmin !== undefined) {
      fetchQuotes();
      if (isVibeAdmin) {
        fetchCompanies();
      }
    }
  }, [isVibeAdmin]);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsVibeAdmin(data?.role === 'vibe_admin');
    }
  };

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');
    setCompanies(data || []);
  };

  const fetchQuotes = async () => {
    try {
      let query = supabase
        .from('quotes')
        .select('*, company:companies(name)')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      
      // For non-admin users (customers), filter out internal workflow quotes
      // Customers should only see:
      // - Their own requests (pending_review, where parent_quote_id is null)
      // - Official responses sent to them (sent, approved, rejected - where parent_quote_id is NOT null)
      // - Their own drafts (parent_quote_id is null)
      // Hide: vibe admin's internal work quotes (in_progress, vendor_pending, vendor_received with parent_quote_id)
      let filteredData = data || [];
      if (!isVibeAdmin) {
        filteredData = filteredData.filter(quote => {
          // Hide internal vibe workflow quotes (response quotes that aren't sent yet)
          if (quote.parent_quote_id && !['sent', 'approved', 'rejected'].includes(quote.status)) {
            return false;
          }
          return true;
        });
      }
      
      setQuotes(filteredData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string, forCustomer: boolean = false) => {
    // For customers, internal workflow statuses should show as "In Review" icon
    if (forCustomer && ['in_progress', 'vendor_pending', 'vendor_received'].includes(status)) {
      return <Clock className="h-4 w-4" />;
    }
    switch (status) {
      case 'draft': return <FileText className="h-4 w-4" />;
      case 'sent': return <Send className="h-4 w-4" />;
      case 'pending_review': return <Clock className="h-4 w-4" />;
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'vendor_pending': return <Truck className="h-4 w-4" />;
      case 'vendor_received': return <CheckCircle className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'rejected': return <XCircle className="h-4 w-4" />;
      case 'expired': return <Calendar className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string, forCustomer: boolean = false) => {
    // For customers, internal workflow statuses should show as "In Review" style
    if (forCustomer && ['in_progress', 'vendor_pending', 'vendor_received'].includes(status)) {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'sent': return 'bg-primary/10 text-primary';
      case 'pending_review': return 'bg-warning/10 text-warning';
      case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'vendor_pending': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'vendor_received': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      case 'approved': return 'bg-success/10 text-success';
      case 'rejected': return 'bg-danger/10 text-danger';
      case 'expired': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatStatus = (status: string, isAdmin: boolean = false) => {
    // Customer-friendly status labels
    if (!isAdmin) {
      switch (status) {
        case 'pending_review': return 'Requested';
        case 'in_progress': return 'In Review';
        case 'vendor_pending': return 'In Review';
        case 'vendor_received': return 'In Review';
        case 'sent': return 'Quote Received';
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'expired': return 'Expired';
        default: return status.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }
    }
    // Admin status labels
    switch (status) {
      case 'in_progress': return 'Working on Quote';
      case 'vendor_pending': return 'Sent to Vendor';
      case 'vendor_received': return 'Vendor Received';
      default: return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      quote.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (quote.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    const matchesCompany = companyFilter === 'all' || quote.company_id === companyFilter;
    
    return matchesSearch && matchesStatus && matchesCompany;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">{isVibeAdmin ? "Quotes" : "My Quotes"}</h1>
          <p className="page-subtitle">
            {isVibeAdmin 
              ? "Manage quote requests and send pricing to customers" 
              : "View your quote requests and official quotes"}
          </p>
        </div>
        <Button onClick={() => navigate('/quotes/create')}>
          <Plus className="h-4 w-4 mr-2" />
          {isVibeAdmin ? "Create Quote" : "Request Quote"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isVibeAdmin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {isVibeAdmin && <SelectItem value="draft">Draft</SelectItem>}
            <SelectItem value="pending_review">{isVibeAdmin ? "Pending Review" : "Requested"}</SelectItem>
            {isVibeAdmin && <SelectItem value="in_progress">Working on Quote</SelectItem>}
            {isVibeAdmin && <SelectItem value="vendor_pending">Sent to Vendor</SelectItem>}
            {isVibeAdmin && <SelectItem value="vendor_received">Vendor Received</SelectItem>}
            <SelectItem value="sent">{isVibeAdmin ? "Sent to Customer" : "Quote Received"}</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotes List */}
      {filteredQuotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No quotes found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== 'all' || companyFilter !== 'all'
                ? "Try adjusting your filters"
                : isVibeAdmin 
                  ? "Create your first quote to send pricing to customers"
                  : "Request a quote to get started"}
            </p>
            <Button onClick={() => navigate('/quotes/create')}>
              <Plus className="h-4 w-4 mr-2" />
              {isVibeAdmin ? "Create Quote" : "Request Quote"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredQuotes.map((quote) => (
            <Card 
              key={quote.id} 
              className="card-hover cursor-pointer"
              onClick={() => navigate(`/quotes/${quote.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={cn(
                      "p-2 rounded-lg",
                      getStatusColor(quote.status, !isVibeAdmin)
                    )}>
                      {getStatusIcon(quote.status, !isVibeAdmin)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold">{quote.quote_number}</span>
                        <Badge variant="outline" className={getStatusColor(quote.status, !isVibeAdmin)}>
                          {formatStatus(quote.status, isVibeAdmin)}
                        </Badge>
                        {/* Show quote type for customers - only if pending */}
                        {!isVibeAdmin && quote.status === 'pending_review' && (
                          <Badge variant="secondary" className="text-xs">
                            Quote Request
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {quote.customer_name}
                        </span>
                        {isVibeAdmin && quote.company && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {quote.company.name}
                          </span>
                        )}
                        <span>{new Date(quote.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(quote.total)}</div>
                    {quote.valid_until && (
                      <div className="text-xs text-muted-foreground">
                        Valid until {new Date(quote.valid_until).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Quotes;
