import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, Mail, Plus, Send, Loader2, Eye, FileText, Paperclip, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface AdditionalAttachment {
  file: File;
  base64: string;
}

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultTo?: string;
  defaultSubject: string;
  defaultMessage: string;
  attachmentName?: string;
  onSend: (data: {
    to: string[];
    subject: string;
    message: string;
    additionalAttachments?: AdditionalAttachment[];
  }) => Promise<void>;
  sending?: boolean;
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  title,
  defaultTo,
  defaultSubject,
  defaultMessage,
  attachmentName,
  onSend,
  sending = false,
}: EmailPreviewDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [activeTab, setActiveTab] = useState("compose");
  const [additionalAttachments, setAdditionalAttachments] = useState<AdditionalAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setEmails(defaultTo ? [defaultTo] : []);
      setCurrentEmail("");
      setActiveTab("compose");
      setAdditionalAttachments([]);
    }
  }, [open, defaultSubject, defaultMessage, defaultTo]);

  const addEmail = () => {
    const email = currentEmail.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (emails.includes(email)) {
      toast({
        title: "Duplicate email",
        description: "This email has already been added",
        variant: "destructive",
      });
      return;
    }

    setEmails([...emails, email]);
    setCurrentEmail("");
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails(emails.filter((e) => e !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEmail();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
    const MAX_TOTAL_SIZE = 40 * 1024 * 1024; // 40MB total

    // Calculate current total size
    const currentTotalSize = additionalAttachments.reduce((sum, a) => sum + a.file.size, 0);

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 25MB limit`,
          variant: "destructive",
        });
        continue;
      }

      if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        toast({
          title: "Total size limit reached",
          description: "Total attachments cannot exceed 40MB",
          variant: "destructive",
        });
        break;
      }

      // Check for duplicates
      if (additionalAttachments.some(a => a.file.name === file.name)) {
        toast({
          title: "Duplicate file",
          description: `${file.name} is already attached`,
          variant: "destructive",
        });
        continue;
      }

      // Convert to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get just the base64
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.readAsDataURL(file);
      });

      setAdditionalAttachments(prev => [...prev, { file, base64 }]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (fileName: string) => {
    setAdditionalAttachments(prev => prev.filter(a => a.file.name !== fileName));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if (emails.length === 0) {
      toast({
        title: "No recipients",
        description: "Please add at least one email address",
        variant: "destructive",
      });
      return;
    }

    await onSend({
      to: emails,
      subject,
      message,
      additionalAttachments: additionalAttachments.length > 0 ? additionalAttachments : undefined,
    });
  };

  // Convert message to HTML for preview (basic markdown-like conversion)
  const messageToHtml = (text: string) => {
    return text
      .split('\n')
      .map(line => line.trim() === '' ? '<br/>' : `<p style="margin: 8px 0;">${line}</p>`)
      .join('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Review and customize your email before sending
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4 mt-4">
            {/* Recipients */}
            <div className="space-y-2">
              <Label>To</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={currentEmail}
                  onChange={(e) => setCurrentEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button type="button" size="icon" variant="outline" onClick={addEmail}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {emails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 pr-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message..."
                rows={8}
                className="resize-none"
              />
            </div>

            {/* Attachments Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Attachments</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip"
                />
              </div>
              
              {/* Primary attachment */}
              {attachmentName && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1">{attachmentName}</span>
                  <Badge variant="outline">PDF</Badge>
                </div>
              )}
              
              {/* Additional attachments */}
              {additionalAttachments.map((attachment) => (
                <div key={attachment.file.name} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate" title={attachment.file.name}>
                    {attachment.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file.size)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAttachment(attachment.file.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {additionalAttachments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {additionalAttachments.length} additional file{additionalAttachments.length > 1 ? 's' : ''} • 
                  Total: {formatFileSize(additionalAttachments.reduce((sum, a) => sum + a.file.size, 0))}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <ScrollArea className="h-[400px] rounded-lg border bg-background">
              <div className="p-6">
                {/* Email Header Preview */}
                <div className="space-y-3 pb-4 border-b">
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">To:</span>
                    <div className="flex flex-wrap gap-1">
                      {emails.length > 0 ? (
                        emails.map((email) => (
                          <span key={email} className="text-sm font-medium">{email}</span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground italic">No recipients added</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-muted-foreground w-16">Subject:</span>
                    <span className="text-sm font-medium">{subject || "(No subject)"}</span>
                  </div>
                  {(attachmentName || additionalAttachments.length > 0) && (
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-muted-foreground w-16">Attach:</span>
                      <div className="flex flex-col gap-1">
                        {attachmentName && (
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-3 w-3" />
                            <span className="text-sm">{attachmentName}</span>
                          </div>
                        )}
                        {additionalAttachments.map((attachment) => (
                          <div key={attachment.file.name} className="flex items-center gap-2">
                            <Paperclip className="h-3 w-3" />
                            <span className="text-sm">{attachment.file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Email Body Preview */}
                <div className="pt-4">
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: messageToHtml(message) }}
                  />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Separator className="my-2" />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || emails.length === 0}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
