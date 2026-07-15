'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Send, User, Bot, Pencil, Check, X, MessageCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

function formatTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function contactLabel(c: { phone: string; name: string | null }): string {
  return c.name?.trim() || `+${c.phone}`;
}

export default function WhatsAppPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameDraft, setEditNameDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: convoLoading } = useQuery({
    queryKey: ['whatsapp-conversations'],
    queryFn: () => api.listWhatsAppConversations(100),
    refetchInterval: 30_000,
  });

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['whatsapp-messages', selectedPhone],
    queryFn: () => api.getWhatsAppMessages(selectedPhone as string, 100),
    enabled: !!selectedPhone,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedPhone]);

  const sendMutation = useMutation({
    mutationFn: ({ phone, message }: { phone: string; message: string }) =>
      api.sendWhatsAppMessage(phone, message),
    onSuccess: () => {
      setNewMessage('');
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast({ title: 'Message sent' });
    },
    onError: () => toast({ title: 'Failed to send message', variant: 'destructive' }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ phone, name }: { phone: string; name: string }) =>
      api.updateWhatsAppContactName(phone, name),
    onSuccess: () => {
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast({ title: 'Name updated' });
    },
    onError: () => toast({ title: 'Failed to update name', variant: 'destructive' }),
  });

  const filteredConversations = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const label = contactLabel(c).toLowerCase();
      return label.includes(q) || c.phone.includes(q);
    });
  }, [conversations, searchText]);

  const selectedContact = useMemo(
    () => conversations.find((c) => c.phone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  );

  const handleSelect = (phone: string) => {
    setSelectedPhone(phone);
    setIsEditingName(false);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPhone) return;
    sendMutation.mutate({ phone: selectedPhone, message: newMessage.trim() });
  };

  const handleStartRename = () => {
    setEditNameDraft(selectedContact?.name ?? '');
    setIsEditingName(true);
  };

  const handleSaveRename = () => {
    if (!selectedPhone) return;
    const trimmed = editNameDraft.trim();
    if (!trimmed) {
      toast({ title: 'Name cannot be empty', variant: 'destructive' });
      return;
    }
    renameMutation.mutate({ phone: selectedPhone, name: trimmed });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="WhatsApp" description="Customer conversations and contact names" />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border-t min-h-0">
        {/* Left pane — conversation list */}
        <aside className="border-r bg-white flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or phone"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convoLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                {conversations.length === 0 ? 'No conversations yet.' : 'No matches.'}
              </div>
            ) : (
              <ul className="divide-y">
                {filteredConversations.map((c) => {
                  const isSelected = c.phone === selectedPhone;
                  return (
                    <li key={c.phone}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.phone)}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                          isSelected && 'bg-primary/5 border-l-2 border-primary',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-medium text-sm truncate">{contactLabel(c)}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {c.lastMessage ? formatRelative(c.lastMessage.at) : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {c.lastMessage?.direction === 'outbound' ? (
                            <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <p className="text-xs text-muted-foreground truncate">
                            {c.lastMessage?.preview}
                          </p>
                        </div>
                        {c.name ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">+{c.phone}</p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right pane — chat view */}
        <section className="flex flex-col min-h-0 bg-gray-50">
          {!selectedContact ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <Card className="rounded-none border-x-0 border-t-0 shadow-none">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editNameDraft}
                          onChange={(e) => setEditNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename();
                            if (e.key === 'Escape') setIsEditingName(false);
                          }}
                          placeholder="Customer name"
                          className="h-9"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSaveRename}
                          disabled={renameMutation.isPending}
                          aria-label="Save name"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setIsEditingName(false)}
                          disabled={renameMutation.isPending}
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {contactLabel(selectedContact)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            +{selectedContact.phone}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleStartRename}
                          aria-label="Edit name"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : messages && messages.length > 0 ? (
                  [...messages].reverse().map((msg, i) => {
                    const isOutbound = msg.direction === 'outbound' || msg.direction === 'outgoing';
                    const isInbound = msg.direction === 'inbound' || msg.direction === 'incoming';
                    const msgKey = (msg as any)._id || (msg as any).whatsappMessageId || i;
                    return (
                      <div
                        key={msgKey}
                        className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg px-4 py-2 shadow-sm',
                            isOutbound ? 'bg-primary text-white' : 'bg-white border',
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            {isInbound ? (
                              <User className="h-3 w-3" />
                            ) : (
                              <Bot className="h-3 w-3" />
                            )}
                            <span className="text-xs opacity-70">
                              {isInbound ? 'Customer' : 'Store'}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.content?.text || msg.content?.templateName || '[Media]'}
                          </p>
                          <p
                            className={cn(
                              'text-xs mt-1',
                              isOutbound ? 'text-white/60' : 'text-muted-foreground',
                            )}
                          >
                            {formatTime(msg.createdAt)}
                            {msg.status && (
                              <Badge variant="outline" className="ml-2 text-[10px] py-0">
                                {msg.status}
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No messages yet.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Send bar */}
              <form onSubmit={handleSend} className="p-3 border-t bg-white flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={sendMutation.isPending || !newMessage.trim()}>
                  <Send className="mr-2 h-4 w-4" />
                  {sendMutation.isPending ? 'Sending...' : 'Send'}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
