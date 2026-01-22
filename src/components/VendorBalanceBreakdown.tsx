import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, DollarSign, Search, X } from "lucide-react";
import { BulkVendorPaymentDialog } from "./BulkVendorPaymentDialog";

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
  onPaymentRecorded?: () => void;
  isFullWidth?: boolean;
}

export function VendorBalanceBreakdown({
  vendors,
  selectedVendorId,
  onVendorSelect,
  onPaymentRecorded,
  isFullWidth = false
}: VendorBalanceBreakdownProps) {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedVendorForPayment, setSelectedVendorForPayment] = useState<VendorBalance | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleMakePayment = (vendor: VendorBalance, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVendorForPayment(vendor);
    setPaymentDialogOpen(true);
  };

  const handlePaymentSuccess = () => {
    setPaymentDialogOpen(false);
    setSelectedVendorForPayment(null);
    onPaymentRecorded?.();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedVendors = [...filteredVendors].sort((a, b) => b.balance - a.balance);

  const totalBalance = vendors.reduce((sum, v) => sum + v.balance, 0);
  const totalPOs = vendors.reduce((sum, v) => sum + v.poCount, 0);

  if (isFullWidth) {
    // Full-width tab layout with grid of cards
    return (
      <div className="space-y-4">
        {/* Summary Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Balance Due</div>
              <div className="text-2xl font-bold text-destructive">{formatCurrency(totalBalance)}</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Active Vendors</div>
              <div className="text-2xl font-bold">{vendors.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total POs</div>
              <div className="text-2xl font-bold">{totalPOs}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Vendor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedVendors.map((vendor) => (
            <Card
              key={vendor.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedVendorId === vendor.id
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => onVendorSelect(vendor.id === selectedVendorId ? 'all' : vendor.id)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate" title={vendor.name}>
                      {vendor.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {vendor.poCount} PO{vendor.poCount !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Owed:</span>
                    <span className="font-medium">{formatCurrency(vendor.totalOwed)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Paid:</span>
                    <span className="font-medium text-success">{formatCurrency(vendor.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Balance Due:</span>
                    <span className={`font-bold ${vendor.balance > 0 ? 'text-destructive' : 'text-success'}`}>
                      {formatCurrency(vendor.balance)}
                    </span>
                  </div>
                </div>

                {vendor.balance > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full mt-3"
                    onClick={(e) => handleMakePayment(vendor, e)}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Record Payment
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredVendors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{searchQuery ? 'No vendors match your search' : 'No vendor data available'}</p>
          </div>
        )}

        {/* Bulk Payment Dialog */}
        {selectedVendorForPayment && (
          <BulkVendorPaymentDialog
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            vendorId={selectedVendorForPayment.id}
            vendorName={selectedVendorForPayment.name}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    );
  }

  // Original sidebar layout
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Balance by Vendor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <div className="max-h-[350px] overflow-y-auto space-y-2">
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
                {totalPOs} POs
              </Badge>
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Total Balance</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(totalBalance)}
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
                <>
                  <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs">
                    <span className="text-muted-foreground">Balance Due:</span>
                    <span className="font-semibold text-destructive">
                      {formatCurrency(vendor.balance)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={(e) => handleMakePayment(vendor, e)}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Make Payment
                  </Button>
                </>
              )}
            </div>
          ))}

          {filteredVendors.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              {searchQuery ? 'No vendors match search' : 'No vendor data available'}
            </div>
          )}
        </div>
      </CardContent>

      {/* Bulk Payment Dialog */}
      {selectedVendorForPayment && (
        <BulkVendorPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          vendorId={selectedVendorForPayment.id}
          vendorName={selectedVendorForPayment.name}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Card>
  );
}
