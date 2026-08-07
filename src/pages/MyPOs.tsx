import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ExternalLink, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/useActiveCompany";

interface OrderWithPO {
  id: string;
  order_number: string;
  po_number: string | null;
  po_pdf_path: string | null;
  status: string;
  customer_name: string;
  created_at: string;
  total: number;
  invoices: {
    id: string;
    invoice_number: string;
    status: string;
  }[];
}

export default function MyPOs() {
  const [orders, setOrders] = useState<OrderWithPO[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();

  useEffect(() => {
    fetchOrders();
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Anyone belonging to more than one company saw an empty page: this looked up their
      // company with .single(), which ERRORS on multiple rows rather than picking one, so the
      // fetch bailed out. Everyone else's page worked, which is why the broken PO download
      // buttons could only be hit by single-company users. Use the company switcher's value,
      // same as the other customer pages.
      if (!activeCompanyId) {
        setLoading(false);
        return;
      }

      // Fetch orders with PO numbers for this company
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          po_number,
          po_pdf_path,
          status,
          customer_name,
          created_at,
          total,
          invoices (
            id,
            invoice_number,
            status
          )
        `)
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
        .not('po_number', 'is', null)
        .neq('status', 'draft')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: "Error",
        description: "Failed to load purchase orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'bg-muted text-muted-foreground';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-600';
      case 'in production':
        return 'bg-blue-500/10 text-blue-600';
      case 'shipped':
      case 'delivered':
      case 'completed':
        return 'bg-green-500/10 text-green-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Both PO document handlers are gone. They pointed at a 'customer-pos' bucket that has never
  // existed, which is what produced the NoSuchBucket error -- but the fix is not to repair the
  // path. Customers do not open PO documents from this app at all.

  // Parse comma-separated PO numbers into array
  const parsePONumbers = (poNumber: string | null): string[] => {
    if (!poNumber) return [];
    return poNumber.split(',').map(po => po.trim()).filter(Boolean);
  };

  if (loading) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">View customer POs attached to your orders</p>
        </div>
      </div>

      <div className="grid gap-4">
        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No purchase orders yet</p>
              <p className="text-muted-foreground">Orders with customer PO numbers will appear here</p>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => {
            const poNumbers = parsePONumbers(order.po_number);
            
            return (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Customer PO Numbers - Main Focus */}
                    <div className="flex flex-wrap gap-2">
                      {poNumbers.map((po, index) => (
                        <Badge 
                          key={index} 
                          variant="default" 
                          className="text-base font-mono px-4 py-2 bg-primary text-primary-foreground"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {po}
                        </Badge>
                      ))}
                    </div>

                    {/* Order Info - Secondary */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground border-t pt-4">
                      <span className="font-medium text-foreground">
                        Order #{order.order_number}
                      </span>
                      {order.invoices && order.invoices.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Invoice #{order.invoices[0].invoice_number}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{order.customer_name}</span>
                      <span>•</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                      <Badge className={`ml-auto ${getStatusColor(order.status)}`}>
                        {order.status}
                      </Badge>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">Order Total</p>
                        <p className="font-semibold">${order.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      </div>
                      
                      <div className="flex gap-2">
                        {/* No View/Download of the PO document here. Customers do not open PO
                            documents from this app -- the PO number stays as the label on their
                            own order, which is how they recognise it. */}

                        {/* Navigate to order detail */}
                        <Button
                          size="sm"
                          onClick={() => navigate(`/orders/${order.id}`)}
                        >
                          View Order
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
