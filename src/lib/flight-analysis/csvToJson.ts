/**
 * AERIS-TWIN post-flight CSV → JSON debrief converter.
 *
 * Offline, deterministic utility (Feature C): parses a raw historical flight
 * CSV log (the exact AERIS-TWIN telemetry export schema) into a compressed,
 * standardized JSON debrief packet ready for:
 *   1. instant ground-station review (stats, exceedance events, findings)
 *   2. rule-based plain-language maintenance work orders
 *   3. fleet analytics / charting via the coarse 60-bucket trend series.
 *
 * Fully offline: no network access, no cloud/LLM dependency, no I/O, no
 * nondeterminism — same CSV in, same debrief out. The "AI" is the
 * GCS-side physics-informed engine models (see engineMlService.ts) plus this
 * deterministic rule layer; nothing leaves the ground station.
 */

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

export interface FlightCsvRow {
  timestamp: number;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  pitch: number;
  roll: number;
  heading: number;
  throttle: number;
  engineLoad: number;
  rpm: number;
  map: number;
  boost: number;
  cht1: number;
  cht2: number;
  cht3: number;
  cht4: number;
  egt1: number;
  egt2: number;
  egt3: number;
  egt4: number;
  oilTemp: number;
  oilPressure: number;
  vibrationRMS: number;
  health: number;
  faultState: string;
}

const NUMERIC_COLUMNS = [
  "timestamp", "altitude", "speed", "verticalSpeed", "pitch", "roll", "heading", "throttle", "engineLoad",
  "rpm", "map", "boost", "cht1", "cht2", "cht3", "cht4", "egt1", "egt2", "egt3", "egt4",
  "oilTemp", "oilPressure", "vibrationRMS", "health",
] as const;

type NumericColumn = (typeof NUMERIC_COLUMNS)[number];

/** Parse AERIS-TWIN telemetry CSV text into typed rows (skips bad rows). */
export function parseFlightCsv(text: string): FlightCsvRow[] {
  const lines = text.split(/\r?\n/);
  const rows: FlightCsvRow[] = [];
  let headerSeen = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Header row detection — tolerant of leading whitespace or BOM.
    if (!headerSeen) {
      if (/^timestamp/i.test(line) || /^[\s\S]*timestamp,\s*altitude/i.test(line) || /^\uFEFF?timestamp/i.test(line)) {
        headerSeen = true;
        continue;
      }
    }

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < NUMERIC_COLUMNS.length) continue;

    const numericEntry = Object.fromEntries(NUMERIC_COLUMNS.map((col, idx) => [col, Number(parts[idx])]));
    if (NUMERIC_COLUMNS.some((col) => !Number.isFinite(numericEntry[col] as number))) continue;

    rows.push({
      ...(numericEntry as unknown as Omit<FlightCsvRow, "faultState">),
      faultState: (parts[24] ?? "NOMINAL").replace(/^"|"$/g, ""),
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Channel specs (normative redlines — environment-agnostic archive)   */
/* ------------------------------------------------------------------ */

export type Severity = "CRITICAL" | "WARNING";

export interface ChannelSpec {
  key: NumericColumn;
  label: string;
  unit: string;
  lowIsBad?: boolean;
  warn: number;
  crit: number;
}

const CYL_CHT: ChannelSpec[] = [1, 2, 3, 4].map((n) => ({
  key: `cht${n}` as NumericColumn,
  label: `CHT CYL ${n}`,
  unit: "°C",
  warn: 180,
  crit: 210,
}));

const CYL_EGT: ChannelSpec[] = [1, 2, 3, 4].map((n) => ({
  key: `egt${n}` as NumericColumn,
  label: `EGT CYL ${n}`,
  unit: "°C",
  warn: 745,
  crit: 770,
}));

export const DEBRIEF_CHANNELS: ChannelSpec[] = [
  ...CYL_CHT,
  ...CYL_EGT,
  { key: "oilTemp", label: "OIL TEMPERATURE", unit: "°C", warn: 110, crit: 120 },
  { key: "oilPressure", label: "OIL PRESSURE", unit: "bar", lowIsBad: true, warn: 2.8, crit: 2.0 },
  { key: "vibrationRMS", label: "VIBRATION RMS", unit: "m/s²", warn: 1.15, crit: 1.6 },
  { key: "rpm", label: "ENGINE SPEED", unit: "rpm", warn: 5800, crit: 6200 },
  { key: "health", label: "HEALTH INDEX", unit: "%", lowIsBad: true, warn: 70, crit: 50 },
];

/* ------------------------------------------------------------------ */
/* Debrief JSON                                                        */
/* ------------------------------------------------------------------ */

export interface PhaseProfileEntry {
  phase: "CLIMB" | "CRUISE" | "DESCEND" | "DASH";
  seconds: number;
  pct: number;
}

export interface ChannelStats {
  key: string;
  label: string;
  unit: string;
  min: number;
  mean: number;
  max: number;
  std: number;
  p95: number;
  end: number;
}

export interface ExceedanceSummary {
  channelKey: string;
  channelLabel: string;
  unit: string;
  severity: Severity;
  count: number; // number of samples past the level
  fractionPct: number; // share of flight past the level
  durationS: number;
  peak: number;
  peakAt: number;
  firstAt: number;
  lastAt: number;
}

export interface FaultActivity {
  flag: string;
  samples: number;
  firstAt: number;
  lastAt: number;
}

export interface Finding {
  severity: Severity | "INFO";
  code: string;
  title: string;
  detail: string;
}

export interface WorkOrderLine {
  priority: "P1" | "P2" | "P3";
  action: string;
}

export interface PostFlightDebrief {
  schema: "aeris-postflight-debrief-v1";
  generatedAt: string;
  mission: {
    samples: number;
    durationS: number;
    durationHms: string;
    startTs: number;
    endTs: number;
    maxAltitudeFt: number;
    minAltitudeFt: number;
    maxRpm: number;
    meanThrottlePct: number;
    maxEngineLoadPct: number;
    phaseProfile: PhaseProfileEntry[];
  };
  health: {
    min: number;
    mean: number;
    end: number;
    below30Samples: number;
  };
  channels: ChannelStats[];
  exceedances: ExceedanceSummary[];
  faultActivity: FaultActivity[];
  findings: Finding[];
  workOrder: WorkOrderLine[];
  /** Coarse 60-bucket trend (compressed series for LLM context / charts). */
  trend: { at: number; chtMax: number; rpm: number; health: number; oilPressure: number }[];
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function fmtHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statOf(values: number[]): { min: number; mean: number; max: number; std: number; p95: number; end: number } {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.floor(0.95 * (n - 1)))] ?? max;
  return { min: round(min), mean: round(mean), max: round(max), std: round(Math.sqrt(variance), 2), p95: round(p95), end: round(values[n - 1] ?? 0) };
}

function phaseAt(rateFtPerSec: number, speedKts: number): PhaseProfileEntry["phase"] {
  if (rateFtPerSec > 5) return "CLIMB"; // ≈ 300 ft/min
  if (rateFtPerSec < -5) return "DESCEND";
  if (speedKts > 180) return "DASH";
  return "CRUISE";
}

function parseFaultState(state: string): string[] {
  const s = state.trim().toUpperCase();
  if (!s || s === "NOMINAL") return [];
  return s.split("|").filter(Boolean);
}

/** Analyze parsed flight rows into the standardized debrief packet. */
export function buildDebrief(rows: FlightCsvRow[]): PostFlightDebrief {
  const n = rows.length;
  const startTs = rows[0]?.timestamp ?? 0;
  const endTs = rows[n - 1]?.timestamp ?? 0;
  const sampleInterval = n > 1 ? (endTs - startTs) / (n - 1) : 0.05;

  // Regime profile
  const phaseSeconds: Record<PhaseProfileEntry["phase"], number> = { CLIMB: 0, CRUISE: 0, DESCEND: 0, DASH: 0 };
  let prevAlt = rows[0]?.altitude ?? 0;
  let prevTs = rows[0]?.timestamp ?? 0;
  rows.forEach((r, i) => {
    if (i === 0) return;
    const dt = Math.max(0, Math.min(2, r.timestamp - prevTs));
    const rate = r.timestamp > prevTs ? (r.altitude - prevAlt) / Math.max(0.001, r.timestamp - prevTs) : 0;
    phaseSeconds[phaseAt(rate, r.speed)] += dt;
    prevAlt = r.altitude;
    prevTs = r.timestamp;
  });
  const totalPhaseS = Object.values(phaseSeconds).reduce((a, b) => a + b, 0) || 1;
  const phaseProfile: PhaseProfileEntry[] = (Object.keys(phaseSeconds) as PhaseProfileEntry["phase"][]).map((phase) => ({
    phase,
    seconds: round(phaseSeconds[phase], 0),
    pct: round((phaseSeconds[phase] / totalPhaseS) * 100),
  }));

  // Channel stats
  const channels: ChannelStats[] = DEBRIEF_CHANNELS.map((spec) => {
    const values = rows.map((r) => r[spec.key] as number);
    const st = statOf(values);
    return { key: spec.key, label: spec.label, unit: spec.unit, ...st };
  });

  // Exceedances (sample-level aggregate over warn/crit)
  const exceedances: ExceedanceSummary[] = [];
  DEBRIEF_CHANNELS.forEach((spec) => {
    const worse = (val: number, threshold: number) => (spec.lowIsBad ? val < threshold : val > threshold);
    const warnRows = rows.filter((r) => worse(r[spec.key] as number, spec.warn));
    const critRows = rows.filter((r) => worse(r[spec.key] as number, spec.crit));
    const summarize = (severity: Severity, level: number, subset: FlightCsvRow[]) => {
      if (subset.length === 0) return;
      let peakRow = subset[0]!;
      subset.forEach((r) => {
        const v = r[spec.key] as number;
        const pv = peakRow[spec.key] as number;
        if (spec.lowIsBad ? v < pv : v > pv) peakRow = r;
      });
      exceedances.push({
        channelKey: spec.key,
        channelLabel: spec.label,
        unit: spec.unit,
        severity,
        count: subset.length,
        fractionPct: round((subset.length / n) * 100, 2),
        durationS: round(subset.length * Math.max(0.05, sampleInterval), 0),
        peak: round(peakRow[spec.key] as number, 2),
        peakAt: round(peakRow.timestamp, 1),
        firstAt: round(subset[0]!.timestamp, 1),
        lastAt: round(subset[subset.length - 1]!.timestamp, 1),
      });
    };
    summarize("CRITICAL", spec.crit, critRows);
    // Only report warning aggregates when no critical on the same channel
    if (warnRows.length > 0 && critRows.length === 0) summarize("WARNING", spec.warn, warnRows);
  });
  exceedances.sort((a, b) => (a.severity === b.severity ? b.peak - a.peak : a.severity === "CRITICAL" ? -1 : 1));

  // Fault flag timeline
  const faultActivity: FaultActivity[] = [];
  const faultRows: Record<string, number[]> = {};
  rows.forEach((r) => {
    parseFaultState(r.faultState).forEach((flag) => {
      (faultRows[flag] ??= []).push(r.timestamp);
    });
  });
  Object.entries(faultRows).forEach(([flag, stamps]) => {
    faultActivity.push({
      flag,
      samples: stamps.length,
      firstAt: round(stamps[0] ?? 0, 1),
      lastAt: round(stamps[stamps.length - 1] ?? 0, 1),
    });
  });

  // Health envelope
  const healthValues = rows.map((r) => r.health);
  const healthMin = Math.min(...healthValues);
  const healthMean = healthValues.reduce((a, b) => a + b, 0) / n;
  const below30 = healthValues.filter((v) => v < 30).length;

  // Findings (rule-based, deterministic)
  const findings: Finding[] = [];
  exceedances
    .filter((e) => e.severity === "CRITICAL")
    .forEach((e) => {
      findings.push({
        severity: "CRITICAL",
        code: `EXC-${e.channelKey.toUpperCase()}-CRIT`,
        title: `${e.channelLabel} exceeded critical limit ${e.count}×`,
        detail: `Peak ${e.peak} ${e.unit} at t=${e.peakAt}s; ${e.fractionPct}% of flight past redline.`,
      });
    });
  if (healthMin < 30) {
    findings.push({
      severity: "CRITICAL",
      code: "HLTH-<30",
      title: "Composite health collapsed below 30%",
      detail: `Minimum health ${round(healthMin, 1)}%, ${below30} samples in the MAYDAY band — in-flight emergency window detected.`,
    });
  } else if (healthMin < 55) {
    findings.push({
      severity: "WARNING",
      code: "HLTH-<55",
      title: "Composite health dipped below 55%",
      detail: `Minimum health ${round(healthMin, 1)}% — significant degradation window present.`,
    });
  }

  // Cylinder-to-cylinder EGT imbalance snapshot
  let worstImbalance = 0;
  let worstImbalanceAt = rows[0]?.timestamp ?? 0;
  rows.forEach((r) => {
    const spread = Math.max(r.egt1, r.egt2, r.egt3, r.egt4) - Math.min(r.egt1, r.egt2, r.egt3, r.egt4);
    if (spread > worstImbalance) {
      worstImbalance = spread;
      worstImbalanceAt = r.timestamp;
    }
  });
  if (worstImbalance > 60) {
    findings.push({
      severity: "WARNING",
      code: "EGT-IMBALANCE",
      title: "EGT runner imbalance detected",
      detail: `Max cylinder spread ${round(worstImbalance, 1)}°C at t=${round(worstImbalanceAt, 1)}s — injector flow restriction or lean mixture signature.`,
    });
  }

  // Exceedance-derived fault-specific findings
  const vibCrit = exceedances.find((e) => e.channelKey === "vibrationRMS" && e.severity === "CRITICAL");
  if (vibCrit) {
    findings.push({
      severity: "CRITICAL",
      code: "BEARING-SPALL",
      title: "Bearing spall signature",
      detail: `Vibration RMS peaked at ${vibCrit.peak} m/s² — high-frequency BPFO pattern consistent with bearing outer-race spalling.`,
    });
  }

  // Trend buckets (max 60) — compressed series for charts / fleet review
  const BUCKETS = 60;
  const bucketSize = Math.max(1, Math.ceil(n / BUCKETS));
  const trend: PostFlightDebrief["trend"] = [];
  for (let i = 0; i < n; i += bucketSize) {
    const slice = rows.slice(i, i + bucketSize);
    const at = slice[0]?.timestamp ?? 0;
    const chtMax = Math.max(...slice.map((r) => Math.max(r.cht1, r.cht2, r.cht3, r.cht4)));
    const rpm = slice.reduce((a, r) => a + r.rpm, 0) / slice.length;
    const health = slice.reduce((a, r) => a + r.health, 0) / slice.length;
    const oilPressure = slice.reduce((a, r) => a + r.oilPressure, 0) / slice.length;
    trend.push({ at: round(at, 1), chtMax: round(chtMax, 0), rpm: round(rpm, 0), health: round(health, 1), oilPressure: round(oilPressure, 2) });
  }

  // Deterministic maintenance work order (offline, rule-based)
  const workOrder: WorkOrderLine[] = [];
  const criticalExc = exceedances.filter((e) => e.severity === "CRITICAL");
  if (criticalExc.some((e) => e.channelKey.startsWith("cht"))) {
    workOrder.push({ priority: "P1", action: "Inspect cylinder head & cooling: check coolant flow, head gasket and cylinder-2 thermocouple; run differential compression check." });
  }
  if (criticalExc.some((e) => e.channelKey.startsWith("egt"))) {
    workOrder.push({ priority: "P1", action: "Inspect fuel injectors & exhaust runners for restriction; clean or bench-test the suspect injector and verify runner EGT balance." });
  }
  if (criticalExc.some((e) => e.channelKey === "vibrationRMS") || faultActivity.some((f) => f.flag === "BEARINGFAIL")) {
    workOrder.push({ priority: "P1", action: "Ground the airframe: vibration analysis & borescope of rear bearing; replace bearing pack before next flight." });
  }
  if (criticalExc.some((e) => e.channelKey === "oilPressure") || criticalExc.some((e) => e.channelKey === "oilTemp")) {
    workOrder.push({ priority: "P1", action: "Check oil pump pressure relief, filter bypass and oil cooler circuit; replace oil and filter, verify 4.0–5.5 bar on ground run." });
  }
  if (faultActivity.some((f) => f.flag === "C2OVERHEAT")) {
    workOrder.push({ priority: "P1", action: "Cylinder-2 overheat fault latched in flight — inspect CHT sensor path and cylinder head before release." });
  }
  if (faultActivity.some((f) => f.flag === "TURBOFAIL")) {
    workOrder.push({ priority: "P1", action: "Turbocharger fault latched — inspect wastegate actuator, boost lines and compressor wheel for damage." });
  }
  const warnCount = exceedances.filter((e) => e.severity === "WARNING").length + findings.filter((f) => f.severity === "WARNING").length;
  if (warnCount > 0) {
    workOrder.push({ priority: "P2", action: `Review ${warnCount} warning-level anomalies from this debrief; trend-check against the last 5 flights before scheduled maintenance.` });
  }
  workOrder.push({
    priority: "P3",
    action: "Flight data retained for fleet analytics; no immediate action required where no P1/P2 item applies.",
  });
  if (workOrder.length === 0 || workOrder[workOrder.length - 1]?.priority !== "P3") {
    workOrder.push({ priority: "P3", action: "No P1/P2 findings — routine post-flight inspection per maintenance schedule." });
  }

  return {
    schema: "aeris-postflight-debrief-v1",
    generatedAt: new Date().toISOString(),
    mission: {
      samples: n,
      durationS: round(Math.max(0, endTs - startTs), 1),
      durationHms: fmtHms(Math.max(0, endTs - startTs)),
      startTs: round(startTs, 1),
      endTs: round(endTs, 1),
      maxAltitudeFt: round(Math.max(...rows.map((r) => r.altitude)), 0),
      minAltitudeFt: round(Math.min(...rows.map((r) => r.altitude)), 0),
      maxRpm: round(Math.max(...rows.map((r) => r.rpm)), 0),
      meanThrottlePct: round(rows.reduce((a, r) => a + r.throttle, 0) / n, 1),
      maxEngineLoadPct: round(Math.max(...rows.map((r) => r.engineLoad)), 0),
      phaseProfile,
    },
    health: {
      min: round(healthMin, 1),
      mean: round(healthMean, 1),
      end: round(healthValues[n - 1] ?? 0, 1),
      below30Samples: below30,
    },
    channels,
    exceedances,
    faultActivity,
    findings,
    workOrder,
    trend,
  };
}
