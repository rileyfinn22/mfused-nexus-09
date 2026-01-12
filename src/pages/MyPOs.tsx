import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ExternalLink, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Get user's company
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) {
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
        .eq('company_id', userRole.company_id)
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

  const handleDownloadPO = async (poPdfPath: string, poNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-pos')
        .download(poPdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO-${poNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PO:', error);
      toast({
        title: "Error",
        description: "Failed to download PO document",
        variant: "destructive",
      });
    }
  };

  const handleViewPO = async (poPdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-pos')
        .createSignedUrl(poPdfPath, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing PO:', error);
      toast({
        title: "Error",
        description: "Failed to open PO document",
        variant: "destructive",
      });
    }
  };

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
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Order #{order.order_number}
                        {order.invoices && order.invoices.length > 0 && (
                          <span className="text-muted-foreground font-normal text-base">
                            / Invoice #{order.invoices[0].invoice_number}
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {order.customer_name} • {new Date(order.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Customer PO Numbers */}
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Customer PO Numbers:</p>
                      <div className="flex flex-wrap gap-2">
                        {poNumbers.map((po, index) => (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className="text-sm font-mono bg-primary/5"
                          >
                            {po}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Order Total */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">Order Total</p>
                        <p className="font-semibold">${order.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      </div>
                      
                      <div className="flex gap-2">
                        {/* View/Download PO PDF if available */}
                        {order.po_pdf_path && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewPO(order.po_pdf_path!)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View PO
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadPO(order.po_pdf_path!, order.po_number || order.order_number)}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                          </>
                        )}
                        
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
