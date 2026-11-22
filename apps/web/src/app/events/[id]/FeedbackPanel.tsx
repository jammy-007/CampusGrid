'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { EventFeedbackDTO, EventFeedbackSummaryDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, CardTitle, Textarea, useToast } from '@/components/ui';

export function FeedbackPanel({
  eventId,
  canReview,
}: {
  eventId: string;
  canReview: boolean;
}) {
  const toast = useToast();
  const [summary, setSummary] = useState<EventFeedbackSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<EventFeedbackSummaryDTO>(`/api/events/${eventId}/feedback`)
      .then((res) => {
        if (!active) return;
        setSummary(res);
        if (res.myFeedback) {
          setRating(res.myFeedback.rating);
          setComment(res.myFeedback.comment);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { feedback } = await apiFetch<{ feedback: EventFeedbackDTO }>(
        `/api/events/${eventId}/feedback`,
        {
          method: 'POST',
          body: { rating, comment: comment.trim() },
        },
      );
      setSummary((prev) => {
        const currentReviews = prev?.reviews ?? [];
        const filtered = currentReviews.filter((r) => r.userId !== feedback.userId);
        const nextReviews = [feedback, ...filtered];
        const totalCount = nextReviews.length;
        const averageRating =
          totalCount > 0
            ? Math.round((nextReviews.reduce((s, r) => s + r.rating, 0) / totalCount) * 10) / 10
            : 0;
        return {
          averageRating,
          totalCount,
          reviews: nextReviews,
          myFeedback: feedback,
        };
      });
      setEditing(false);
      toast('Thank you for your feedback!', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save feedback', 'error');
    } finally {
      setBusy(false);
    }
  }

  const totalCount = summary?.totalCount ?? 0;
  const averageRating = summary?.averageRating ?? 0;
  const reviews = summary?.reviews ?? [];
  const hasMyFeedback = Boolean(summary?.myFeedback);

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Attendee Ratings & Reviews</CardTitle>
          {totalCount > 0 && (
            <Badge tone="amber">
              ★ {averageRating.toFixed(1)} / 5.0 ({totalCount} {totalCount === 1 ? 'review' : 'reviews'})
            </Badge>
          )}
        </div>
        {canReview && hasMyFeedback && !editing && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit My Review
          </Button>
        )}
      </div>

      {canReview && (!hasMyFeedback || editing) && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">Your Rating</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`rounded-lg px-2.5 py-1 text-base transition ${
                    star <= rating
                      ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
                      : 'bg-slate-800/60 text-slate-500 hover:text-slate-300'
                  }`}
                  aria-label={`Rate ${star} out of 5 stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Comment (optional)"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share what you learned or how the event went..."
            maxLength={1000}
          />

          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" loading={busy}>
              {hasMyFeedback ? 'Update Review' : 'Submit Review'}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-slate-400">
          No attendee reviews yet. {canReview ? 'Be the first to rate this event above!' : ''}
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{r.userName}</span>
                  <span className="font-mono text-xs text-amber-400">
                    {'★'.repeat(r.rating)}
                    <span className="text-slate-600">{'★'.repeat(5 - r.rating)}</span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">{formatDateTime(r.createdAt)}</span>
              </div>
              {r.comment && (
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
                  {r.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
