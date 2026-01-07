import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FolderKanban, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProjectSummary {
  id: string;
  order_number: string;
  customer_name: string;
  company_id: string;
  company_name: string;
  description: string | null;
  order_date: string;
  status: string;
  total_revenue: number;
  total_paid: number;
  total_costs: number;
  total_costs_paid: number;
  profit: number;
  invoice_count: number;
  vendor_po_count: number;
}

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      // Fetch orders with their related data
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          company_id,
          description,
          order_date,
          status,
          companies(name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // For each order, fetch invoices, payments, and vendor POs
      const projectPromises = (orders || []).map(async (order) => {
        // Fetch invoices
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, total, total_paid, status')
          .eq('order_id', order.id)
          .is('deleted_at', null);

        // Fetch vendor POs
        const { data: vendorPOs } = await supabase
          .from('vendor_pos')
          .select('id, total, total_paid')
          .eq('order_id', order.id);

        const totalRevenue = (invoices || []).reduce((sum, inv) => sum + (inv.total || 0), 0);
        const totalPaid = (invoices || []).reduce((sum, inv) => sum + (inv.total_paid || 0), 0);
        const totalCosts = (vendorPOs || []).reduce((sum, po) => sum + (po.total || 0), 0);
        const totalCostsPaid = (vendorPOs || []).reduce((sum, po) => sum + (po.total_paid || 0), 0);

        return {
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          company_id: order.company_id,
          company_name: (order.companies as any)?.name || 'Unknown',
          description: order.description,
          order_date: order.order_date,
          status: order.status,
          total_revenue: totalRevenue,
          total_paid: totalPaid,
          total_costs: totalCosts,
          total_costs_paid: totalCostsPaid,
          profit: totalRevenue - totalCosts,
          invoice_count: invoices?.length || 0,
          vendor_po_count: vendorPOs?.length || 0,
        };
      });

      const projectData = await Promise.all(projectPromises);
      setProjects(projectData);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => 
    project.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = filteredProjects.reduce((acc, project) => ({
    revenue: acc.revenue + project.total_revenue,
    paid: acc.paid + project.total_paid,
    costs: acc.costs + project.total_costs,
    profit: acc.profit + project.profit,
  }), { revenue: 0, paid: 0, costs: 0, profit: 0 });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getProfitColor = (profit: number) => {
    if (profit > 0) return "text-green-600";
    if (profit < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-muted-foreground text-sm">Job costing and P&L by order</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Costs</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.costs)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Profit</p>
                <p className={`text-2xl font-bold ${getProfitColor(totals.profit)}`}>
                  {formatCurrency(totals.profit)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-success/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Costs</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((project) => {
                const profit = project.profit;
                const revenue = project.total_revenue;
                const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

                return (
                  <TableRow 
                    key={project.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">{project.order_number}</TableCell>
                    <TableCell>{project.company_name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {project.description || '-'}
                    </TableCell>
                    <TableCell>{new Date(project.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={project.status === 'completed' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(revenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(project.total_costs)}</TableCell>
                    <TableCell className={`text-right font-medium ${getProfitColor(profit)}`}>
                      {formatCurrency(profit)}
                    </TableCell>
                    <TableCell className={`text-right ${getProfitColor(profit)}`}>
                      {margin.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProjects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No projects found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Projects;
