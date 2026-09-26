import type { Metadata } from 'next';
import { Card } from '@/components/ui';

export const metadata: Metadata = { title: 'Create event' };

// Phase 0 shell. Phase 1 adds the create/edit event form.
export default function NewEventPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create event</h1>
      <Card className="text-sm text-slate-600">The event form is coming in Phase 1.</Card>
    </div>
  );
}
