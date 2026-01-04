import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, DollarSign, TrendingUp, TrendingDown, Search, ExternalLink, Download } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface JobCostingData {
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderDate: string;
  status: string;
  orderTotal: number;
  invoicedTotal: number;
  totalPaid: number;
  productionCosts: number;
  expenses: number;
  totalCosts: number;
  grossProfit: number;
  profitMargin: number;
}

export default function JobCostingReport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobData, setJobData] = useState<JobCostingData[]>([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalCosts: 0,
    totalProfit: 0,
    avgMargin: 0,
    jobCount: 0,
  });

  useEffect(() => {
    loadJobCostingData();
  }, [dateFrom, dateTo]);

  const loadJobCostingData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRole } = await supabase
        .from("user_roles")
        .select("company_id, role")
        .eq("user_id", user.id)
        .single();

      if (!userRole || userRole.role !== 'vibe_admin') {
        toast({
          title: "Access Denied",
          description: "Only Vibe admins can access job costing reports",
          variant: "destructive",
        });
        return;
      }

      // Fetch orders with date filters
      let ordersQuery = supabase
        .from("orders")
        .select("id, order_number, customer_name, order_date, status, total, company_id")
        .is("deleted_at", null)
        .order("order_date", { ascending: false });

      if (dateFrom) {
        ordersQuery = ordersQuery.gte("order_date", dateFrom.toISOString().split('T')[0]);
      }
      if (dateTo) {
        ordersQuery = ordersQuery.lte("order_date", dateTo.toISOString().split('T')[0]);
      }

      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      if (!orders || orders.length === 0) {
        setJobData([]);
        setSummary({ totalRevenue: 0, totalCosts: 0, totalProfit: 0, avgMargin: 0, jobCount: 0 });
        setLoading(false);
        return;
      }

      const orderIds = orders.map(o => o.id);

      // Fetch invoices for these orders
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, order_id, total")
        .in("order_id", orderIds)
        .is("deleted_at", null);

      // Fetch vendor POs for these orders
      const { data: vendorPOs } = await supabase
        .from("vendor_pos")
        .select("id, order_id, total, po_type")
        .in("order_id", orderIds);

      // Fetch payments for these invoices
      const invoiceIds = invoices?.map(i => i.id) || [];
      let payments: any[] = [];
      if (invoiceIds.length > 0) {
        const { data } = await supabase
          .from("payments")
          .select("invoice_id, amount")
          .in("invoice_id", invoiceIds);
        payments = data || [];
      }

      // Calculate job costing for each order
      const jobCostingData: JobCostingData[] = orders.map(order => {
        const orderInvoices = invoices?.filter(inv => inv.order_id === order.id) || [];
        const orderPOs = vendorPOs?.filter(po => po.order_id === order.id) || [];
        const orderPayments = payments.filter(p => orderInvoices.some(inv => inv.id === p.invoice_id));

        const invoicedTotal = orderInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
        const totalPaid = orderPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const productionCosts = orderPOs.filter(po => po.po_type === 'production').reduce((sum, po) => sum + Number(po.total), 0);
        const expenses = orderPOs.filter(po => po.po_type === 'expense').reduce((sum, po) => sum + Number(po.total), 0);
        const totalCosts = productionCosts + expenses;
        const grossProfit = invoicedTotal - totalCosts;
        const profitMargin = invoicedTotal > 0 ? (grossProfit / invoicedTotal) * 100 : 0;

        return {
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          orderDate: order.order_date,
          status: order.status,
          orderTotal: Number(order.total),
          invoicedTotal,
          totalPaid,
          productionCosts,
          expenses,
          totalCosts,
          grossProfit,
          profitMargin,
        };
      });

      setJobData(jobCostingData);

      // Calculate summary
      const totalRevenue = jobCostingData.reduce((sum, j) => sum + j.invoicedTotal, 0);
      const totalCosts = jobCostingData.reduce((sum, j) => sum + j.totalCosts, 0);
      const totalProfit = totalRevenue - totalCosts;
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      setSummary({
        totalRevenue,
        totalCosts,
        totalProfit,
        avgMargin,
        jobCount: jobCostingData.length,
      });

    } catch (error: any) {
      toast({
        title: "Error loading job costing data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobData.filter(job =>
    job.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = ["Order #", "Customer", "Date", "Status", "Revenue", "Production Costs", "Expenses", "Total Costs", "Profit", "Margin %"];
    const rows = filteredJobs.map(job => [
      job.orderNumber,
      job.customerName,
      job.orderDate,
      job.status,
      job.invoicedTotal.toFixed(2),
      job.productionCosts.toFixed(2),
      job.expenses.toFixed(2),
      job.totalCosts.toFixed(2),
      job.grossProfit.toFixed(2),
      job.profitMargin.toFixed(1),
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-costing-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Job Costing Report</h1>
          <p className="text-muted-foreground">Analyze profitability across all jobs/orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "PPP") : "From date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "PPP") : "To date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${summary.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{summary.jobCount} jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${summary.totalCosts.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            {summary.totalProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${summary.totalProfit.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
            {summary.avgMargin >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.avgMargin.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.jobCount}</div>
            <p className="text-xs text-muted-foreground">in period</p>
          </CardContent>
        </Card>
      </div>

      {/* Job Costing Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Job Profitability</CardTitle>
              <CardDescription>Revenue, costs, and profit margin by order</CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Prod. Costs</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.orderId}>
                      <TableCell className="font-mono text-sm">{job.orderNumber}</TableCell>
                      <TableCell className="font-medium">{job.customerName}</TableCell>
                      <TableCell>{new Date(job.orderDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {job.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        ${job.invoicedTotal.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ${job.productionCosts.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        ${job.expenses.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${job.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${job.grossProfit.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={job.profitMargin >= 20 ? 'bg-green-500' : job.profitMargin >= 0 ? 'bg-yellow-500' : 'bg-red-500'}>
                          {job.profitMargin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/orders/${job.orderId}`)}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredJobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No jobs found for selected criteria
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
