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
            density={0.82}
            gradientOpacity={0.62}
            glyphOpacity={0.72}
            glow={0.32}
            scale={1.15}
            flow={0.65}
            speed={0.75}
            mouseInteraction={true}
            scrambleRadius={0.18}
            clickEffect="wave"
            dpr={1.25}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.32)_55%,rgba(2,6,23,0.72)_72%,rgba(2,6,23,0.96)_100%)]"
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
