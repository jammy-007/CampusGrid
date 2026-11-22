'use client';

import { useEffect, useState } from 'react';
import type { ShowcaseSubmissionDTO, SubmissionDTO } from '@campusgrid/shared';
import { Badge, ButtonLink, Card, CardTitle } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/lib/session';

export function HackathonPanel({ eventId }: { eventId: string }) {
  const { user } = useSession();
  const [submission, setSubmission] = useState<SubmissionDTO | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseSubmissionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const tasks: Promise<unknown>[] = [
      apiFetch<{ showcase: ShowcaseSubmissionDTO[] }>(`/api/events/${eventId}/showcase`)
        .then((res) => {
          if (active) setShowcase(res.showcase);
        })
        .catch(() => {}),
    ];

    if (user?.role === 'STUDENT') {
      tasks.push(
        apiFetch<{ submission: SubmissionDTO | null }>(`/api/events/${eventId}/submissions/mine`)
          .then((res) => {
            if (active) setSubmission(res.submission);
          })
          .catch(() => {}),
      );
    }

    Promise.all(tasks).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [eventId, user?.role]);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Hackathon Portal</CardTitle>
            <p className="text-xs text-slate-400">
              GitHub repository verification, rubric-based faculty evaluation, live leaderboard, and project showcase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${eventId}/leaderboard`} variant="secondary">
              Live Leaderboard
            </ButtonLink>
          </div>
        </div>

      {user?.role === 'STUDENT' && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">Team Submission Status</span>
            {loading ? (
              <span className="text-xs text-slate-400">Checking submission...</span>
            ) : submission ? (
              <Badge tone="green">Submitted</Badge>
            ) : (
              <Badge tone="amber">Pending Submission</Badge>
            )}
          </div>

          {!loading && submission && (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Repository:</span>
                <a
                  href={submission.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sky-400 hover:underline"
                >
                  {submission.repoOwner}/{submission.repoName}
                </a>
                <span className="text-slate-500">({submission.defaultBranch})</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Latest Commit:</span>
                <span className="font-mono text-slate-200">{submission.lastCommitSha.slice(0, 7)}</span>
                {submission.commitsAfterDeadline && (
                  <Badge tone="red">Commit after deadline</Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <ButtonLink href={`/events/${eventId}/submit`} className="text-xs">
              {submission ? 'Update Submission' : 'Submit Project'}
            </ButtonLink>
          </div>
        </div>
      )}

      {(user?.role === 'ORGANIZER' || user?.role === 'ADMIN') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold text-white">Organizer Tools</p>
            <p className="text-xs text-slate-400">Evaluation & Scoring</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${eventId}/rubric`} variant="secondary" size="sm">
              Configure Rubric
            </ButtonLink>
            <ButtonLink href={`/events/${eventId}/rubric#judges`} variant="secondary" size="sm">
              Assign Judges
            </ButtonLink>
          </div>
        </div>
      )}

      {(user?.role === 'JUDGE' || user?.role === 'ADMIN') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <div>
            <p className="text-sm font-semibold text-white">Faculty Judging</p>
            <p className="text-xs text-slate-400">Scoring Matrix</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${eventId}/judge`} size="sm">
              Open Evaluation Queue
            </ButtonLink>
          </div>
        </div>
      )}

      {/* Hackathon Project Showcase Gallery */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">
            Project Showcase ({showcase.length})
          </h4>
          <span className="text-xs text-slate-400">Verified GitHub Repositories & Demos</span>
        </div>

        {showcase.length === 0 ? (
          <p className="text-xs text-slate-400">
            No projects have been submitted yet. Submitted projects will appear here automatically.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {showcase.map((proj) => {
              const podiumBadge =
                proj.rank === 1
                  ? '🏆 1st Place'
                  : proj.rank === 2
                    ? '🥈 2nd Place'
                    : proj.rank === 3
                      ? '🥉 3rd Place'
                      : null;

              return (
                <div
                  key={proj.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">
                        {proj.teamName ?? 'Team'}
                      </span>
                      {podiumBadge && (
                        <Badge tone="amber" className="font-bold">
                          {podiumBadge}
                        </Badge>
                      )}
                    </div>
                    {proj.description ? (
                      <p className="line-clamp-3 text-xs leading-relaxed text-slate-300">
                        {proj.description}
                      </p>
                    ) : (
                      <p className="text-xs italic text-slate-500">No project description provided.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs">
                    <a
                      href={proj.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-sky-400 hover:underline"
                    >
                      📦 {proj.repoOwner}/{proj.repoName} ↗
                    </a>
                    {proj.demoUrl && (
                      <a
                        href={proj.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-emerald-400 hover:underline"
                      >
                        🚀 Live Demo ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </Card>
  );
}
