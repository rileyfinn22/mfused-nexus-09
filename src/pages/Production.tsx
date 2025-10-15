import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ProductionOrder {
  id: string;
  order_number: string;
  customer_name: string;
  order_date: string;
  company_id: string;
  companies: {
    name: string;
  };
}

interface ProductionStage {
  id: string;
  stage_name: string;
  status: string;
  vendor_id: string | null;
  sequence_order: number;
  vendors: {
    name: string;
  } | null;
}

export default function Production() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);

  useEffect(() => {
    checkRole();
    fetchProductionOrders();
  }, []);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'vibe_admin')
      .maybeSingle();

    setIsVibeAdmin(!!data);
  };

  const fetchProductionOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          order_date,
          company_id,
          companies (
            name
          )
        `)
        .eq('status', 'in production')
        .order('order_date', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Error fetching production orders:', error);
      toast({
        title: "Error",
        description: "Failed to load production orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (isVibeAdmin && order.companies.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Production Tracking</h1>
            <p className="text-muted-foreground">
              Monitor orders in production and track stage progress
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="grid gap-4">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No orders in production</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{order.order_number}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {order.customer_name}
                        {isVibeAdmin && ` • ${order.companies.name}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Order Date: {new Date(order.order_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/production/${order.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Stages
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
