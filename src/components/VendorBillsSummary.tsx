import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface VendorBillsSummaryProps {
  totalOutstanding: number;
  unpaidAmount: number;
  partialAmount: number;
  paidAmount: number;
  onFilterChange: (filter: string) => void;
  activeFilter: string;
}

export function VendorBillsSummary({
  totalOutstanding,
  unpaidAmount,
  partialAmount,
  paidAmount,
  onFilterChange,
  activeFilter
}: VendorBillsSummaryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const tiles = [
    {
      key: 'all',
      label: 'Total Outstanding',
      amount: totalOutstanding,
      icon: DollarSign,
      color: 'text-info dark:text-info',
      bgColor: 'bg-info/10',
      borderColor: 'border-info/30'
    },
    {
      key: 'unpaid',
      label: 'Unpaid',
      amount: unpaidAmount,
      icon: AlertTriangle,
      color: 'text-danger dark:text-danger',
      bgColor: 'bg-danger/10',
      borderColor: 'border-danger/30'
    },
    {
      key: 'partial',
      label: 'Partially Paid',
      amount: partialAmount,
      icon: Clock,
      color: 'text-warning dark:text-warning',
      bgColor: 'bg-warning/10',
      borderColor: 'border-warning/30'
    },
    {
      key: 'paid',
      label: 'Paid',
      amount: paidAmount,
      icon: CheckCircle,
      color: 'text-success dark:text-success',
      bgColor: 'bg-success/10',
      borderColor: 'border-success/30'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const isActive = activeFilter === tile.key;
        
        return (
          <Card 
            key={tile.key}
            className={`cursor-pointer transition-all hover:shadow-md ${
              isActive ? `ring-2 ring-primary ${tile.bgColor}` : ''
            }`}
            onClick={() => onFilterChange(isActive ? 'all' : tile.key)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {tile.label}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${tile.color}`}>
                    {formatCurrency(tile.amount)}
                  </p>
                </div>
                <div className={`p-2 rounded-full ${tile.bgColor}`}>
                  <Icon className={`h-5 w-5 ${tile.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
