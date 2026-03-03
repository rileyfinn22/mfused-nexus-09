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
  ChevronLeft,
  User,
  Trash2,
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

interface ChatProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_color: string;
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
  const [chatProfiles, setChatProfiles] = useState<ChatProfile[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ChatProfile>>({});
  const [showNewDm, setShowNewDm] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Load chat profiles
  useEffect(() => {
    if (!isVibeAdmin) return;
    loadProfiles();
  }, [isVibeAdmin]);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from("chat_profiles")
      .select("*");
    if (data) {
      setChatProfiles(data);
      const map: Record<string, ChatProfile> = {};
      data.forEach((p: ChatProfile) => {
        map[p.user_id] = p;
      });
      setProfileMap(map);
    }
  };

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

  // Track per-channel unread counts using last_seen_at
  useEffect(() => {
    if (!currentUserId || channels.length === 0) return;
    let cancelled = false;

    const fetchUnreadCounts = async () => {
      // Get memberships with last_seen_at
      const { data: memberships } = await supabase
        .from('chat_channel_members')
        .select('channel_id, last_seen_at')
        .eq('user_id', currentUserId);

      const seenMap: Record<string, string> = {};
      memberships?.forEach(m => { seenMap[m.channel_id] = m.last_seen_at || new Date(0).toISOString(); });

      const counts: Record<string, number> = {};
      for (const ch of channels) {
        if (ch.id === activeChannel?.id) {
          counts[ch.id] = 0;
          continue;
        }
        const lastSeen = seenMap[ch.id] || new Date(0).toISOString();
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', ch.id)
          .neq('user_id', currentUserId)
          .gt('created_at', lastSeen);
        counts[ch.id] = count || 0;
      }
      if (!cancelled) setUnreadCounts(counts);
    };

    fetchUnreadCounts();

    const realtimeChannel = supabase
      .channel('chat-unread-per-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any;
        if (msg.user_id !== currentUserId) {
          // Play notification sound
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
          } catch (e) { /* audio not available */ }

          if (msg.channel_id !== activeChannel?.id) {
            setUnreadCounts(prev => ({
              ...prev,
              [msg.channel_id]: (prev[msg.channel_id] || 0) + 1,
            }));
          }
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(realtimeChannel); };
  }, [currentUserId, channels.length, activeChannel?.id]);

  // Mark channel as seen when switching to it
  useEffect(() => {
    if (!activeChannel || !currentUserId) return;
    setUnreadCounts(prev => ({ ...prev, [activeChannel.id]: 0 }));

    // Update last_seen_at in DB
    supabase
      .from('chat_channel_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('channel_id', activeChannel.id)
      .eq('user_id', currentUserId)
      .then();
  }, [activeChannel?.id]);

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

      const { data: attachments } = await supabase
        .from("chat_message_attachments")
        .select("*")
        .in("message_id", messageIds);

      const attachmentMap: Record<string, Attachment[]> = {};
      attachments?.forEach((a) => {
        if (!attachmentMap[a.message_id]) attachmentMap[a.message_id] = [];
        attachmentMap[a.message_id].push(a);
      });

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

  // Helper: get display name for a user
  const getDisplayName = (userId: string): string => {
    if (profileMap[userId]) return profileMap[userId].display_name;
    const email = userEmails[userId];
    return email ? email.split("@")[0] : "unknown";
  };

  const getAvatarColor = (userId: string): string => {
    return profileMap[userId]?.avatar_color || "";
  };

  const getInitials = (userId: string) => {
    const name = getDisplayName(userId);
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // DM helpers — UUIDs contain hyphens so we can't split by "-"
  // DM channel name format: "dm-<uuid1>-<uuid2>" where each UUID is 36 chars
  const parseDmUserIds = (channelName: string): [string, string] | null => {
    if (!channelName.startsWith("dm-")) return null;
    const rest = channelName.slice(3); // remove "dm-"
    // rest = "uuid1-uuid2" — uuid1 is 36 chars, then "-", then uuid2 is 36 chars
    if (rest.length < 73) return null; // 36 + 1 + 36
    const id1 = rest.slice(0, 36);
    const id2 = rest.slice(37);
    return [id1, id2];
  };

  const getDmDisplayName = (channel: Channel): string => {
    if (!currentUserId) return channel.name;
    const ids = parseDmUserIds(channel.name);
    if (ids) {
      const otherUserId = ids[0] === currentUserId ? ids[1] : ids[0];
      return getDisplayName(otherUserId);
    }
    return channel.name;
  };

  const getDmOtherUserId = (channel: Channel): string | null => {
    if (!currentUserId) return null;
    const ids = parseDmUserIds(channel.name);
    if (ids) {
      return ids[0] === currentUserId ? ids[1] : ids[0];
    }
    return null;
  };

  const deleteChannel = async (channelId: string) => {
    // Delete messages, members, attachments, then channel
    const { data: msgs } = await supabase.from("chat_messages").select("id").eq("channel_id", channelId);
    if (msgs && msgs.length > 0) {
      const msgIds = msgs.map(m => m.id);
      await supabase.from("chat_message_attachments").delete().in("message_id", msgIds);
      await supabase.from("chat_messages").delete().eq("channel_id", channelId);
    }
    await supabase.from("chat_channel_members").delete().eq("channel_id", channelId);
    await supabase.from("chat_channels").delete().eq("id", channelId);

    if (activeChannel?.id === channelId) {
      setActiveChannel(null);
      setShowMobileSidebar(true);
    }
    setChannels(prev => prev.filter(c => c.id !== channelId));
    toast({ title: "Channel deleted" });
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && pendingFiles.length === 0) || !activeChannel || !currentUserId) return;

    const content = newMessage.trim() || (pendingFiles.length > 0 ? `📎 ${pendingFiles.length} file(s)` : "");
    setNewMessage("");
    setMentionQuery(null);

    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: activeChannel.id, user_id: currentUserId, content })
      .select()
      .single();

    if (error) {
      toast({ title: "Error sending message", variant: "destructive" });
      return;
    }

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

  const startDm = async (targetUserId: string) => {
    if (!currentUserId) return;
    // Check if DM channel already exists between these two users
    const dmChannels = channels.filter((c) => c.is_dm);
    const existing = dmChannels.find((c) => {
      const parts = c.name.split("-");
      if (parts.length >= 3) {
        const id1 = parts[1];
        const id2 = parts.slice(2).join("-");
        return (
          (id1 === currentUserId && id2 === targetUserId) ||
          (id1 === targetUserId && id2 === currentUserId)
        );
      }
      return false;
    });

    if (existing) {
      setActiveChannel(existing);
      setShowNewDm(false);
      setShowMobileSidebar(false);
      return;
    }

    // Create new DM channel
    const { data, error } = await supabase
      .from("chat_channels")
      .insert({
        name: `dm-${currentUserId}-${targetUserId}`,
        is_dm: true,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (!error && data) {
      // Add both members
      await supabase.from("chat_channel_members").insert([
        { channel_id: data.id, user_id: currentUserId },
        { channel_id: data.id, user_id: targetUserId },
      ]);
      setShowNewDm(false);
      await loadChannels();
      setActiveChannel(data);
      setShowMobileSidebar(false);
    }
  };

  // @mention logic
  const filteredMentions = chatProfiles.filter((p) => {
    if (mentionQuery === null) return false;
    if (mentionQuery === "") return true;
    return p.display_name.toLowerCase().includes(mentionQuery.toLowerCase());
  });

  const handleComposerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    setNewMessage(val);
    setCursorPos(pos);

    // Check for @ trigger
    const textBeforeCursor = val.slice(0, pos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (profile: ChatProfile) => {
    const textBeforeCursor = newMessage.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const beforeAt = textBeforeCursor.slice(0, atMatch.index);
      const afterCursor = newMessage.slice(cursorPos);
      const newVal = `${beforeAt}@${profile.display_name} ${afterCursor}`;
      setNewMessage(newVal);
      setMentionQuery(null);
      composerRef.current?.focus();
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Render message content with @mention highlighting
  const renderContent = (content: string) => {
    const mentionRegex = /@([\w\s]+?)(?=\s@|\s|$)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const isRealMention = chatProfiles.some(
        (p) => p.display_name.toLowerCase() === name.toLowerCase()
      );

      if (isRealMention) {
        if (match.index > lastIndex) {
          parts.push(content.slice(lastIndex, match.index));
        }
        parts.push(
          <span
            key={match.index}
            className="bg-primary/15 text-primary font-medium rounded px-0.5"
          >
            @{name}
          </span>
        );
        lastIndex = match.index + match[0].length;
      }
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
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

  const dmChannels = channels.filter((c) => c.is_dm);
  const regularChannels = channels.filter((c) => !c.is_dm);

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
            {/* Channels Section */}
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </p>
            {regularChannels.map((c) => (
              <div key={c.id} className="group relative flex items-center">
                <button
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
                  <span className="truncate flex-1">{c.name}</span>
                  {(unreadCounts[c.id] || 0) > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                      {unreadCounts[c.id] > 99 ? '99+' : unreadCounts[c.id]}
                    </span>
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteChannel(c.id); }}
                  className="absolute right-1 hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Delete channel"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Direct Messages Section */}
            <div className="pt-4">
              <div className="flex items-center justify-between px-3 py-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Direct Messages
                </p>
                <Dialog open={showNewDm} onOpenChange={setShowNewDm}>
                  <DialogTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Direct Message</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1 pt-2">
                      {chatProfiles
                        .filter((p) => p.user_id !== currentUserId)
                        .map((p) => (
                          <button
                            key={p.user_id}
                            onClick={() => startDm(p.user_id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors text-left"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback
                                className="text-xs text-primary-foreground font-medium"
                                style={{ backgroundColor: p.avatar_color }}
                              >
                                {p.display_name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{p.display_name}</span>
                          </button>
                        ))}
                      {chatProfiles.filter((p) => p.user_id !== currentUserId).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No team members found. Add profiles first.
                        </p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {dmChannels.map((c) => {
                const otherUserId = getDmOtherUserId(c);
                const dmName = getDmDisplayName(c);
                const color = otherUserId ? getAvatarColor(otherUserId) : "";
                return (
                  <div key={c.id} className="group relative flex items-center">
                    <button
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
                      <Avatar className="h-5 w-5">
                        <AvatarFallback
                          className="text-[9px] text-primary-foreground font-medium"
                          style={{ backgroundColor: color || undefined }}
                        >
                          {dmName.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{dmName}</span>
                      {(unreadCounts[c.id] || 0) > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                          {unreadCounts[c.id] > 99 ? '99+' : unreadCounts[c.id]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChannel(c.id); }}
                      className="absolute right-1 hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
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
            {activeChannel.is_dm ? (
              <>
                <User className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-sm">{getDmDisplayName(activeChannel)}</h3>
              </>
            ) : (
              <>
                <Hash className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold text-sm">{activeChannel.name}</h3>
                  {activeChannel.description && (
                    <p className="text-xs text-muted-foreground">{activeChannel.description}</p>
                  )}
                </div>
              </>
            )}
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

              const displayName = getDisplayName(msg.user_id);
              const avatarColor = getAvatarColor(msg.user_id);

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
                        <AvatarFallback
                          className="text-xs font-medium"
                          style={avatarColor ? { backgroundColor: avatarColor, color: "white" } : undefined}
                        >
                          {getInitials(msg.user_id)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {!sameUser && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm">{displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {renderContent(msg.content)}
                      </p>
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
          <div className="p-4 border-t border-border relative">
            {/* @mention dropdown */}
            {mentionQuery !== null && filteredMentions.length > 0 && (
              <div
                ref={mentionRef}
                className="absolute bottom-full left-4 right-4 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-30"
              >
                {filteredMentions.map((p, idx) => (
                  <button
                    key={p.user_id}
                    onClick={() => insertMention(p)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                      idx === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    )}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback
                        className="text-[10px] text-primary-foreground font-medium"
                        style={{ backgroundColor: p.avatar_color }}
                      >
                        {p.display_name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{p.display_name}</span>
                  </button>
                ))}
              </div>
            )}
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
                ref={composerRef}
                value={newMessage}
                onChange={handleComposerChange}
                placeholder={
                  activeChannel.is_dm
                    ? `Message ${getDmDisplayName(activeChannel)}`
                    : `Message #${activeChannel.name}`
                }
                className="flex-1"
                onKeyDown={handleComposerKeyDown}
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
                  <AvatarFallback
                    className="text-xs font-medium"
                    style={
                      getAvatarColor(threadParent.user_id)
                        ? { backgroundColor: getAvatarColor(threadParent.user_id), color: "white" }
                        : undefined
                    }
                  >
                    {getInitials(threadParent.user_id)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">
                      {getDisplayName(threadParent.user_id)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(threadParent.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {renderContent(threadParent.content)}
                  </p>
                </div>
              </div>

              {/* Replies */}
              {threadMessages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback
                      className="text-[10px] font-medium"
                      style={
                        getAvatarColor(msg.user_id)
                          ? { backgroundColor: getAvatarColor(msg.user_id), color: "white" }
                          : undefined
                      }
                    >
                      {getInitials(msg.user_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">{getDisplayName(msg.user_id)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">
                      {renderContent(msg.content)}
                    </p>
                  </div>
                </div>
              ))}
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
