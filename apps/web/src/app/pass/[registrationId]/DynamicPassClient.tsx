'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { apiFetch, ApiError } from '@/lib/api';
import { base64UrlDecodeToString, type PassTokenResponse, type PassTokenPayload } from '@campusgrid/shared';

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
      width: 250,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('QR draw error', err);
    });
  }, [token]);

  const percentage = Math.max(0, Math.min(100, (secondsLeft / 60) * 100));

  if (loading && !token) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center p-8 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-600">Generating secure dynamic pass...</p>
      </div>
    );
  }

  if (error && !token) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-red-900">Pass Unavailable</h2>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <Link
          href="/events"
          className="mt-5 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm animate-pulse">
          <svg className="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-12.728 0m0 0l2.829-2.829m-2.829 2.829L3 21m2.828-15.536a9 9 0 0112.728 0" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Offline, pass may expire</p>
            <p className="text-xs text-amber-700">Displaying cached pass. Reconnect soon to renew.</p>
          </div>
          <button
            onClick={() => fetchToken()}
            className="rounded bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Pass Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Pass Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-ping" />
              Dynamic Pass
            </span>
            <div className="text-right">
              <span className="text-xs text-emerald-100">Validity</span>
              <p className="font-mono text-sm font-bold">{secondsLeft}s left</p>
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-xl font-bold tracking-tight">
              {eventInfo?.title ?? 'CampusGrid Event'}
            </h1>
            {eventInfo?.venue && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-100">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {eventInfo.venue}
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar for Expiry Countdown */}
        <div className="h-1.5 w-full bg-slate-100">
          <div
            className={`h-full transition-all duration-1000 ${
              secondsLeft > 20
                ? 'bg-emerald-500'
                : secondsLeft > 10
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* QR Code Container */}
        <div className="p-6 text-center">
          <div className="relative mx-auto inline-block rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
            <canvas ref={canvasRef} className="mx-auto block" />
            {secondsLeft === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/90 p-4 backdrop-blur-sm">
                <p className="text-sm font-bold text-red-600">Pass Expired</p>
                <p className="mt-1 text-xs text-slate-500">Auto-refreshing...</p>
                <button
                  onClick={() => fetchToken()}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Renew Now
                </button>
              </div>
            )}
          </div>

          {/* Student Info */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Attendee</p>
            <p className="text-lg font-bold text-slate-900">{payload?.name ?? 'Registered Attendee'}</p>
            <p className="font-mono text-xs text-slate-500">ID: {payload?.rid ?? registrationId}</p>
          </div>

          {/* Anti-screenshot Notice */}
          <div className="mt-4 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
            <div className="flex items-center justify-center gap-1.5 font-medium text-slate-700">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Cryptographically Signed Dynamic QR
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Refreshes automatically every 25 seconds. Screenshots will be rejected at the gate.
            </p>
          </div>
        </div>

        {/* Pass Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          <Link
            href={payload?.eid ? `/events/${payload.eid}` : '/events'}
            className="font-medium text-emerald-600 hover:text-emerald-500"
          >
            ← Back to Event
          </Link>
          <button
            onClick={() => fetchToken()}
            className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
