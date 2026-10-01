import { openDB, type IDBPDatabase } from 'idb';
import type { CheckinBundleDTO, CheckinScanItem } from '@campusgrid/shared';

const DB_NAME = 'campusgrid-scanner';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bundles')) {
          db.createObjectStore('bundles', { keyPath: 'eventId' });
        }
        if (!db.objectStoreNames.contains('scanQueue')) {
          db.createObjectStore('scanQueue', { keyPath: 'clientScanId' });
        }
        if (!db.objectStoreNames.contains('localCheckedIn')) {
          db.createObjectStore('localCheckedIn', { keyPath: 'rid' });
        }
      },
    });
  }
  return dbPromise;
}

/** Get or create persistent device ID */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('cg_device_id');
  if (!id) {
    id = `device-${crypto.randomUUID().slice(0, 12)}`;
    localStorage.setItem('cg_device_id', id);
  }
  return id;
}

/** Save bundle in IndexedDB */
export async function saveBundle(bundle: CheckinBundleDTO): Promise<void> {
  const db = await getDb();
  await db.put('bundles', bundle);

  // Seed localCheckedIn store with alreadyCheckedIn list from bundle
  const tx = db.transaction('localCheckedIn', 'readwrite');
  for (const rid of bundle.alreadyCheckedIn) {
    await tx.store.put({ rid, scannedAt: new Date().toISOString() });
  }
  await tx.done;
}

/** Retrieve cached bundle */
export async function getCachedBundle(eventId: string): Promise<CheckinBundleDTO | undefined> {
  const db = await getDb();
  return db.get('bundles', eventId);
}

/** Queue an accepted scan */
export async function queueScan(scan: CheckinScanItem): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['scanQueue', 'localCheckedIn'], 'readwrite');
  await tx.objectStore('scanQueue').put(scan);
  await tx.objectStore('localCheckedIn').put({ rid: scan.rid, scannedAt: scan.scannedAt });
  await tx.done;
}

/** Get all pending scans in queue */
export async function getQueuedScans(): Promise<CheckinScanItem[]> {
  const db = await getDb();
  return db.getAll('scanQueue');
}

/** Remove processed scans from queue */
export async function removeQueuedScans(clientScanIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('scanQueue', 'readwrite');
  for (const id of clientScanIds) {
    await tx.store.delete(id);
  }
  await tx.done;
}

/** Get set of all registration IDs that have been checked in (cached + local) */
export async function getCheckedInSet(): Promise<Set<string>> {
  const db = await getDb();
  const items = await db.getAll('localCheckedIn');
  return new Set(items.map((i: { rid: string }) => i.rid));
}

/** Mark an attendee checked in locally */
export async function markLocallyCheckedIn(rid: string): Promise<void> {
  const db = await getDb();
  await db.put('localCheckedIn', { rid, scannedAt: new Date().toISOString() });
}
