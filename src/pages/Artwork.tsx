import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Upload, 
  Download, 
  Eye, 
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  FileImage
} from "lucide-react";

const Artwork = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const artworkFiles = [
    {
      id: "ART-001", fileName: "vape-cart-001-wa-v2.1.ai", sku: "VAPE-CART-001", state: "WA", version: "v2.1",
      status: "approved", uploadDate: "2024-01-10", approvedDate: "2024-01-12", approvedBy: "John Smith",
      fileSize: "2.4 MB", fileType: "Adobe Illustrator", notes: "Final version with updated state compliance"
    },
    {
      id: "ART-002", fileName: "edible-pkg-005-ny-v3.0.psd", sku: "EDIBLE-PKG-005", state: "NY", version: "v3.0",
      status: "rejected", uploadDate: "2024-01-08", approvedDate: null, approvedBy: null,
      fileSize: "15.7 MB", fileType: "Photoshop", notes: "Color scheme needs adjustment for NY regulations"
    },
    {
      id: "ART-003", fileName: "flower-jar-003-az-v1.9.ai", sku: "FLOWER-JAR-003", state: "AZ", version: "v1.9",
      status: "pending", uploadDate: "2024-01-14", approvedDate: null, approvedBy: null,
      fileSize: "3.1 MB", fileType: "Adobe Illustrator", notes: "Awaiting final approval from compliance team"
    },
    {
      id: "ART-004", fileName: "concentrate-tin-002-md-v1.5.ai", sku: "CONCENTRATE-TIN-002", state: "MD", version: "v1.5",
      status: "approved", uploadDate: "2024-01-06", approvedDate: "2024-01-08", approvedBy: "Sarah Johnson",
      fileSize: "1.8 MB", fileType: "Adobe Illustrator", notes: "Clean design approved for production"
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'text-success';
      case 'rejected': return 'text-danger';
      case 'pending': return 'text-warning';
      case 'revision': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      case 'pending': return Clock;
      case 'revision': return MessageSquare;
      default: return Clock;
    }
  };

  const filteredFiles = artworkFiles.filter(file => {
    const matchesSearch = file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         file.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || file.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-table-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Artwork Library & Proofing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage artwork files, review process, and approval workflow</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground">
          <Upload className="h-4 w-4 mr-2" />
          Upload Artwork
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Files</p>
          <p className="text-2xl font-semibold mt-1">{artworkFiles.length}</p>
        </div>
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Approved</p>
          <p className="text-2xl font-semibold mt-1 text-success">
            {artworkFiles.filter(f => f.status === 'approved').length}
          </p>
        </div>
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Review</p>
          <p className="text-2xl font-semibold mt-1 text-warning">
            {artworkFiles.filter(f => f.status === 'pending').length}
          </p>
        </div>
        <div className="bg-table-row border border-table-border rounded p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Need Revision</p>
          <p className="text-2xl font-semibold mt-1 text-danger">
            {artworkFiles.filter(f => f.status === 'rejected').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search artwork..."
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
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Artwork Table */}
      <div className="border border-table-border rounded">
        {/* Table Header */}
        <div className="bg-table-header border-b border-table-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">File Name</div>
            <div className="col-span-2">SKU</div>
            <div className="col-span-1">State</div>
            <div className="col-span-1">Version</div>
            <div className="col-span-2">Upload Date</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-table-border">
          {filteredFiles.map((file) => {
            const StatusIcon = getStatusIcon(file.status);
            
            return (
              <div key={file.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-table-row-hover transition-colors">
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{file.fileName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{file.fileType}</div>
                </div>
                <div className="col-span-2 font-mono text-sm">{file.sku}</div>
                <div className="col-span-1">
                  <Badge variant="outline" className="text-xs">{file.state}</Badge>
                </div>
                <div className="col-span-1 font-mono text-sm">{file.version}</div>
                <div className="col-span-2 text-sm">{file.uploadDate}</div>
                <div className={`col-span-1 text-sm font-medium ${getStatusColor(file.status)}`}>
                  <div className="flex items-center gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {file.status.toUpperCase()}
                  </div>
                </div>
                <div className="col-span-1 text-xs text-muted-foreground">{file.fileSize}</div>
                <div className="col-span-1 flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filteredFiles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No artwork files found matching your criteria.
        </div>
      )}
    </div>
  );
};

export default Artwork;