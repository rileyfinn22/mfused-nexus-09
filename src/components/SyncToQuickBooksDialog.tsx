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
        .select('id, invoice_number, invoice_type, billed_percentage, total, total_paid, quickbooks_id, status')
        .eq('order_id', invoice.order_id)
        .is('deleted_at', null)
        .order('shipment_number', { ascending: true });
      
      setBillingHistory(data || []);
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

  // Calculate what's already been billed in QBO
  const syncedInvoices = billingHistory.filter(inv => inv.quickbooks_id && inv.id !== invoice?.id);
  const totalBilledInQBO = syncedInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalPaidInQBO = syncedInvoices.reduce((sum, inv) => sum + Number(inv.total_paid || 0), 0);
  
  // Determine parent deposit info
  const parentInvoice = invoice?.parent_invoice_id 
    ? billingHistory.find(inv => inv.id === invoice.parent_invoice_id)
    : null;
  const hasParentDeposit = parentInvoice && Number(parentInvoice.billed_percentage || 100) < 100 && parentInvoice.quickbooks_id;
  const depositAmount = hasParentDeposit ? Number(parentInvoice.total || 0) : 0;

  // Check if this is a re-sync
  const isResync = !!invoice?.quickbooks_id;

  // Determine the effective amount that will be billed in QBO
  const effectiveBillAmount = billingPercentage < 100
    ? (invoiceTotal * billingPercentage) / 100
    : invoiceTotal - (hasParentDeposit ? depositAmount : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isResync ? 'Re-Sync' : 'Sync'} Invoice to QuickBooks
          </DialogTitle>
          <DialogDescription>
            {step === 'review' 
              ? 'Review billing history before syncing.'
              : 'Configure what to bill in QuickBooks.'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'review' ? (
          <div className="space-y-4 py-2">
            {/* Current Invoice Info */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">This Invoice</span>
                <Badge variant="outline">{invoice?.invoice_number}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Invoice Total</span>
                <span className="font-semibold">{formatCurrency(invoiceTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="secondary" className="text-xs">
                  {invoice?.invoice_type === 'full' ? 'Blanket' : 'Shipment'}
                </Badge>
              </div>
              {isResync && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Already synced — this will update the existing QBO invoice
                </div>
              )}
            </div>

            {/* Billing History */}
            {billingHistory.length > 1 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Order Billing History</h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {billingHistory
                      .filter(inv => inv.id !== invoice?.id)
                      .map(inv => (
                        <div key={inv.id} className="flex items-center justify-between text-xs rounded-md bg-muted/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{inv.invoice_number}</span>
                            {inv.quickbooks_id ? (
                              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                In QBO
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Not synced</Badge>
                            )}
                            {Number(inv.billed_percentage || 100) < 100 && (
                              <Badge variant="secondary" className="text-[10px]">
                                {inv.billed_percentage}% Deposit
                              </Badge>
                            )}
                          </div>
                          <span className="font-medium">{formatCurrency(Number(inv.total))}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}

            {/* Deposit Deduction Notice */}
            {hasParentDeposit && (
              <>
                <Separator />
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-blue-800 dark:text-blue-300">
                    <DollarSign className="h-4 w-4" />
                    Deposit Will Be Deducted
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    A {parentInvoice.billed_percentage}% deposit of {formatCurrency(depositAmount)} was previously billed on invoice {parentInvoice.invoice_number}. 
                    This will be automatically subtracted as a credit line in QuickBooks.
                  </p>
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="text-blue-700 dark:text-blue-400">Shipped Total</span>
                    <span className="font-medium">{formatCurrency(invoiceTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-700 dark:text-blue-400">Less Deposit</span>
                    <span className="font-medium text-red-600">-{formatCurrency(depositAmount)}</span>
                  </div>
                  <Separator className="bg-blue-200 dark:bg-blue-800" />
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span className="text-blue-800 dark:text-blue-300">Net QBO Amount</span>
                    <span className="text-primary">{formatCurrency(invoiceTotal - depositAmount)}</span>
                  </div>
                </div>
              </>
            )}

            {/* Summary */}
            {!hasParentDeposit && totalBilledInQBO > 0 && (
              <>
                <Separator />
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Previously billed in QBO</span>
                    <span className="font-medium">{formatCurrency(totalBilledInQBO)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">This invoice</span>
                    <span className="font-medium">{formatCurrency(invoiceTotal)}</span>
                  </div>
                </div>
              </>
            )}
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
              {hasParentDeposit && billingPercentage === 100 && (
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
                {syncing ? 'Syncing...' : isResync ? 'Re-Sync to QBO' : hasParentDeposit ? `Bill ${formatCurrency(invoiceTotal - depositAmount)} to QBO` : `Bill ${formatCurrency(invoiceTotal)} to QBO`}
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
