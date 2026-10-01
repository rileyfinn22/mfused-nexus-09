import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const REPS = [
  { email: "justin@vibepkg.com", name: "Justin" },
  { email: "riley@vibepkg.com", name: "Riley" },
  { email: "jack@vibepkg.com", name: "Jack" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function AssignSalesRepsDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string; sales_rep_email: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("companies")
      .select("id, name, sales_rep_email")
      .order("name")
      .then(({ data, error }) => {
        if (error) toast({ title: "Couldn't load companies", description: error.message, variant: "destructive" });
        setCompanies((data as any) || []);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(
    () => companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [companies, search]
  );

  const setRep = async (id: string, email: string | null) => {
    const prev = companies;
    setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, sales_rep_email: email } : c)));
    setSavingId(id);
    const { error } = await supabase.from("companies").update({ sales_rep_email: email } as any).eq("id", id);
    setSavingId(null);
    if (error) {
      setCompanies(prev);
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    } else {
      onSaved?.();
    }
  };

  const assigned = companies.filter((c) => c.sales_rep_email).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Salespeople</DialogTitle>
          <DialogDescription>
            Tick one person per company. Changes save right away. {assigned} of {companies.length} assigned.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex-1 overflow-y-auto -mx-2 px-2 divide-y divide-border">
          {loading && <p className="text-sm text-muted-foreground py-4">Loading...</p>}
          {!loading &&
            filtered.map((c) => {
              const other = c.sales_rep_email && !REPS.some((r) => r.email === c.sales_rep_email);
              return (
                <div key={c.id} className="py-3">
                  <div className="font-medium text-sm">
                    {c.name}
                    {other && <span className="text-xs text-muted-foreground ml-2">(currently {c.sales_rep_email})</span>}
                    {savingId === c.id && <span className="text-xs text-muted-foreground ml-2">Saving...</span>}
                  </div>
                  <div className="flex gap-6 mt-2">
                    {REPS.map((r) => {
                      const id = `${c.id}-${r.email}`;
                      const checked = c.sales_rep_email === r.email;
                      return (
                        <label key={r.email} htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(v) => setRep(c.id, v ? r.email : null)}
                          />
                          {r.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
