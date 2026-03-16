import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Copy, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateFinanceLinkDialog({ open, onOpenChange }: Props) {
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("finance_share_links")
      .insert({ label: label || "Finance Tracker" })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const url = `${window.location.origin}/finance-view?token=${data.token}`;
      setGeneratedUrl(url);
      toast({ title: "Share link generated" });
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setGeneratedUrl(""); setLabel(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Finance Share Link</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!generatedUrl ? (
            <>
              <div>
                <Label>Label (optional)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q1 2026 Financing" />
              </div>
              <Button onClick={handleGenerate} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Link
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Share this link with your finance company. They will see data in Chinese/RMB.</p>
              <div className="flex gap-2">
                <Input value={generatedUrl} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
