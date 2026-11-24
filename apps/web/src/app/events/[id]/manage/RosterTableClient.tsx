'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RegistrationDTO } from '@campusgrid/shared';
import { formatDateTime } from '@/lib/format';
import { Badge, buttonClass, Card, Table, TBody, TD, TH, THead, TR } from '@/components/ui';

type FilterTab = 'ALL' | 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

export function RosterTableClient({
  eventId,
  isTeamEvent,
  registrations,
}: {
  eventId: string;
  isTeamEvent: boolean;
  registrations: RegistrationDTO[];
}) {
  const [tab, setTab] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');

  const filtered = registrations.filter((r) => {
    if (tab !== 'ALL' && r.status !== tab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.user?.name.toLowerCase().includes(q) ||
      r.user?.email.toLowerCase().includes(q) ||
      (r.user?.usn && r.user.usn.toLowerCase().includes(q)) ||
      (r.team?.name && r.team.name.toLowerCase().includes(q))
    );
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Registrations ({filtered.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'CONFIRMED', 'WAITLISTED', 'CANCELLED'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  tab === t
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, USN, email, team..."
            className="rounded-xl border border-white/15 bg-slate-950/80 px-3 py-1.5 text-xs text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
          <a
            href={`/api/events/${eventId}/registrations?format=csv`}
            className={buttonClass('secondary', 'sm')}
          >
            ⬇ Export Roster CSV
          </a>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-sm text-slate-300">No registrations match this filter.</Card>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>USN</TH>
              {isTeamEvent && <TH>Team</TH>}
              <TH>Status</TH>
              <TH>Registered</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={r.id}>
                <TD>{r.user?.name}</TD>
                <TD>{r.user?.email}</TD>
                <TD>{r.user?.usn ?? '—'}</TD>
                {isTeamEvent && (
                  <TD>
                    {r.team ? (
                      <Link href={`/teams/${r.team.id}`} className="font-medium text-sky-400 hover:underline">
                        {r.team.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                )}
                <TD>
                  <Badge
                    tone={
                      r.status === 'CONFIRMED'
                        ? 'green'
                        : r.status === 'WAITLISTED'
                          ? 'amber'
                          : 'neutral'
                    }
                  >
                    {r.status.toLowerCase()}
                  </Badge>
                </TD>
                <TD>{formatDateTime(r.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
