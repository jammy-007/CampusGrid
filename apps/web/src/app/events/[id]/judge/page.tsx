'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { EventDTO, JudgeQueueItemDTO, RubricCriterionDTO } from '@campusgrid/shared';
import { Badge, Button, ButtonLink, Card, CardTitle, Input, useToast } from '@/components/ui';
import { apiFetch, ApiError } from '@/lib/api';

export default function JudgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const toast = useToast();

  const [event, setEvent] = useState<Partial<EventDTO> | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterionDTO[]>([]);
  const [queue, setQueue] = useState<JudgeQueueItemDTO[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Local draft scores for active submission: Map criterionId -> { value, comment }
  const [activeScores, setActiveScores] = useState<Record<string, { value: number; comment: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{
      event: Partial<EventDTO>;
      criteria: RubricCriterionDTO[];
      queue: JudgeQueueItemDTO[];
      progress: { scored: number; total: number };
    }>(`/api/judge/events/${eventId}/queue`)
      .then((res) => {
        if (!active) return;
        setEvent(res.event);
        setCriteria(res.criteria);
        setQueue(res.queue);
        if (res.queue.length > 0) {
          loadSubmissionScores(res.queue[0], res.criteria);
        }
      })
      .catch((err) => {
        if (active) {
          if (err instanceof ApiError && err.code === 'FORBIDDEN') {
            setErrorMsg('You are not assigned as a judge for this hackathon.');
          } else {
            setErrorMsg(err.message || 'Failed to load judging queue');
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  function loadSubmissionScores(item: JudgeQueueItemDTO, critList: RubricCriterionDTO[]) {
    const map: Record<string, { value: number; comment: string }> = {};
    for (const c of critList) {
      const existing = item.scores.find((s) => s.criterionId === c.id);
      map[c.id] = {
        value: existing ? existing.value : 0,
        comment: existing?.comment || '',
      };
    }
    setActiveScores(map);
  }

  function handleSelectSubmission(idx: number) {
    setSelectedIndex(idx);
    loadSubmissionScores(queue[idx], criteria);
  }

  function handleScoreChange(criterionId: string, val: number) {
    setActiveScores((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        value: val,
      },
    }));
  }

  function handleCommentChange(criterionId: string, comment: string) {
    setActiveScores((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        comment,
      },
    }));
  }

  async function handleSaveScores() {
    const current = queue[selectedIndex];
    if (!current) return;
    setSaving(true);
    try {
      const payload = Object.entries(activeScores).map(([criterionId, data]) => ({
        criterionId,
        value: data.value,
        comment: data.comment || undefined,
      }));

      await apiFetch(`/api/submissions/${current.submission.id}/scores`, {
        method: 'PUT',
        body: { scores: payload },
      });

      // Update queue item locally
      setQueue((prev) => {
        const copy = [...prev];
        const updatedItem = { ...copy[selectedIndex] };
        updatedItem.scores = payload.map((p) => ({
          criterionId: p.criterionId,
          value: p.value,
          comment: p.comment || null,
        }));
        updatedItem.isFullyScored = criteria.every((c) =>
          updatedItem.scores.some((s) => s.criterionId === c.id),
        );
        copy[selectedIndex] = updatedItem;
        return copy;
      });

      toast('Evaluation scores saved!', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save scores', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card className="p-8 text-center text-slate-400">Loading evaluation queue...</Card>;
  }

  if (errorMsg) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <Badge tone="red">Access Restricted</Badge>
        <p className="text-sm text-slate-300">{errorMsg}</p>
        <ButtonLink href={`/events/${eventId}`} variant="secondary">
          Back to Event
        </ButtonLink>
      </Card>
    );
  }

  const scoredCount = queue.filter((q) => q.isFullyScored).length;
  const currentItem = queue[selectedIndex];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/events/${eventId}`} className="text-sm font-medium text-sky-400 hover:underline">
            ← Back to {event?.title ?? 'Event'}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Faculty Evaluation Matrix</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-sky-300">
            Progress: {scoredCount} / {queue.length} scored
          </span>
          <ButtonLink href={`/events/${eventId}/leaderboard`} variant="secondary">
            Leaderboard
          </ButtonLink>
        </div>
      </div>

      {queue.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          No team submissions have been registered yet for this hackathon.
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Submission Queue Sidebar */}
          <div className="space-y-3 lg:col-span-4">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Submissions Queue ({queue.length})
            </h2>
            <div className="space-y-2">
              {queue.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.submission.id}
                    type="button"
                    onClick={() => handleSelectSubmission(idx)}
                    className={`w-full text-left rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-sky-400 bg-sky-950/40 text-white shadow-lg shadow-sky-500/10'
                        : 'border-white/10 bg-slate-900/60 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">
                        {item.submission.teamName || `Team #${idx + 1}`}
                      </span>
                      {item.isFullyScored ? (
                        <Badge tone="green">Scored</Badge>
                      ) : (
                        <Badge tone="amber">Pending</Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                      {item.submission.repoOwner}/{item.submission.repoName}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Evaluation Sheet */}
          {currentItem && (
            <div className="space-y-5 lg:col-span-8">
              {/* Submission Information Banner */}
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>{currentItem.submission.teamName || 'Team Submission'}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <a
                        href={currentItem.submission.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sky-400 hover:underline flex items-center gap-1"
                      >
                        GitHub ↗
                      </a>
                      {currentItem.submission.demoUrl && (
                        <a
                          href={currentItem.submission.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          Live Demo ↗
                        </a>
                      )}
                      <span>Commit: {currentItem.submission.lastCommitSha.slice(0, 7)}</span>
                    </div>
                  </div>
                  <Button onClick={handleSaveScores} disabled={saving}>
                    {saving ? 'Saving Scores...' : 'Save Evaluation'}
                  </Button>
                </div>

                {currentItem.submission.description && (
                  <p className="rounded-lg bg-slate-900/60 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                    {currentItem.submission.description}
                  </p>
                )}
              </Card>

              {/* Rubric Criteria Evaluation Form */}
              <Card className="space-y-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Rubric Criteria Scoring
                </h3>

                <div className="space-y-4">
                  {criteria.map((c) => {
                    const scoreData = activeScores[c.id] || { value: 0, comment: '' };
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-sm text-white">{c.name}</span>
                            {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                            <span className="inline-block text-[10px] text-sky-400 font-mono">
                              Weight multiplier: {c.weight}× (Max Score: {c.maxScore})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Score:</span>
                            <Input
                              type="number"
                              min={0}
                              max={c.maxScore}
                              value={scoreData.value}
                              onChange={(e) =>
                                handleScoreChange(
                                  c.id,
                                  Math.min(c.maxScore, Math.max(0, parseInt(e.target.value, 10) || 0)),
                                )
                              }
                              className="w-20 text-center font-bold text-white"
                            />
                            <span className="text-xs text-slate-500">/ {c.maxScore}</span>
                          </div>
                        </div>

                        {/* Slider for quick rating */}
                        <input
                          type="range"
                          min={0}
                          max={c.maxScore}
                          value={scoreData.value}
                          onChange={(e) => handleScoreChange(c.id, parseInt(e.target.value, 10))}
                          className="w-full accent-sky-400"
                        />

                        {/* Comment input */}
                        <Input
                          placeholder="Feedback or rationale (optional)..."
                          value={scoreData.comment}
                          onChange={(e) => handleCommentChange(c.id, e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    Changes are saved per submission and instantly update the live leaderboard.
                  </span>
                  <Button onClick={handleSaveScores} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Evaluation'}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
