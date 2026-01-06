import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, FolderOpen, Building2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface QBProject {
  id: string;
  name: string;
  fullName: string;
  parentId: string | null;
  parentName: string | null;
  isProject: boolean;
  active: boolean;
}

interface QBProjectSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  companyName: string;
  onProjectSelected: () => void;
}

export function QBProjectSelectorDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  companyName,
  onProjectSelected,
}: QBProjectSelectorDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<QBProject[]>([]);
  const [customers, setCustomers] = useState<QBProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<QBProject | null>(null);

  // Pre-fill search with order number or company name
  useEffect(() => {
    if (open) {
      setSearchTerm(orderNumber || "");
      setSelectedProject(null);
    }
  }, [open, orderNumber]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: "Enter a search term",
        description: "Please enter a project name or customer name to search.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-query-projects', {
        body: { searchTerm: searchTerm.trim() }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setProjects(data.projects || []);
      setCustomers(data.customers || []);

      if (data.projects?.length === 0 && data.customers?.length === 0) {
        toast({
          title: "No results",
          description: "No projects or customers found matching your search.",
        });
      }
    } catch (error: any) {
      console.error('Error searching projects:', error);
      toast({
        title: "Search failed",
        description: error.message || "Failed to search QuickBooks projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = async () => {
    if (!selectedProject) return;

    setSaving(true);
    try {
      // Update the order with the selected project ID
      const { error } = await supabase
        .from('orders')
        .update({ qb_project_id: selectedProject.id })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: "Project linked",
        description: `Order linked to QB Project: ${selectedProject.fullName || selectedProject.name}`,
      });

      onProjectSelected();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error linking project:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to link project to order",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link to QuickBooks Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search for an existing project in QuickBooks to link this order. Invoices synced from this order will be associated with the selected project.
          </p>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Search</Label>
              <Input
                id="search"
                placeholder="Search by project name (e.g., 10701)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Projects list */}
          {projects.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Projects (Sub-customers)
              </h3>
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center justify-between ${
                      selectedProject?.id === project.id ? 'bg-primary/10 border-l-4 border-primary' : ''
                    }`}
                  >
                    <div>
                      <p className="font-medium">{project.name}</p>
                      {project.parentName && (
                        <p className="text-sm text-muted-foreground">
                          Under: {project.parentName}
                        </p>
                      )}
                    </div>
                    {selectedProject?.id === project.id && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Customers list (parent customers without projects) */}
          {customers.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Customers (Create a project under them in QBO first)
              </h3>
              <div className="border rounded-lg divide-y max-h-32 overflow-y-auto bg-muted/30">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="w-full text-left p-3 text-muted-foreground"
                  >
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs">Parent customer - create a project under this in QBO</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && projects.length === 0 && customers.length === 0 && searchTerm && (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Search for a project to see results</p>
              <p className="text-sm">Projects are sub-customers in QuickBooks</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSelectProject}
              disabled={!selectedProject || saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Link to Project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
