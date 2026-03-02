import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Hash,
  MessageSquare,
  Plus,
  Send,
  Paperclip,
  X,
  Reply,
  Download,
  Users,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  is_dm: boolean;
  created_at: string;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  parent_message_id: string | null;
  created_at: string;
  is_edited: boolean;
  user_email?: string;
  reply_count?: number;
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
}

export default function Chat() {
  const { isVibeAdmin } = useActiveCompany();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadReply, setThreadReply] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Load channels
  useEffect(() => {
    if (!isVibeAdmin) return;
    loadChannels();
  }, [isVibeAdmin]);

  const loadChannels = async () => {
    const { data } = await supabase
      .from("chat_channels")
      .select("*")
      .order("created_at");
    if (data) {
      setChannels(data);
      if (!activeChannel && data.length > 0) {
        setActiveChannel(data[0]);
        setShowMobileSidebar(false);
      }
    }
    setLoading(false);
  };

  // Load messages for active channel
  useEffect(() => {
    if (!activeChannel) return;
    loadMessages();
  }, [activeChannel?.id]);

  const loadMessages = async () => {
    if (!activeChannel) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_id", activeChannel.id)
      .is("parent_message_id", null)
      .order("created_at");

    if (data) {
      // Get reply counts
      const messageIds = data.map((m) => m.id);
      const { data: replies } = await supabase
        .from("chat_messages")
        .select("parent_message_id")
        .in("parent_message_id", messageIds);

      const replyCounts: Record<string, number> = {};
      replies?.forEach((r) => {
        if (r.parent_message_id) {
          replyCounts[r.parent_message_id] = (replyCounts[r.parent_message_id] || 0) + 1;
        }
      });

      // Get attachments
      const { data: attachments } = await supabase
        .from("chat_message_attachments")
        .select("*")
        .in("message_id", messageIds);

      const attachmentMap: Record<string, Attachment[]> = {};
      attachments?.forEach((a) => {
        if (!attachmentMap[a.message_id]) attachmentMap[a.message_id] = [];
        attachmentMap[a.message_id].push(a);
      });

      // Resolve emails
      const userIds = [...new Set(data.map((m) => m.user_id))];
      await resolveEmails(userIds);

      setMessages(
        data.map((m) => ({
          ...m,
          reply_count: replyCounts[m.id] || 0,
          attachments: attachmentMap[m.id] || [],
        }))
      );
    }
  };

  const resolveEmails = async (userIds: string[]) => {
    const missing = userIds.filter((id) => !userEmails[id]);
    if (missing.length === 0) return;

    const { data } = await supabase.rpc("get_all_portal_users");
    if (data) {
      const map: Record<string, string> = { ...userEmails };
      data.forEach((u: any) => {
        map[u.user_id] = u.email;
      });
      setUserEmails(map);
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!activeChannel) return;
    const channel = supabase
      .channel(`chat-${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        () => {
          loadMessages();
          if (threadParent) loadThread(threadParent.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel?.id, threadParent?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && pendingFiles.length === 0) || !activeChannel || !currentUserId) return;

    const content = newMessage.trim() || (pendingFiles.length > 0 ? `📎 ${pendingFiles.length} file(s)` : "");
    setNewMessage("");

    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: activeChannel.id, user_id: currentUserId, content })
      .select()
      .single();

    if (error) {
      toast({ title: "Error sending message", variant: "destructive" });
      return;
    }

    // Upload files
    if (msg && pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const path = `${activeChannel.id}/${msg.id}/${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("chat-files")
          .upload(path, file);

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from("chat-files")
            .getPublicUrl(path);

          await supabase.from("chat_message_attachments").insert({
            message_id: msg.id,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
          });
        }
      }
      setPendingFiles([]);
    }
  };

  const sendThreadReply = async () => {
    if (!threadReply.trim() || !threadParent || !currentUserId || !activeChannel) return;

    const content = threadReply.trim();
    setThreadReply("");

    await supabase.from("chat_messages").insert({
      channel_id: activeChannel.id,
      user_id: currentUserId,
      content,
      parent_message_id: threadParent.id,
    });
  };

  const loadThread = async (parentId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("parent_message_id", parentId)
      .order("created_at");

    if (data) {
      const userIds = [...new Set(data.map((m) => m.user_id))];
      await resolveEmails(userIds);
      setThreadMessages(data);
    }
  };

  const openThread = async (msg: Message) => {
    setThreadParent(msg);
    await loadThread(msg.id);
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    const { error } = await supabase.from("chat_channels").insert({
      name: newChannelName.trim().toLowerCase().replace(/\s+/g, "-"),
      description: newChannelDesc || null,
      created_by: currentUserId,
    });
    if (!error) {
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelDesc("");
      loadChannels();
    }
  };

  const getInitials = (email: string) => {
    return email?.split("@")[0]?.slice(0, 2).toUpperCase() || "??";
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
    return format(d, "MMM d, h:mm a");
  };

  const getDateDivider = (ts: string) => {
    const d = new Date(ts);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMMM d");
  };

  if (!isVibeAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Access restricted to team members.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-border bg-background">
      {/* Channel Sidebar */}
      <div
        className={cn(
          "w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col",
          "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-72 max-md:bg-background",
          !showMobileSidebar && "max-md:hidden"
        )}
      >
        <div className="p-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">Chat</h2>
          <Dialog open={showNewChannel} onOpenChange={setShowNewChannel}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. shipping-updates"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="What's this channel about?"
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                  />
                </div>
                <Button onClick={createChannel} className="w-full">
                  Create Channel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </p>
            {channels
              .filter((c) => !c.is_dm)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveChannel(c);
                    setThreadParent(null);
                    setShowMobileSidebar(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                    activeChannel?.id === c.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Header */}
        {activeChannel && (
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setShowMobileSidebar(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Hash className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-sm">{activeChannel.name}</h3>
              {activeChannel.description && (
                <p className="text-xs text-muted-foreground">{activeChannel.description}</p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 space-y-1">
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDate =
                !prevMsg ||
                getDateDivider(msg.created_at) !== getDateDivider(prevMsg.created_at);
              const sameUser =
                prevMsg &&
                prevMsg.user_id === msg.user_id &&
                !showDate &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;

              const email = userEmails[msg.user_id] || "unknown";

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-3 my-4">
                      <Separator className="flex-1" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {getDateDivider(msg.created_at)}
                      </span>
                      <Separator className="flex-1" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "group flex gap-3 hover:bg-muted/50 rounded-md px-2 py-1 transition-colors",
                      sameUser ? "pt-0" : "pt-2"
                    )}
                  >
                    {!sameUser ? (
                      <Avatar className="h-8 w-8 mt-0.5 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/20 text-primary">
                          {getInitials(email)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {!sameUser && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm">
                            {email.split("@")[0]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {msg.attachments.map((a) => (
                            <a
                              key={a.id}
                              href={a.file_url}
                              target="_blank"
                              rel="noopener"
                              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/50 text-xs hover:bg-muted transition-colors"
                            >
                              <Paperclip className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{a.file_name}</span>
                              <Download className="h-3 w-3 text-muted-foreground" />
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Thread indicator */}
                      {(msg.reply_count ?? 0) > 0 && (
                        <button
                          onClick={() => openThread(msg)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          <MessageSquare className="h-3 w-3" />
                          {msg.reply_count} {msg.reply_count === 1 ? "reply" : "replies"}
                        </button>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-start gap-1 shrink-0 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openThread(msg)}
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Composer */}
        {activeChannel && (
          <div className="p-4 border-t border-border">
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{f.name}</span>
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message #${activeChannel.name}`}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={!newMessage.trim() && pendingFiles.length === 0}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Thread Panel */}
      {threadParent && (
        <div className="w-80 border-l border-border flex flex-col shrink-0 max-lg:absolute max-lg:right-0 max-lg:inset-y-0 max-lg:z-20 max-lg:bg-background max-lg:w-80 max-lg:shadow-lg">
          <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
            <h4 className="font-semibold text-sm">Thread</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setThreadParent(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 px-4">
            <div className="py-4 space-y-3">
              {/* Parent message */}
              <div className="flex gap-3 pb-3 border-b border-border">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {getInitials(userEmails[threadParent.user_id] || "")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">
                      {(userEmails[threadParent.user_id] || "").split("@")[0]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(threadParent.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{threadParent.content}</p>
                </div>
              </div>

              {/* Replies */}
              {threadMessages.map((msg) => {
                const email = userEmails[msg.user_id] || "unknown";
                return (
                  <div key={msg.id} className="flex gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                        {getInitials(email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm">{email.split("@")[0]}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>
          </ScrollArea>

          {/* Thread composer */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={threadReply}
                onChange={(e) => setThreadReply(e.target.value)}
                placeholder="Reply..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendThreadReply();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={sendThreadReply}
                disabled={!threadReply.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
