'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { EventDTO, LeaderboardDTO } from '@campusgrid/shared';
import { Button, ButtonLink, Card, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [event, setEvent] = useState<Partial<EventDTO> | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectorMode, setProjectorMode] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  useEffect(() => {
    let active = true;

    // 1. Initial REST fetch
    Promise.all([
      apiFetch<{ event: EventDTO }>(`/api/events/${eventId}`),
      apiFetch<{ leaderboard: LeaderboardDTO }>(`/api/events/${eventId}/leaderboard`),
    ])
      .then(([evRes, lbRes]) => {
        if (!active) return;
        setEvent(evRes.event);
        setLeaderboard(lbRes.leaderboard);
      })
      .catch((err) => {
        console.error('Failed to load leaderboard', err);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    // 2. Realtime Socket.IO (/live)
    const socket = getSocket('/live');

    function onConnect() {
      setIsLiveConnected(true);
      socket.emit('live:subscribe', { eventId });
    }

    function onDisconnect() {
      setIsLiveConnected(false);
    }

    function onLeaderboardUpdate(updated: LeaderboardDTO) {
      if (updated.eventId === eventId) {
        setLeaderboard(updated);
      }
    }

    if (socket.connected) {
      onConnect();
    } else {
      socket.connect();
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('leaderboard:update', onLeaderboardUpdate);

    return () => {
      active = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('leaderboard:update', onLeaderboardUpdate);
    };
  }, [eventId]);

  if (loading) {
    return <Card className="p-8 text-center text-slate-400">Loading live leaderboard...</Card>;
  }

  const rows = leaderboard?.rows || [];

  return (
    <div
      className={
        projectorMode
          ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-8 text-white flex flex-col justify-between'
          : 'space-y-6'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          {!projectorMode && (
            <Link href={`/events/${eventId}`} className="text-sm font-medium text-sky-400 hover:underline">
              ← Back to {event?.title ?? 'Event'}
            </Link>
          )}
          <div className="flex items-center gap-3">
            <h1 className={`${projectorMode ? 'text-4xl font-extrabold' : 'text-2xl font-bold'} text-white`}>
              {event?.title ?? 'Hackathon'} Leaderboard
            </h1>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              {isLiveConnected ? 'LIVE' : 'SYNCING'}
            </span>
          </div>
          {leaderboard?.updatedAt && (
            <p className="text-xs text-slate-400">
              Last score update: {formatDateTime(leaderboard.updatedAt)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setProjectorMode(!projectorMode)}
            className="text-xs"
          >
            {projectorMode ? 'Exit Projector Mode' : '📺 Projector Mode'}
          </Button>
          {!projectorMode && (
            <ButtonLink href={`/events/${eventId}/submit`} variant="secondary">
              My Submission
            </ButtonLink>
          )}
        </div>
      </div>

      <Card className={projectorMode ? 'bg-slate-900/90 border-slate-700/60 p-6' : ''}>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-base font-semibold text-slate-300">No scored submissions yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Judges are currently reviewing team submissions. Scores will stream live here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-16 text-center">Rank</TH>
                  <TH>Team Name</TH>
                  <TH className="text-center">Judges Scored</TH>
                  <TH className="text-right">Criterion Breakdown</TH>
                  <TH className="text-right">Final Score</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => {
                  const isTop3 = row.rank <= 3;

                  return (
                    <TR
                      key={row.submissionId}
                      className={
                        isTop3 && projectorMode
                          ? 'bg-slate-800/60 font-semibold'
                          : undefined
                      }
                    >
                      <TD className="text-center font-mono font-bold">
                        <span
                          className={`inline-flex items-center justify-center size-8 rounded-full ${
                            row.rank === 1
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 text-base'
                              : row.rank === 2
                              ? 'bg-slate-400/20 text-slate-200 border border-slate-400/40'
                              : row.rank === 3
                              ? 'bg-amber-700/20 text-amber-500 border border-amber-600/40'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.rank}
                        </span>
                      </TD>
                      <TD>
                        <div className="space-y-0.5">
                          <span className={`${projectorMode ? 'text-lg' : 'text-sm'} font-bold text-white`}>
                            {row.teamName}
                          </span>
                          <p className="text-[11px] text-slate-400">
                            Submitted at {formatDateTime(row.submittedAt)}
                          </p>
                        </div>
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className="text-slate-200">
                          {row.judgesScored} / {row.judgesAssigned}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.perCriterion.map((c) => (
                            <span
                              key={c.criterionId}
                              className="inline-block rounded bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                              title={`${c.criterionName} (Avg: ${c.averageScore} / ${c.maxScore})`}
                            >
                              {c.criterionName.slice(0, 10)}: <span className="font-semibold text-sky-300">{c.averageScore}</span>
                            </span>
                          ))}
                        </div>
                      </TD>
                      <TD className="text-right font-mono">
                        <span
                          className={`${
                            projectorMode ? 'text-2xl' : 'text-lg'
                          } font-extrabold ${
                            row.score > 0 ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {row.score.toFixed(1)}
                        </span>
                        <span className="text-xs text-slate-500"> / 100</span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
