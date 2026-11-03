import type { Metadata } from 'next';
import Link from 'next/link';
import type { TeamDTO } from '@campusgrid/shared';
import { TeamChat } from '@/features/chat';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { Badge, Card } from '@/components/ui';
import { CopyInviteCode, MemberActions } from './TeamClient';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ team }, user] = await Promise.all([apiServer<{ team: TeamDTO }>(`/api/teams/${id}`, `/teams/${id}`), getSession()]);
  const isMember = team.members.some((m) => m.userId === user?.id);
  const isLeader = team.leaderId === user?.id;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/events/${team.eventId}`} className="text-sm font-medium text-sky-400 hover:underline">
          ← {team.eventTitle}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-white">{team.name}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4">
          {team.inviteCode && (
            <Card className="space-y-2">
              <p className="text-sm text-slate-500">Invite code</p>
              <CopyInviteCode code={team.inviteCode} />
              <p className="text-xs text-slate-500">Share this with teammates so they can join from the event page.</p>
            </Card>
          )}
          <Card className="space-y-3">
            <h2 className="font-semibold">Members ({team.members.length})</h2>
            <ul className="divide-y divide-slate-100">
              {team.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {m.name} {m.isLeader && <Badge tone="brand">Leader</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </div>
                  {isMember && (
                    <MemberActions
                      teamId={team.id}
                      eventId={team.eventId}
                      userId={m.userId}
                      canRemove={isLeader && !m.isLeader}
                      isSelf={m.userId === user?.id}
                      isLeader={m.isLeader}
                      memberCount={team.members.length}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="lg:col-span-2">{isMember && <TeamChat teamId={team.id} />}</div>
      </div>
    </div>
  );
}
