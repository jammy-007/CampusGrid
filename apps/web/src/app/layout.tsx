import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';
import { GradientASCII, ToastProvider } from '@/components/ui';
import { Nav } from '@/components/nav/Nav';
import { SmoothScrollProvider } from '@/components/motion/SmoothScrollProvider';
import { PageTransition } from '@/components/motion/PageTransition';
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
        <div className="pointer-events-none fixed inset-0 -z-10 bg-slate-950">
          <GradientASCII
            colors={['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8']}
            shape="horizon"
            characters=" =+xX0S8#@"
            cellSize={18}
            density={0.78}
            gradientOpacity={0.55}
            glyphOpacity={0.62}
            speed={0.65}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(2,6,23,0.45)_0%,rgba(2,6,23,0.75)_65%,rgba(2,6,23,0.92)_100%)]"
          />
        </div>
        <SessionProvider initialUser={user}>
          <ToastProvider>
            <SmoothScrollProvider>
              <Nav />
              <main className="relative z-10 mx-auto max-w-6xl px-4 py-8">
                <PageTransition>{children}</PageTransition>
              </main>
            </SmoothScrollProvider>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
