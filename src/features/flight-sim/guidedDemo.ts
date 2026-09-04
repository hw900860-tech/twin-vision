/**
 * GUIDED DEMO — one-click full value chain.
 *
 * A scripted-but-live timeline controller installed on /sim: it drives the
 * REAL flight store and physics (never a mock), so every beat is genuine
 * telemetry:
 *
 *   LAUNCH  → HIMALAYA REGION TRANSECT takes off (real waypoint navigation)
 *   TRANSECT→ UAV crosses the CRYO TROUGH / LOW PRESSURE / THERMAL SHEAR cores
 *   FAULT   → wastegate/turbo failure injected at altitude — MAP collapses,
 *             health index collapses toward ~30% (CRITICAL but survivable)
 *   ALERT   → GCS critical alert fires off the live wire (CHT/MAP excursion)
 *   MAYDAY  → MAYDAY banner (health < 50% + fault flag)
 *   RTB     → operator RTB command — UAV flies straight home at reduced power
 *   REPORT  → auto-generated mission debrief card (extremes, crossings, chips)
 *
 * The fault is turboFail on purpose: it pins engine health at ~30% — MAYDAY
 * territory without force-landing the aircraft — so the RTB leg always
 * completes. (c2Overheat would destroy the engine: health 0% → forced landing.)
 *
 * The GCS side needs no changes: it already renders the alert banner, MAYDAY
 * banner, live band and SORTIE REPLAY from the wire; this module only steers
 * the airborne session.
 */
import { useFlightStore, type DemoChip, type DemoPhase, type MissionExtremes, type MissionReport } from './flightStore';

const POLL_MS = 200;
/** Inject the fault once the LOW PRESSURE core is captured (turbo at max boost). */
const FAULT_AT_PROGRESS = 2;
const FAULT_AT_SEC = 20;
const ALERT_HEALTH = 0.72;
const MAYDAY_HEALTH = 0.5;

let installed = false;
let timer: ReturnType<typeof setInterval> | null = null;

// module-local timeline facts (not store state — only needed for the report)
let faultAtSec = 0;
let maydayAtSec = 0;
let rtbAtSec = 0;
let startRul = 0;
let extremes: MissionExtremes = freshExtremes();
let prevInside: string[] = [];
let crossings: string[] = [];
let captures: { wp: number; t: number }[] = [];
let lastProgress = 0;

function freshExtremes(): MissionExtremes {
  return {
    maxCht: [0, 0, 0, 0],
    maxEgt: 0,
    minMap: Infinity,
    maxOilTemp: 0,
    maxVib: 0,
    minHealthPct: 100,
    rulConsumed: 0,
    maxAltFt: 0,
  };
}

function chip(t: number, label: string, tone: DemoChip['tone']): DemoChip {
  return { t: Math.round(t), label, tone };
}

function pushChip(c: DemoChip): void {
  const d = useFlightStore.getState().demo;
  useFlightStore.getState().updateDemo({ chips: [...d.chips, c].slice(-12) });
}

function setPhase(phase: DemoPhase): void {
  useFlightStore.getState().updateDemo({ phase });
}

function sample(st: ReturnType<typeof useFlightStore.getState>): void {
  const e = extremes;
  st.cht.forEach((v, i) => { const cur = e.maxCht[i] ?? 0; if (v > cur) e.maxCht[i] = v; });
  if (st.egt > e.maxEgt) e.maxEgt = st.egt;
  if (st.map < e.minMap) e.minMap = st.map;
  if (st.oilTemp > e.maxOilTemp) e.maxOilTemp = st.oilTemp;
  if (st.vibrationRMS > e.maxVib) e.maxVib = st.vibrationRMS;
  const hp = st.healthIndex * 100;
  if (hp < e.minHealthPct) e.minHealthPct = hp;
  if (st.altitude > e.maxAltFt) e.maxAltFt = st.altitude;
}

function buildReport(): MissionReport {
  const st = useFlightStore.getState();
  extremes.rulConsumed = Math.max(0, startRul - st.rul);
  const outcome =
    st.emergencyState === 'crashed'
      ? 'CRASHED — FORCED LANDING AFTER FAULT'
      : st.emergencyState === 'forcedLanding'
        ? 'FORCED LANDING AFTER FAULT'
        : 'MAYDAY RTB — UAV RECOVERED AT BASE · MISSION TERMINATED BY COMMAND';
  return {
    mission: 'HIMALAYA REGION TRANSECT',
    biome: st.biome.toUpperCase(),
    outcome,
    durationSec: Math.round(st.missionElapsed),
    faultInjected: 'WASTEGATE / TURBO FAILURE (ALTITUDE BOOST LOSS)',
    faultAtSec: Math.round(faultAtSec),
    maydayAtSec: Math.round(maydayAtSec),
    rtbAtSec: Math.round(rtbAtSec),
    waypointCaptures: captures,
    regionCrossings: crossings,
    extremes,
    chips: st.demo.chips,
  };
}

function abort(reason: string): void {
  pushChip(chip(useFlightStore.getState().missionElapsed, reason, 'amber'));
  setPhase('idle');
  useFlightStore.getState().updateDemo({ active: false });
}

function poll(): void {
  const st = useFlightStore.getState();
  const d = st.demo;
  if (!d.active) {
    if (timer) { clearInterval(timer); timer = null; }
    return;
  }

  sample(st);

  // track waypoint captures + region crossings for the report
  if (st.missionProgress > lastProgress) {
    lastProgress = st.missionProgress;
    captures.push({ wp: st.missionProgress - 1, t: st.missionElapsed });
  }
  for (const id of st.regionsInside) {
    if (!prevInside.includes(id)) {
      const r = st.regions.find((rr) => rr.id === id);
      if (r && !crossings.includes(r.name)) crossings.push(r.name);
    }
  }
  prevInside = [...st.regionsInside];

  switch (d.phase) {
    case 'launching':
      if (st.missionActive && st.missionElapsed > 2) {
        setPhase('cruise');
        pushChip(chip(st.missionElapsed, 'IN TRANSIT — HIMALAYA REGION TRANSECT UNDERWAY', 'cyan'));
      }
      break;

    case 'cruise':
      // Inject the fault at the LOW PRESSURE core — turbo already at max boost.
      if (st.missionElapsed >= FAULT_AT_SEC || st.missionProgress >= FAULT_AT_PROGRESS) {
        faultAtSec = st.missionElapsed;
        useFlightStore.setState((s) => ({ faults: { ...s.faults, turboFail: true } }));
        useFlightStore.getState().updateDemo({ faultInjected: true });
        setPhase('fault');
        pushChip(chip(faultAtSec, `FAULT INJECTED — WASTEGATE/TURBO FAILURE AT ${st.altitude.toFixed(0)} FT · MAP COLLAPSE`, 'critical'));
      }
      break;

    case 'fault':
      if (st.healthIndex < ALERT_HEALTH) {
        setPhase('alert');
        pushChip(chip(st.missionElapsed, `GCS ALERT — ENGINE HEALTH ${(st.healthIndex * 100).toFixed(0)}% · BOOST LOST`, 'amber'));
      }
      break;

    case 'alert':
      if (st.healthIndex < MAYDAY_HEALTH) {
        maydayAtSec = st.missionElapsed;
        setPhase('mayday');
        pushChip(chip(maydayAtSec, 'MAYDAY — TACTICAL ADVISORY: RTB IMMEDIATELY', 'critical'));
      }
      break;

    case 'mayday':
      rtbAtSec = st.missionElapsed;
      st.triggerRtb();
      setPhase('rtb');
      pushChip(chip(rtbAtSec, 'RTB — RETURNING TO BASE AT REDUCED POWER (55%)', 'amber'));
      break;

    case 'rtb':
      if (!st.missionActive && !st.rtbActive) {
        const report = buildReport();
        useFlightStore.getState().updateDemo({ report, phase: 'report' });
        pushChip(chip(st.missionElapsed, 'MISSION REPORT GENERATED — AUTO DEBRIEF', 'nominal'));
        if (timer) { clearInterval(timer); timer = null; }
      }
      break;

    case 'report':
    case 'idle':
      break;
  }

  // operator intervention / external abort while mid-demo
  if (['launching', 'cruise', 'fault', 'alert', 'mayday'].includes(d.phase) && !st.missionActive && st.missionElapsed > 0) {
    abort('DEMO ABORTED — OPERATOR INTERVENTION');
  }
}

export function startGuidedDemo(): void {
  const st = useFlightStore.getState();
  // A completed demo may re-run instantly; only block while one is mid-flight.
  if (st.demo.active && st.demo.phase !== 'report') return;

  st.resetSimulation();
  st.setMissionPreset('himalayaTransect');
  st.startMission();

  faultAtSec = 0;
  maydayAtSec = 0;
  rtbAtSec = 0;
  startRul = st.rul;
  extremes = freshExtremes();
  prevInside = [];
  crossings = [];
  captures = [];
  lastProgress = 0;

  st.updateDemo({
    active: true,
    phase: 'launching',
    chips: [chip(0, 'MISSION LAUNCH — HIMALAYA REGION TRANSECT', 'cyan')],
    report: null,
    faultInjected: false,
  });

  if (timer) clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
}

export function stopGuidedDemo(): void {
  if (timer) { clearInterval(timer); timer = null; }
  useFlightStore.getState().updateDemo({ active: false, phase: 'idle', chips: [], report: null, faultInjected: false });
}

export function closeDemoReport(): void {
  useFlightStore.getState().updateDemo({ active: false, phase: 'idle', chips: [], report: null, faultInjected: false });
}

export function installGuidedDemo(): void {
  if (installed) return;
  installed = true;
  // Resume an in-flight demo after an HMR/module remount.
  if (useFlightStore.getState().demo.active && !timer) {
    timer = setInterval(poll, POLL_MS);
  }
}

export function uninstallGuidedDemo(): void {
  installed = false;
  if (timer) { clearInterval(timer); timer = null; }
}
