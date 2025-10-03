import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Download, 
  Eye, 
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Package
} from "lucide-react";

const Invoices = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Regular billing invoices
  const billingInvoices = [
    {
      id: "INV-2024-001", 
      type: "billing",
      orderIds: ["ORD-001", "ORD-002"], 
      amount: 4750.00, 
      status: "paid",
      issueDate: "2024-01-10", 
      dueDate: "2024-01-25", 
      paidDate: "2024-01-20", 
      customerPO: "PO-MFUSED-001",
      packingListPdf: null,
      invoicePdf: null
    },
    {
      id: "INV-2024-002", 
      type: "billing",
      orderIds: ["ORD-003"], 
      amount: 2850.00, 
      status: "open",
      issueDate: "2024-01-12", 
      dueDate: "2024-01-27", 
      paidDate: null, 
      customerPO: "PO-MFUSED-002",
      packingListPdf: null,
      invoicePdf: null
    },
    {
      id: "INV-2024-003", 
      type: "billing",
      orderIds: ["ORD-004", "ORD-005"], 
      amount: 8200.00, 
      status: "overdue",
      issueDate: "2024-01-05", 
      dueDate: "2024-01-20", 
      paidDate: null, 
      customerPO: "PO-MFUSED-003",
      packingListPdf: null,
      invoicePdf: null
    },
    {
      id: "INV-2024-004", 
      type: "billing",
      orderIds: ["ORD-006"], 
      amount: 1950.00, 
      status: "open",
      issueDate: "2024-01-15", 
      dueDate: "2024-01-30", 
      paidDate: null, 
      customerPO: "PO-MFUSED-004",
      packingListPdf: null,
      invoicePdf: null
    },
    {
      id: "INV-2024-005", 
      type: "billing",
      orderIds: ["ORD-007", "ORD-008"], 
      amount: 6300.00, 
      status: "pending",
      issueDate: "2024-01-16", 
      dueDate: "2024-01-31", 
      paidDate: null, 
      customerPO: "PO-MFUSED-005",
      packingListPdf: null,
      invoicePdf: null
    },
  ];

  // Pull & Ship invoices (these would normally come from a shared state or API)
  const pullShipInvoices = [
    {
      id: "INV-001", 
      type: "pullship",
      state: "WA", 
      items: [
        { sku: "VAPE-CART-001", quantity: 100 },
        { sku: "EDIBLE-PKG-005", quantity: 50 }
      ],
      status: "pending",
      issueDate: "2024-01-15", 
      dueDate: "2024-01-30",
      paidDate: null,
      estimatedShip: "2024-01-17", 
      shippingAddress: "123 Main St, Seattle, WA 98101",
      trackingNumber: null, 
      notes: "Rush order for new dispensary opening",
      amount: 15250.00,
      customerPO: "PS-WA-001",
      packingListPdf: null,
      invoicePdf: null
    },
    {
      id: "INV-002", 
      type: "pullship",
      state: "CA", 
      items: [
        { sku: "EDIBLE-PKG-005", quantity: 250 },
        { sku: "FLOWER-JAR-003", quantity: 75 }
      ],
      status: "picked",
      issueDate: "2024-01-12", 
      dueDate: "2024-01-27",
      paidDate: null,
      estimatedShip: "2024-01-16", 
      shippingAddress: "456 Oak Ave, Los Angeles, CA 90210",
      trackingNumber: null, 
      notes: "Standard delivery",
      amount: 18750.00,
      customerPO: "PS-CA-001",
      packingListPdf: null,
      invoicePdf: null
    },
  ];

  // Combine all invoices
  const allInvoices = [...billingInvoices, ...pullShipInvoices];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': return 'text-success';
      case 'open': return 'text-primary';
      case 'overdue': return 'text-danger';
      case 'pending': return 'text-warning';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': return CheckCircle;
      case 'open': return Clock;
      case 'overdue': return AlertTriangle;
      case 'pending': return Clock;
      default: return Clock;
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const filteredInvoices = allInvoices.filter(invoice => {
    const matchesSearch = invoice.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.customerPO.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (invoice.type === "pullship" && "state" in invoice && invoice.state?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || invoice.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const paidAmount = filteredInvoices.filter(inv => inv.status === 'paid').reduce((sum, invoice) => sum + invoice.amount, 0);
  const overdueAmount = filteredInvoices.filter(inv => inv.status === 'overdue').reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Invoices & Billing</h1>
        <p className="text-muted-foreground mt-2">Manage invoices, track payments, and monitor due dates</p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-6 hover:shadow-sm transition-shadow">
          <p className="text-sm font-medium text-muted-foreground">Total Outstanding</p>
          <p className="text-3xl font-bold mt-3">{formatCurrency(totalAmount - paidAmount)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 hover:shadow-sm transition-shadow">
          <p className="text-sm font-medium text-muted-foreground">Paid This Month</p>
          <p className="text-3xl font-bold mt-3 text-success">{formatCurrency(paidAmount)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 hover:shadow-sm transition-shadow">
          <p className="text-sm font-medium text-muted-foreground">Overdue Amount</p>
          <p className="text-3xl font-bold mt-3 text-danger">{formatCurrency(overdueAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Invoice ID</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-2">PO Number</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {filteredInvoices.map((invoice) => {
            const StatusIcon = getStatusIcon(invoice.status);
            const daysUntilDue = getDaysUntilDue(invoice.dueDate);
            
            return (
              <div key={invoice.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                <div className="col-span-2 font-medium font-mono text-sm">{invoice.id}</div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    {invoice.type === "pullship" ? <Package className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm capitalize">{invoice.type === "pullship" ? "Pull & Ship" : "Billing"}</span>
                  </div>
                  {invoice.type === "pullship" && "state" in invoice && "items" in invoice && (
                    <div className="text-xs text-muted-foreground">
                      {invoice.state} • {invoice.items?.reduce((sum: number, item: any) => sum + item.quantity, 0)} units
                    </div>
                  )}
                </div>
                <div className="col-span-2 font-semibold text-sm">{formatCurrency(invoice.amount)}</div>
                <div className="col-span-2 text-sm">{invoice.customerPO}</div>
                <div className="col-span-2 text-sm">
                  <div className={
                    invoice.status === 'overdue' ? 'text-danger' : 
                    daysUntilDue <= 7 ? 'text-warning' : 'text-foreground'
                  }>
                    {invoice.dueDate}
                    {invoice.status !== 'paid' && (
                      <div className="text-xs text-muted-foreground">
                        {daysUntilDue > 0 ? `${daysUntilDue}d remaining` : `${Math.abs(daysUntilDue)}d overdue`}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`col-span-1 text-sm font-medium ${getStatusColor(invoice.status)}`}>
                  <div className="flex items-center gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {invoice.status.toUpperCase()}
                  </div>
                </div>
                <div className="col-span-1 flex gap-1">
                  {invoice.type === "pullship" ? (
                    <>
                      {invoice.packingListPdf ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0" 
                          onClick={() => window.open(invoice.packingListPdf!)}
                          title="View Packing List"
                        >
                          <Package className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled title="Packing List Not Available">
                          <Package className="h-3 w-3 opacity-30" />
                        </Button>
                      )}
                      {invoice.invoicePdf ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(invoice.invoicePdf!)}
                          title="View Invoice PDF"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled title="Invoice PDF Not Available">
                          <Download className="h-3 w-3 opacity-30" />
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="View Invoice">
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Download Invoice">
                        <Download className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filteredInvoices.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No invoices found matching your criteria.
        </div>
      )}
    </div>
  );
};

export default Invoices;