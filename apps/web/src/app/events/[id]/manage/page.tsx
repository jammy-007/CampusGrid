import Link from 'next/link';
import { Card } from '@/components/ui';

/** Tabs to the other agents' organizer pages (Agent 2: scan, attendance, certificates; Agent 4: rubric, judges, leaderboard). */
const MANAGE_TABS = [
  { href: 'scan', label: 'Scan passes' },
  { href: 'attendance', label: 'Attendance' },
  { href: 'attendance#certificates', label: 'Certificates' },
  { href: 'rubric', label: 'Rubric' },
  { href: 'rubric#judges', label: 'Judges' },
  { href: 'leaderboard', label: 'Leaderboard' },
] as const;

// Phase 0 shell. Phase 1 adds the registrations list and hides hackathon tabs for other event types.
export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Manage event</h1>
      <nav className="flex flex-wrap gap-2">
        {MANAGE_TABS.map((t) => (
          <Link key={t.href} href={`/events/${id}/${t.href}`} className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">
            {t.label}
          </Link>
        ))}
      </nav>
      <Card className="text-sm text-slate-600">Registrations are coming in Phase 1.</Card>
    </div>
  );
}
