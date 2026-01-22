import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

interface VendorBalance {
  id: string;
  name: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  poCount: number;
}

interface VendorBalanceBreakdownProps {
  vendors: VendorBalance[];
  selectedVendorId: string;
  onVendorSelect: (vendorId: string) => void;
}

export function VendorBalanceBreakdown({
  vendors,
  selectedVendorId,
  onVendorSelect
}: VendorBalanceBreakdownProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const sortedVendors = [...vendors].sort((a, b) => b.balance - a.balance);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Balance by Vendor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {/* All Vendors Option */}
        <div
          className={`p-3 rounded-lg cursor-pointer transition-all border ${
            selectedVendorId === 'all'
              ? 'bg-primary/10 border-primary'
              : 'bg-muted/30 border-transparent hover:bg-muted/50'
          }`}
          onClick={() => onVendorSelect('all')}
        >
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm">All Vendors</span>
            <Badge variant="secondary" className="text-xs">
              {vendors.reduce((sum, v) => sum + v.poCount, 0)} POs
            </Badge>
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Total Balance</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(vendors.reduce((sum, v) => sum + v.balance, 0))}
            </span>
          </div>
        </div>

        {/* Individual Vendors */}
        {sortedVendors.map((vendor) => (
          <div
            key={vendor.id}
            className={`p-4 rounded-lg cursor-pointer transition-all border ${
              selectedVendorId === vendor.id
                ? 'bg-primary/10 border-primary'
                : 'bg-muted/30 border-transparent hover:bg-muted/50'
            }`}
            onClick={() => onVendorSelect(vendor.id)}
          >
            <div className="flex justify-between items-center gap-2 mb-2">
              <span className="font-medium text-sm truncate flex-1" title={vendor.name}>
                {vendor.name}
              </span>
              <Badge variant="outline" className="text-xs shrink-0">
                {vendor.poCount} PO{vendor.poCount !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owed:</span>
                <span className="text-destructive font-medium">
                  {formatCurrency(vendor.totalOwed)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid:</span>
                <span className="text-success font-medium">
                  {formatCurrency(vendor.totalPaid)}
                </span>
              </div>
            </div>
            {vendor.balance > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs">
                <span className="text-muted-foreground">Balance Due:</span>
                <span className="font-semibold text-destructive">
                  {formatCurrency(vendor.balance)}
                </span>
              </div>
            )}
          </div>
        ))}

        {vendors.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No vendor data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
