'use client';

import { useEffect, useState } from 'react';
import type { SubmissionDTO } from '@campusgrid/shared';
import { Badge, ButtonLink, Card, CardTitle } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/lib/session';

export function HackathonPanel({ eventId }: { eventId: string }) {
  const { user } = useSession();
  const [submission, setSubmission] = useState<SubmissionDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (user?.role === 'STUDENT') {
      apiFetch<{ submission: SubmissionDTO | null }>(`/api/events/${eventId}/submissions/mine`)
        .then((res) => {
          if (active) setSubmission(res.submission);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [eventId, user?.role]);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Hackathon Portal</CardTitle>
          <p className="text-xs text-slate-400">
            GitHub repository verification, rubric-based faculty evaluation, and live leaderboard.
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
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Organizer Tools</span>
            <span className="text-xs text-slate-400">Evaluation & Scoring</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${eventId}/rubric`} variant="secondary">
              Configure Rubric
            </ButtonLink>
            <ButtonLink href={`/events/${eventId}/rubric#judges`} variant="secondary">
              Assign Judges
            </ButtonLink>
          </div>
        </div>
      )}

      {(user?.role === 'JUDGE' || user?.role === 'ADMIN') && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Faculty Judging</span>
            <span className="text-xs text-slate-400">Scoring Matrix</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${eventId}/judge`} className="text-xs">
              Open Evaluation Queue
            </ButtonLink>
          </div>
        </div>
      )}
    </Card>
  );
}
