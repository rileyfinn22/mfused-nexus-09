import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, CheckCircle2, AlertCircle, ArrowRight, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SyncToQuickBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  onSync: (percentage: number) => Promise<void>;
  syncing: boolean;
}

interface BillingHistoryItem {
  invoice_number: string;
  invoice_type: string;
  billed_percentage: number;
  total: number;
  total_paid: number;
  quickbooks_id: string | null;
  status: string;
  id: string;
  shipment_number: number | null;
  parent_invoice_id: string | null;
}

interface PaymentItem {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  quickbooks_id: string | null;
}

export function SyncToQuickBooksDialog({ 
  open, 
  onOpenChange, 
  invoice, 
  onSync,
  syncing 
}: SyncToQuickBooksDialogProps) {
  const [billingPercentage, setBillingPercentage] = useState(100);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'review' | 'configure'>('review');

  const invoiceTotal = Number(invoice?.total || 0);
  const billedAmount = (invoiceTotal * billingPercentage) / 100;

  // Load billing history for this order when dialog opens
  useEffect(() => {
    if (open && invoice?.order_id) {
      loadBillingHistory();
    }
    if (open) {
      // Auto-detect best default percentage
      if (invoice?.invoice_type === 'partial' || invoice?.parent_invoice_id) {
        setBillingPercentage(100);
      } else {
        setBillingPercentage(invoice?.billed_percentage || 100);
      }
    }
  }, [open, invoice?.order_id]);

  const loadBillingHistory = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, billed_percentage, total, total_paid, quickbooks_id, status, shipment_number, parent_invoice_id')
        .eq('order_id', invoice.order_id)
        .is('deleted_at', null)
        .order('shipment_number', { ascending: true });
      
      setBillingHistory((data as BillingHistoryItem[]) || []);

      // Load all payments for this order's invoices
      if (data && data.length > 0) {
        const invoiceIds = data.map((inv: any) => inv.id);
        const { data: paymentData } = await supabase
          .from('payments')
          .select('id, invoice_id, amount, payment_date, payment_method, quickbooks_id')
          .in('invoice_id', invoiceIds)
          .order('payment_date', { ascending: true });
        
        setPayments((paymentData as PaymentItem[]) || []);
      }
    } catch (e) {
      console.error('Failed to load billing history', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    await onSync(billingPercentage);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate order-wide totals
  const allInvoices = billingHistory;
  const orderTotal = allInvoices.find(inv => inv.invoice_type === 'full' && inv.shipment_number === 1)?.total || invoiceTotal;
  
  // Total billed in QBO (synced invoices excluding blanket parent if it has children)
  const syncedInvoices = allInvoices.filter(inv => inv.quickbooks_id);
  const totalBilledInQBO = syncedInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  
  // Total payments across all invoices in this order  
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const thisInvoicePayments = payments.filter(p => p.invoice_id === invoice?.id);
  const thisInvoicePaid = thisInvoicePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  
  // Determine deposit info - check both directions:
  // 1. If this is a child, look at parent for deposit
  // 2. If this is the blanket/parent, look at children for deposit invoices
  const parentInvoice = invoice?.parent_invoice_id 
    ? billingHistory.find(inv => inv.id === invoice.parent_invoice_id)
    : null;
  
  // Find deposit child invoices (billed_percentage < 100) for this order
  const depositChildInvoices = billingHistory.filter(
    inv => inv.parent_invoice_id === invoice?.id && Number(inv.billed_percentage || 100) < 100
  );
  
  // Deposit from parent (when viewing a child invoice)
  const hasParentDeposit = parentInvoice && Number(parentInvoice.billed_percentage || 100) < 100;
  
  // Deposit from children (when viewing the blanket invoice)
  const hasChildDeposits = depositChildInvoices.length > 0;
  
  // 3. Deposit recorded as a payment directly on this blanket invoice
  const isBlanket = !invoice?.parent_invoice_id;
  const hasDirectDepositPayment = isBlanket && !hasChildDeposits && thisInvoicePaid > 0;

  // Total deposit amount
  const depositAmount = hasParentDeposit 
    ? Number(parentInvoice.total || 0)
    : hasChildDeposits 
      ? depositChildInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
      : hasDirectDepositPayment
        ? thisInvoicePaid
        : 0;
  
  const hasDeposit = hasParentDeposit || hasChildDeposits || hasDirectDepositPayment;
  
  const depositPaid = hasParentDeposit 
    ? payments.filter(p => p.invoice_id === parentInvoice.id).reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : hasChildDeposits
      ? payments.filter(p => depositChildInvoices.some(d => d.id === p.invoice_id)).reduce((sum, p) => sum + Number(p.amount || 0), 0)
      : 0;
  
  const depositInvoiceLabel = hasParentDeposit
    ? `${parentInvoice.billed_percentage}% Deposit (${parentInvoice.invoice_number})`
    : hasChildDeposits
      ? depositChildInvoices.map(d => `${d.billed_percentage}% Deposit (${d.invoice_number})`).join(', ')
      : hasDirectDepositPayment
        ? 'Deposit Payment Received'
        : '';

  // Check if this is a re-sync
  const isResync = !!invoice?.quickbooks_id;

  // What will actually be billed in QBO for THIS sync
  const netQBOAmount = hasDeposit && billingPercentage === 100
    ? invoiceTotal - depositAmount
    : (invoiceTotal * billingPercentage) / 100;

  // Remaining balance on this invoice
  const thisInvoiceBalance = invoiceTotal - thisInvoicePaid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isResync ? 'Re-Sync' : 'Sync'} Invoice to QuickBooks
          </DialogTitle>
          <DialogDescription>
            {step === 'review' 
              ? 'Review billing & payment status before syncing.'
              : 'Configure what to bill in QuickBooks.'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'review' ? (
          <div className="space-y-3 py-2">
            {/* This Invoice Summary */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">This Invoice</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {invoice?.invoice_type === 'full' ? 'Blanket' : 'Shipment'}
                  </Badge>
                  <Badge variant="outline">{invoice?.invoice_number}</Badge>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Invoice Total</span>
                <span className="text-right font-semibold">{formatCurrency(invoiceTotal)}</span>
                
                <span className="text-muted-foreground">Paid</span>
                <span className="text-right font-medium text-green-600">{thisInvoicePaid > 0 ? formatCurrency(thisInvoicePaid) : '—'}</span>
                
                <span className="text-muted-foreground">Balance Due</span>
                <span className="text-right font-semibold">{formatCurrency(thisInvoiceBalance)}</span>
              </div>
              {isResync && (
                <div className="flex items-center gap-1 text-xs text-amber-600 pt-1">
                  <AlertCircle className="h-3 w-3" />
                  Already synced — will update existing QBO invoice
                </div>
              )}
            </div>

            {/* Order-Wide Billing History */}
            {allInvoices.length > 1 && (
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="text-sm font-medium">Order Billing Summary</h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {allInvoices.map(inv => {
                    const invPaid = payments.filter(p => p.invoice_id === inv.id).reduce((s, p) => s + Number(p.amount || 0), 0);
                    const isCurrent = inv.id === invoice?.id;
                    return (
                      <div key={inv.id} className={`flex items-center justify-between text-xs rounded-md px-3 py-2 ${isCurrent ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono shrink-0">{inv.invoice_number}</span>
                          {inv.quickbooks_id ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                          ) : (
                            <span className="text-muted-foreground">·</span>
                          )}
                          {Number(inv.billed_percentage || 100) < 100 && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {inv.billed_percentage}% Dep
                            </Badge>
                          )}
                          {isCurrent && (
                            <Badge className="text-[10px] shrink-0">Current</Badge>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-medium">{formatCurrency(Number(inv.total))}</div>
                          {invPaid > 0 && (
                            <div className="text-green-600 text-[10px]">Paid {formatCurrency(invPaid)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Total Billed in QBO</span>
                  <span className="text-right font-medium">{formatCurrency(totalBilledInQBO)}</span>
                  <span className="text-muted-foreground">Total Payments Received</span>
                  <span className="text-right font-medium text-green-600">{formatCurrency(totalPayments)}</span>
                  <span className="text-muted-foreground">Outstanding in QBO</span>
                  <span className="text-right font-semibold">{formatCurrency(totalBilledInQBO - totalPayments)}</span>
                </div>
              </div>
            )}

            {/* Deposit Deduction Notice */}
            {hasDeposit && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-blue-800 dark:text-blue-300">
                  <DollarSign className="h-4 w-4" />
                  Deposit {hasChildDeposits ? 'Billed via Child Invoice' : 'Deduction'}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-blue-700 dark:text-blue-400">Invoice Total</span>
                  <span className="text-right font-medium">{formatCurrency(invoiceTotal)}</span>
                  <span className="text-blue-700 dark:text-blue-400">Less {depositInvoiceLabel}</span>
                  <span className="text-right font-medium text-destructive">-{formatCurrency(depositAmount)}</span>
                  {depositPaid > 0 && (
                    <>
                      <span className="text-blue-700 dark:text-blue-400 text-xs">↳ Deposit Paid</span>
                      <span className="text-right text-xs text-green-600">{formatCurrency(depositPaid)}</span>
                    </>
                  )}
                </div>
                <Separator className="bg-blue-200 dark:bg-blue-800" />
                <div className="flex items-center justify-between text-sm font-bold">
                  <span className="text-blue-800 dark:text-blue-300">Remaining to Bill in QBO</span>
                  <span className="text-primary">{formatCurrency(netQBOAmount)}</span>
                </div>
              </div>
            )}

            {/* What Will Happen */}
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What Will Sync</h4>
              <div className="flex items-center justify-between text-sm">
                <span>Amount billed to QBO</span>
                <span className="font-bold text-primary text-lg">{formatCurrency(netQBOAmount)}</span>
              </div>
              {thisInvoicePaid > 0 && !isResync && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(thisInvoicePaid)} already paid — sync payments separately after billing.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Configure step */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="billing-percentage">Billing Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="billing-percentage"
                  type="number"
                  min="1"
                  max="100"
                  value={billingPercentage}
                  onChange={(e) => {
                    const value = Math.min(100, Math.max(1, Number(e.target.value)));
                    setBillingPercentage(value);
                  }}
                  className="flex-1"
                />
                <span className="text-sm font-medium">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the percentage you want to bill (1-100%)
              </p>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Amount to Bill:</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(billedAmount)}</span>
              </div>
              {billingPercentage < 100 && (
                <p className="text-xs text-muted-foreground">
                  This will create a {billingPercentage}% deposit invoice in QuickBooks
                </p>
              )}
              {hasDeposit && billingPercentage === 100 && (
                <p className="text-xs text-blue-600">
                  Deposit of {formatCurrency(depositAmount)} will be auto-deducted → Net: {formatCurrency(invoiceTotal - depositAmount)}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step === 'review' ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('configure')}
              >
                Customize %
              </Button>
              <Button onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : isResync ? 'Re-Sync to QBO' : `Bill ${formatCurrency(netQBOAmount)} to QBO`}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('review')}
                disabled={syncing}
              >
                Back
              </Button>
              <Button onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : `Sync ${billingPercentage}% to QBO`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
