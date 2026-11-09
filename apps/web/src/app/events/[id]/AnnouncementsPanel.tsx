'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { AnnouncementPriority, EventAnnouncementDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, CardTitle, Input, Select, Textarea, useToast } from '@/components/ui';

const PRIORITY_BADGE: Record<
  AnnouncementPriority,
  { label: string; tone: 'brand' | 'amber' | 'red' }
> = {
  INFO: { label: 'Info', tone: 'brand' },
  IMPORTANT: { label: 'Important', tone: 'amber' },
  URGENT: { label: 'Urgent', tone: 'red' },
};

export function AnnouncementsPanel({
  eventId,
  canPost,
}: {
  eventId: string;
  canPost: boolean;
}) {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<EventAnnouncementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('INFO');

  useEffect(() => {
    let active = true;

    apiFetch<{ announcements: EventAnnouncementDTO[] }>(`/api/events/${eventId}/announcements`)
      .then((res) => {
        if (active) setAnnouncements(res.announcements);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = getSocket('/live');

    function onConnect() {
      socket.emit('live:subscribe', { eventId });
    }

    function onNewAnnouncement(item: EventAnnouncementDTO) {
      if (item.eventId !== eventId) return;
      setAnnouncements((prev) => {
        if (prev.some((a) => a.id === item.id)) return prev;
        return [item, ...prev];
      });
      toast(`📢 ${item.title}`, item.priority === 'URGENT' ? 'error' : 'info');
    }

    if (socket.connected) {
      onConnect();
    } else {
      socket.connect();
    }

    socket.on('connect', onConnect);
    socket.on('announcement:new', onNewAnnouncement);

    return () => {
      active = false;
      socket.off('connect', onConnect);
      socket.off('announcement:new', onNewAnnouncement);
    };
  }, [eventId, toast]);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { announcement } = await apiFetch<{ announcement: EventAnnouncementDTO }>(
        `/api/events/${eventId}/announcements`,
        {
          method: 'POST',
          body: { title: title.trim(), body: body.trim(), priority },
        },
      );
      setAnnouncements((prev) =>
        prev.some((a) => a.id === announcement.id) ? prev : [announcement, ...prev],
      );
      setTitle('');
      setBody('');
      setPriority('INFO');
      setShowForm(false);
      toast('Announcement broadcast to all event participants', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to post announcement', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!loading && announcements.length === 0 && !canPost) {
    return null;
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <CardTitle>Live Announcements</CardTitle>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
            <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
            Real-time
          </span>
        </div>
        {canPost && (
          <Button
            type="button"
            size="sm"
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ Broadcast Update'}
          </Button>
        )}
      </div>

      {canPost && showForm && (
        <form
          onSubmit={handlePost}
          className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                label="Headline"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Check-out QR scanning is now open at Gate B!"
                required
                maxLength={140}
              />
            </div>
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
            >
              <option value="INFO">Info</option>
              <option value="IMPORTANT">Important</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </div>
          <Textarea
            label="Message"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share schedule updates, venue changes, or judging announcements..."
            required
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={busy}>
              Send Live Broadcast
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <p className="text-xs text-slate-400">
          No announcements broadcast yet. Use &ldquo;Broadcast Update&rdquo; to notify participants in real time.
        </p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const badge = PRIORITY_BADGE[a.priority];
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-4 space-y-1.5 ${
                  a.priority === 'URGENT'
                    ? 'border-rose-500/40 bg-rose-950/25'
                    : a.priority === 'IMPORTANT'
                      ? 'border-amber-500/35 bg-amber-950/20'
                      : 'border-white/10 bg-slate-900/50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <h4 className="text-sm font-bold text-white">{a.title}</h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {a.authorName} · {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
                  {a.body}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
