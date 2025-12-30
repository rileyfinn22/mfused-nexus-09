import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Loader2,
  FileText,
  Download,
  Building2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ChevronDown,
  ChevronRight,
  Truck,
  Clock,
  PlayCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { generateQuotePDF } from "@/lib/quoteUtils";
import { SendToVendorDialog } from "@/components/SendToVendorDialog";

interface PriceBreak {
  qty: number;
  unit_price: number;
}

interface QuoteItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  state: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  price_breaks: PriceBreak[];
  selected_tier: number | null;
}

interface Quote {
  id: string;
  quote_number: string;
  company_id: string;
  status: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_name: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  description: string | null;
  request_notes: string | null;
  internal_notes: string | null;
  terms: string | null;
  valid_until: string | null;
  uploaded_file_url: string | null;
  uploaded_filename: string | null;
  subtotal: number;
  tax: number;
  shipping_cost: number;
  total: number;
  sent_at: string | null;
  approved_at: string | null;
  created_at: string;
  parent_quote_id: string | null;
  company?: { name: string };
  vendor_id: string | null;
  vendor_sent_at: string | null;
  vendor_response_received_at: string | null;
  vendor_quote_notes: string | null;
  vendor?: { name: string };
}

const QuoteDetail = () => {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showVendorDialog, setShowVendorDialog] = useState(false);

  useEffect(() => {
    checkRole();
    fetchQuote();
  }, [quoteId]);

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

  const fetchQuote = async () => {
    try {
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*, company:companies(name), vendor:vendors(name)')
        .eq('id', quoteId)
        .single();

      if (quoteError) throw quoteError;
      setQuote(quoteData);

      const { data: itemsData, error: itemsError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at');

      if (itemsError) throw itemsError;
      setItems((itemsData || []).map(item => ({
        ...item,
        price_breaks: Array.isArray(item.price_breaks) ? (item.price_breaks as unknown as PriceBreak[]) : [],
        selected_tier: item.selected_tier ?? null
      })));
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

  const updateQuoteStatus = async (newStatus: string) => {
    setActionLoading(newStatus);
    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === 'sent') {
        updates.sent_at = new Date().toISOString();
      } else if (newStatus === 'approved') {
        const { data: { user } } = await supabase.auth.getUser();
        updates.approved_at = new Date().toISOString();
        updates.approved_by = user?.id;
      }

      const { error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', quoteId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Quote ${newStatus === 'sent' ? 'sent to customer' : newStatus}`,
      });

      fetchQuote();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;

      toast({
        title: "Quote deleted",
        description: "The quote has been deleted",
      });

      navigate('/quotes');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
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
      case 'vendor_received': return 'Vendor Response Received';
      default: return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading('status');
    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === 'vendor_pending') {
        updates.vendor_sent_at = new Date().toISOString();
      } else if (newStatus === 'vendor_received') {
        updates.vendor_response_received_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', quoteId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Quote status updated",
      });

      fetchQuote();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-2">Quote not found</h2>
        <Button onClick={() => navigate('/quotes')}>Back to Quotes</Button>
      </div>
    );
  }

  // Vibe admin can edit any quote that's not already sent/approved/rejected
  // Customer can only edit their own pending_review quotes
  const canEdit = isVibeAdmin 
    ? !['sent', 'approved', 'rejected'].includes(quote.status)
    : (quote.status === 'pending_review');
  
  // Vibe admin can send quote to customer when it has items and is ready
  const canSend = isVibeAdmin && ['pending_review', 'in_progress', 'vendor_received'].includes(quote.status) && items.length > 0;
  const canApprove = !isVibeAdmin && quote.status === 'sent';
  const canReject = !isVibeAdmin && quote.status === 'sent';
  
  // Send to Vendor available when vibe admin is working on the quote
  const canSendToVendor = isVibeAdmin && ['pending_review', 'in_progress'].includes(quote.status) && !quote.vendor_id;
  
  // Status dropdown available for vibe admins on quotes they're working on
  const showStatusDropdown = isVibeAdmin && !['sent', 'approved', 'rejected'].includes(quote.status);
  
  // Delete available for customers (pending_review only) and vibe admins (any non-final status)
  const canDelete = isVibeAdmin 
    ? !['approved'].includes(quote.status) // Vibe can delete anything except approved
    : (quote.status === 'pending_review'); // Customer can only delete their pending requests

  const handleDownloadPDF = () => {
    generateQuotePDF(quote, items);
  };

  // Check if any items have price breaks
  const hasAnyPriceBreaks = items.some(item => item.price_breaks && item.price_breaks.length > 0);


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title">{quote.quote_number}</h1>
              <Badge className={getStatusColor(quote.status)}>
                {formatStatus(quote.status, isVibeAdmin)}
              </Badge>
              {/* Show quote type indicator for customers */}
              {!isVibeAdmin && quote.status === 'pending_review' && (
                <Badge variant="outline" className="text-xs">Quote Request</Badge>
              )}
            </div>
            <p className="page-subtitle">
              Created {new Date(quote.created_at).toLocaleDateString()}
              {quote.valid_until && ` • Valid until ${new Date(quote.valid_until).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Dropdown for Vibe Admins */}
          {showStatusDropdown && (
            <Select 
              value={quote.status} 
              onValueChange={handleStatusChange}
              disabled={actionLoading === 'status'}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="in_progress">Working on Quote</SelectItem>
                <SelectItem value="vendor_pending">Sent to Vendor</SelectItem>
                <SelectItem value="vendor_received">Vendor Response Received</SelectItem>
              </SelectContent>
            </Select>
          )}
          
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/quotes/edit/${quote.id}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canSend && (
            <Button 
              onClick={() => updateQuoteStatus('sent')}
              disabled={actionLoading === 'sent'}
            >
              {actionLoading === 'sent' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send to Customer
            </Button>
          )}
          {canApprove && (
            <Button 
              onClick={() => updateQuoteStatus('approved')}
              disabled={actionLoading === 'approved'}
              className="bg-success hover:bg-success/90"
            >
              {actionLoading === 'approved' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve Quote
            </Button>
          )}
          {canReject && (
            <Button 
              variant="destructive"
              onClick={() => updateQuoteStatus('rejected')}
              disabled={actionLoading === 'rejected'}
            >
              {actionLoading === 'rejected' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          {canSendToVendor && (
            <Button variant="outline" onClick={() => setShowVendorDialog(true)}>
              <Truck className="h-4 w-4 mr-2" />
              Send to Vendor
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{quote.customer_name}</p>
                </div>
                {quote.customer_email && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </p>
                    <p className="font-medium">{quote.customer_email}</p>
                  </div>
                )}
                {quote.customer_phone && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone
                    </p>
                    <p className="font-medium">{quote.customer_phone}</p>
                  </div>
                )}
              </div>
              {quote.shipping_street && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin className="h-3 w-3" /> Shipping Address
                    </p>
                    <p className="font-medium">
                      {quote.shipping_name && <span>{quote.shipping_name}<br /></span>}
                      {quote.shipping_street}<br />
                      {quote.shipping_city}, {quote.shipping_state} {quote.shipping_zip}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Items</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No items added to this quote yet
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2">State</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>
                  {items.map((item) => {
                    const hasPriceBreaks = item.price_breaks && item.price_breaks.length > 0;
                    const formatQty = (qty: number) => qty.toLocaleString();
                    
                    return (
                      <Collapsible key={item.id} defaultOpen={hasPriceBreaks}>
                        <div className="grid grid-cols-12 gap-4 text-sm items-center">
                          <div className={hasPriceBreaks ? "col-span-10" : "col-span-4"}>
                            <div className="flex items-center gap-2">
                              {hasPriceBreaks && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <ChevronDown className="h-4 w-4 transition-transform data-[state=closed]:rotate-[-90deg]" />
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground font-mono text-xs">{item.sku}</span>
                                  {hasPriceBreaks && (
                                    <Badge variant="secondary" className="text-xs">
                                      {item.price_breaks.length} tier{item.price_breaks.length !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          {hasPriceBreaks ? (
                            <div className="col-span-2">
                              {item.state && (
                                <Badge variant="outline">{item.state}</Badge>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="col-span-2">
                                {item.state && (
                                  <Badge variant="outline">{item.state}</Badge>
                                )}
                              </div>
                              <div className="col-span-2 text-right">{item.quantity.toLocaleString()}</div>
                              <div className="col-span-2 text-right">{formatCurrency(item.unit_price)}</div>
                              <div className="col-span-2 text-right font-medium">{formatCurrency(item.total)}</div>
                            </>
                          )}
                        </div>
                        
                        {hasPriceBreaks && (
                          <CollapsibleContent>
                            <div className="ml-8 mt-2 mb-3 p-3 bg-muted/50 rounded-md">
                              <div className="grid grid-cols-3 gap-4 text-xs font-medium text-muted-foreground border-b pb-2 mb-2">
                                <div>Quantity</div>
                                <div className="text-right">Unit Price</div>
                                <div className="text-right">Total</div>
                              </div>
                              <div className="space-y-1">
                                {item.price_breaks.map((pb, idx) => (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "grid grid-cols-3 gap-4 text-sm px-2 py-1.5 rounded",
                                      item.selected_tier === idx && "bg-primary/10 text-primary font-medium"
                                    )}
                                  >
                                    <span>{formatQty(pb.qty)} units</span>
                                    <span className="text-right">{formatCurrency(pb.unit_price)}</span>
                                    <span className="text-right font-medium">{formatCurrency(pb.qty * pb.unit_price)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        )}
                      </Collapsible>
                    );
                  })}
                  {!hasAnyPriceBreaks && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>{formatCurrency(quote.subtotal)}</span>
                        </div>
                        {quote.shipping_cost > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Shipping</span>
                            <span>{formatCurrency(quote.shipping_cost)}</span>
                          </div>
                        )}
                        {quote.tax > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tax</span>
                            <span>{formatCurrency(quote.tax)}</span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between font-semibold text-lg">
                          <span>Total</span>
                          <span>{formatCurrency(quote.total)}</span>
                        </div>
                      </div>
                    </>
                  )}
                  {hasAnyPriceBreaks && (
                    <div className="text-sm text-muted-foreground italic mt-4 text-center">
                      * Pricing shown per tier. Final total depends on quantity selected.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Description - show in main content area */}
          {quote.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{quote.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Request Notes */}
          {quote.request_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer Request Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{quote.request_notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Uploaded File */}
          {quote.uploaded_file_url && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Attached Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">{quote.uploaded_filename}</span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={quote.uploaded_file_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Workflow Status (Vibe Admin only) */}
          {isVibeAdmin && !['sent', 'approved', 'rejected'].includes(quote.status) && (
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  Quote Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    quote.status === 'pending_review' && "bg-warning/10 font-medium"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      quote.status === 'pending_review' ? "bg-warning" : "bg-muted"
                    )} />
                    Pending Review
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    quote.status === 'in_progress' && "bg-blue-100 dark:bg-blue-900/30 font-medium"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      quote.status === 'in_progress' ? "bg-blue-500" : "bg-muted"
                    )} />
                    Working on Quote
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    quote.status === 'vendor_pending' && "bg-orange-100 dark:bg-orange-900/30 font-medium"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      quote.status === 'vendor_pending' ? "bg-orange-500" : "bg-muted"
                    )} />
                    Sent to Vendor
                    {quote.vendor_sent_at && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(quote.vendor_sent_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    quote.status === 'vendor_received' && "bg-cyan-100 dark:bg-cyan-900/30 font-medium"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      quote.status === 'vendor_received' ? "bg-cyan-500" : "bg-muted"
                    )} />
                    Vendor Response Received
                    {quote.vendor_response_received_at && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(quote.vendor_response_received_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quote Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isVibeAdmin && quote.company && (
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-medium">{quote.company.name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Terms</p>
                <p className="font-medium">{quote.terms || 'Net 30'}</p>
              </div>
              {quote.valid_until && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Valid Until
                  </p>
                  <p className="font-medium">{new Date(quote.valid_until).toLocaleDateString()}</p>
                </div>
              )}
              {quote.sent_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Sent</p>
                  <p className="font-medium">{new Date(quote.sent_at).toLocaleDateString()}</p>
                </div>
              )}
              {quote.approved_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="font-medium">{new Date(quote.approved_at).toLocaleDateString()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vendor Status (Vibe Admin only) */}
          {isVibeAdmin && quote.vendor_id && (
            <Card className="border-orange-500/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-orange-500" />
                  Vendor Quote Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Vendor</span>
                  <span className="font-medium">{quote.vendor?.name || 'Unknown'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sent</span>
                  <span className="font-medium">
                    {quote.vendor_sent_at 
                      ? new Date(quote.vendor_sent_at).toLocaleDateString() 
                      : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Response</span>
                  <span className="font-medium">
                    {quote.vendor_response_received_at ? (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle className="h-3 w-3" />
                        Received {new Date(quote.vendor_response_received_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-warning">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </span>
                </div>
                {quote.vendor_quote_notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{quote.vendor_quote_notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Internal Notes (Vibe Admin only) */}
          {isVibeAdmin && quote.internal_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{quote.internal_notes}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger hover:bg-danger/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send to Vendor Dialog */}
      <SendToVendorDialog
        open={showVendorDialog}
        onOpenChange={setShowVendorDialog}
        quoteId={quote.id}
        onSent={fetchQuote}
      />
    </div>
  );
};

export default QuoteDetail;
