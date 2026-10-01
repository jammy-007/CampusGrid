'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { InstitutionDTO, SessionUser } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, Input, Select } from '@/components/ui';

export function RegisterForm({ institutions }: { institutions: InstitutionDTO[] }) {
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
      const { user } = await apiFetch<{ user: SessionUser }>('/api/auth/register', {
        method: 'POST',
        body: {
          institutionSlug: form.get('institutionSlug'),
          name: form.get('name'),
          email: form.get('email'),
          usn: form.get('usn') || undefined,
          password: form.get('password'),
        },
      });
      setUser(user);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign up');
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">Create a student account</h1>
      <p className="mb-4 text-sm text-slate-500">Organizer and judge accounts are created by your campus admin.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Select label="Institution" name="institutionSlug" required defaultValue={institutions[0]?.slug}>
          {institutions.map((i) => (
            <option key={i.id} value={i.slug}>
              {i.name}
            </option>
          ))}
        </Select>
        <Input label="Full name" name="name" autoComplete="name" required />
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input label="USN" name="usn" hint="University seat number (optional)" />
        <Input label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Sign up
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-600">
          Log in
        </Link>
      </p>
    </Card>
  );
}
