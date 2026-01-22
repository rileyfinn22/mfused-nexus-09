import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  color: string;
}

interface VendorBillsAgingBucketsProps {
  buckets: AgingBucket[];
  totalOutstanding: number;
}

export function VendorBillsAgingBuckets({ buckets, totalOutstanding }: VendorBillsAgingBucketsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Aging Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {buckets.map((bucket, index) => {
          const percentage = totalOutstanding > 0 ? (bucket.amount / totalOutstanding) * 100 : 0;
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{bucket.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">({bucket.count})</span>
                  <span className="font-medium">{formatCurrency(bucket.amount)}</span>
                </div>
              </div>
              <Progress 
                value={percentage} 
                className="h-1.5" 
                style={{ 
                  '--progress-background': bucket.color 
                } as React.CSSProperties}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
