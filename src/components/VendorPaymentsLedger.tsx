import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { Download, CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

interface VendorPayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  vendor_po: {
    po_number: string;
    vendors: { name: string } | null;
  } | null;
}

export function VendorPaymentsLedger() {
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_po_payments')
      .select(`
        id,
        amount,
        payment_date,
        payment_method,
        reference_number,
        notes,
        vendor_pos!vendor_po_payments_vendor_po_id_fkey (
          po_number,
          vendors (name)
        )
      `)
      .order('payment_date', { ascending: false });

    if (!error && data) {
      // Transform the data to match our interface
      const transformedData = data.map((payment: any) => ({
        ...payment,
        vendor_po: payment.vendor_pos
      }));
      setPayments(transformedData);
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      wire: 'Wire Transfer',
      check: 'Check',
      ach: 'ACH',
      credit_card: 'Credit Card',
      cash: 'Cash',
      other: 'Other'
    };
    return labels[method] || method;
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.vendor_po?.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.vendor_po?.vendors?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.reference_number?.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesDate = true;
    if (dateRange?.from) {
      const paymentDate = new Date(payment.payment_date);
      matchesDate = paymentDate >= dateRange.from;
      if (dateRange.to) {
        matchesDate = matchesDate && paymentDate <= dateRange.to;
      }
    }

    return matchesSearch && matchesDate;
  });

  const totalFiltered = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

  const exportToCSV = () => {
    const headers = ['Date', 'Vendor', 'PO Number', 'Method', 'Reference', 'Amount', 'Notes'];
    const rows = filteredPayments.map(p => [
      new Date(p.payment_date).toLocaleDateString(),
      p.vendor_po?.vendors?.name || '-',
      p.vendor_po?.po_number || '-',
      getPaymentMethodLabel(p.payment_method),
      p.reference_number || '-',
      p.amount.toFixed(2),
      p.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Payment Ledger</CardTitle>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendor, PO, or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal min-w-[200px]", !dateRange && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
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
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between text-sm bg-muted/50 p-3 rounded-lg">
          <span className="text-muted-foreground">
            Showing {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
          </span>
          <span className="font-semibold">Total: {formatCurrency(totalFiltered)}</span>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading payments...
                  </TableCell>
                </TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {payment.vendor_po?.vendors?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {payment.vendor_po?.po_number || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getPaymentMethodLabel(payment.payment_method)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.reference_number || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
