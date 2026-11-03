'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { apiFetch, ApiError } from '@/lib/api';
import { base64UrlDecodeToString, type PassTokenResponse, type PassTokenPayload } from '@campusgrid/shared';
import { Badge, Button, ButtonLink, Card } from '@/components/ui';

interface DynamicPassClientProps {
  registrationId: string;
}

export function DynamicPassClient({ registrationId }: DynamicPassClientProps) {
  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<PassTokenPayload | null>(null);
  const [eventInfo, setEventInfo] = useState<{ title: string; venue: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch fresh token
  const fetchToken = useCallback(async () => {
    try {
      const data = await apiFetch<PassTokenResponse>(`/api/passes/${registrationId}/token`);
      setToken(data.token);
      setSecondsLeft(data.expiresIn || 60);
      setError(null);
      setIsOffline(false);

      // Extract payload for display
      try {
        const payloadJson = base64UrlDecodeToString(data.token.split('.')[0]);
        const p = JSON.parse(payloadJson) as PassTokenPayload;
        setPayload(p);
      } catch {
        // Ignored
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          setError(err.message);
        } else {
          setIsOffline(true);
        }
      } else {
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  // Fetch event details
  useEffect(() => {
    apiFetch<{ registration: { event: { title: string; venue: string } } }>(`/api/passes/${registrationId}`)
      .then((res) => {
        setEventInfo(res.registration.event);
      })
      .catch(() => {
        // Optional
      });
  }, [registrationId]);

  // Initial fetch
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Periodic refresh every 25 seconds
  useEffect(() => {
    const refreshTimer = setInterval(() => {
      fetchToken();
    }, 25000);

    return () => clearInterval(refreshTimer);
  }, [fetchToken]);

  // 1-second countdown timer
  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  // Online / offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchToken();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchToken]);

  // Draw QR code onto canvas
  useEffect(() => {
    if (!token || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, token, {
      width: 260,
      margin: 1.5,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('QR draw error', err);
    });
  }, [token, loading]);

  const handleCopyCode = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const percentage = Math.max(0, Math.min(100, (secondsLeft / 60) * 100));

  if (loading && !token) {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center justify-center p-12 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-300">Generating secure dynamic pass...</p>
      </Card>
    );
  }

  if (error && !token) {
    return (
      <Card className="mx-auto max-w-md border-red-500/30 bg-red-950/20 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-400/30">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white">Pass Unavailable</h2>
        <p className="mt-2 text-sm text-red-200">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => fetchToken()} variant="secondary" size="sm">
            Try Again
          </Button>
          <ButtonLink href="/events" variant="primary" size="sm">
            Back to Events
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 shadow-sm backdrop-blur-md animate-pulse">
          <svg className="h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-12.728 0m0 0l2.829-2.829m-2.829 2.829L3 21m2.828-15.536a9 9 0 0112.728 0" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold text-amber-300">Offline, pass may expire</p>
            <p className="text-xs text-amber-200/80">Displaying cached pass. Reconnect soon to renew.</p>
          </div>
          <button
            onClick={() => fetchToken()}
            className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30 hover:bg-amber-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Pass Card */}
      <Card className="overflow-hidden p-0 shadow-2xl">
        {/* Pass Header */}
        <div className="border-b border-white/10 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-sky-950/80 p-5 text-white">
          <div className="flex items-center justify-between">
            <Badge tone="green" className="font-semibold">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Dynamic Pass
            </Badge>
            <div className="text-right">
              <span className="text-[11px] text-slate-400">Validity</span>
              <p className="font-mono text-sm font-bold text-emerald-300">{secondsLeft}s left</p>
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-xl font-bold tracking-tight text-white">
              {eventInfo?.title ?? 'CampusGrid Event'}
            </h1>
            {eventInfo?.venue && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-sky-300">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {eventInfo.venue}
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar for Expiry Countdown */}
        <div className="h-1.5 w-full bg-slate-900">
          <div
            className={`h-full transition-all duration-1000 ${
              secondsLeft > 20
                ? 'bg-gradient-to-r from-emerald-400 to-sky-400'
                : secondsLeft > 10
                ? 'bg-amber-400'
                : 'bg-red-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* QR Code Container */}
        <div className="p-6 text-center">
          <div className="relative mx-auto inline-block rounded-2xl border-2 border-emerald-400/40 bg-white p-3 shadow-2xl ring-4 ring-emerald-500/10">
            <canvas ref={canvasRef} className="mx-auto block" />
            {secondsLeft === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 p-4 backdrop-blur-sm">
                <p className="text-sm font-bold text-red-600">Pass Expired</p>
                <p className="mt-1 text-xs text-slate-600">Auto-refreshing...</p>
                <button
                  onClick={() => fetchToken()}
                  className="mt-3 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500"
                >
                  Renew Now
                </button>
              </div>
            )}
          </div>

          {/* Attendee Info */}
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Attendee</p>
            <p className="mt-0.5 text-lg font-bold text-white">{payload?.name ?? 'Registered Attendee'}</p>
            <p className="font-mono text-xs text-slate-400">ID: {payload?.rid ?? registrationId}</p>
          </div>

          {/* Copy Token Action */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-slate-700 hover:text-white"
            >
              <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Code Copied!' : 'Copy Pass Code'}
            </button>
          </div>

          {/* Anti-screenshot Notice */}
          <div className="mt-4 rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs text-slate-400">
            <div className="flex items-center justify-center gap-1.5 font-medium text-emerald-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Cryptographically Signed Dynamic QR
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Pass renews automatically every 25 seconds. Static screenshots will be rejected by the gate scanner.
            </p>
          </div>
        </div>

        {/* Pass Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/60 px-5 py-3 text-xs text-slate-400">
          <Link
            href={payload?.eid ? `/events/${payload.eid}` : '/events'}
            className="font-medium text-sky-400 hover:underline"
          >
            ← Back to Event
          </Link>
          <button
            onClick={() => fetchToken()}
            className="flex items-center gap-1 font-medium text-slate-300 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </Card>
    </div>
  );
}
