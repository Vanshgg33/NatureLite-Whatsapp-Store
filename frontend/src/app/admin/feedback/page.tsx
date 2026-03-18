'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Star, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { Feedback } from '@/types';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  acknowledged: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const typeColors: Record<string, string> = {
  review: 'bg-purple-100 text-purple-800',
  complaint: 'bg-red-100 text-red-800',
  suggestion: 'bg-blue-100 text-blue-800',
  general: 'bg-gray-100 text-gray-800',
};

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-feedback', page, typeFilter, statusFilter],
    queryFn: () =>
      api.getAllFeedback({
        page,
        limit: 20,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      api.respondToFeedback(id, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
      setResponseText('');
      setExpandedId(null);
      toast({ title: 'Response sent' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateFeedbackStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
      toast({ title: 'Status updated' });
    },
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Feedback" description="Manage customer feedback and reviews" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const feedbackItems = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div>
      <Header title="Feedback" description="Manage customer feedback and reviews" />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Types</option>
            <option value="review">Review</option>
            <option value="complaint">Complaint</option>
            <option value="suggestion">Suggestion</option>
            <option value="general">General</option>
          </select>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        {/* Feedback List */}
        {feedbackItems.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
              No feedback found
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {feedbackItems.map((item: Feedback) => (
              <Card key={item._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={typeColors[item.type] || typeColors.general}>
                          {item.type}
                        </Badge>
                        <Badge className={statusColors[item.status] || statusColors.pending}>
                          {item.status}
                        </Badge>
                        {item.rating && (
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  'h-3 w-3',
                                  i < (item.rating ?? 0)
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                )}
                              />
                            ))}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm">{item.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        By: {typeof item.user === 'object' && item.user ? (item.user.name ?? item.user.email ?? 'Unknown') : 'Unknown'}
                        {item.order && ` | Order: ${typeof item.order === 'string' ? item.order : (item.order as { orderNumber?: string }).orderNumber ?? ''}`}
                      </p>

                      {/* Admin Response */}
                      {item.adminResponse && (
                        <div className="mt-3 p-3 bg-primary/5 rounded-lg border-l-2 border-primary">
                          <p className="text-xs font-medium text-primary mb-1">Admin Response:</p>
                          <p className="text-sm">{item.adminResponse}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status Dropdown */}
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={item.status}
                        onChange={(e) =>
                          statusMutation.mutate({ id: item._id, status: e.target.value })
                        }
                      >
                        <option value="pending">Pending</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>

                      {/* Expand/Collapse */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedId(expandedId === item._id ? null : item._id)
                        }
                      >
                        {expandedId === item._id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Response Form */}
                  {expandedId === item._id && (
                    <div className="mt-4 pt-4 border-t flex gap-2">
                      <Input
                        placeholder="Write a response..."
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={respondMutation.isPending || !responseText.trim()}
                        onClick={() =>
                          respondMutation.mutate({ id: item._id, response: responseText })
                        }
                      >
                        <Send className="mr-1 h-3 w-3" />
                        Respond
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
