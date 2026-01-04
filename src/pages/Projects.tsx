import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  FolderKanban, 
  RefreshCw, 
  Plus,
  TrendingUp,
  DollarSign,
  FileText,
  Receipt
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ProjectSummary {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
  order_date: string;
  due_date: string | null;
  total: number;
  qb_project_id: string | null;
  company_id: string;
  // Computed fields
  invoice_count: number;
  po_count: number;
  total_invoiced: number;
  total_paid: number;
  total_costs: number;
  profit: number;
}

const Projects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!userRole) return;

      // Fetch orders with related data
      const { data: orders, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          status,
          order_date,
          due_date,
          total,
          qb_project_id,
          company_id
        `)
        .eq("company_id", userRole.company_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch related data for each order
      const projectsWithData = await Promise.all(
        (orders || []).map(async (order) => {
          // Get invoices
          const { data: invoices } = await supabase
            .from("invoices")
            .select("id, total, total_paid")
            .eq("order_id", order.id)
            .is("deleted_at", null);

          // Get vendor POs
          const { data: vendorPOs } = await supabase
            .from("vendor_pos")
            .select("id, total")
            .eq("order_id", order.id);

          const totalInvoiced = invoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) || 0;
          const totalPaid = invoices?.reduce((sum, inv) => sum + (inv.total_paid || 0), 0) || 0;
          const totalCosts = vendorPOs?.reduce((sum, po) => sum + (po.total || 0), 0) || 0;

          return {
            ...order,
            invoice_count: invoices?.length || 0,
            po_count: vendorPOs?.length || 0,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            total_costs: totalCosts,
            profit: totalInvoiced - totalCosts,
          };
        })
      );

      setProjects(projectsWithData);
    } catch (error) {
      console.error("Error loading projects:", error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncFromQBO = async () => {
    setSyncing(true);
    toast({
      title: "Sync Started",
      description: "Pulling latest data from QuickBooks...",
    });

    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-sync-projects', {
        body: {}
      });

      if (error) throw error;

      if (data?.success) {
        const { synced } = data;
        const parts = [];
        if (synced.companies) parts.push(`${synced.companies} companies`);
        if (synced.projects) parts.push(`${synced.projects} projects`);
        if (synced.estimates) parts.push(`${synced.estimates} estimates`);
        if (synced.invoices) parts.push(`${synced.invoices} invoices`);
        if (synced.payments) parts.push(`${synced.payments} payments`);
        if (synced.purchaseOrders) parts.push(`${synced.purchaseOrders} POs`);
        if (synced.bills) parts.push(`${synced.bills} bills`);
        
        toast({
          title: "Sync Complete",
          description: parts.length > 0 
            ? `Synced ${parts.join(', ')} from QuickBooks` 
            : "No new data to sync from QuickBooks",
        });
      } else if (data?.error) {
        toast({
          title: "Sync Issue",
          description: data.error,
          variant: "destructive",
        });
      }

      // Refresh the projects list
      await loadProjects();
    } catch (error: any) {
      console.error("Error syncing from QuickBooks:", error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync from QuickBooks",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Derive status based on financial data if order status is just 'pending'
  const deriveProjectStatus = (project: ProjectSummary): string => {
    const rawStatus = project.status?.toLowerCase() || '';
    
    // If status is already meaningful, normalize it
    if (rawStatus === 'completed' || rawStatus === 'complete' || rawStatus === 'closed') {
      return 'completed';
    }
    if (rawStatus === 'cancelled' || rawStatus === 'canceled') {
      return 'cancelled';
    }
    if (rawStatus === 'in_progress' || rawStatus === 'in progress' || rawStatus === 'in production') {
      return 'in_progress';
    }
    
    // For 'pending' or unknown statuses, derive from financial data
    if (project.total_invoiced > 0 && project.total_paid >= project.total_invoiced) {
      return 'completed'; // Fully paid = completed
    }
    if (project.total_invoiced > 0 || project.po_count > 0) {
      return 'in_progress'; // Has invoices or POs = in progress
    }
    
    return 'pending';
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
    const derivedStatus = deriveProjectStatus(project);
    const matchesStatus = statusFilter === "all" || derivedStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in_progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Summary stats
  const totalRevenue = filteredProjects.reduce((sum, p) => sum + p.total_invoiced, 0);
  const totalCosts = filteredProjects.reduce((sum, p) => sum + p.total_costs, 0);
  const totalProfit = filteredProjects.reduce((sum, p) => sum + p.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage and track all your projects in one place
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncFromQBO} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sync from QB
          </Button>
          <Button onClick={() => navigate("/orders/create")}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCosts.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${totalProfit.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgMargin >= 0 ? "text-green-500" : "text-red-500"}`}>
              {avgMargin.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No projects found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first project to get started"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead className="text-center">POs</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-center">QB Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => {
                  const margin = project.total_invoiced > 0 
                    ? (project.profit / project.total_invoiced) * 100 
                    : 0;
                  const derivedStatus = deriveProjectStatus(project);
                  return (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">{project.order_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(project.order_date), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>{project.customer_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(derivedStatus)}>
                          {derivedStatus.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{project.invoice_count}</TableCell>
                      <TableCell className="text-center">{project.po_count}</TableCell>
                      <TableCell className="text-right">
                        ${project.total_invoiced.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${project.total_costs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={project.profit >= 0 ? "text-green-500" : "text-red-500"}>
                          ${project.profit.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {margin.toFixed(1)}%
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {project.qb_project_id ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                            Synced
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Local
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Projects;
