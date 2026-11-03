'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { JudgeDTO, RubricCriterionDTO, RubricDTO } from '@campusgrid/shared';
import { Badge, Button, ButtonLink, Card, CardTitle, Input, Table, TBody, TD, TH, THead, TR, useToast } from '@/components/ui';
import { apiFetch, ApiError } from '@/lib/api';

export default function RubricPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'rubric' | 'judges'>('rubric');
  const [rubric, setRubric] = useState<RubricDTO | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterionDTO[]>([]);
  const [judges, setJudges] = useState<JudgeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRubric, setSavingRubric] = useState(false);
  const [savingJudges, setSavingJudges] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#judges') {
      setActiveTab('judges');
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ rubric: RubricDTO }>(`/api/events/${eventId}/rubric`),
      apiFetch<{ judges: JudgeDTO[] }>(`/api/events/${eventId}/judges`),
    ])
      .then(([rubricRes, judgesRes]) => {
        if (!active) return;
        setRubric(rubricRes.rubric);
        setCriteria(rubricRes.rubric.criteria);
        setJudges(judgesRes.judges);
      })
      .catch((err) => {
        if (active) setErrorMsg(err.message || 'Failed to load rubric and judges');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  function handleAddCriterion() {
    setCriteria((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        rubricId: rubric?.id || '',
        name: 'New Criterion',
        description: '',
        weight: 1,
        maxScore: 10,
        order: prev.length,
      },
    ]);
  }

  function handleRemoveCriterion(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCriterionChange(index: number, field: keyof RubricCriterionDTO, val: unknown) {
    setCriteria((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  }

  async function handleSaveRubric() {
    setSavingRubric(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ rubric: RubricDTO }>(`/api/events/${eventId}/rubric`, {
        method: 'PUT',
        body: {
          criteria: criteria.map((c, i) => ({
            name: c.name,
            description: c.description,
            weight: Number(c.weight),
            maxScore: Number(c.maxScore),
            order: i,
          })),
        },
      });
      setRubric(res.rubric);
      setCriteria(res.rubric.criteria);
      toast('Rubric criteria updated successfully', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RUBRIC_LOCKED') {
        setErrorMsg('Rubric is locked because scoring has already started for this event.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save rubric');
      }
    } finally {
      setSavingRubric(false);
    }
  }

  function toggleJudge(id: string) {
    setJudges((prev) =>
      prev.map((j) => (j.id === id ? { ...j, assigned: !j.assigned } : j)),
    );
  }

  async function handleSaveJudges() {
    setSavingJudges(true);
    setErrorMsg(null);
    try {
      const assignedIds = judges.filter((j) => j.assigned).map((j) => j.id);
      const res = await apiFetch<{ judges: JudgeDTO[] }>(`/api/events/${eventId}/judges`, {
        method: 'PUT',
        body: { judgeIds: assignedIds },
      });
      setJudges(res.judges);
      toast('Assigned judges updated successfully', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign judges');
    } finally {
      setSavingJudges(false);
    }
  }

  if (loading) {
    return <Card className="p-8 text-center text-slate-400">Loading rubric and judges configuration...</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/events/${eventId}/manage`} className="text-sm font-medium text-sky-400 hover:underline">
            ← Back to Manage Event
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Rubric & Judge Configuration</h1>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/events/${eventId}/leaderboard`} variant="secondary">
            View Leaderboard
          </ButtonLink>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {rubric?.isLocked && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone="amber">Rubric Locked</Badge>
            <span className="text-sm font-semibold text-amber-300">Criteria cannot be modified</span>
          </div>
          <p className="text-xs text-slate-300">
            One or more judges have already submitted evaluation scores for this hackathon. The rubric criteria are locked to maintain grading integrity.
          </p>
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('rubric')}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === 'rubric' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Evaluation Criteria ({criteria.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('judges')}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === 'judges' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Assigned Judges ({judges.filter((j) => j.assigned).length})
        </button>
      </div>

      {activeTab === 'rubric' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>Weighted Evaluation Rubric</CardTitle>
            {!rubric?.isLocked && (
              <Button type="button" variant="secondary" onClick={handleAddCriterion} className="text-xs">
                + Add Criterion
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {criteria.map((c, idx) => (
              <div
                key={c.id || idx}
                className="grid gap-3 rounded-xl border border-white/10 bg-slate-900/50 p-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Criterion Name</label>
                  <Input
                    disabled={rubric?.isLocked}
                    value={c.name}
                    onChange={(e) => handleCriterionChange(idx, 'name', e.target.value)}
                  />
                  <Input
                    placeholder="Short description / guidance"
                    disabled={rubric?.isLocked}
                    value={c.description}
                    onChange={(e) => handleCriterionChange(idx, 'description', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Weight (Multiplier)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    disabled={rubric?.isLocked}
                    value={c.weight}
                    onChange={(e) => handleCriterionChange(idx, 'weight', parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Max Score</label>
                  <Input
                    type="number"
                    min="1"
                    disabled={rubric?.isLocked}
                    value={c.maxScore}
                    onChange={(e) => handleCriterionChange(idx, 'maxScore', parseInt(e.target.value, 10) || 10)}
                  />
                </div>
                <div className="flex items-end justify-end sm:col-span-1">
                  {!rubric?.isLocked && criteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCriterion(idx)}
                      className="rounded-lg p-2 text-xs text-red-400 hover:bg-red-950/40"
                      title="Delete criterion"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!rubric?.isLocked && (
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveRubric} disabled={savingRubric}>
                {savingRubric ? 'Saving Rubric...' : 'Save Rubric'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'judges' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Faculty Judge Assignment</CardTitle>
              <p className="text-xs text-slate-400">
                Select judges who will have access to the scoring matrix for this hackathon.
              </p>
            </div>
            <Button onClick={handleSaveJudges} disabled={savingJudges}>
              {savingJudges ? 'Saving...' : 'Save Assignments'}
            </Button>
          </div>

          {judges.length === 0 ? (
            <p className="text-xs text-slate-400">No users with the JUDGE role found in this institution.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">Assign</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {judges.map((j) => (
                  <TR key={j.id}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={j.assigned}
                        onChange={() => toggleJudge(j.id)}
                        className="size-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                    </TD>
                    <TD className="font-medium text-white">{j.name}</TD>
                    <TD className="text-slate-400">{j.email}</TD>
                    <TD>{j.assigned ? <Badge tone="green">Assigned</Badge> : <Badge tone="neutral">Available</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
