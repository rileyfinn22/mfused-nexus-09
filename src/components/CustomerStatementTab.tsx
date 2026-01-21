import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileSpreadsheet, DollarSign, Clock, AlertTriangle, FileText, ShoppingCart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface CustomerStatementTabProps {
  companyId: string;
  companyName: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  total_paid: number | null;
  status: string;
  parent_invoice_id: string | null;
  description: string | null;
  order_id: string;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  invoice?: Invoice;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  total: number;
  status: string;
  customer_name: string;
}

interface Transaction {
  id: string;
  date: string;
  type: 'invoice' | 'payment' | 'open_order';
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
  dueDate?: string | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const parseDateAsLocalDay = (dateString: string): Date => {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const CustomerStatementTab = ({ companyId, companyName }: CustomerStatementTabProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subMonths(startOfMonth(new Date()), 3),
    to: endOfMonth(new Date()),
  });

  useEffect(() => {
    fetchStatementData();
  }, [companyId]);

  const fetchStatementData = async () => {
    setLoading(true);
    try {
      // Fetch all invoices for this company (non-deleted)
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, total, total_paid, status, parent_invoice_id, description, order_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: true });

      if (invoicesError) throw invoicesError;

      // Fetch all payments for this company
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('id, invoice_id, amount, payment_date, payment_method, reference_number')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: true });

      if (paymentsError) throw paymentsError;

      // Fetch open orders (not yet invoiced or partially invoiced)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, order_date, total, status, customer_name')
        .eq('company_id', companyId)
        .in('status', ['pending', 'in production', 'artwork', 'approved'])
        .is('deleted_at', null)
        .order('order_date', { ascending: false });

      if (ordersError) throw ordersError;

      setInvoices(invoicesData || []);
      setPayments(paymentsData || []);
      setOpenOrders(ordersData || []);
    } catch (error) {
      console.error('Error fetching statement data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter invoices to only count "billable" ones (child invoices if they exist, otherwise blanket)
  const billableInvoices = useMemo(() => {
    const childInvoices = invoices.filter(inv => inv.parent_invoice_id !== null);
    // If there are child invoices, only count those; otherwise count all
    if (childInvoices.length > 0) {
      // Group by parent and only include children
      const parentIds = new Set(childInvoices.map(inv => inv.parent_invoice_id));
      return invoices.filter(inv => 
        inv.parent_invoice_id !== null || !parentIds.has(inv.id)
      );
    }
    return invoices;
  }, [invoices]);

  // Calculate aging buckets
  const agingBuckets = useMemo(() => {
    const today = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90Plus: 0 };

    billableInvoices.forEach(invoice => {
      const balance = invoice.total - (invoice.total_paid || 0);
      if (balance <= 0) return;

      if (!invoice.due_date) {
        buckets.current += balance;
        return;
      }

      const dueDate = parseDateAsLocalDay(invoice.due_date);
      const daysOverdue = differenceInDays(today, dueDate);

      if (daysOverdue <= 0) {
        buckets.current += balance;
      } else if (daysOverdue <= 30) {
        buckets.days30 += balance;
      } else if (daysOverdue <= 60) {
        buckets.days60 += balance;
      } else {
        buckets.days90Plus += balance;
      }
    });

    return buckets;
  }, [billableInvoices]);

  // Calculate summary totals
  const summaryTotals = useMemo(() => {
    const totalBilled = billableInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = billableInvoices.reduce((sum, inv) => sum + (inv.total_paid || 0), 0);
    const outstanding = totalBilled - totalPaid;
    const overdue = agingBuckets.days30 + agingBuckets.days60 + agingBuckets.days90Plus;

    return { totalBilled, totalPaid, outstanding, overdue };
  }, [billableInvoices, agingBuckets]);

  // Build transaction ledger
  const transactions = useMemo((): Transaction[] => {
    const txns: Transaction[] = [];

    // Add invoices as debits (charges)
    billableInvoices.forEach(invoice => {
      txns.push({
        id: invoice.id,
        date: invoice.invoice_date,
        type: 'invoice',
        description: invoice.description || 'Invoice',
        reference: invoice.invoice_number,
        debit: invoice.total,
        credit: 0,
        balance: 0,
        status: invoice.status,
        dueDate: invoice.due_date,
      });
    });

    // Add payments as credits
    payments.forEach(payment => {
      const relatedInvoice = invoices.find(inv => inv.id === payment.invoice_id);
      txns.push({
        id: payment.id,
        date: payment.payment_date,
        type: 'payment',
        description: `Payment - ${payment.payment_method}${payment.reference_number ? ` (${payment.reference_number})` : ''}`,
        reference: relatedInvoice?.invoice_number || 'N/A',
        debit: 0,
        credit: payment.amount,
        balance: 0,
      });
    });

    // Sort by date ascending
    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let runningBalance = 0;
    txns.forEach(txn => {
      runningBalance += txn.debit - txn.credit;
      txn.balance = runningBalance;
    });

    return txns;
  }, [billableInvoices, payments, invoices]);

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return transactions;

    return transactions.filter(txn => {
      const txnDate = parseDateAsLocalDay(txn.date);
      if (dateRange.from && dateRange.to) {
        return isWithinInterval(txnDate, { start: dateRange.from, end: dateRange.to });
      }
      if (dateRange.from) {
        return txnDate >= dateRange.from;
      }
      if (dateRange.to) {
        return txnDate <= dateRange.to;
      }
      return true;
    });
  }, [transactions, dateRange]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = filteredTransactions.map(txn => [
      format(parseDateAsLocalDay(txn.date), 'MM/dd/yyyy'),
      txn.type === 'invoice' ? 'Invoice' : txn.type === 'payment' ? 'Payment' : 'Open Order',
      txn.reference,
      txn.description,
      txn.debit > 0 ? txn.debit.toFixed(2) : '',
      txn.credit > 0 ? txn.credit.toFixed(2) : '',
      txn.balance.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_statement_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string, dueDate?: string | null) => {
    const today = new Date();
    const isOverdue = dueDate && parseDateAsLocalDay(dueDate) < today && status !== 'paid';

    if (status === 'paid') {
      return <Badge className="bg-success/10 text-success border-success/20">Paid</Badge>;
    }
    if (isOverdue) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (status === 'partial') {
      return <Badge className="bg-warning/10 text-warning border-warning/20">Partial</Badge>;
    }
    return <Badge variant="outline">Open</Badge>;
  };

  const quickDateRanges = [
    { label: 'This Month', from: startOfMonth(new Date()), to: endOfMonth(new Date()) },
    { label: 'Last 30 Days', from: subDays(new Date(), 30), to: new Date() },
    { label: 'Last 90 Days', from: subDays(new Date(), 90), to: new Date() },
    { label: 'Year to Date', from: new Date(new Date().getFullYear(), 0, 1), to: new Date() },
    { label: 'All Time', from: undefined, to: undefined },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Open</p>
                <p className="text-2xl font-bold">{formatCurrency(summaryTotals.outstanding)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Billed</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(agingBuckets.current)}</p>
              </div>
              <Clock className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(summaryTotals.overdue)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(summaryTotals.totalPaid)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aging Summary</CardTitle>
          <CardDescription>Outstanding balances by days past due</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm text-muted-foreground mb-1">Current</p>
              <p className="text-xl font-semibold text-success">{formatCurrency(agingBuckets.current)}</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-muted-foreground mb-1">1-30 Days</p>
              <p className="text-xl font-semibold text-warning">{formatCurrency(agingBuckets.days30)}</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-muted-foreground mb-1">31-60 Days</p>
              <p className="text-xl font-semibold text-warning">{formatCurrency(agingBuckets.days60)}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-muted-foreground mb-1">90+ Days</p>
              <p className="text-xl font-semibold text-destructive">{formatCurrency(agingBuckets.days90Plus)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open Orders Section */}
      {openOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Open Orders (Not Yet Invoiced)
            </CardTitle>
            <CardDescription>Orders in progress that haven't been fully invoiced</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openOrders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>{format(parseDateAsLocalDay(order.order_date), 'MM/dd/yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(order.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Transaction Ledger */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Transaction Ledger
              </CardTitle>
              <CardDescription>
                Chronological record of invoices and payments
                {dateRange.from && dateRange.to && (
                  <span className="ml-2">
                    ({format(dateRange.from, 'MM/dd/yyyy')} - {format(dateRange.to, 'MM/dd/yyyy')})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Date Range
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {quickDateRanges.map(range => (
                        <Button
                          key={range.label}
                          variant="outline"
                          size="sm"
                          onClick={() => setDateRange({ from: range.from, to: range.to })}
                          className={cn(
                            dateRange.from?.getTime() === range.from?.getTime() &&
                            dateRange.to?.getTime() === range.to?.getTime() &&
                            "bg-primary text-primary-foreground"
                          )}
                        >
                          {range.label}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">From</p>
                        <Calendar
                          mode="single"
                          selected={dateRange.from}
                          onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                          className="rounded-md border"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">To</p>
                        <Calendar
                          mode="single"
                          selected={dateRange.to}
                          onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                          className="rounded-md border"
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions found for the selected date range</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map(txn => (
                  <TableRow key={`${txn.type}-${txn.id}`}>
                    <TableCell>{format(parseDateAsLocalDay(txn.date), 'MM/dd/yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {txn.type === 'invoice' ? (
                          <TrendingUp className="h-4 w-4 text-destructive" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-success" />
                        )}
                        <span className="capitalize">{txn.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{txn.reference}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{txn.description}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {txn.debit > 0 ? formatCurrency(txn.debit) : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {txn.credit > 0 ? formatCurrency(txn.credit) : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(txn.balance)}</TableCell>
                    <TableCell>
                      {txn.type === 'invoice' && txn.status && getStatusBadge(txn.status, txn.dueDate)}
                      {txn.type === 'payment' && (
                        <Badge className="bg-success/10 text-success border-success/20">Applied</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
