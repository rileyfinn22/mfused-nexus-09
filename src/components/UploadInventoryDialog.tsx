import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface UploadInventoryDialogProps {
  onInventoryUploaded: () => void;
  selectedCompanyId?: string;
}

export function UploadInventoryDialog({ onInventoryUploaded, selectedCompanyId }: UploadInventoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Pass selected company ID if provided (for vibe_admin)
      if (selectedCompanyId) {
        formData.append('company_id', selectedCompanyId);
      }

      const { data, error } = await supabase.functions.invoke('upload-inventory', {
        body: formData
      });

      if (error) throw error;

      toast.success(`Successfully uploaded ${data.inserted} inventory items`);
      setOpen(false);
      setFile(null);
      onInventoryUploaded();
    } catch (error) {
      console.error('Error uploading inventory:', error);
      toast.error("Failed to upload inventory");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Upload Inventory
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Inventory</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file with inventory data. Required columns: SKU (or Item), Available Primary (or Available). Optional: State, In Production, Redline. Products will be created automatically if they don't exist.
            </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              required
            />
          </div>
          <Button type="submit" disabled={loading || !file} className="w-full">
            {loading ? "Uploading..." : "Upload Inventory"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
