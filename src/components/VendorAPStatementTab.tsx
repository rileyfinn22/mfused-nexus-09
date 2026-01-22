import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { Download, CalendarIcon, FileText, TrendingDown, TrendingUp, DollarSign, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

interface VendorPO {
  id: string;
  po_number: string;
  order_date: string;
  total: number;
  final_total: number | null;
  total_paid: number;
  status: string;
  vendors: { name: string } | null;
}

interface VendorPayment {
  id: string;
  vendor_po_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
}

interface Transaction {
  id: string;
  date: string;
  type: 'bill' | 'payment';
  reference: string;
  vendor: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
  ageInDays?: number;
  datePaid?: string | null;
  linkedId: string;
}

export function VendorAPStatementTab() {
  const navigate = useNavigate();
  const [vendorPOs, setVendorPOs] = useState<VendorPO[]>([]);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [posResult, paymentsResult] = await Promise.all([
      supabase
        .from('vendor_pos')
        .select('id, po_number, order_date, total, final_total, total_paid, status, vendors(name)')
        .neq('status', 'draft')
        .order('order_date', { ascending: false }),
      supabase
        .from('vendor_po_payments')
        .select('id, vendor_po_id, amount, payment_date, payment_method, reference_number')
        .order('payment_date', { ascending: false })
    ]);

    if (!posResult.error && posResult.data) {
      setVendorPOs(posResult.data as VendorPO[]);
    }
    if (!paymentsResult.error && paymentsResult.data) {
      setPayments(paymentsResult.data as VendorPayment[]);
    }
    setLoading(false);
  };

  // Summary calculations
  const summary = useMemo(() => {
    const totalBilled = vendorPOs.reduce((sum, po) => sum + (po.final_total ?? po.total ?? 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = totalBilled - totalPaid;
    
    const today = new Date();
    // Calculate overdue as bills older than 30 days with remaining balance
    const overdue = vendorPOs.reduce((sum, po) => {
      if (po.status === 'paid') return sum;
      const balance = (po.final_total ?? po.total ?? 0) - (po.total_paid || 0);
      if (balance <= 0) return sum;
      
      const orderDate = new Date(po.order_date);
      const daysOld = differenceInDays(today, orderDate);
      if (daysOld > 30) {
        return sum + balance;
      }
      return sum;
    }, 0);

    return { totalBilled, totalPaid, outstanding, overdue };
  }, [vendorPOs, payments]);

  // Aging buckets
  const agingBuckets = useMemo(() => {
    const today = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90Plus: 0 };

    vendorPOs.forEach(po => {
      if (po.status === 'paid') return;
      const balance = (po.final_total ?? po.total ?? 0) - (po.total_paid || 0);
      if (balance <= 0) return;

      const orderDate = new Date(po.order_date);
      const daysOld = differenceInDays(today, orderDate);

      if (daysOld <= 30) {
        buckets.current += balance;
      } else if (daysOld <= 60) {
        buckets.days30 += balance;
      } else if (daysOld <= 90) {
        buckets.days60 += balance;
      } else {
        buckets.days90Plus += balance;
      }
    });

    return buckets;
  }, [vendorPOs]);

  // Build transaction ledger
  const transactions = useMemo((): Transaction[] => {
    const txns: Transaction[] = [];

    // Add vendor POs as debits (bills)
    vendorPOs.forEach(po => {
      const total = po.final_total ?? po.total ?? 0;
      const poPayments = payments.filter(p => p.vendor_po_id === po.id);
      const lastPaymentDate = poPayments.length > 0
        ? poPayments.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0].payment_date
        : null;

      const orderDate = new Date(po.order_date);
      const ageInDays = differenceInDays(new Date(), orderDate);
      
      txns.push({
        id: po.id,
        date: po.order_date,
        type: 'bill',
        reference: po.po_number,
        vendor: po.vendors?.name || 'Unknown',
        debit: total,
        credit: 0,
        balance: 0,
        status: po.status,
        ageInDays,
        datePaid: po.status === 'paid' ? lastPaymentDate : null,
        linkedId: po.id,
      });
    });

    // Add payments as credits
    payments.forEach(payment => {
      const relatedPO = vendorPOs.find(po => po.id === payment.vendor_po_id);
      txns.push({
        id: payment.id,
        date: payment.payment_date,
        type: 'payment',
        reference: payment.reference_number || `Payment for ${relatedPO?.po_number || '-'}`,
        vendor: relatedPO?.vendors?.name || 'Unknown',
        debit: 0,
        credit: payment.amount,
        balance: 0,
        datePaid: payment.payment_date,
        linkedId: payment.vendor_po_id,
      });
    });

    // Sort by date ascending
    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance (AP balance)
    let runningBalance = 0;
    txns.forEach(txn => {
      runningBalance += txn.debit - txn.credit;
      txn.balance = runningBalance;
    });

    return txns;
  }, [vendorPOs, payments]);

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!dateRange?.from) return transactions;
    
    return transactions.filter(txn => {
      const txnDate = new Date(txn.date);
      if (dateRange.from && txnDate < dateRange.from) return false;
      if (dateRange.to && txnDate > dateRange.to) return false;
      return true;
    });
  }, [transactions, dateRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const quickDateRanges = [
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 60 days', days: 60 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Year to date', ytd: true },
  ];

  const handleQuickRange = (range: { days?: number; ytd?: boolean }) => {
    const to = new Date();
    let from: Date;
    if (range.ytd) {
      from = new Date(to.getFullYear(), 0, 1);
    } else {
      from = new Date();
      from.setDate(from.getDate() - (range.days || 30));
    }
    setDateRange({ from, to });
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Reference', 'Vendor', 'Age (Days)', 'Date Paid', 'Debit', 'Credit', 'Balance'];
    const rows = filteredTransactions.map(txn => [
      format(new Date(txn.date), 'MM/dd/yyyy'),
      txn.type === 'bill' ? 'Bill' : 'Payment',
      txn.reference,
      txn.vendor,
      txn.ageInDays !== undefined ? `${txn.ageInDays} days` : '',
      txn.datePaid ? format(new Date(txn.datePaid), 'MM/dd/yyyy') : '',
      txn.debit > 0 ? txn.debit.toFixed(2) : '',
      txn.credit > 0 ? txn.credit.toFixed(2) : '',
      txn.balance.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AP_Statement_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status?: string, ageInDays?: number) => {
    const isOverdue = ageInDays !== undefined && ageInDays > 30 && status !== 'paid';

    if (status === 'paid') {
      return <Badge className="bg-success/10 text-success border-success/20">Paid</Badge>;
    }
    if (isOverdue) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (status === 'partial') {
      return <Badge className="bg-warning/10 text-warning border-warning/20">Partial</Badge>;
    }
    return <Badge variant="outline">Unpaid</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading AP statement...</div>
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
                <p className="text-sm text-muted-foreground">Total Billed</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalBilled)}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(summary.totalPaid)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(summary.outstanding)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(summary.overdue)}</p>
              </div>
              <Clock className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">AP Aging Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm text-muted-foreground">Current (0-30)</p>
              <p className="text-xl font-semibold text-success">{formatCurrency(agingBuckets.current)}</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-muted-foreground">31-60 Days</p>
              <p className="text-xl font-semibold text-warning">{formatCurrency(agingBuckets.days30)}</p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground">61-90 Days</p>
              <p className="text-xl font-semibold text-primary">{formatCurrency(agingBuckets.days60)}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-muted-foreground">90+ Days</p>
              <p className="text-xl font-semibold text-destructive">{formatCurrency(agingBuckets.days90Plus)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Ledger */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-lg">Transaction Ledger</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick date ranges */}
              <div className="flex gap-1">
                {quickDateRanges.map((range) => (
                  <Button
                    key={range.label}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleQuickRange(range)}
                  >
                    {range.label}
                  </Button>
                ))}
              </div>
              
              {/* Date picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Custom range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {dateRange && (
                <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                  Clear
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-4">
            Showing {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Date Paid</TableHead>
                  <TableHead className="text-right">Debit (Owed)</TableHead>
                  <TableHead className="text-right">Credit (Paid)</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((txn) => (
                    <TableRow
                      key={`${txn.type}-${txn.id}`}
                      className={cn(
                        "cursor-pointer hover:bg-muted/40",
                        txn.type === 'payment' && "bg-success/5"
                      )}
                      onClick={() => navigate(`/vendor-pos/${txn.linkedId}`)}
                    >
                      <TableCell>{format(new Date(txn.date), 'MM/dd/yyyy')}</TableCell>
                      <TableCell>
                        {txn.type === 'bill' ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span>Bill</span>
                            {txn.status && getStatusBadge(txn.status, txn.ageInDays)}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-success" />
                            <span className="text-success">Payment</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{txn.reference}</TableCell>
                      <TableCell>{txn.vendor}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {txn.ageInDays !== undefined ? `${txn.ageInDays} days` : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {txn.datePaid ? format(new Date(txn.datePaid), 'MM/dd/yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {txn.debit > 0 ? formatCurrency(txn.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-success">
                        {txn.credit > 0 ? formatCurrency(txn.credit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(txn.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
