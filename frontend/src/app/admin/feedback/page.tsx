'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Star, Send, ChevronDown, ChevronUp, Upload, X } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { Feedback, Product } from '@/types';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  acknowledged: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const typeColors: Record<string, string> = {
  product_review: 'bg-purple-100 text-purple-800',
  complaint: 'bg-red-100 text-red-800',
  suggestion: 'bg-blue-100 text-blue-800',
  general: 'bg-gray-100 text-gray-800',
};

const emptyUploadForm = {
  productId: '',
  reviewerName: '',
  rating: 5,
  message: '',
};

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  // Upload Review dialog state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState(emptyUploadForm);
  const [uploadMedia, setUploadMedia] = useState<{ file: File; preview: string }[]>([]);
  const [uploadingReview, setUploadingReview] = useState(false);

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

  const { data: productsData } = useQuery({
    queryKey: ['products-for-review'],
    queryFn: () => api.getProducts({ limit: 200, isActive: true }),
    enabled: showUploadForm,
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

  const handleAdminUploadReview = async () => {
    if (!uploadForm.productId || !uploadForm.reviewerName.trim() || !uploadForm.message.trim()) {
      toast({ title: 'Fill in all required fields', variant: 'destructive' });
      return;
    }
    setUploadingReview(true);
    try {
      const images: string[] = [];
      const videos: string[] = [];
      for (const { file } of uploadMedia) {
        const { url } = await api.uploadReviewMedia(file);
        if (file.type.startsWith('video/')) videos.push(url);
        else images.push(url);
      }
      uploadMedia.forEach(({ preview }) => URL.revokeObjectURL(preview));
      await api.adminCreateReview({
        productId: uploadForm.productId,
        reviewerName: uploadForm.reviewerName,
        rating: uploadForm.rating,
        message: uploadForm.message,
        images,
        videos,
      });
      toast({ title: 'Review uploaded successfully' });
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
      setShowUploadForm(false);
      setUploadForm(emptyUploadForm);
      setUploadMedia([]); // previews already revoked above
    } catch {
      toast({ title: 'Failed to upload review', variant: 'destructive' });
    } finally {
      setUploadingReview(false);
    }
  };

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
  const products: Product[] = productsData?.items || [];

  return (
    <div>
      <Header title="Feedback" description="Manage customer feedback and reviews" />

      <div className="p-6 space-y-6">
        {/* Top bar: Filters + Upload Review button */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-3">
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Types</option>
              <option value="product_review">Review</option>
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
          <Button onClick={() => setShowUploadForm(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Review
          </Button>
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
                        {item.isAdminCurated && (
                          <Badge className="bg-amber-100 text-amber-800">Admin Curated</Badge>
                        )}
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
                        By: {item.reviewerName ?? (typeof item.user === 'object' && item.user ? (item.user.name ?? item.user.email ?? 'Unknown') : 'Unknown')}
                        {item.order && ` | Order: ${typeof item.order === 'string' ? item.order : (item.order as { orderNumber?: string }).orderNumber ?? ''}`}
                      </p>

                      {/* Media thumbnails */}
                      {((item.images && item.images.length > 0) || (item.videos && item.videos.length > 0)) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.images?.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="review" className="w-14 h-14 object-cover rounded-lg border" />
                            </a>
                          ))}
                          {item.videos?.map((url, i) => (
                            <video key={i} src={url} controls className="h-14 rounded-lg border" style={{ maxWidth: 120 }} />
                          ))}
                        </div>
                      )}

                      {/* Admin Response */}
                      {item.adminResponse && (
                        <div className="mt-3 p-3 bg-primary/5 rounded-lg border-l-2 border-primary">
                          <p className="text-xs font-medium text-primary mb-1">Admin Response:</p>
                          <p className="text-sm">{item.adminResponse}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
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

      {/* Upload Review Dialog */}
      <Dialog open={showUploadForm} onOpenChange={(open) => {
        if (!open) {
          uploadMedia.forEach(({ preview }) => URL.revokeObjectURL(preview));
          setUploadForm(emptyUploadForm);
          setUploadMedia([]);
        }
        setShowUploadForm(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Review</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Product */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Product *</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={uploadForm.productId}
                onChange={(e) => setUploadForm((f) => ({ ...f, productId: e.target.value }))}
              >
                <option value="">Select a product</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Reviewer Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reviewer Name *</label>
              <Input
                placeholder="e.g. Priya Sharma"
                value={uploadForm.reviewerName}
                onChange={(e) => setUploadForm((f) => ({ ...f, reviewerName: e.target.value }))}
              />
            </div>

            {/* Rating */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rating *</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setUploadForm((f) => ({ ...f, rating: star }))}
                    className="p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        'h-7 w-7 transition-colors',
                        star <= uploadForm.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Review Message *</label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none resize-none focus:border-primary transition-colors"
                placeholder="Write the review here..."
                value={uploadForm.message}
                onChange={(e) => setUploadForm((f) => ({ ...f, message: e.target.value }))}
              />
            </div>

            {/* Media Upload */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Photos & Videos</label>
              <label
                className="flex items-center gap-2 w-full px-4 py-3 rounded-md border border-dashed border-input cursor-pointer text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload className="h-4 w-4" />
                Click to add photos or videos
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const items = Array.from(e.target.files || []).map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
                    setUploadMedia((prev) => [...prev, ...items].slice(0, 8));
                    e.target.value = '';
                  }}
                />
              </label>
              {uploadMedia.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {uploadMedia.map(({ file, preview }, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      {file.type.startsWith('video/') ? (
                        <video src={preview} className="w-full h-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(preview);
                          setUploadMedia((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                uploadMedia.forEach(({ preview }) => URL.revokeObjectURL(preview));
                setShowUploadForm(false);
                setUploadForm(emptyUploadForm);
                setUploadMedia([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdminUploadReview}
              disabled={uploadingReview || !uploadForm.productId || !uploadForm.reviewerName.trim() || !uploadForm.message.trim()}
            >
              {uploadingReview ? 'Uploading…' : 'Upload Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
