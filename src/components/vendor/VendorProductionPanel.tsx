import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, Send, X, Trash2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductionUpdate {
  id: string;
  kind: string;
  note: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  percent_at_time: number | null;
  created_at: string;
  created_by: string | null;
  published_at: string | null;
  signedUrl?: string;
}

const DOC_KINDS = [
  { kind: "packing_list", label: "Packing List", hint: "The packing list for this shipment" },
  { kind: "proof", label: "Order Proofs", hint: "Proofs for the order (photos or PDFs)" },
  { kind: "shipped_qty_sheet", label: "Shipped Qty Sheet", hint: "Sheet of quantities shipped per SKU" },
  { kind: "final_invoice", label: "Final Invoice", hint: "Your final invoice for this PO" },
] as const;

const isImage = (name: string | null) => !!name && /\.(png|jpe?g|gif|webp)$/i.test(name);

/**
 * Production progress + shipment documents — the exact panel vendors see on
 * their PO page. Vibe-admins render the same panel on the admin PO detail
 * (percent saves go through vendor_update_po_details, which has an admin
 * bypass; posting and deleting are covered by RLS on the updates table).
 */
export default function VendorProductionPanel({ poId }: { poId: string }) {
  const { toast } = useToast();

  const [percent, setPercent] = useState(0);
  const [savedPercent, setSavedPercent] = useState(0);
  const [updates, setUpdates] = useState<ProductionUpdate[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [isVibeAdmin, setIsVibeAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const pendingDocKindRef = useRef<string | null>(null);

  useEffect(() => {
    load();
  }, [poId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try {
      const [{ data: poData }, { data: updateData }, { data: { user } }] = await Promise.all([
        (supabase as any).from("vendor_pos").select("production_percent").eq("id", poId).maybeSingle(),
        (supabase as any)
          .from("vendor_po_production_updates")
          .select("id, kind, note, attachment_url, attachment_name, percent_at_time, created_at, created_by, published_at")
          .eq("vendor_po_id", poId)
          .order("created_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);

      setPercent(poData?.production_percent ?? 0);
      setSavedPercent(poData?.production_percent ?? 0);
      setUid(user?.id || null);

      if (user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        setIsVibeAdmin((roles || []).some((r: any) => String(r.role) === "vibe_admin"));
      }

      // Attachments live in the private po-documents bucket — sign for display.
      const rows = (updateData || []) as ProductionUpdate[];
      const paths = rows.filter((u) => u.attachment_url).map((u) => u.attachment_url as string);
      if (paths.length > 0) {
        const { data: signed } = await (supabase as any).storage
          .from("po-documents")
          .createSignedUrls(paths, 60 * 60);
        const byPath = new Map<string, string>(
          (signed || []).filter((s: any) => s.signedUrl).map((s: any) => [s.path, s.signedUrl])
        );
        rows.forEach((u) => {
          if (u.attachment_url) u.signedUrl = byPath.get(u.attachment_url);
        });
      }
      setUpdates(rows);
    } catch (error: any) {
      console.error("Error loading production panel:", error);
    } finally {
      setLoading(false);
    }
  };

  const savePercent = async (value: number) => {
    const { data, error } = await (supabase as any).rpc("vendor_update_po_details", {
      p_po_id: poId,
      p_production_percent: value,
    });
    if (error || data?.success === false) {
      console.error("Error saving percent:", error || data?.error);
      toast({ title: "Change didn't save", description: error?.message || data?.error || "Try again", variant: "destructive" });
      setPercent(savedPercent);
    } else {
      setSavedPercent(value);
    }
  };

  const uploadAttachment = async (f: File): Promise<{ path: string; name: string }> => {
    if (!uid) throw new Error("Not signed in");
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${uid}/vendor-updates/${poId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await (supabase as any).storage.from("po-documents").upload(path, f);
    if (upErr) throw upErr;
    return { path, name: f.name };
  };

  const postUpdate = async () => {
    if (!note.trim() && !file) return;
    setPosting(true);
    try {
      let attachment: { path: string; name: string } | null = null;
      if (file) attachment = await uploadAttachment(file);

      const { error: insErr } = await (supabase as any)
        .from("vendor_po_production_updates")
        .insert({
          vendor_po_id: poId,
          kind: "update",
          note: note.trim() || null,
          attachment_url: attachment?.path || null,
          attachment_name: attachment?.name || null,
          percent_at_time: percent,
        });
      if (insErr) throw insErr;

      setNote("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (error: any) {
      console.error("Error posting update:", error);
      toast({ title: "Update didn't post", description: error.message || "Try again", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const uploadDoc = async (kind: string, f: File) => {
    setUploadingKind(kind);
    try {
      const attachment = await uploadAttachment(f);
      const { error: insErr } = await (supabase as any)
        .from("vendor_po_production_updates")
        .insert({
          vendor_po_id: poId,
          kind,
          attachment_url: attachment.path,
          attachment_name: attachment.name,
        });
      if (insErr) throw insErr;
      await load();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast({ title: "Upload failed", description: error.message || "Try again", variant: "destructive" });
    } finally {
      setUploadingKind(null);
    }
  };

  const canDelete = (u: ProductionUpdate) => isVibeAdmin || (!!uid && u.created_by === uid);

  // Vibe admin decides which notes customers see (vendor- or admin-authored).
  const togglePublish = async (u: ProductionUpdate) => {
    const publish = !u.published_at;
    const { data, error } = await (supabase as any)
      .from("vendor_po_production_updates")
      .update({ published_at: publish ? new Date().toISOString() : null })
      .eq("id", u.id)
      .select("id");
    if (error || !data?.length) {
      toast({ title: "Couldn't update", description: error?.message || "Not allowed", variant: "destructive" });
      return;
    }
    setUpdates((prev) =>
      prev.map((row) => (row.id === u.id ? { ...row, published_at: publish ? new Date().toISOString() : null } : row))
    );
  };

  const publishButton = (u: ProductionUpdate) =>
    isVibeAdmin && (
      <button
        onClick={() => togglePublish(u)}
        title={u.published_at ? "Visible to customer — click to unpublish" : "Hidden from customer — click to publish"}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0",
          u.published_at
            ? "border-success/40 text-success hover:bg-success/10"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
        )}
      >
        {u.published_at ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {u.published_at ? "Published" : "Publish"}
      </button>
    );

  const deleteUpdate = async (u: ProductionUpdate) => {
    if (!confirm(`Delete ${u.attachment_name || "this update"}? This can't be undone.`)) return;
    setDeletingId(u.id);
    try {
      // .select() so a delete silently blocked by RLS reads as a failure.
      const { data, error } = await (supabase as any)
        .from("vendor_po_production_updates")
        .delete()
        .eq("id", u.id)
        .select("id");
      if (error || !data?.length) {
        toast({ title: "Couldn't delete", description: error?.message || "Not allowed", variant: "destructive" });
        return;
      }
      if (u.attachment_url) {
        // Best effort — if the storage policy blocks it the file is just orphaned,
        // and it's already invisible everywhere once the row is gone.
        try {
          await (supabase as any).storage.from("po-documents").remove([u.attachment_url]);
        } catch { /* ignore */ }
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const deleteButton = (u: ProductionUpdate) =>
    canDelete(u) && (
      <button
        onClick={() => deleteUpdate(u)}
        disabled={deletingId === u.id}
        title="Delete"
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        {deletingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const updateFeed = updates.filter((u) => u.kind === "update");
  const docsOfKind = (kind: string) => updates.filter((u) => u.kind === kind && u.attachment_url);

  return (
    <div className="space-y-6">
      {/* Production progress & notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Production progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              onMouseUp={() => savePercent(percent)}
              onTouchEnd={() => savePercent(percent)}
              onKeyUp={() => savePercent(percent)}
              className="flex-1 accent-primary cursor-pointer"
            />
            <div className={cn("text-2xl font-semibold w-20 text-right", percent === 100 && "text-success")}>
              {percent}%
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", percent === 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Post a production note / attachment */}
          <div className="space-y-2 pt-1">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a production note for the team…"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-1.5" /> Attach file
              </Button>
              {file && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              <div className="flex-1" />
              <Button size="sm" onClick={postUpdate} disabled={posting || (!note.trim() && !file)}>
                {posting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Post update
              </Button>
            </div>
          </div>

          {/* Updates feed */}
          {updateFeed.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-border">
              {updateFeed.map((u) => (
                <div key={u.id} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(u.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      {u.percent_at_time != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{u.percent_at_time}%</Badge>}
                      {publishButton(u)}
                      {deleteButton(u)}
                    </div>
                    {u.note && <p className="mt-0.5 whitespace-pre-wrap">{u.note}</p>}
                    {u.signedUrl && (
                      isImage(u.attachment_name) ? (
                        <a href={u.signedUrl} target="_blank" rel="noreferrer" className="block mt-2">
                          <img src={u.signedUrl} alt={u.attachment_name || "attachment"} className="max-h-40 rounded-md border border-border" />
                        </a>
                      ) : (
                        <a
                          href={u.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 mt-1 text-primary hover:underline text-xs"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {u.attachment_name || "Attachment"}
                        </a>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shipment documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shipment documents</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={docInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const kind = pendingDocKindRef.current;
              if (f && kind) uploadDoc(kind, f);
              pendingDocKindRef.current = null;
              if (docInputRef.current) docInputRef.current.value = "";
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOC_KINDS.map((dk) => {
              const docs = docsOfKind(dk.kind);
              return (
                <div key={dk.kind} className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <div className="text-sm font-medium">{dk.label}</div>
                    <div className="text-xs text-muted-foreground">{dk.hint}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={uploadingKind === dk.kind}
                    onClick={() => { pendingDocKindRef.current = dk.kind; docInputRef.current?.click(); }}
                  >
                    {uploadingKind === dk.kind
                      ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      : <Paperclip className="h-4 w-4 mr-1.5" />}
                    Upload
                  </Button>
                  {docs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60">Nothing uploaded yet</p>
                  ) : (
                    <div className="space-y-1">
                      {docs.map((d) => (
                        <div key={d.id} className="flex items-center gap-1.5 min-w-0">
                          <a
                            href={d.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline min-w-0 flex-1"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{d.attachment_name}</span>
                          </a>
                          {deleteButton(d)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
