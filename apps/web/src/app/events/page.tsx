import type { Metadata } from 'next';
import { Card } from '@/components/ui';

export const metadata: Metadata = { title: 'Events' };

// Phase 0 shell. Phase 1 lists events with type and upcoming/past filters.
export default function EventsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Events</h1>
      <Card className="text-sm text-slate-600">Events will be listed here.</Card>
    </div>
  );
}
