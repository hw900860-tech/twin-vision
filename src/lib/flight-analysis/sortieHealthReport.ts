/**
 * SORTIE HEALTH REPORT — pure derivation of a per-mission health card from a
 * captured SortieRecord. Runs entirely on the ground from data that came off
 * the datalink (the same ~1 Hz samples the animated replay uses), so the card
 * works for any sortie, past or future, without touching the protocol.
 *
 * The card answers the operator's post-flight questions:
 *   - how hard was the engine pushed?  (max CHT/EGT, exceedance seconds)
 *   - what did the mission cost?       (RUL consumed, engine hours accrued)
 *   - what went wrong and for how long? (fault windows, region crossings)
 *   - is the engine fit for the next sortie? (grade A-D with reasons)
 */

import type { SortieEndReason, SortieRecord } from "@/lib/datalink/sortie";
import { REGIONS_BY_BIOME } from "@/features/flight-sim/regions";

export interface FaultWindow {
  name: string;
  t0: number;
  /** Mission-clock seconds when the fault cleared; null if still active at end. */
  t1: number | null;
  durSec: number;
}

export interface RegionEvent {
  id: string;
  name: string;
  severity: string;
  enterT: number;
  /** null if the sortie ended inside the region. */
  exitT: number | null;
  dwellSec: number;
}

export type HealthGrade = "A" | "B" | "C" | "D";

export interface SortieHealthReport {
  id: string;
  presetLabel: string;
  biome: string;
  endReason: SortieEndReason;
  durationSec: number;
  engineHours: number;

  // thermal
  maxCht: [number, number, number, number];
  chtHotSec: number; // total seconds any cylinder CHT > 180°C
  chtCriticalSec: number; // any cylinder CHT > 220°C
  maxEgt: number;
  avgEgt: number;
  egtHotSec: number; // EGT > 720°C

  // induction / lubrication / vibration
  minMap: number;
  mapCollapseSec: number; // MAP < 15 kPa (boost loss)
  maxOilTemp: number;
  minOilPressure: number;
  oilHotSec: number; // oil temp > 110°C
  maxVib: number;
  vibHighSec: number; // vibration RMS > 1.2 m/s²

  // life
  healthMin: number;
  healthAvg: number;
  rulStartH: number | null;
  rulEndH: number | null;
  rulConsumedH: number | null;

  // events
  faultCount: number;
  faultWindows: FaultWindow[];
  regionEvents: RegionEvent[];

  // verdict
  grade: HealthGrade;
  gradeScore: number;
  gradeNotes: string[];
}

const FAULT_NAMES = ["c2Overheat", "turboFail", "bearingFail", "injectorClog", "misfire3"];

const THRESHOLDS = {
  chtHot: 180,
  chtCritical: 220,
  egtHot: 720,
  mapCollapse: 15,
  oilHot: 110,
  vibHigh: 1.2,
};

function spanSec(rec: SortieRecord, i: number): number {
  const a = rec.samples[i]!;
  const b = rec.samples[i + 1];
  return b ? Math.max(0, b.t - a.t) : 0;
}

export function buildSortieHealthReport(rec: SortieRecord): SortieHealthReport {
  const samples = rec.samples;

  // --- thermal / fluid / mechanical extremes with exceedance seconds ---
  const maxCht: [number, number, number, number] = [0, 0, 0, 0];
  let maxEgt = 0;
  let egtSum = 0;
  let egtN = 0;
  let minMap = Infinity;
  let maxOilTemp = 0;
  let minOilPressure = Infinity;
  let maxVib = 0;
  let healthMin = 100;
  let healthSum = 0;
  let healthN = 0;

  let chtHotSec = 0;
  let chtCriticalSec = 0;
  let egtHotSec = 0;
  let mapCollapseSec = 0;
  let oilHotSec = 0;
  let vibHighSec = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const span = spanSec(rec, i);

    if (s.cht) {
      s.cht.forEach((v, c) => {
        if (v > maxCht[c]!) maxCht[c] = v;
      });
      if (s.cht.some((v) => v > THRESHOLDS.chtHot)) chtHotSec += span;
      if (s.cht.some((v) => v > THRESHOLDS.chtCritical)) chtCriticalSec += span;
    }
    if (s.egt > maxEgt) maxEgt = s.egt;
    egtSum += s.egt;
    egtN++;
    if (s.egt > THRESHOLDS.egtHot) egtHotSec += span;
    if (s.map < minMap) minMap = s.map;
    if (s.map < THRESHOLDS.mapCollapse) mapCollapseSec += span;
    if (s.oilT !== undefined) {
      if (s.oilT > maxOilTemp) maxOilTemp = s.oilT;
      if (s.oilT > THRESHOLDS.oilHot) oilHotSec += span;
    }
    if (s.oilP !== undefined && s.oilP < minOilPressure) minOilPressure = s.oilP;
    if (s.vib !== undefined) {
      if (s.vib > maxVib) maxVib = s.vib;
      if (s.vib > THRESHOLDS.vibHigh) vibHighSec += span;
    }
    if (s.health !== undefined) {
      if (s.health < healthMin) healthMin = s.health;
      healthSum += s.health;
      healthN++;
    }
  }
  if (minMap === Infinity) minMap = 0;
  if (minOilPressure === Infinity) minOilPressure = 0;

  // --- fault windows from the per-sample bitmask ---
  const faultWindows: FaultWindow[] = [];
  const active: Record<string, number> = {};
  let prevMask = 0;
  for (const s of samples) {
    const mask = s.flt ?? 0;
    const turnedOn = mask & ~prevMask;
    const turnedOff = prevMask & ~mask;
    FAULT_NAMES.forEach((name, i) => {
      const bit = 1 << i;
      if (turnedOn & bit) active[name] = s.t;
      if (turnedOff & bit && active[name] !== undefined) {
        faultWindows.push({ name, t0: active[name]!, t1: s.t, durSec: s.t - active[name]! });
        delete active[name];
      }
    });
    prevMask = mask;
  }
  for (const [name, t0] of Object.entries(active)) {
    faultWindows.push({ name, t0, t1: null, durSec: Math.max(0, rec.duration - t0) });
  }
  faultWindows.sort((a, b) => a.t0 - b.t0);

  // --- region ENTER/EXIT events from per-sample occupancy ---
  const regionEvents: RegionEvent[] = [];
  const inside: Record<string, number> = {};
  const regDefs = REGIONS_BY_BIOME[rec.biome as keyof typeof REGIONS_BY_BIOME] ?? [];
  const defById = new Map(regDefs.map((r) => [r.id, r]));
  for (const s of samples) {
    const current = new Set(s.inside ?? []);
    for (const id of current) {
      if (inside[id] === undefined) inside[id] = s.t;
    }
    for (const id of Object.keys(inside)) {
      if (!current.has(id)) {
        const def = defById.get(id);
        regionEvents.push({
          id,
          name: def?.name ?? id,
          severity: def?.severity ?? "info",
          enterT: inside[id]!,
          exitT: s.t,
          dwellSec: s.t - inside[id]!,
        });
        delete inside[id];
      }
    }
  }
  for (const [id, enterT] of Object.entries(inside)) {
    const def = defById.get(id);
    regionEvents.push({
      id,
      name: def?.name ?? id,
      severity: def?.severity ?? "info",
      enterT,
      exitT: null,
      dwellSec: Math.max(0, rec.duration - enterT),
    });
  }
  regionEvents.sort((a, b) => a.enterT - b.enterT);

  // --- life accounting ---
  const rulStartH = rec.rulStartH ?? null;
  const rulEndH = rec.rulEndH ?? null;
  const rulConsumedH =
    rulStartH !== null && rulEndH !== null ? Math.max(0, rulStartH - rulEndH) : null;
  const engineHours = rec.duration / 3600;

  // --- grade ---
  const notes: string[] = [];
  let score = 100;
  if (rec.endReason === "CRASHED" || rec.endReason === "FORCED LANDING") {
    score -= 40;
    notes.push(`${rec.endReason} — mission outcome penalty`);
  } else if (rec.endReason === "ABORTED") {
    score -= 15;
    notes.push("Aborted mission — incomplete objective penalty");
  }
  if (healthMin < 30) {
    score -= 30;
    notes.push(`Health floor ${healthMin.toFixed(0)}% — critical degradation`);
  } else if (healthMin < 50) {
    score -= 20;
    notes.push(`Health floor ${healthMin.toFixed(0)}% — degraded`);
  }
  if (chtCriticalSec > 0) {
    score -= 10;
    notes.push(`Critical CHT exceedance (>220°C for ${Math.round(chtCriticalSec)} s)`);
  }
  if (egtHotSec > 0) {
    score -= 10;
    notes.push(`EGT over-limit (>720°C for ${Math.round(egtHotSec)} s)`);
  }
  if (vibHighSec > 0) {
    score -= 10;
    notes.push(`Elevated vibration (>1.2 m/s² for ${Math.round(vibHighSec)} s)`);
  }
  if (oilHotSec > 0) {
    score -= 5;
    notes.push(`Oil thermal excursion (>110°C for ${Math.round(oilHotSec)} s)`);
  }
  if (mapCollapseSec > 0) {
    score -= 5;
    notes.push(`MAP collapse (<15 kPa for ${Math.round(mapCollapseSec)} s) — boost loss`);
  }
  if (faultWindows.length > 0) {
    score -= Math.min(20, faultWindows.length * 5);
    notes.push(`${faultWindows.length} fault injection${faultWindows.length > 1 ? "s" : ""} observed`);
  }
  score = Math.max(5, Math.min(100, score));
  const grade: HealthGrade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
  if (notes.length === 0) notes.push("No exceedances, faults or abnormal outcomes recorded");

  return {
    id: rec.id,
    presetLabel: rec.presetLabel,
    biome: rec.biome,
    endReason: rec.endReason,
    durationSec: rec.duration,
    engineHours,
    maxCht,
    chtHotSec,
    chtCriticalSec,
    maxEgt,
    avgEgt: egtN > 0 ? egtSum / egtN : 0,
    egtHotSec,
    minMap,
    mapCollapseSec,
    maxOilTemp,
    minOilPressure,
    oilHotSec,
    maxVib,
    vibHighSec,
    healthMin,
    healthAvg: healthN > 0 ? healthSum / healthN : 0,
    rulStartH,
    rulEndH,
    rulConsumedH,
    faultCount: faultWindows.length,
    faultWindows,
    regionEvents,
    grade,
    gradeScore: score,
    gradeNotes: notes,
  };
}
