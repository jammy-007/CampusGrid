'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { disconnectSockets } from '@/lib/socket';
import { Button, Card, Input } from '@/components/ui';

/** Only allow same-site relative redirects. */
function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { setUser } = useSession();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const { user } = await apiFetch<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      disconnectSockets();
      setUser(user);
      router.push(safeNext(next));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in');
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Log in</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-600">
          Create a student account
        </Link>
      </p>
    </Card>
  );
}
