'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Html5Qrcode } from 'html5-qrcode';
import { apiFetch } from '@/lib/api';
import type { CheckinBundleDTO, CheckinScanItem, CheckinSyncResponse, ScanType } from '@campusgrid/shared';
import { Badge, Button, ButtonLink, Card } from '@/components/ui';
import {
  getCachedBundle,
  getCheckedInSet,
  getCheckedOutSet,
  getDeviceId,
  getQueuedScans,
  markLocallyCheckedIn,
  markLocallyCheckedOut,
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
  const [checkedOutSet, setCheckedOutSet] = useState<Set<string>>(new Set());
  const [scanMode, setScanMode] = useState<ScanType>('CHECK_IN');
  const [openingCheckout, setOpeningCheckout] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [manualCode, setManualCode] = useState<string>('');
  const [recentScans, setRecentScans] = useState<
    Array<{ id: string; name: string; time: string; success: boolean; mode: ScanType }>
  >([]);

  const [flash, setFlash] = useState<FlashState>({
    show: false,
    success: false,
    message: '',
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const bundleRef = useRef<CheckinBundleDTO | null>(null);
  const checkedInSetRef = useRef<Set<string>>(new Set());
  const checkedOutSetRef = useRef<Set<string>>(new Set());
  const scanModeRef = useRef<ScanType>('CHECK_IN');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep refs synchronized with state
  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    checkedInSetRef.current = checkedInSet;
  }, [checkedInSet]);

  useEffect(() => {
    checkedOutSetRef.current = checkedOutSet;
  }, [checkedOutSet]);

  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);

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
        .filter(
          (r) =>
            r.status === 'ACCEPTED' ||
            r.status === 'ALREADY_CHECKED_IN' ||
            r.status === 'ALREADY_CHECKED_OUT',
        )
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

  // Load offline bundle & queue
  const loadData = useCallback(async () => {
    // 1. Try local IndexedDB first
    const cached = await getCachedBundle(eventId);
    if (cached) {
      setBundle(cached);
      bundleRef.current = cached;
    }

    const [currentCheckedIn, currentCheckedOut, queued] = await Promise.all([
      getCheckedInSet(),
      getCheckedOutSet(),
      getQueuedScans(),
    ]);
    setCheckedInSet(currentCheckedIn);
    checkedInSetRef.current = currentCheckedIn;
    setCheckedOutSet(currentCheckedOut);
    checkedOutSetRef.current = currentCheckedOut;
    setPendingSyncCount(queued.length);

    // 2. Fetch fresh bundle from server if online
    try {
      const serverBundle = await apiFetch<CheckinBundleDTO>(`/api/events/${eventId}/checkin/bundle`);
      setBundle(serverBundle);
      bundleRef.current = serverBundle;
      await saveBundle(serverBundle);
      const [updatedCheckedIn, updatedCheckedOut] = await Promise.all([
        getCheckedInSet(),
        getCheckedOutSet(),
      ]);
      setCheckedInSet(updatedCheckedIn);
      checkedInSetRef.current = updatedCheckedIn;
      setCheckedOutSet(updatedCheckedOut);
      checkedOutSetRef.current = updatedCheckedOut;
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, [eventId]);

  const handleOpenCheckoutNow = useCallback(async () => {
    setOpeningCheckout(true);
    try {
      const res = await apiFetch<{ checkoutOpensAt: string }>(
        `/api/events/${eventId}/checkin/open-checkout`,
        { method: 'POST' },
      );
      if (bundleRef.current) {
        const updatedBundle: CheckinBundleDTO = {
          ...bundleRef.current,
          checkoutOpensAt: res.checkoutOpensAt,
        };
        setBundle(updatedBundle);
        bundleRef.current = updatedBundle;
        await saveBundle(updatedBundle);
      }
      setScanMode('CHECK_OUT');
      scanModeRef.current = 'CHECK_OUT';
    } catch {
      // Ignore
    } finally {
      setOpeningCheckout(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    async (rawText: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      let decodedText = rawText.trim();
      // Handle URL pasted or scanned if someone scanned a full pass URL
      if (decodedText.includes('token=')) {
        decodedText = decodedText.split('token=')[1].split('&')[0];
      }

      let activeBundle = bundleRef.current;
      if (!activeBundle) {
        // Fallback: check IndexedDB directly
        activeBundle = (await getCachedBundle(eventId)) || null;
      }

      if (!activeBundle) {
        playSound(false);
        setFlash({
          show: true,
          success: false,
          message: 'Check-in roster still loading. Please try again in a moment.',
        });
        setTimeout(() => {
          setFlash((f) => ({ ...f, show: false }));
          isProcessingRef.current = false;
        }, 1600);
        return;
      }

      const activeCheckedSet = checkedInSetRef.current;
      const activeCheckedOutSet = checkedOutSetRef.current;
      const currentMode = scanModeRef.current;
      const result: ScanVerificationResult = await verifyScanToken(
        decodedText,
        activeBundle,
        activeCheckedSet,
        activeCheckedOutSet,
        currentMode,
      );

      if (result.valid && result.attendee) {
        // Success
        playSound(true);

        const newScan: CheckinScanItem = {
          clientScanId: crypto.randomUUID(),
          rid: result.attendee.rid,
          scannedAt: new Date().toISOString(),
          deviceId: getDeviceId(),
          scanType: currentMode,
        };

        // Queue in IndexedDB
        await queueScan(newScan);
        if (currentMode === 'CHECK_OUT') {
          await markLocallyCheckedOut(result.attendee.rid);
          const nextOutSet = new Set([...activeCheckedOutSet, result.attendee.rid]);
          setCheckedOutSet(nextOutSet);
          checkedOutSetRef.current = nextOutSet;
        } else {
          await markLocallyCheckedIn(result.attendee.rid);
          const nextInSet = new Set([...activeCheckedSet, result.attendee.rid]);
          setCheckedInSet(nextInSet);
          checkedInSetRef.current = nextInSet;
        }
        setPendingSyncCount((prev) => prev + 1);

        setRecentScans((prev) => [
          {
            id: newScan.clientScanId,
            name: result.attendee!.name,
            time: new Date().toLocaleTimeString(),
            success: true,
            mode: currentMode,
          },
          ...prev.slice(0, 9),
        ]);

        // Flash green
        setFlash({
          show: true,
          success: true,
          name: result.attendee.name,
          usn: result.attendee.usn,
          message: currentMode === 'CHECK_OUT' ? 'CHECK-OUT CONFIRMED (OD ELIGIBLE)' : 'CHECK-IN CONFIRMED',
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
            mode: currentMode,
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
    [eventId, playSound, syncQueue],
  );

  // Initialize camera scanner with fallback
  const startCamera = useCallback(
    async (facing: 'environment' | 'user' = cameraFacing) => {
      try {
        setCameraError(null);

        // Ensure container exists
        const container = document.getElementById('qr-reader-container');
        if (!container) return;

        const { Html5Qrcode: Html5QrcodeClass, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!scannerRef.current) {
          scannerRef.current = new Html5QrcodeClass('qr-reader-container', {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false,
          });
        }

        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop().catch(() => {});
        }

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        const onScanSuccess = (decodedText: string) => {
          handleDecodedToken(decodedText);
        };

        try {
          await scanner.start({ facingMode: facing }, config, onScanSuccess, () => {});
          setCameraFacing(facing);
        } catch (facingErr) {
          // If requested facingMode fails (e.g. desktop webcam with no rear camera), try the other mode
          const altFacing = facing === 'environment' ? 'user' : 'environment';
          console.warn(`Camera facingMode "${facing}" failed, attempting "${altFacing}":`, facingErr);
          try {
            await scanner.start({ facingMode: altFacing }, config, onScanSuccess, () => {});
            setCameraFacing(altFacing);
          } catch {
            // Try deviceId fallback if facingMode is unsupported
            const devices = await Html5QrcodeClass.getCameras().catch(() => []);
            if (devices && devices.length > 0) {
              await scanner.start(devices[0].id, config, onScanSuccess, () => {});
            } else {
              throw facingErr;
            }
          }
        }

        setCameraActive(true);
      } catch (err) {
        console.error('Camera start failed', err);
        setCameraError('Camera access unavailable on this device. You can use image upload or manual code verification below.');
        setCameraActive(false);
      }
    },
    [cameraFacing, handleDecodedToken],
  );

  const stopCamera = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        setCameraActive(false);
      } catch (err) {
        console.error('Camera stop failed', err);
      }
    }
  }, []);

  const toggleCameraFacing = useCallback(async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    await stopCamera();
    await startCamera(nextFacing);
  }, [cameraFacing, startCamera, stopCamera]);

  // Mount camera on page load or when camera facing changes
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) {
        startCamera();
      }
    }, 150);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch {
          // Ignored
        }
      }
    };
  }, [startCamera]);

  // Handle uploading an image file to scan
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!scannerRef.current) {
        const { Html5Qrcode: Html5QrcodeClass, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        scannerRef.current = new Html5QrcodeClass('qr-reader-container', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      const decodedText = await scannerRef.current.scanFile(file, true);
      handleDecodedToken(decodedText);
    } catch (err) {
      console.warn('Image file decode error:', err);
      playSound(false);
      setFlash({
        show: true,
        success: false,
        message: 'No readable QR code found in selected image',
      });
      setTimeout(() => setFlash((f) => ({ ...f, show: false })), 1600);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="relative min-h-[85vh] space-y-6">
      {/* Full-Screen Flash Overlay */}
      {flash.show && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center text-white transition-all duration-200 ${
            flash.success ? 'bg-emerald-600/95 backdrop-blur-md' : 'bg-rose-600/95 backdrop-blur-md'
          }`}
        >
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-md shadow-2xl">
            {flash.success ? (
              <svg className="h-14 w-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-14 w-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href={`/events/${eventId}/manage`} className="text-sm font-medium text-sky-400 hover:underline">
              ← Manage Event
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-white">Pass Scanner</h1>
            <p className="text-xs text-slate-400">Scan student dynamic QR passes or paste codes for instant admission</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Online/Offline Badge */}
            <Badge tone={isOnline ? 'green' : 'amber'}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isOnline ? 'Online' : 'Offline Mode'}
            </Badge>

            {/* Pending Sync Count */}
            {pendingSyncCount > 0 ? (
              <button
                onClick={() => syncQueue()}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/35 hover:bg-sky-500/25"
              >
                <svg className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync ({pendingSyncCount})
              </button>
            ) : (
              <Badge tone="neutral">Synced</Badge>
            )}

            <ButtonLink
              href={`/events/${eventId}/attendance`}
              variant="secondary"
              size="sm"
            >
              Attendance
            </ButtonLink>
          </div>
        </div>
      </Card>

      {/* Scan Mode Toggle: Check-In vs Check-Out */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setScanMode('CHECK_IN')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                scanMode === 'CHECK_IN'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1. Entry Check-In
            </button>
            <button
              type="button"
              onClick={() => setScanMode('CHECK_OUT')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                scanMode === 'CHECK_OUT'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2. Exit Check-Out (OD Unlock)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {bundle?.checkoutOpensAt ? (
              new Date() < new Date(bundle.checkoutOpensAt) ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-amber-300">
                    Check-out opens at{' '}
                    <strong>{new Date(bundle.checkoutOpensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={openingCheckout}
                    onClick={handleOpenCheckoutNow}
                  >
                    Open Check-Out Now
                  </Button>
                </div>
              ) : (
                <Badge tone="green">Check-Out Window Open</Badge>
              )
            ) : (
              <Badge tone="green">Check-Out Open Anytime</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Roster & Stats Summary */}
      {bundle && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <span className="text-xs font-medium text-slate-400">Roster in Bundle</span>
            <p className="mt-1 text-2xl font-bold text-white">{bundle.registrations.length}</p>
          </Card>
          <Card className="p-4">
            <span className="text-xs font-medium text-slate-400">Checked In (Entry)</span>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{checkedInSet.size}</p>
          </Card>
          <Card className="col-span-2 sm:col-span-1 p-4">
            <span className="text-xs font-medium text-slate-400">Checked Out (OD Eligible)</span>
            <p className="mt-1 text-2xl font-bold text-sky-400">{checkedOutSet.size}</p>
          </Card>
        </div>
      )}

      {/* Camera Scanner Viewport */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl backdrop-blur-xl">
        <div className="relative">
          <div id="qr-reader-container" className="w-full min-h-[340px]" />

          {/* Scanner Active Overlay Guidelines */}
          {cameraActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-64 w-64 rounded-2xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                <div className="h-0.5 w-full bg-emerald-400 animate-pulse mt-32" />
                <span className="absolute -bottom-7 left-0 right-0 text-center text-[11px] font-medium tracking-wider text-emerald-300 uppercase">
                  Point camera at pass QR
                </span>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="p-8 text-center text-white">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-400/30">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-200">{cameraError}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => startCamera()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-500"
                >
                  Retry Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-slate-700"
                >
                  Upload QR Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Camera Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-900/90 px-4 py-3 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${cameraActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span className="font-medium text-slate-300">
              {cameraActive ? `${cameraFacing === 'environment' ? 'Rear' : 'Front'} Camera Active` : 'Camera Inactive'}
            </span>
          </span>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileChange}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800/90 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-slate-700 hover:text-white"
              title="Upload QR screenshot or photo"
            >
              <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upload Image
            </button>

            {cameraActive && (
              <button
                onClick={toggleCameraFacing}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800/90 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-slate-700 hover:text-white"
                title="Switch Camera (Front/Rear)"
              >
                <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Flip
              </button>
            )}

            <button
              onClick={() => (cameraActive ? stopCamera() : startCamera())}
              className="font-semibold text-emerald-400 hover:text-emerald-300"
            >
              {cameraActive ? 'Pause Camera' : 'Start Camera'}
            </button>
          </div>
        </div>
      </div>

      {/* Manual Token Verification / Paste fallback */}
      <Card className="space-y-3 p-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Manual Pass Code Verification</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            If the attendee’s camera cannot scan or screen brightness is low, paste their dynamic pass code:
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="eyJ2IjoxLCJyaWQiOi..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualCode.trim()) {
                handleDecodedToken(manualCode.trim());
                setManualCode('');
              }
            }}
            className="flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <Button
            onClick={() => {
              if (manualCode.trim()) {
                handleDecodedToken(manualCode.trim());
                setManualCode('');
              }
            }}
            variant="primary"
            size="sm"
          >
            Verify Pass
          </Button>
        </div>
      </Card>

      {/* Recent Scans Activity Log */}
      {recentScans.length > 0 && (
        <Card className="space-y-3 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent Scans</h3>
          <div className="divide-y divide-white/10">
            {recentScans.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${s.success ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
                  <span className="font-semibold text-white">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <Badge tone={s.mode === 'CHECK_OUT' ? 'brand' : 'neutral'}>
                    {s.mode === 'CHECK_OUT' ? 'CHECK-OUT' : 'CHECK-IN'}
                  </Badge>
                  <span className="font-mono text-[11px]">{s.time}</span>
                  <Badge tone={s.success ? 'green' : 'red'}>
                    {s.success ? 'ACCEPTED' : 'REJECTED'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
