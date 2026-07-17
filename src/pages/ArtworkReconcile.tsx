import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Sparkles, Save, Loader2, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { signStorageUrlsInRows } from "@/lib/storageUrl";

interface Orphan {
  id: string;
  filename: string;
  sku: string | null;
  company_id: string;
  preview_url: string | null;
  artwork_url: string | null;
  artwork_type: string | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  item_id: string | null;
  company_id: string;
}

interface Company { id: string; name: string; }

interface Suggestion {
  fileId: string;
  productId: string | null;
  sku: string | null;
  productName?: string | null;
  confidence: string;
  reason: string;
}

const confidenceColor = (c: string) => c === 'high' ? 'bg-green-500/20 text-green-700' : c === 'medium' ? 'bg-yellow-500/20 text-yellow-700' : c === 'low' ? 'bg-orange-500/20 text-orange-700' : 'bg-muted text-muted-foreground';

export default function ArtworkReconcile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Record<string, { sku: string; productName?: string }>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-artwork-skus', { body: { action: 'list' } });
      if (error) throw error;
      const signedOrphans = await signStorageUrlsInRows<Orphan>('artwork', data.orphans || [], ['artwork_url', 'preview_url']);
      setOrphans(signedOrphans || []);
      setProducts(data.products || []);
      setCompanies(data.companies || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const productsByCompany = useMemo(() => {
    const m: Record<string, Product[]> = {};
    for (const p of products) {
      if (!p.item_id) continue;
      (m[p.company_id] = m[p.company_id] || []).push(p);
    }
    return m;
  }, [products]);

  const companyName = (id: string) => companies.find(c => c.id === id)?.name || id.slice(0, 8);

  const filtered = useMemo(() => {
    return orphans.filter(o => {
      if (companyFilter !== 'all' && o.company_id !== companyFilter) return false;
      if (search && !o.filename.toLowerCase().includes(search.toLowerCase()) && !(o.sku || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [orphans, companyFilter, search]);

  const visibleIds = filtered.map(o => o.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checked[id]);
  const someChecked = visibleIds.some(id => checked[id]);

  const toggleAll = () => {
    const next = { ...checked };
    const v = !allChecked;
    visibleIds.forEach(id => { next[id] = v; });
    setChecked(next);
  };

  const runSuggest = async () => {
    const ids = visibleIds.filter(id => checked[id]);
    if (!ids.length) { toast.error('Select files first'); return; }
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-artwork-skus', { body: { action: 'suggest', fileIds: ids } });
      if (error) throw error;
      const map: Record<string, Suggestion> = { ...suggestions };
      const sel: Record<string, { sku: string; productName?: string }> = { ...selections };
      for (const s of (data.suggestions || []) as Suggestion[]) {
        map[s.fileId] = s;
        if (s.sku && (s.confidence === 'high' || s.confidence === 'medium')) {
          sel[s.fileId] = { sku: s.sku, productName: s.productName || undefined };
        }
      }
      setSuggestions(map);
      setSelections(sel);
      toast.success(`Suggested matches for ${data.suggestions?.length || 0} files`);
    } catch (e: any) {
      toast.error(e.message || 'Suggest failed');
    } finally {
      setSuggesting(false);
    }
  };

  const apply = async () => {
    const updates = Object.entries(selections)
      .filter(([id]) => checked[id])
      .map(([fileId, v]) => ({ fileId, sku: v.sku }));
    if (!updates.length) { toast.error('No selections to apply'); return; }
    if (!confirm(`Update SKU on ${updates.length} artwork file(s)?`)) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-artwork-skus', { body: { action: 'apply', updates } });
      if (error) throw error;
      toast.success(`Updated ${data.updated} files`);
      // Clear and reload
      setSelections({});
      setChecked({});
      setSuggestions({});
      await loadData();
    } catch (e: any) {
      toast.error(e.message || 'Apply failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedToApplyCount = Object.entries(selections).filter(([id]) => checked[id]).length;

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/artwork')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <div>
          <h1 className="text-2xl font-bold">Reconcile Artwork SKUs</h1>
          <p className="text-sm text-muted-foreground">Re-map orphaned artwork files to the correct product SKU</p>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.filter(c => orphans.some(o => o.company_id === c.id)).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Search filename or SKU" value={search} onChange={e => setSearch(e.target.value)} className="w-[280px]" />
        <div className="flex-1" />
        <Badge variant="outline" className="text-sm">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {orphans.length} total orphans · {filtered.length} shown
        </Badge>
        <Button variant="outline" onClick={runSuggest} disabled={!someChecked || suggesting}>
          {suggesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          AI Suggest for Selected
        </Button>
        <Button onClick={apply} disabled={selectedToApplyCount === 0 || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Apply {selectedToApplyCount > 0 ? `(${selectedToApplyCount})` : ''}
        </Button>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No orphaned artwork files</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-sm font-medium">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <span className="w-16">Preview</span>
            <span className="flex-1">Filename / Company</span>
            <span className="w-[180px]">Current SKU</span>
            <span className="w-[320px]">Map to Product</span>
            <span className="w-[120px]">AI</span>
          </div>
          <ScrollArea className="h-[calc(100vh-340px)]">
            {filtered.map(o => {
              const sug = suggestions[o.id];
              const sel = selections[o.id];
              const companyProducts = productsByCompany[o.company_id] || [];
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 border-b hover:bg-muted/20">
                  <Checkbox checked={!!checked[o.id]} onCheckedChange={(v) => setChecked(c => ({ ...c, [o.id]: !!v }))} />
                  <div className="w-16 h-16 bg-muted rounded overflow-hidden flex items-center justify-center">
                    {o.preview_url ? (
                      <img src={o.preview_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No img</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={o.filename}>{o.filename}</div>
                    <div className="text-xs text-muted-foreground">{companyName(o.company_id)} · {new Date(o.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="w-[180px]">
                    <Badge variant="outline" className="text-xs font-mono">{o.sku || '(none)'}</Badge>
                  </div>
                  <div className="w-[320px]">
                    <ProductPicker
                      products={companyProducts}
                      value={sel?.sku || ''}
                      onChange={(sku, name) => setSelections(s => ({ ...s, [o.id]: { sku, productName: name } }))}
                    />
                  </div>
                  <div className="w-[120px]">
                    {sug ? (
                      <Badge className={cn("text-xs", confidenceColor(sug.confidence))} title={sug.reason}>
                        {sug.confidence}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

function ProductPicker({ products, value, onChange }: { products: Product[]; value: string; onChange: (sku: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.item_id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? `${selected.name} · ${selected.item_id}` : 'Pick product…'}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product or SKU..." />
          <CommandList>
            <CommandEmpty>No product found</CommandEmpty>
            <CommandGroup>
              {products.map(p => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.item_id}`}
                  onSelect={() => { onChange(p.item_id!, p.name); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.item_id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{p.item_id}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
