'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { apiFetch } from '@/lib/api';
import type { CheckinBundleDTO, CheckinScanItem, CheckinSyncResponse } from '@campusgrid/shared';
import {
  getCachedBundle,
  getCheckedInSet,
  getDeviceId,
  getQueuedScans,
  markLocallyCheckedIn,
  queueScan,
  removeQueuedScans,
  saveBundle,
} from '@/features/checkin/scannerDb';
import { verifyScanToken, type ScanVerificationResult } from '@/features/checkin/scannerVerify';

interface ScannerClientProps {
  eventId: string;
}

interface FlashState {
  show: boolean;
  success: boolean;
  name?: string;
  usn?: string | null;
  message: string;
}

export function ScannerClient({ eventId }: ScannerClientProps) {
  const [bundle, setBundle] = useState<CheckinBundleDTO | null>(null);
  const [checkedInSet, setCheckedInSet] = useState<Set<string>>(new Set());
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const [recentScans, setRecentScans] = useState<Array<{ id: string; name: string; time: string; success: boolean }>>([]);

  const [flash, setFlash] = useState<FlashState>({
    show: false,
    success: false,
    message: '',
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Play audio chimes
  const playSound = useCallback((success: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();

      if (success) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.35);
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, ctx.currentTime);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // Audio autoplay may be disabled
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (success) {
          navigator.vibrate(120);
        } else {
          navigator.vibrate([100, 60, 100]);
        }
      } catch {
        // Ignored
      }
    }
  }, []);

  // Register service worker for offline loading
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/scanner-sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    }
  }, []);

  // Load offline bundle & queue
  const loadData = useCallback(async () => {
    // 1. Try local IndexedDB first
    const cached = await getCachedBundle(eventId);
    if (cached) {
      setBundle(cached);
    }

    const currentChecked = await getCheckedInSet();
    setCheckedInSet(currentChecked);

    const queued = await getQueuedScans();
    setPendingSyncCount(queued.length);

    // 2. Fetch fresh bundle from server if online
    try {
      const serverBundle = await apiFetch<CheckinBundleDTO>(`/api/events/${eventId}/checkin/bundle`);
      setBundle(serverBundle);
      await saveBundle(serverBundle);
      const updatedChecked = await getCheckedInSet();
      setCheckedInSet(updatedChecked);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync queued scans to server
  const syncQueue = useCallback(async () => {
    if (isSyncing) return;
    const queued = await getQueuedScans();
    if (queued.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    setIsSyncing(true);
    try {
      const response = await apiFetch<CheckinSyncResponse>('/api/checkin/sync', {
        method: 'POST',
        body: { scans: queued },
      });

      const processedIds = response.results
        .filter((r) => r.status === 'ACCEPTED' || r.status === 'ALREADY_CHECKED_IN')
        .map((r) => r.clientScanId);

      await removeQueuedScans(processedIds);

      const remaining = await getQueuedScans();
      setPendingSyncCount(remaining.length);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Periodic sync every 10 seconds & online event listener
  useEffect(() => {
    const interval = setInterval(() => {
      syncQueue();
    }, 10000);

    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
      loadData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue, loadData]);

  // Process a scanned token string
  const handleDecodedToken = useCallback(
    async (decodedText: string) => {
      if (isProcessingRef.current || !bundle) return;
      isProcessingRef.current = true;

      const result: ScanVerificationResult = await verifyScanToken(decodedText, bundle, checkedInSet);

      if (result.valid && result.attendee) {
        // Success
        playSound(true);

        const newScan: CheckinScanItem = {
          clientScanId: crypto.randomUUID(),
          rid: result.attendee.rid,
          scannedAt: new Date().toISOString(),
          deviceId: getDeviceId(),
        };

        // Queue in IndexedDB
        await queueScan(newScan);
        await markLocallyCheckedIn(result.attendee.rid);

        // Update local set to prevent duplicate immediate scan
        setCheckedInSet((prev) => new Set([...prev, result.attendee!.rid]));
        setPendingSyncCount((prev) => prev + 1);

        setRecentScans((prev) => [
          {
            id: newScan.clientScanId,
            name: result.attendee!.name,
            time: new Date().toLocaleTimeString(),
            success: true,
          },
          ...prev.slice(0, 9),
        ]);

        // Flash green
        setFlash({
          show: true,
          success: true,
          name: result.attendee.name,
          usn: result.attendee.usn,
          message: 'CHECK-IN CONFIRMED',
        });

        // Trigger immediate background sync
        syncQueue();
      } else {
        // Rejected
        playSound(false);

        const displayName = result.attendee?.name ?? result.payload?.name ?? 'Unknown';

        setRecentScans((prev) => [
          {
            id: crypto.randomUUID(),
            name: displayName,
            time: new Date().toLocaleTimeString(),
            success: false,
          },
          ...prev.slice(0, 9),
        ]);

        // Flash red
        setFlash({
          show: true,
          success: false,
          name: displayName,
          usn: result.attendee?.usn,
          message: result.message,
        });
      }

      // Hide flash and resume scanning after 1.6 seconds (< 2s requirement)
      setTimeout(() => {
        setFlash((f) => ({ ...f, show: false }));
        isProcessingRef.current = false;
      }, 1600);
    },
    [bundle, checkedInSet, playSound, syncQueue],
  );

  // Initialize camera scanner
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader-container', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDecodedToken(decodedText);
        },
        () => {
          // Frame decode failure, normal while scanning
        },
      );

      setCameraActive(true);
    } catch (err) {
      console.error('Camera start failed', err);
      setCameraError('Camera access failed. Please ensure camera permissions are granted or use manual entry below.');
      setCameraActive(false);
    }
  }, [handleDecodedToken]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current && cameraActive) {
      try {
        await scannerRef.current.stop();
        setCameraActive(false);
      } catch (err) {
        console.error('Camera stop failed', err);
      }
    }
  }, [cameraActive]);

  useEffect(() => {
    startCamera();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [startCamera]);

  return (
    <div className="relative min-h-[85vh] space-y-4">
      {/* Full-Screen Flash Overlay */}
      {flash.show && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center text-white transition-all duration-200 ${
            flash.success ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
            {flash.success ? (
              <svg className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h2 className="text-3xl font-extrabold tracking-wide uppercase">{flash.message}</h2>

          {flash.name && <p className="mt-3 text-2xl font-bold">{flash.name}</p>}
          {flash.usn && <p className="mt-1 font-mono text-lg text-white/80">USN: {flash.usn}</p>}

          <p className="mt-6 text-xs text-white/70 uppercase tracking-widest">Resuming scanner...</p>
        </div>
      )}

      {/* Top Header & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Link href={`/events/${eventId}/manage`} className="text-xs font-semibold text-brand-600 hover:underline">
            ← Manage Event
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Pass Scanner</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Online/Offline Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOnline ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>

          {/* Pending Sync Count */}
          {pendingSyncCount > 0 ? (
            <button
              onClick={() => syncQueue()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20 hover:bg-blue-100"
            >
              <svg className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync ({pendingSyncCount})
            </button>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Synced
            </span>
          )}

          <Link
            href={`/events/${eventId}/attendance`}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Attendance
          </Link>
        </div>
      </div>

      {/* Roster & Stats Summary */}
      {bundle && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-xs text-slate-500">Roster in Bundle</span>
            <p className="text-xl font-bold text-slate-900">{bundle.registrations.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-xs text-slate-500">Checked In</span>
            <p className="text-xl font-bold text-emerald-600">{checkedInSet.size}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-xs text-slate-500">Remaining</span>
            <p className="text-xl font-bold text-slate-600">
              {Math.max(0, bundle.registrations.length - checkedInSet.size)}
            </p>
          </div>
        </div>
      )}

      {/* Camera Scanner Viewport */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-lg">
        <div className="relative">
          <div id="qr-reader-container" className="w-full min-h-[320px]" />

          {/* Scanner Active Overlay Guidelines */}
          {cameraActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-64 w-64 rounded-2xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="h-0.5 w-full bg-emerald-400 animate-pulse mt-32" />
              </div>
            </div>
          )}

          {cameraError && (
            <div className="p-6 text-center text-white">
              <svg className="mx-auto h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="mt-2 text-sm text-slate-300">{cameraError}</p>
              <button
                onClick={() => startCamera()}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Camera Control Bar */}
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            {cameraActive ? 'Rear Camera Continuous' : 'Camera Paused'}
          </span>
          <button
            onClick={() => (cameraActive ? stopCamera() : startCamera())}
            className="font-medium text-emerald-400 hover:text-emerald-300"
          >
            {cameraActive ? 'Pause Camera' : 'Start Camera'}
          </button>
        </div>
      </div>

      {/* Manual Token Verification / Paste fallback */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Manual Pass Verification</h3>
        <p className="mt-0.5 text-xs text-slate-500">If camera cannot scan, paste the token string directly:</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="eyJ2IjoxLCJyaWQiOi..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={() => {
              if (manualCode.trim()) {
                handleDecodedToken(manualCode.trim());
                setManualCode('');
              }
            }}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Verify
          </button>
        </div>
      </div>

      {/* Recent Scans Activity Log */}
      {recentScans.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Scans</h3>
          <div className="mt-2 divide-y divide-slate-100">
            {recentScans.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${s.success ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                  <span className="font-semibold text-slate-900">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <span>{s.time}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      s.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {s.success ? 'ACCEPTED' : 'REJECTED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
