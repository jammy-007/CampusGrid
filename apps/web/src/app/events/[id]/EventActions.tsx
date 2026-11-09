'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { EventDTO, TeamDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, ButtonLink, Dialog, Input, useToast } from '@/components/ui';

/** Student actions on an event: register / waitlist / cancel, or create / join / browse open teams. */
export function EventActions({ event, open }: { event: EventDTO; open: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'join' | 'browse' | 'cancel' | null>(null);
  const [error, setError] = useState<string>();
  const [openTeams, setOpenTeams] = useState<TeamDTO[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [isOpenTeam, setIsOpenTeam] = useState(true);

  const reg = event.myRegistration?.status === 'CONFIRMED' ? event.myRegistration : null;
  const waitlisted = event.myRegistration?.status === 'WAITLISTED' ? event.myRegistration : null;

  useEffect(() => {
    if (dialog !== 'browse') return;
    let active = true;
    setLoadingTeams(true);
    apiFetch<{ teams: TeamDTO[] }>(`/api/events/${event.id}/open-teams`)
      .then((res) => {
        if (active) setOpenTeams(res.teams);
      })
      .catch(() => {
        if (active) setOpenTeams([]);
      })
      .finally(() => {
        if (active) setLoadingTeams(false);
      });
    return () => {
      active = false;
    };
  }, [dialog, event.id]);

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

  const register = (waitlist = false) =>
    run(async () => {
      const res = await apiFetch<{ registration: { status: string } }>(
        `/api/events/${event.id}/register`,
        {
          method: 'POST',
          body: waitlist ? { waitlist: true } : {},
        },
      );
      toast(
        res.registration.status === 'WAITLISTED'
          ? 'Added to waitlist! You will be promoted automatically if a spot opens.'
          : 'You are registered',
        'success',
      );
      router.refresh();
    });

  const cancel = () =>
    run(async () => {
      await apiFetch(`/api/events/${event.id}/register`, { method: 'DELETE' });
      setDialog(null);
      toast(waitlisted ? 'Removed from waitlist' : 'Registration cancelled');
      router.refresh();
    });

  const joinOpenTeam = (teamId: string) =>
    run(async () => {
      const { team } = await apiFetch<{ team: TeamDTO }>('/api/teams/join', {
        method: 'POST',
        body: { teamId },
      });
      toast(`You joined ${team.name}`, 'success');
      setDialog(null);
      router.push(`/teams/${team.id}`);
      router.refresh();
    });

  const teamSubmit = (kind: 'create' | 'join') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = String(formData.get('value') ?? '');
    return run(async () => {
      const { team } =
        kind === 'create'
          ? await apiFetch<{ team: TeamDTO }>(`/api/events/${event.id}/teams`, {
              method: 'POST',
              body: { name: value, isOpen: isOpenTeam },
            })
          : await apiFetch<{ team: TeamDTO }>('/api/teams/join', {
              method: 'POST',
              body: { inviteCode: value },
            });
      toast(kind === 'create' ? 'Team created' : `You joined ${team.name}`, 'success');
      router.push(`/teams/${team.id}`);
      router.refresh();
    });
  };

  if (reg || waitlisted) {
    return (
      <div className="space-y-3">
        {waitlisted && (
          <p className="text-xs text-amber-200/90">
            You are #{waitlisted.waitlistPosition ?? '—'} on the waitlist. If a confirmed participant cancels, you will be promoted automatically.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {reg?.teamId && <ButtonLink href={`/teams/${reg.teamId}`}>Open my team</ButtonLink>}
          {open && (
            <Button variant="secondary" onClick={() => setDialog('cancel')}>
              {waitlisted
                ? 'Leave waitlist'
                : reg?.teamId
                  ? 'Leave team & cancel'
                  : 'Cancel registration'}
            </Button>
          )}
          <Dialog
            open={dialog === 'cancel'}
            onClose={() => setDialog(null)}
            title={waitlisted ? 'Leave the waitlist?' : 'Cancel your registration?'}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Keep it
                </Button>
                <Button variant="danger" loading={busy} onClick={cancel}>
                  {waitlisted ? 'Leave waitlist' : 'Cancel registration'}
                </Button>
              </>
            }
          >
            <p className="text-sm text-slate-600">
              {waitlisted
                ? 'You will lose your current position in the waitlist queue.'
                : reg?.teamId
                  ? 'You will leave your team. Team leaders must remove their members first.'
                  : 'You can register again before the deadline if there is space.'}
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </Dialog>
        </div>
      </div>
    );
  }

  if (!open) return <p className="text-sm text-slate-500">Registration is closed.</p>;

  if (!event.isTeamEvent) {
    const full = event.capacity !== null && (event.registeredCount ?? 0) >= event.capacity;
    return (
      <div className="space-y-2">
        <Button onClick={() => register(full)} loading={busy} className="w-full justify-center">
          {full ? 'Join Waitlist' : 'Register'}
        </Button>
        {full && (
          <p className="text-xs text-slate-400">
            All {event.capacity} spots are currently filled. Join the waitlist to be automatically registered when a spot opens!
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog('create')}>Create a team</Button>
        <Button variant="secondary" onClick={() => setDialog('browse')}>
          🔍 Find Open Team
        </Button>
        <Button variant="secondary" onClick={() => setDialog('join')}>
          Join with invite code
        </Button>
      </div>

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
              <>
                <Input label="Team name" name="value" required maxLength={60} autoFocus />
                <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOpenTeam}
                    onChange={(e) => setIsOpenTeam(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    <strong className="block font-semibold text-slate-900">
                      Open to solo teammates (&ldquo;Looking for Teammates&rdquo;)
                    </strong>
                    Allow other students to discover and join your team from the Open Team Finder until it reaches {event.maxTeamSize} members.
                  </span>
                </label>
              </>
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
              {kind === 'create' && ' You will also get an invite code to share privately.'}
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

      <Dialog
        open={dialog === 'browse'}
        onClose={() => {
          setDialog(null);
          setError(undefined);
        }}
        title="Open Teams Looking for Teammates"
      >
        <div className="space-y-3">
          {loadingTeams ? (
            <p className="text-sm text-slate-500">Searching for open teams...</p>
          ) : openTeams.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No open teams available right now</p>
              <p className="text-xs text-slate-500">
                Create your own open team so other solo participants can join you!
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 max-h-72 overflow-y-auto">
              {openTeams.map((t) => {
                const leader = t.members.find((m) => m.isLeader);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{t.name}</span>
                        <Badge tone="brand">
                          {t.members.length} / {event.maxTeamSize} members
                        </Badge>
                      </div>
                      {leader && (
                        <p className="text-xs text-slate-500">Led by {leader.name}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() => joinOpenTeam(t.id)}
                    >
                      Join
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Dialog>
    </div>
  );
}
