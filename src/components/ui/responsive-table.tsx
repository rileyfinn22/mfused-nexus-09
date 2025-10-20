import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

interface ResponsiveTableProps {
  headers: string[];
  rows: ReactNode[][];
  mobileCardRender?: (row: ReactNode[], index: number) => ReactNode;
}

export function ResponsiveTable({ headers, rows, mobileCardRender }: ResponsiveTableProps) {
  const isMobile = useIsMobile();

  if (isMobile && mobileCardRender) {
    return (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <Card key={index} className="p-4">
            {mobileCardRender(row, index)}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            {headers.map((header, index) => (
              <th key={index} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b hover:bg-muted/50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
