import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Truck, 
  Receipt,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface JobCostingSummaryProps {
  orderId: string;
  orderTotal: number;
  companyId: string;
  customerCompanyId?: string;
}

interface VendorPO {
  id: string;
  po_number: string;
  po_type: string;
  total: number;
  status: string;
  vendor: { name: string } | null;
  order_date: string;
  description?: string;
  expense_category?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total: number;
  status: string;
  total_paid: number;
  invoice_date: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  invoice_id: string;
}

export const JobCostingSummary = ({ orderId, orderTotal, companyId, customerCompanyId }: JobCostingSummaryProps) => {
  const navigate = useNavigate();
  const [vendorPOs, setVendorPOs] = useState<VendorPO[]>([]);
  const [expenses, setExpenses] = useState<VendorPO[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>("summary");

  useEffect(() => {
    fetchJobData();
  }, [orderId, customerCompanyId]);

  const fetchJobData = async () => {
    setLoading(true);
    
    // Fetch vendor POs linked to this order
    const { data: posData } = await supabase
      .from('vendor_pos')
      .select('*, vendor:vendors(name)')
      .eq('order_id', orderId)
      .order('order_date', { ascending: false });
    
    // Fetch expense POs linked to the customer company (if exists)
    let expensesData: any[] = [];
    if (customerCompanyId) {
      const { data } = await supabase
        .from('vendor_pos')
        .select('*, vendor:vendors(name)')
        .eq('customer_company_id', customerCompanyId)
        .eq('po_type', 'expense')
        .order('order_date', { ascending: false });
      expensesData = data || [];
    }
    
    // Fetch invoices for this order
    const { data: invoicesData } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false });
    
    // Fetch payments for these invoices
    const invoiceIds = invoicesData?.map(inv => inv.id) || [];
    let paymentsData: Payment[] = [];
    if (invoiceIds.length > 0) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });
      paymentsData = data || [];
    }
    
    setVendorPOs(posData?.filter(po => po.po_type === 'production') || []);
    setExpenses([...(posData?.filter(po => po.po_type === 'expense') || []), ...expensesData]);
    setInvoices(invoicesData || []);
    setPayments(paymentsData);
    setLoading(false);
  };

  // Calculate totals
  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalProductionCosts = vendorPOs.reduce((sum, po) => sum + Number(po.total), 0);
  const totalExpenses = expenses.reduce((sum, po) => sum + Number(po.total), 0);
  const totalCosts = totalProductionCosts + totalExpenses;
  const grossProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const outstandingBalance = totalRevenue - totalPaid;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
        return 'bg-green-500 text-white';
      case 'pending':
      case 'draft':
        return 'bg-yellow-500 text-white';
      case 'sent':
      case 'in_progress':
        return 'bg-blue-500 text-white';
      case 'overdue':
        return 'bg-red-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Job Costing Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-background rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
            <p className="text-xl font-bold text-green-600">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {invoices.length} invoice(s)
            </p>
          </div>
          <div className="bg-background rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Total Costs</p>
            <p className="text-xl font-bold text-red-600">${totalCosts.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {vendorPOs.length + expenses.length} PO(s)
            </p>
          </div>
          <div className="bg-background rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Gross Profit</p>
            <p className={`text-xl font-bold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${grossProfit.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 text-xs">
              {grossProfit >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {profitMargin.toFixed(1)}% margin
              </span>
            </div>
          </div>
          <div className="bg-background rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
            <p className={`text-xl font-bold ${outstandingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              ${outstandingBalance.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              ${totalPaid.toFixed(2)} collected
            </p>
          </div>
        </div>

        <Separator />

        {/* Production POs Section */}
        <div className="space-y-2">
          <button 
            onClick={() => toggleSection('production')}
            className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-lg p-2 -mx-2"
          >
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <span className="font-medium">Production POs</span>
              <Badge variant="secondary">{vendorPOs.length}</Badge>
              <span className="text-sm text-muted-foreground ml-2">
                ${totalProductionCosts.toFixed(2)}
              </span>
            </div>
            {expandedSection === 'production' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          {expandedSection === 'production' && (
            <div className="pl-6 space-y-2">
              {vendorPOs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No production POs linked to this order</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorPOs.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                        <TableCell>{po.vendor?.name || 'Unknown'}</TableCell>
                        <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(po.status)}>{po.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">${Number(po.total).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigate(`/vendor-pos/${po.id}`)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>

        {/* Expenses Section */}
        <div className="space-y-2">
          <button 
            onClick={() => toggleSection('expenses')}
            className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-lg p-2 -mx-2"
          >
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="font-medium">Expenses</span>
              <Badge variant="secondary">{expenses.length}</Badge>
              <span className="text-sm text-muted-foreground ml-2">
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
            {expandedSection === 'expenses' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          {expandedSection === 'expenses' && (
            <div className="pl-6 space-y-2">
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No expenses linked to this job</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                        <TableCell>{po.vendor?.name || 'Unknown'}</TableCell>
                        <TableCell>{po.expense_category || '-'}</TableCell>
                        <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right font-medium">${Number(po.total).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigate(`/vendor-pos/${po.id}`)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>

        {/* Invoices & Payments Section */}
        <div className="space-y-2">
          <button 
            onClick={() => toggleSection('invoices')}
            className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-lg p-2 -mx-2"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-500" />
              <span className="font-medium">Invoices & Payments</span>
              <Badge variant="secondary">{invoices.length}</Badge>
              <span className="text-sm text-muted-foreground ml-2">
                ${totalRevenue.toFixed(2)} billed / ${totalPaid.toFixed(2)} collected
              </span>
            </div>
            {expandedSection === 'invoices' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          {expandedSection === 'invoices' && (
            <div className="pl-6 space-y-2">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No invoices for this order</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(inv => {
                      const invPayments = payments.filter(p => p.invoice_id === inv.id);
                      const totalInvPaid = invPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                      const balance = Number(inv.total) - totalInvPaid;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                          <TableCell>{new Date(inv.invoice_date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(inv.status)}>{inv.status.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">${Number(inv.total).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600">${totalInvPaid.toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            ${balance.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/invoices/${inv.id}`)}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
