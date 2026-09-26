'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { EVENT_TYPES, type EventDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { toLocalInput } from '@/lib/format';
import { Button, Card, Input, Select, Textarea, useToast } from '@/components/ui';
import { TYPE_LABEL } from './EventBits';

/** Create (no `event`) or edit an event. */
export function EventForm({ event }: { event?: EventDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [isTeamEvent, setIsTeamEvent] = useState(event?.isTeamEvent ?? false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = (k: string) => new Date(String(f.get(k))).toISOString();
    const capacity = String(f.get('capacity') ?? '').trim();
    const body = {
      title: f.get('title'),
      description: f.get('description'),
      type: f.get('type'),
      venue: f.get('venue'),
      startsAt: date('startsAt'),
      endsAt: date('endsAt'),
      registrationDeadline: date('registrationDeadline'),
      isTeamEvent,
      minTeamSize: isTeamEvent ? Number(f.get('minTeamSize')) : 1,
      maxTeamSize: isTeamEvent ? Number(f.get('maxTeamSize')) : 1,
      capacity: capacity ? Number(capacity) : null,
    };
    setLoading(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const res = await apiFetch<{ event: EventDTO }>(event ? `/api/events/${event.id}` : '/api/events', {
        method: event ? 'PATCH' : 'POST',
        body,
      });
      toast(event ? 'Event saved' : 'Event created as a draft', 'success');
      router.push(`/events/${res.event.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(
          Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])),
        );
      }
      setError(err instanceof ApiError ? err.message : 'Could not save the event');
      setLoading(false);
    }
  }

  const now = new Date();
  return (
    <Card className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Title" name="title" required defaultValue={event?.title} error={fieldErrors.title} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" name="type" defaultValue={event?.type ?? 'FEST'}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Input label="Venue" name="venue" required defaultValue={event?.venue} error={fieldErrors.venue} />
        </div>
        <Textarea label="Description" name="description" defaultValue={event?.description} rows={5} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Starts"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toLocalInput(event?.startsAt ?? new Date(now.getTime() + 7 * 864e5))}
            error={fieldErrors.startsAt}
          />
          <Input
            label="Ends"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={toLocalInput(event?.endsAt ?? new Date(now.getTime() + 7 * 864e5 + 3 * 36e5))}
            error={fieldErrors.endsAt}
          />
          <Input
            label="Registration closes"
            name="registrationDeadline"
            type="datetime-local"
            required
            defaultValue={toLocalInput(event?.registrationDeadline ?? new Date(now.getTime() + 6 * 864e5))}
            error={fieldErrors.registrationDeadline}
          />
        </div>
        <Input
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          defaultValue={event?.capacity ?? ''}
          hint="Leave empty for no limit"
          error={fieldErrors.capacity}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTeamEvent} onChange={(e) => setIsTeamEvent(e.target.checked)} />
          Team event (students register by creating or joining a team)
        </label>
        {isTeamEvent && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Min team size" name="minTeamSize" type="number" min={1} max={20} defaultValue={event?.minTeamSize ?? 2} />
            <Input
              label="Max team size"
              name="maxTeamSize"
              type="number"
              min={1}
              max={20}
              defaultValue={event?.maxTeamSize ?? 4}
              error={fieldErrors.maxTeamSize}
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={loading}>
            {event ? 'Save changes' : 'Create draft'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
