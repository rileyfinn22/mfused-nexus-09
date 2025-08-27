import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  ArrowUpDown,
  AlertTriangle
} from "lucide-react";

const Inventory = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("available");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const inventoryData = [
    { sku: "VAPE-CART-001", state: "WA", available: 45, reserved: 15, inProduction: 100, redline: 50, lastUpdated: "2024-01-15" },
    { sku: "VAPE-CART-001", state: "AZ", available: 12, reserved: 8, inProduction: 50, redline: 25, lastUpdated: "2024-01-14" },
    { sku: "EDIBLE-PKG-005", state: "WA", available: 150, reserved: 25, inProduction: 200, redline: 100, lastUpdated: "2024-01-15" },
    { sku: "EDIBLE-PKG-005", state: "CA", available: 85, reserved: 20, inProduction: 150, redline: 100, lastUpdated: "2024-01-15" },
    { sku: "FLOWER-JAR-003", state: "NY", available: 8, reserved: 12, inProduction: 75, redline: 25, lastUpdated: "2024-01-13" },
    { sku: "CONCENTRATE-TIN-002", state: "MD", available: 200, reserved: 30, inProduction: 100, redline: 50, lastUpdated: "2024-01-15" },
    { sku: "PRE-ROLL-TUBE-001", state: "WA", available: 22, reserved: 5, inProduction: 50, redline: 30, lastUpdated: "2024-01-14" },
    { sku: "PRE-ROLL-TUBE-001", state: "CA", available: 15, reserved: 8, inProduction: 25, redline: 20, lastUpdated: "2024-01-13" },
  ];

  const getStockStatus = (available: number, redline: number) => {
    if (available < redline * 0.5) return "critical";
    if (available < redline) return "warning";
    return "good";
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case "critical": return "text-danger";
      case "warning": return "text-warning";
      case "good": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredAndSortedData = inventoryData
    .filter(item => {
      const matchesSearch = item.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesState = stateFilter === "all" || item.state === stateFilter;
      const status = getStockStatus(item.available, item.redline);
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "low" && (status === "critical" || status === "warning")) ||
        (statusFilter === "good" && status === "good");
      
      return matchesSearch && matchesState && matchesStatus;
    })
    .sort((a, b) => {
      const aValue = a[sortField as keyof typeof a] as number;
      const bValue = b[sortField as keyof typeof b] as number;
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-table-border pb-4">
        <h1 className="text-2xl font-semibold">Inventory Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Track stock levels, monitor thresholds, and manage production pipeline</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="WA">Washington</SelectItem>
            <SelectItem value="AZ">Arizona</SelectItem>
            <SelectItem value="NY">New York</SelectItem>
            <SelectItem value="CA">California</SelectItem>
            <SelectItem value="MD">Maryland</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="good">Good Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Grid */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-10 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">SKU</div>
            <div className="col-span-1">State</div>
            <div 
              className="col-span-2 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("available")}
            >
              Available {getSortIcon("available")}
            </div>
            <div 
              className="col-span-2 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("inProduction")}
            >
              In Production {getSortIcon("inProduction")}
            </div>
            <div 
              className="col-span-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSort("redline")}
            >
              Redline {getSortIcon("redline")}
            </div>
            <div className="col-span-1">Status</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {filteredAndSortedData.map((item, index) => {
            const status = getStockStatus(item.available, item.redline);
            const stockColor = getStockColor(status);
            
            return (
              <div 
                key={`${item.sku}-${item.state}`}
                className="grid grid-cols-10 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors"
              >
                <div className="col-span-3 font-mono text-sm font-medium">{item.sku}</div>
                <div className="col-span-1">
                  <Badge variant="outline" className="text-xs">{item.state}</Badge>
                </div>
                <div className="col-span-2 font-semibold text-sm flex items-center gap-1">
                  {status === "critical" && <AlertTriangle className="h-3 w-3 text-danger" />}
                  {item.available}
                </div>
                <div className="col-span-2 text-sm">{item.inProduction}</div>
                <div className="col-span-1 text-sm text-muted-foreground">{item.redline}</div>
                <div className={`col-span-1 text-xs font-medium uppercase ${stockColor}`}>
                  {status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {filteredAndSortedData.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No inventory items found matching your criteria.
        </div>
      )}
    </div>
  );
};

export default Inventory;