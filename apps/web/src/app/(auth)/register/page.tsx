import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { InstitutionDTO } from '@campusgrid/shared';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Sign up' };

export default async function RegisterPage() {
  if (await getSession()) redirect('/dashboard');
  const { institutions } = await apiFetch<{ institutions: InstitutionDTO[] }>('/api/institutions').catch(() => ({
    institutions: [] as InstitutionDTO[],
  }));
  return <RegisterForm institutions={institutions} />;
}
