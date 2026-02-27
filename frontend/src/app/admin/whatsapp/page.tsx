'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Send, MessageCircle, User, Bot } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function WhatsAppPage() {
  const [phone, setPhone] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const { toast } = useToast();

  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-messages', searchPhone],
    queryFn: () => api.getWhatsAppMessages(searchPhone, 100),
    enabled: searchPhone.length >= 10,
  });

  const sendMutation = useMutation({
    mutationFn: ({ phone, message }: { phone: string; message: string }) =>
      api.sendWhatsAppMessage(phone, message),
    onSuccess: () => {
      setNewMessage('');
      refetch();
      toast({ title: 'Message sent' });
    },
    onError: () => {
      toast({ title: 'Failed to send message', variant: 'destructive' });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length >= 10) {
      setSearchPhone(phone);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !searchPhone) return;
    sendMutation.mutate({ phone: searchPhone, message: newMessage });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <Header title="WhatsApp" description="View conversations and send messages" />

      <div className="p-6 space-y-6">
        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter phone number (e.g., 919876543210)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={phone.length < 10}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Conversation */}
        {searchPhone && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Conversation with +{searchPhone}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Messages */}
              <div className="h-[500px] overflow-y-auto border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : messages && messages.length > 0 ? (
                  [...messages].reverse().map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-lg px-4 py-2 shadow-sm',
                          msg.direction === 'outgoing'
                            ? 'bg-primary text-white'
                            : 'bg-white border'
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.direction === 'incoming' ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Bot className="h-3 w-3" />
                          )}
                          <span className="text-xs opacity-70">
                            {msg.direction === 'incoming' ? 'Customer' : 'Store'}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.content?.text || msg.content?.templateName || '[Media]'}</p>
                        <p className={cn(
                          'text-xs mt-1',
                          msg.direction === 'outgoing' ? 'text-white/60' : 'text-muted-foreground'
                        )}>
                          {formatTime(msg.createdAt)}
                          {msg.status && (
                            <Badge variant="outline" className="ml-2 text-[10px] py-0">
                              {msg.status}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No messages found for this number
                  </div>
                )}
              </div>

              {/* Send Message */}
              <form onSubmit={handleSend} className="flex gap-3">
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
