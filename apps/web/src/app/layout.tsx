import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';
import { ToastProvider } from '@/components/ui';
import { Nav } from '@/components/nav/Nav';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: { default: 'CampusGrid', template: '%s · CampusGrid' },
  description: 'Create, host and manage campus events in one place.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  return (
    <html lang="en">
      <body>
        <SessionProvider initialUser={user}>
          <ToastProvider>
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
