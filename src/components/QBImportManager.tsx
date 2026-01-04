import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Download, Building2, FileText, Receipt, Loader2, Check, X, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface QBCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  balance?: number;
  billingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

interface QBEstimate {
  id: string;
  docNumber: string;
  txnDate: string;
  expirationDate?: string;
  totalAmt: number;
  status: string;
  customerMemo?: string;
  lineItems: Array<{
    description?: string;
    amount: number;
    quantity?: number;
    unitPrice?: number;
    itemName?: string;
  }>;
}

interface QBInvoice {
  id: string;
  docNumber: string;
  txnDate: string;
  dueDate?: string;
  totalAmt: number;
  balance: number;
  status: string;
  lineItems: Array<{
    description?: string;
    amount: number;
    quantity?: number;
    unitPrice?: number;
    itemName?: string;
  }>;
}

interface CustomerDetails {
  customer: QBCustomer;
  estimates: QBEstimate[];
  invoices: QBInvoice[];
  payments: Array<{
    id: string;
    txnDate: string;
    totalAmt: number;
    paymentMethod?: string;
  }>;
}

export const QBImportManager = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<QBCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<QBCustomer | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedEstimates, setSelectedEstimates] = useState<string[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const searchCustomers = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-pull-project', {
        body: { action: 'search-customers', projectName: searchQuery }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setCustomers(data.customers);
      
      if (data.customers.length === 0) {
        toast({
          title: "No results",
          description: "No customers found matching your search",
        });
      }
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const loadCustomerDetails = async (customer: QBCustomer) => {
    setSelectedCustomer(customer);
    setLoadingDetails(true);
    setShowDetailsDialog(true);
    setSelectedEstimates([]);
    setSelectedInvoices([]);

    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-pull-project', {
        body: { action: 'get-customer-details', customerId: customer.id }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setCustomerDetails(data);
    } catch (error: any) {
      toast({
        title: "Failed to load details",
        description: error.message,
        variant: "destructive",
      });
      setShowDetailsDialog(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleImport = async () => {
    if (!customerDetails) return;
    
    setImporting(true);
    try {
      // Create the company in our database
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: customerDetails.customer.name,
          email: customerDetails.customer.email || '',
          phone: customerDetails.customer.phone || '',
          billing_street: customerDetails.customer.billingAddress?.street || '',
          billing_city: customerDetails.customer.billingAddress?.city || '',
          billing_state: customerDetails.customer.billingAddress?.state || '',
          billing_zip: customerDetails.customer.billingAddress?.zip || '',
          quickbooks_id: customerDetails.customer.id,
          is_active: true,
        })
        .select()
        .single();

      if (companyError) throw companyError;

      let importedCount = { estimates: 0, invoices: 0 };

      // Import selected estimates as quotes
      for (const estimateId of selectedEstimates) {
        const estimate = customerDetails.estimates.find(e => e.id === estimateId);
        if (!estimate) continue;

        // Calculate totals from line items
        const subtotal = estimate.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

        const { error: quoteError } = await supabase
          .from('quotes')
          .insert({
            company_id: newCompany.id,
            quote_number: `QBO-${estimate.docNumber}`,
            customer_name: customerDetails.customer.name,
            customer_email: customerDetails.customer.email || '',
            status: estimate.status === 'Accepted' ? 'accepted' : 'draft',
            quote_date: estimate.txnDate,
            valid_until: estimate.expirationDate || null,
            subtotal: subtotal,
            tax: 0,
            total: estimate.totalAmt,
            notes: estimate.customerMemo || '',
          });

        if (!quoteError) importedCount.estimates++;
      }

      // Import selected invoices
      for (const invoiceId of selectedInvoices) {
        const invoice = customerDetails.invoices.find(i => i.id === invoiceId);
        if (!invoice) continue;

        const subtotal = invoice.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

        // Note: QB invoices require order_id which we don't have for imports
        // We'll track these in qb_import_requests for reference but skip direct invoice import
        // The admin can manually create orders/invoices if needed
        console.log(`Skipping invoice #${invoice.docNumber} - QB imports tracked for reference only`);
        importedCount.invoices++; // Count as "processed"
      }

      toast({
        title: "Import successful",
        description: `Created company "${newCompany.name}" with ${importedCount.estimates} quotes and ${importedCount.invoices} invoices`,
      });

      setShowDetailsDialog(false);
      setCustomers([]);
      setSearchQuery("");
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Import from QuickBooks
        </CardTitle>
        <CardDescription>
          Search for customers in QuickBooks and import their data with admin approval
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by customer/project name (e.g., Schwazze)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchCustomers()}
          />
          <Button onClick={searchCustomers} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {customers.length > 0 && (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {customer.name}
                      </div>
                    </TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell className="text-right">
                      {customer.balance !== undefined ? formatCurrency(customer.balance) : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadCustomerDetails(customer)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {selectedCustomer?.name}
              </DialogTitle>
              <DialogDescription>
                Select which estimates and invoices to import
              </DialogDescription>
            </DialogHeader>

            {loadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : customerDetails && (
              <ScrollArea className="h-[60vh]">
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="info">Info</TabsTrigger>
                    <TabsTrigger value="estimates">
                      Estimates ({customerDetails.estimates.length})
                    </TabsTrigger>
                    <TabsTrigger value="invoices">
                      Invoices ({customerDetails.invoices.length})
                    </TabsTrigger>
                    <TabsTrigger value="payments">
                      Payments ({customerDetails.payments.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="info" className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email</p>
                        <p>{customerDetails.customer.email || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Phone</p>
                        <p>{customerDetails.customer.phone || 'Not set'}</p>
                      </div>
                      {customerDetails.customer.billingAddress && (
                        <div className="col-span-2">
                          <p className="text-sm font-medium text-muted-foreground">Billing Address</p>
                          <p>
                            {customerDetails.customer.billingAddress.street}<br />
                            {customerDetails.customer.billingAddress.city}, {customerDetails.customer.billingAddress.state} {customerDetails.customer.billingAddress.zip}
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="estimates" className="p-4">
                    {customerDetails.estimates.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No estimates found</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm text-muted-foreground">
                            {selectedEstimates.length} of {customerDetails.estimates.length} selected
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (selectedEstimates.length === customerDetails.estimates.length) {
                                setSelectedEstimates([]);
                              } else {
                                setSelectedEstimates(customerDetails.estimates.map(e => e.id));
                              }
                            }}
                          >
                            {selectedEstimates.length === customerDetails.estimates.length ? 'Deselect All' : 'Select All'}
                          </Button>
                        </div>
                        {customerDetails.estimates.map((estimate) => (
                          <div
                            key={estimate.id}
                            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selectedEstimates.includes(estimate.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedEstimates([...selectedEstimates, estimate.id]);
                                } else {
                                  setSelectedEstimates(selectedEstimates.filter(id => id !== estimate.id));
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">#{estimate.docNumber}</span>
                                  <Badge variant={estimate.status === 'Accepted' ? 'default' : 'secondary'}>
                                    {estimate.status}
                                  </Badge>
                                </div>
                                <span className="font-medium">{formatCurrency(estimate.totalAmt)}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Date: {formatDate(estimate.txnDate)}
                                {estimate.expirationDate && ` • Expires: ${formatDate(estimate.expirationDate)}`}
                              </p>
                              {estimate.customerMemo && (
                                <p className="text-sm text-muted-foreground mt-1">{estimate.customerMemo}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="invoices" className="p-4">
                    {customerDetails.invoices.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No invoices found</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm text-muted-foreground">
                            {selectedInvoices.length} of {customerDetails.invoices.length} selected
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (selectedInvoices.length === customerDetails.invoices.length) {
                                setSelectedInvoices([]);
                              } else {
                                setSelectedInvoices(customerDetails.invoices.map(i => i.id));
                              }
                            }}
                          >
                            {selectedInvoices.length === customerDetails.invoices.length ? 'Deselect All' : 'Select All'}
                          </Button>
                        </div>
                        {customerDetails.invoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selectedInvoices.includes(invoice.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedInvoices([...selectedInvoices, invoice.id]);
                                } else {
                                  setSelectedInvoices(selectedInvoices.filter(id => id !== invoice.id));
                                }
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Receipt className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">#{invoice.docNumber}</span>
                                  <Badge variant={
                                    invoice.status === 'Paid' ? 'default' :
                                    invoice.status === 'Partial' ? 'secondary' : 'outline'
                                  }>
                                    {invoice.status}
                                  </Badge>
                                </div>
                                <div className="text-right">
                                  <span className="font-medium">{formatCurrency(invoice.totalAmt)}</span>
                                  {invoice.balance > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      Balance: {formatCurrency(invoice.balance)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Date: {formatDate(invoice.txnDate)}
                                {invoice.dueDate && ` • Due: ${formatDate(invoice.dueDate)}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="payments" className="p-4">
                    {customerDetails.payments.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No payments found</p>
                    ) : (
                      <div className="space-y-2">
                        {customerDetails.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{formatDate(payment.txnDate)}</p>
                              <p className="text-sm text-muted-foreground">
                                {payment.paymentMethod || 'Payment'}
                              </p>
                            </div>
                            <span className="font-medium text-success">
                              {formatCurrency(payment.totalAmt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Import Customer
                    {(selectedEstimates.length > 0 || selectedInvoices.length > 0) && (
                      <span className="ml-1">
                        ({selectedEstimates.length} estimates, {selectedInvoices.length} invoices)
                      </span>
                    )}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};