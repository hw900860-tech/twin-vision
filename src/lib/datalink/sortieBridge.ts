/**
 * SORTIE BRIDGE — local delivery for completed sortie records.
 *
 * The primary sortie path is the datalink: the airborne recorder queues a
 * finished record, the /sim window drains it into a MISSION_RECORD frame, the
 * relay forwards it, and the /gcs window pushes it into the replay panel.
 *
 * That chain needs the relay process (ws://localhost:3010 by default), which
 * does not exist on a Vercel deployment — Vercel cannot host the long-lived
 * WebSocket gateway, so on the deployed site the relay is unreachable, the
 * drain never runs, and the replay panel always shows "NO SORTIES RECEIVED"
 * even after a mission is flown and finished.
 *
 * This bridge is the fallback that makes sortie replay work with no relay:
 *   - every finalized record is persisted to localStorage (same browser),
 *   - it is also broadcast live to other tabs of the same origin, so an open
 *     /gcs tab receives the sortie the moment the mission ends,
 *   - the ground side hydrates from localStorage on start, so navigating
 *     /sim → /gcs in one tab (or reopening /gcs later) still shows sorties.
 *
 * The relay path is untouched: when a relay IS reachable, records also arrive
 * over MISSION_RECORD, and linkStore.pushSortie dedupes by id, so a sortie
 * delivered both ways appears exactly once.
 *
 * Everything here is SSR-safe (window guards) and failure-tolerant (storage
 * disabled / quota exceeded / BroadcastChannel unsupported all degrade to
 * no-op instead of throwing).
 */
import type { SortieRecord, SortieSample } from "./sortie";

export const SORTIE_STORAGE_KEY = "aeris-twin:sorties:v1";
const SORTIE_CHANNEL_NAME = "aeris-twin-sorties";

/** Max sortie records kept in this browser (newest first). */
const MAX_STORED_SORTIES = 4;
/** Byte budget per stored record; samples are decimated to fit under it. */
const MAX_STORED_BYTES = 180_000;
/** Floor for decimation: never thin a record below this many samples. */
const MIN_SAMPLES = 60;

type SortieListener = (rec: SortieRecord) => void;

function isRecordShape(v: unknown): v is SortieRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    Array.isArray(r["waypoints"]) &&
    Array.isArray(r["samples"]) &&
    Array.isArray(r["captures"])
  );
}

function validSample(s: SortieSample): boolean {
  return (
    typeof s.t === "number" &&
    typeof s.x === "number" &&
    typeof s.z === "number" &&
    Number.isFinite(s.t)
  );
}

function sanitize(rec: SortieRecord): SortieRecord | null {
  if (!isRecordShape(rec)) return null;
  return {
    ...rec,
    duration: typeof rec.duration === "number" ? rec.duration : 0,
    samples: rec.samples.filter(validSample),
  };
}

/**
 * Return a copy of the record thinned to at most `maxSamples` samples,
 * evenly spaced, always keeping the first and last sample so the replay
 * still starts and ends exactly where the UAV did.
 */
export function decimateSortie(rec: SortieRecord, maxSamples: number): SortieRecord {
  const samples = rec.samples;
  if (samples.length <= maxSamples || maxSamples < 2) return rec;
  const step = (samples.length - 1) / (maxSamples - 1);
  const thinned: SortieSample[] = [];
  for (let i = 0; i < maxSamples; i++) {
    thinned.push(samples[Math.round(i * step)]!);
  }
  return { ...rec, samples: thinned };
}

function byteSize(rec: SortieRecord): number {
  try {
    return JSON.stringify(rec).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** All sortie records saved in this browser, newest first. Never throws. */
export function loadStoredSorties(): SortieRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SORTIE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SortieRecord[] = [];
    for (const item of parsed) {
      const clean = sanitize(item as SortieRecord);
      if (clean) out.push(clean);
    }
    return out;
  } catch {
    return [];
  }
}

function saveStoredSorties(records: SortieRecord[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SORTIE_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist a finalized sortie in this browser (newest first, capped).
 * Oversize records are decimated until they fit the per-record budget;
 * a full store drops the oldest record and retries once. Never throws.
 */
export function storeSortie(rec: SortieRecord): void {
  if (typeof window === "undefined") return;
  let slim = rec;
  while (byteSize(slim) > MAX_STORED_BYTES && slim.samples.length > MIN_SAMPLES) {
    slim = decimateSortie(slim, Math.max(MIN_SAMPLES, Math.floor(slim.samples.length / 2)));
  }
  let records = loadStoredSorties().filter((r) => r.id !== slim.id);
  records = [slim, ...records].slice(0, MAX_STORED_SORTIES);
  if (!saveStoredSorties(records)) {
    // Quota pressure: drop the oldest and try once more.
    saveStoredSorties(records.slice(0, Math.max(1, records.length - 1)));
  }
}

/** Push a finalized sortie to other tabs of this origin, live. Never throws. */
export function broadcastSortie(rec: SortieRecord): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SORTIE_CHANNEL_NAME);
    ch.postMessage({ type: "aeris-sortie", record: rec });
    ch.close();
  } catch {
    /* broadcast unsupported — localStorage hydration still covers it */
  }
}

/**
 * Listen for sorties finalized in other tabs. Uses BroadcastChannel when
 * available and the `storage` event as a fallback (fires in other tabs when
 * localStorage changes). The listener may receive the same record twice
 * (both channels); the consumer dedupes by id. Returns an unsubscribe fn.
 */
export function subscribeSorties(cb: SortieListener): () => void {
  if (typeof window === "undefined") return () => {};
  const cleanups: Array<() => void> = [];

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(SORTIE_CHANNEL_NAME);
      const onMsg = (ev: MessageEvent) => {
        const data = ev.data as { type?: unknown; record?: unknown } | null;
        if (data && data.type === "aeris-sortie") {
          const clean = sanitize(data.record as SortieRecord);
          if (clean) cb(clean);
        }
      };
      ch.addEventListener("message", onMsg);
      cleanups.push(() => ch.close());
    }
  } catch {
    /* ignore — storage fallback below */
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== null && ev.key !== SORTIE_STORAGE_KEY) return;
    for (const rec of loadStoredSorties()) cb(rec);
  };
  window.addEventListener("storage", onStorage);
  cleanups.push(() => window.removeEventListener("storage", onStorage));

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        /* noop */
      }
    }
  };
}
