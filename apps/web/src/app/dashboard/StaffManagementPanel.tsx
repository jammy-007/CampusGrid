'use client';

import { useState, type FormEvent } from 'react';
import type { Role } from '@campusgrid/shared';
import { ApiError, apiFetch } from '@/lib/api';
import { Badge, Button, Card, Input, Select, useToast } from '@/components/ui';

export interface StaffUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

type StaffRoleOption = 'JUDGE' | 'ORGANIZER';

export function StaffManagementPanel({ initialUsers }: { initialUsers: StaffUserItem[] }) {
  const toast = useToast();
  const [users, setUsers] = useState<StaffUserItem[]>(
    initialUsers.filter((u) => u.role === 'JUDGE' || u.role === 'ORGANIZER'),
  );
  const [filter, setFilter] = useState<'ALL' | StaffRoleOption>('ALL');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRoleOption>('JUDGE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);

  const judgesCount = users.filter((u) => u.role === 'JUDGE').length;
  const organizersCount = users.filter((u) => u.role === 'ORGANIZER').length;
  const visibleUsers = filter === 'ALL' ? users : users.filter((u) => u.role === filter);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedBanner(null);
    setBusy(true);
    try {
      const { user } = await apiFetch<{ user: StaffUserItem }>('/api/users', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password, role },
      });
      setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
      const label = role === 'JUDGE' ? 'Teacher / Judge' : 'Event Organizer';
      setCreatedBanner(`Created ${label} account for ${user.name} (${user.email}).`);
      toast(`${label} account created`, 'success');
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create staff account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Teachers &amp; Organizers</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Create faculty judge (teacher) and event organizer accounts for your campus.
            </p>
          </div>
          <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-white/15 bg-slate-950/75 p-1 backdrop-blur-md">
            {(
              [
                { key: 'ALL', label: `All (${users.length})` },
                { key: 'JUDGE', label: `Teachers / Judges (${judgesCount})` },
                { key: 'ORGANIZER', label: `Organizers (${organizersCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === tab.key
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-sm font-semibold text-white">Add New Teacher or Organizer</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Prof. Ananya Rao"
              required
              maxLength={100}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ananya@campus.edu"
              required
            />
            <Input
              label="Temporary password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              maxLength={128}
              required
            />
            <Select
              label="Account role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRoleOption)}
            >
              <option value="JUDGE">Teacher / Faculty Judge</option>
              <option value="ORGANIZER">Event Organizer</option>
            </Select>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-xs font-medium text-red-300">
              {error}
            </p>
          )}
          {createdBanner && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-xs font-medium text-emerald-300">
              {createdBanner}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={busy}>
              Create {role === 'JUDGE' ? 'Teacher / Judge' : 'Organizer'} Account
            </Button>
          </div>
        </form>

        {visibleUsers.length === 0 ? (
          <p className="text-sm text-slate-400">No staff accounts found for this filter.</p>
        ) : (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-950/40">
            {visibleUsers.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <Badge tone={u.role === 'JUDGE' ? 'brand' : 'green'}>
                  {u.role === 'JUDGE' ? 'Teacher / Judge' : 'Organizer'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
