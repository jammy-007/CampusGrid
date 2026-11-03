'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EventDTO, SubmissionDTO } from '@campusgrid/shared';
import { Badge, Button, ButtonLink, Card, CardTitle, Input, Textarea, useToast } from '@/components/ui';
import { apiFetch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export default function SubmitHackathonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [event, setEvent] = useState<EventDTO | null>(null);
  const [submission, setSubmission] = useState<SubmissionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ event: EventDTO }>(`/api/events/${eventId}`),
      apiFetch<{ submission: SubmissionDTO | null }>(`/api/events/${eventId}/submissions/mine`).catch(() => ({ submission: null })),
    ])
      .then(([evRes, subRes]) => {
        if (!active) return;
        setEvent(evRes.event);
        if (subRes.submission) {
          setSubmission(subRes.submission);
          setRepoUrl(subRes.submission.repoUrl);
          setDemoUrl(subRes.submission.demoUrl || '');
          setDescription(subRes.submission.description || '');
        }
      })
      .catch((err) => {
        if (active) setErrorMsg(err.message || 'Failed to load hackathon details');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch<{ submission: SubmissionDTO }>(`/api/events/${eventId}/submissions/mine`, {
        method: 'PUT',
        body: {
          repoUrl,
          demoUrl: demoUrl || undefined,
          description,
        },
      });

      setSubmission(res.submission);
      toast('Repository validated and submitted successfully!', 'success');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'REPO_NOT_FOUND') {
          setErrorMsg('GitHub repository not found. Please verify the URL and ensure the repo is public.');
        } else if (err.code === 'REPO_PRIVATE') {
          setErrorMsg('The repository is private. Hackathons require public repositories for evaluation.');
        } else if (err.code === 'NO_COMMITS_DURING_EVENT') {
          setErrorMsg('No commits were found after the hackathon start time. Make sure you push your commits to the repo.');
        } else if (err.code === 'SUBMISSIONS_CLOSED') {
          setErrorMsg('Submissions for this hackathon are now closed.');
        } else if (err.code === 'NO_TEAM') {
          setErrorMsg('You must be a member of a registered team to submit.');
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('An unexpected error occurred while validating repository.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Card className="p-8 text-center text-slate-400">Loading hackathon submission details...</Card>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/events/${eventId}`} className="text-sm font-medium text-sky-400 hover:underline">
          ← Back to {event?.title ?? 'Event'}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Project Submission Vault</h1>
        <p className="text-sm text-slate-300">
          Submit your public GitHub repository. Commits will be validated against hackathon start time.
        </p>
      </div>

      {event && (
        <Card className="space-y-2 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Hackathon Starts:</span>
            <span className="font-mono text-slate-200">{formatDateTime(event.startsAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Deadline:</span>
            <span className="font-mono text-slate-200">{formatDateTime(event.endsAt)}</span>
          </div>
        </Card>
      )}

      {submission && (
        <Card className="border-emerald-500/30 bg-emerald-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-400">Verified Submission on Record</span>
            <Badge tone="green">Validated</Badge>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <p>
              <span className="text-slate-400">Repository: </span>
              <a
                href={submission.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sky-400 hover:underline"
              >
                {submission.repoOwner}/{submission.repoName}
              </a>
            </p>
            <p>
              <span className="text-slate-400">Default Branch: </span>
              <span className="font-mono">{submission.defaultBranch}</span>
            </p>
            <p>
              <span className="text-slate-400">Latest Verified Commit: </span>
              <span className="font-mono text-sky-300">{submission.lastCommitSha.slice(0, 7)}</span>
              {' at '}
              <span>{formatDateTime(submission.lastCommitAt)}</span>
            </p>
            {submission.commitsAfterDeadline && (
              <p className="text-amber-400">
                Warning: The latest commit occurred after the event deadline.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CardTitle>{submission ? 'Update Submission' : 'Submit Repository'}</CardTitle>

          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              GitHub Repository URL <span className="text-red-400">*</span>
            </label>
            <Input
              type="url"
              required
              placeholder="https://github.com/owner/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">
              Must be a public repository containing commits pushed after hackathon start.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Demo / Preview URL (optional)</label>
            <Input
              type="url"
              placeholder="https://my-demo-app.vercel.app"
              value={demoUrl}
              onChange={(e) => setDemoUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Project Description</label>
            <Textarea
              rows={4}
              placeholder="Describe what you built, libraries used, and how to test it..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <ButtonLink href={`/events/${eventId}`} variant="secondary">
              Cancel
            </ButtonLink>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Validating on GitHub...' : submission ? 'Update & Revalidate' : 'Submit Project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
