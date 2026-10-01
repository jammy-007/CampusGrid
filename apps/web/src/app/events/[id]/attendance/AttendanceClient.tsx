'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { AttendanceDTO, AttendanceAttendeeDTO, CertificateDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface AttendanceClientProps {
  eventId: string;
  initialAttendance: AttendanceDTO;
  eventStatus: string;
}

export function AttendanceClient({ eventId, initialAttendance, eventStatus }: AttendanceClientProps) {
  const [attendance, setAttendance] = useState<AttendanceDTO>(initialAttendance);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CHECKED_IN' | 'PENDING'>('ALL');

  // Certificate state
  const [certificates, setCertificates] = useState<CertificateDTO[]>([]);
  const [loadingCerts, setLoadingCerts] = useState<boolean>(false);
  const [issuingCerts, setIssuingCerts] = useState<boolean>(false);
  const [certMessage, setCertMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Live Socket.IO count updates
  useEffect(() => {
    const socket = getSocket('/live');

    socket.emit('live:subscribe', { eventId });

    const handleCountUpdate = (data: { eventId: string; checkedIn: number; registered: number }) => {
      if (data.eventId === eventId) {
        setAttendance((prev) => ({
          ...prev,
          registeredCount: data.registered,
          checkedInCount: data.checkedIn,
        }));
        // Re-fetch full attendance list to show newly checked-in attendee rows
        apiFetch<AttendanceDTO>(`/api/events/${eventId}/attendance`)
          .then((res) => setAttendance(res))
          .catch(() => {});
      }
    };

    socket.on('checkin:count', handleCountUpdate);

    return () => {
      socket.off('checkin:count', handleCountUpdate);
    };
  }, [eventId]);

  // Load existing certificates
  const loadCertificates = useCallback(async () => {
    setLoadingCerts(true);
    try {
      // Call issue with dry check or fetch existing certificates
      const res = await apiFetch<{ certificates: CertificateDTO[] }>(`/api/events/${eventId}/certificates/issue`, {
        method: 'POST',
      });
      setCertificates(res.certificates ?? []);
    } catch {
      // Might not be eligible yet
    } finally {
      setLoadingCerts(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventStatus === 'COMPLETED' || eventStatus === 'ONGOING') {
      loadCertificates();
    }
  }, [eventStatus, loadCertificates]);

  // Handle Certificate Issuing
  const handleIssueCertificates = async () => {
    setIssuingCerts(true);
    setCertMessage(null);
    try {
      const res = await apiFetch<{ count: number; certificates: CertificateDTO[] }>(
        `/api/events/${eventId}/certificates/issue`,
        { method: 'POST' },
      );
      setCertificates(res.certificates ?? []);
      setCertMessage({
        text: `Successfully issued ${res.count} new certificate(s)! Total: ${res.certificates.length}`,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to issue certificates';
      setCertMessage({ text: msg, error: true });
    } finally {
      setIssuingCerts(false);
    }
  };

  // Filter attendees
  const filteredAttendees = useMemo(() => {
    return attendance.attendees.filter((a: AttendanceAttendeeDTO) => {
      if (statusFilter === 'CHECKED_IN' && !a.checkedIn) return false;
      if (statusFilter === 'PENDING' && a.checkedIn) return false;

      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(query) ||
        a.email.toLowerCase().includes(query) ||
        (a.usn && a.usn.toLowerCase().includes(query)) ||
        (a.teamName && a.teamName.toLowerCase().includes(query))
      );
    });
  }, [attendance.attendees, search, statusFilter]);

  const percentage = attendance.registeredCount > 0
    ? Math.round((attendance.checkedInCount / attendance.registeredCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/events/${eventId}/manage`} className="text-xs font-semibold text-brand-600 hover:underline">
            ← Manage Event
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Attendance & Duty Leave</h1>
          <p className="text-sm text-slate-500">Live attendance monitoring and verified certificate issuance</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${eventId}/scan`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan Passes
          </Link>

          <a
            href={`/api/events/${eventId}/attendance?format=csv`}
            download={`attendance-${eventId}.csv`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Registered</span>
          <p className="mt-1 text-2xl font-bold text-slate-900">{attendance.registeredCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Checked In</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{attendance.checkedInCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Pending</span>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {Math.max(0, attendance.registeredCount - attendance.checkedInCount)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Attendance Rate</span>
          <p className="mt-1 text-2xl font-bold text-blue-600">{percentage}%</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, USN, team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-1.5">
          {(['ALL', 'CHECKED_IN', 'PENDING'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setStatusFilter(mode)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === mode
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode === 'ALL' ? 'All' : mode === 'CHECKED_IN' ? 'Checked In' : 'Pending'}
            </button>
          ))}
        </div>
      </div>

      {/* Attendees Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">USN</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Checked In At</th>
                <th className="px-4 py-3">Scanned By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No attendees match your filter.
                  </td>
                </tr>
              ) : (
                filteredAttendees.map((a: AttendanceAttendeeDTO) => (
                  <tr key={a.registrationId} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      {a.checkedIn ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Checked In
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{a.usn ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.email}</td>
                    <td className="px-4 py-3 text-slate-600">{a.teamName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {a.scannedAt ? new Date(a.scannedAt).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{a.scannedByName ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OD Certificates Section */}
      <section id="certificates" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Duty Leave (OD) Certificates</h2>
            <p className="text-xs text-slate-500">
              Generate officially verifiable On Duty certificates for checked-in attendees.
            </p>
          </div>

          <button
            onClick={handleIssueCertificates}
            disabled={issuingCerts || (eventStatus !== 'COMPLETED' && eventStatus !== 'ONGOING')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {issuingCerts ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Issuing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Issue OD Certificates ({attendance.checkedInCount} checked-in)
              </>
            )}
          </button>
        </div>

        {eventStatus !== 'COMPLETED' && eventStatus !== 'ONGOING' && (
          <p className="text-xs text-amber-600">
            ⚠️ Event must be ONGOING or COMPLETED to issue OD certificates. (Current status: {eventStatus})
          </p>
        )}

        {certMessage && (
          <div
            className={`rounded-lg p-3 text-xs font-semibold ${
              certMessage.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {certMessage.text}
          </div>
        )}

        {/* Certificates Table */}
        {loadingCerts ? (
          <p className="text-xs text-slate-400">Loading certificates...</p>
        ) : certificates.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-xs text-slate-500">
            No OD certificates have been issued yet. Click &quot;Issue OD Certificates&quot; to generate them.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Serial</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">USN</th>
                  <th className="px-3 py-2">Verification Code</th>
                  <th className="px-3 py-2">Issued At</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certificates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{c.serial}</td>
                    <td className="px-3 py-2 font-medium">{c.studentName}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{c.studentUsn ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/verify/${c.verifyCode}`}
                        className="font-mono text-brand-600 hover:underline"
                        target="_blank"
                      >
                        {c.verifyCode}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{new Date(c.issuedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={`/api/certificates/${c.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
