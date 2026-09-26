'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EventStatus } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';

const NEXT: Partial<Record<EventStatus, { status: EventStatus; label: string }>> = {
  DRAFT: { status: 'PUBLISHED', label: 'Publish' },
  PUBLISHED: { status: 'ONGOING', label: 'Mark as ongoing' },
  ONGOING: { status: 'COMPLETED', label: 'Mark as completed' },
};

export function PublishButton({ eventId }: { eventId: string }) {
  return <StatusButton eventId={eventId} status="DRAFT" />;
}

/** Moves the event one step along DRAFT → PUBLISHED → ONGOING → COMPLETED. */
export function StatusButton({ eventId, status }: { eventId: string; status: EventStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const next = NEXT[status];
  if (!next) return null;

  async function move() {
    setBusy(true);
    try {
      if (next!.status === 'PUBLISHED') {
        await apiFetch(`/api/events/${eventId}/publish`, { method: 'POST' });
      } else {
        await apiFetch(`/api/events/${eventId}`, { method: 'PATCH', body: { status: next!.status } });
      }
      toast(`Event is now ${next!.status.toLowerCase()}`, 'success');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the event', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={next.status === 'PUBLISHED' ? 'primary' : 'secondary'} loading={busy} onClick={move}>
      {next.label}
    </Button>
  );
}
