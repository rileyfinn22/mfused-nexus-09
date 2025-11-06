import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

interface SyncToQuickBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  onSync: (percentage: number) => Promise<void>;
  syncing: boolean;
}

export function SyncToQuickBooksDialog({ 
  open, 
  onOpenChange, 
  invoice, 
  onSync,
  syncing 
}: SyncToQuickBooksDialogProps) {
  const [billingPercentage, setBillingPercentage] = useState(100);

  const invoiceTotal = Number(invoice?.total || 0);
  const billedAmount = (invoiceTotal * billingPercentage) / 100;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Invoice to QuickBooks</DialogTitle>
          <DialogDescription>
            Choose what percentage of the invoice to bill the customer in QuickBooks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invoice Number:</span>
              <Badge variant="outline">{invoice?.invoice_number}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invoice Total:</span>
              <span className="font-semibold">{formatCurrency(invoiceTotal)}</span>
            </div>
          </div>

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
                This will create a {billingPercentage}% deposit/partial payment invoice in QuickBooks
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={syncing}
          >
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync to QuickBooks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
