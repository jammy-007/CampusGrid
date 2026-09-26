'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { EventDTO, TeamDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, ButtonLink, Dialog, Input, useToast } from '@/components/ui';

/** Student actions on an event: register / cancel, or create / join a team. */
export function EventActions({ event, open }: { event: EventDTO; open: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'join' | 'cancel' | null>(null);
  const [error, setError] = useState<string>();
  const reg = event.myRegistration?.status === 'CONFIRMED' ? event.myRegistration : null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong';
      setError(message);
      if (!dialog) toast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const register = () =>
    run(async () => {
      await apiFetch(`/api/events/${event.id}/register`, { method: 'POST' });
      toast('You are registered', 'success');
      router.refresh();
    });

  const cancel = () =>
    run(async () => {
      await apiFetch(`/api/events/${event.id}/register`, { method: 'DELETE' });
      setDialog(null);
      toast('Registration cancelled');
      router.refresh();
    });

  const teamSubmit = (kind: 'create' | 'join') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('value') ?? '');
    return run(async () => {
      const { team } =
        kind === 'create'
          ? await apiFetch<{ team: TeamDTO }>(`/api/events/${event.id}/teams`, { method: 'POST', body: { name: value } })
          : await apiFetch<{ team: TeamDTO }>('/api/teams/join', { method: 'POST', body: { inviteCode: value } });
      toast(kind === 'create' ? 'Team created' : `You joined ${team.name}`, 'success');
      router.push(`/teams/${team.id}`);
      router.refresh();
    });
  };

  if (reg) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {reg.teamId && <ButtonLink href={`/teams/${reg.teamId}`}>Open my team</ButtonLink>}
        {open && (
          <Button variant="secondary" onClick={() => setDialog('cancel')}>
            {reg.teamId ? 'Leave team & cancel' : 'Cancel registration'}
          </Button>
        )}
        <Dialog
          open={dialog === 'cancel'}
          onClose={() => setDialog(null)}
          title="Cancel your registration?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Keep it
              </Button>
              <Button variant="danger" loading={busy} onClick={cancel}>
                Cancel registration
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {reg.teamId
              ? 'You will leave your team. Team leaders must remove their members first.'
              : 'You can register again before the deadline if there is space.'}
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Dialog>
      </div>
    );
  }

  if (!open) return <p className="text-sm text-slate-500">Registration is closed.</p>;

  if (!event.isTeamEvent) {
    const full = event.capacity !== null && (event.registeredCount ?? 0) >= event.capacity;
    return (
      <Button onClick={register} loading={busy} disabled={full}>
        {full ? 'Event full' : 'Register'}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setDialog('create')}>Create a team</Button>
      <Button variant="secondary" onClick={() => setDialog('join')}>
        Join with invite code
      </Button>
      {(['create', 'join'] as const).map((kind) => (
        <Dialog
          key={kind}
          open={dialog === kind}
          onClose={() => {
            setDialog(null);
            setError(undefined);
          }}
          title={kind === 'create' ? 'Create a team' : 'Join a team'}
        >
          <form onSubmit={teamSubmit(kind)} className="space-y-4">
            {kind === 'create' ? (
              <Input label="Team name" name="value" required maxLength={60} autoFocus />
            ) : (
              <Input
                label="Invite code"
                name="value"
                required
                placeholder="ABCD2345"
                className="font-mono uppercase tracking-widest"
                maxLength={8}
                autoFocus
              />
            )}
            <p className="text-xs text-slate-500">
              Teams have {event.minTeamSize} to {event.maxTeamSize} members.
              {kind === 'create' && ' You will get an invite code to share.'}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" loading={busy}>
                {kind === 'create' ? 'Create team' : 'Join team'}
              </Button>
            </div>
          </form>
        </Dialog>
      ))}
    </div>
  );
}
