import { TeamChat } from '@/features/chat';
import { Card } from '@/components/ui';

// Phase 0 shell: renders the Agent 3 chat slot. Phase 1 adds members and the invite code.
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Team</h1>
      <Card className="text-sm text-slate-600">Members and invite code are coming in Phase 1.</Card>
      <TeamChat teamId={id} />
    </div>
  );
}
