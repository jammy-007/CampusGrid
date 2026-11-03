'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { AttendanceDTO, AttendanceAttendeeDTO, CertificateDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import {
  Badge,
  Button,
  ButtonLink,
  buttonClass,
  Card,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@/components/ui';

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
          <Link href={`/events/${eventId}/manage`} className="text-sm font-medium text-sky-400 hover:underline">
            ← Manage Event
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Attendance & Duty Leave</h1>
          <p className="text-xs text-slate-400">Live attendance monitoring and verified certificate issuance</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={`/events/${eventId}/scan`}
            variant="primary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan Passes
          </ButtonLink>

          <a
            href={`/api/events/${eventId}/attendance?format=csv`}
            download={`attendance-${eventId}.csv`}
            className={buttonClass('secondary', 'md')}
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-400">Registered</span>
          <p className="mt-1 text-2xl font-bold text-white">{attendance.registeredCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Checked In</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{attendance.checkedInCount}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-400">Pending</span>
          <p className="mt-1 text-2xl font-bold text-amber-400">
            {Math.max(0, attendance.registeredCount - attendance.checkedInCount)}
          </p>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-400">Attendance Rate</span>
          <p className="mt-1 text-2xl font-bold text-sky-400">{percentage}%</p>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/10">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Search and Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-1.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>

          <div className="flex gap-1.5">
            {(['ALL', 'CHECKED_IN', 'PENDING'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === mode
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {mode === 'ALL' ? 'All' : mode === 'CHECKED_IN' ? 'Checked In' : 'Pending'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Attendees Table */}
      <Table>
        <THead>
          <TR>
            <TH>Status</TH>
            <TH>Student Name</TH>
            <TH>USN</TH>
            <TH>Email</TH>
            <TH>Team</TH>
            <TH>Checked In At</TH>
            <TH>Scanned By</TH>
          </TR>
        </THead>
        <TBody>
          {filteredAttendees.length === 0 ? (
            <TR>
              <TD colSpan={7} className="p-8 text-center text-slate-400">
                No attendees match your filter.
              </TD>
            </TR>
          ) : (
            filteredAttendees.map((a: AttendanceAttendeeDTO) => (
              <TR key={a.registrationId}>
                <TD>
                  {a.checkedIn ? (
                    <Badge tone="green">Checked In</Badge>
                  ) : (
                    <Badge tone="neutral">Pending</Badge>
                  )}
                </TD>
                <TD className="font-semibold text-white">{a.name}</TD>
                <TD className="font-mono text-slate-300">{a.usn ?? '—'}</TD>
                <TD className="text-slate-400">{a.email}</TD>
                <TD className="text-slate-300">{a.teamName ?? '—'}</TD>
                <TD className="font-mono text-slate-400">
                  {a.scannedAt ? new Date(a.scannedAt).toLocaleTimeString() : '—'}
                </TD>
                <TD className="text-slate-400">{a.scannedByName ?? '—'}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {/* OD Certificates Section */}
      <Card id="certificates" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Duty Leave (OD) Certificates</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Generate officially verifiable On Duty certificates for checked-in attendees.
            </p>
          </div>

          <Button
            onClick={handleIssueCertificates}
            disabled={issuingCerts || (eventStatus !== 'COMPLETED' && eventStatus !== 'ONGOING')}
            loading={issuingCerts}
            variant="primary"
            size="sm"
          >
            Issue OD Certificates ({attendance.checkedInCount} checked-in)
          </Button>
        </div>

        {eventStatus !== 'COMPLETED' && eventStatus !== 'ONGOING' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-300">
            ⚠️ Event must be ONGOING or COMPLETED to issue OD certificates. (Current status: {eventStatus})
          </div>
        )}

        {certMessage && (
          <div
            className={`rounded-xl border p-3 text-xs font-semibold ${
              certMessage.error
                ? 'border-red-500/30 bg-red-950/40 text-red-200'
                : 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
            }`}
          >
            {certMessage.text}
          </div>
        )}

        {/* Certificates Table */}
        {loadingCerts ? (
          <p className="text-xs text-slate-400">Loading certificates...</p>
        ) : certificates.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
            No OD certificates have been issued yet. Click &quot;Issue OD Certificates&quot; to generate them.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Serial</TH>
                <TH>Student</TH>
                <TH>USN</TH>
                <TH>Verification Code</TH>
                <TH>Issued At</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {certificates.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono font-bold text-sky-400">{c.serial}</TD>
                  <TD className="font-medium text-white">{c.studentName}</TD>
                  <TD className="font-mono text-slate-400">{c.studentUsn ?? '—'}</TD>
                  <TD>
                    <Link
                      href={`/verify/${c.verifyCode}`}
                      className="font-mono text-sky-400 hover:underline"
                      target="_blank"
                    >
                      {c.verifyCode}
                    </Link>
                  </TD>
                  <TD className="text-slate-400">{new Date(c.issuedAt).toLocaleDateString()}</TD>
                  <TD className="text-right">
                    <a
                      href={`/api/certificates/${c.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass('secondary', 'sm')}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      PDF
                    </a>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
