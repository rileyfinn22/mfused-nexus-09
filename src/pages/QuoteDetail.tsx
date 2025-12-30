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
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
}

interface ResponseQuote {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
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
  const [responseQuote, setResponseQuote] = useState<ResponseQuote | null>(null);

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
        .select('*, company:companies(name)')
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

      // Check if there's a response quote linked to this request
      const { data: responseData } = await supabase
        .from('quotes')
        .select('id, quote_number, status, total, created_at')
        .eq('parent_quote_id', quoteId)
        .single();

      if (responseData) {
        setResponseQuote(responseData);
      }
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
      case 'approved': return 'bg-success/10 text-success';
      case 'rejected': return 'bg-danger/10 text-danger';
      case 'expired': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
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

  const canEdit = quote.status === 'draft' || quote.status === 'pending_review';
  const canSend = isVibeAdmin && quote.status === 'draft' && items.length > 0;
  const canApprove = !isVibeAdmin && quote.status === 'sent';
  const canReject = !isVibeAdmin && quote.status === 'sent';
  const canRespond = isVibeAdmin && quote.status === 'pending_review' && !responseQuote;

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
                {formatStatus(quote.status)}
              </Badge>
            </div>
            <p className="page-subtitle">
              Created {new Date(quote.created_at).toLocaleDateString()}
              {quote.valid_until && ` • Valid until ${new Date(quote.valid_until).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/quotes/edit/${quote.id}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canRespond && (
            <Button 
              onClick={() => navigate(`/quotes/respond/${quote.id}`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Respond with Quote
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
          {canEdit && (
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
                      <Collapsible key={item.id}>
                        <div className="grid grid-cols-12 gap-4 text-sm items-center">
                          <div className="col-span-4">
                            <div className="flex items-center gap-2">
                              {hasPriceBreaks && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
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
                          <div className="col-span-2">
                            {item.state && (
                              <Badge variant="outline">{item.state}</Badge>
                            )}
                          </div>
                          <div className="col-span-2 text-right">{item.quantity}</div>
                          <div className="col-span-2 text-right">
                            {formatCurrency(item.unit_price)}
                            {item.selected_tier !== null && hasPriceBreaks && (
                              <div className="text-xs text-muted-foreground">
                                (Tier {item.selected_tier + 1})
                              </div>
                            )}
                          </div>
                          <div className="col-span-2 text-right font-medium">{formatCurrency(item.total)}</div>
                        </div>
                        
                        {hasPriceBreaks && (
                          <CollapsibleContent>
                            <div className="ml-8 mt-2 mb-3 p-3 bg-muted/50 rounded-md">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Price Tiers</p>
                              <div className="space-y-1">
                                {item.price_breaks.map((pb, idx) => (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "flex justify-between text-sm px-2 py-1 rounded",
                                      item.selected_tier === idx && "bg-primary/10 text-primary font-medium"
                                    )}
                                  >
                                    <span>Qty {formatQty(pb.qty)}</span>
                                    <span>{formatCurrency(pb.unit_price)} / unit = {formatCurrency(pb.qty * pb.unit_price)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        )}
                      </Collapsible>
                    );
                  })}
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
                </div>
              )}
            </CardContent>
          </Card>

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
          {/* Response Quote (if this is a request with a response) */}
          {responseQuote && (
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Response Quote
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quote Number</span>
                  <span className="font-medium">{responseQuote.quote_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(responseQuote.status)}>
                    {formatStatus(responseQuote.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="font-semibold">{formatCurrency(responseQuote.total)}</span>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={() => navigate(`/quotes/${responseQuote.id}`)}
                >
                  View Response Quote
                </Button>
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

          {/* Description */}
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
    </div>
  );
};

export default QuoteDetail;
