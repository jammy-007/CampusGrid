'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';

export function CopyInviteCode({ code }: { code: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2">
      <code className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-lg tracking-widest text-slate-900">{code}</code>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            toast('Invite code copied', 'success');
          } catch {
            toast('Copy failed; select the code instead', 'error');
          }
        }}
      >
        Copy
      </Button>
    </div>
  );
}

export function OpenTeamToggle({
  teamId,
  initialIsOpen,
  canEdit,
}: {
  teamId: string;
  initialIsOpen: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const next = !isOpen;
      await apiFetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: { isOpen: next },
      });
      setIsOpen(next);
      toast(
        next
          ? 'Team is now visible in the Open Team Finder'
          : 'Team is now invite-only',
        'success',
      );
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update team visibility', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
      <div>
        <p className="text-xs font-semibold text-white">
          {isOpen ? '🟢 Looking for Teammates (Open)' : '🔒 Invite-Only Team'}
        </p>
        <p className="text-[11px] text-slate-400">
          {isOpen
            ? 'Solo students can discover and join your team from the event page.'
            : 'Only students with your invite code can join.'}
        </p>
      </div>
      {canEdit && (
        <Button variant="secondary" size="sm" loading={busy} onClick={toggle}>
          {isOpen ? 'Make Invite-Only' : 'Open to Public'}
        </Button>
      )}
    </div>
  );
}

interface MemberActionsProps {
  teamId: string;
  eventId: string;
  userId: string;
  canRemove: boolean;
  isSelf: boolean;
  isLeader: boolean;
  memberCount: number;
}

/** Leader: remove a member. Anyone: leave (the leader only once alone, which deletes the team). */
export function MemberActions({ teamId, eventId, userId, canRemove, isSelf, isLeader, memberCount }: MemberActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!canRemove && !isSelf) return null;
  if (isSelf && isLeader && memberCount > 1) return null;

  async function remove() {
    const question = isSelf
      ? isLeader
        ? 'Delete this team and cancel your registration?'
        : 'Leave this team? Your registration for the event is cancelled.'
      : 'Remove this member? Their registration is cancelled.';
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      toast(isSelf ? 'You left the team' : 'Member removed');
      if (isSelf) router.push(`/events/${eventId}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the team', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" loading={busy} onClick={remove} className="text-red-600">
      {isSelf ? 'Leave' : 'Remove'}
    </Button>
  );
}
