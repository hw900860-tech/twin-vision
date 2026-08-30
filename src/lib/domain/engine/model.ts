/**
 * AE-P4 — representative four-cylinder aero piston engine.
 * All values are SYNTHETIC and produced by a deterministic demonstrator model.
 * This does not represent any specific OEM engine.
 */

export type EngineState = {
  t: number;
  rpm: number;
  throttle: number;
  manifoldPressure: number;
  fuelFlow: number;
  cht: number;
  egt: number;
  oilPressure: number;
  oilTemperature: number;
  vibrationRms: number;
  alternatorVoltage: number;
  injectorEfficiency: number;
  compressionHealth: number;
  lubricationHealth: number;
  thermalHealth: number;
  electricalHealth: number;
  combustionHealth: number;
  anomalyScore: number;
  residual: number;
  health: number;
};

export type Conditions = {
  altitudeFt: number;
  ambientC: number;
  throttlePct: number;
  wearPct: number;
  durationH: number;
};

export const BASELINE_CONDITIONS: Conditions = {
  altitudeFt: 18000,
  ambientC: 41,
  throttlePct: 72,
  wearPct: 31,
  durationH: 8,
};

/** Deterministic pseudo-noise — same input always yields the same output. */
export function noise(t: number, seed = 1): number {
  const a = Math.sin(t * 1.7 + seed * 12.9898) * 43758.5453;
  const b = Math.sin(t * 0.43 + seed * 78.233) * 12543.1234;
  return ((a - Math.floor(a)) + (b - Math.floor(b))) - 1;
}

function wave(t: number, f: number, phase = 0) {
  return Math.sin(t * f + phase);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export { clamp };

/**
 * Physics-lite expected behaviour of the AE-P4 under given conditions.
 * `fault` in [0..1] drives progressive injector degradation on top of it.
 */
export function simulate(t: number, c: Conditions, fault = 0): EngineState {
  const densityRatio = Math.exp(-c.altitudeFt / 27000);
  const thr = c.throttlePct / 100;
  const wear = c.wearPct / 100;

  const rpm = 1900 + thr * 2900 * (0.86 + 0.14 * densityRatio) + wave(t, 0.6) * 18 + noise(t, 3) * 9;
  const manifoldPressure = 18 + thr * 14 * densityRatio + wave(t, 0.31, 1.2) * 0.25;
  const fuelFlowBase = 3.4 + thr * 20 * densityRatio;
  const fuelFlow = fuelFlowBase * (1 + fault * 0.14) + wave(t, 1.9) * (0.12 + fault * 0.9) + noise(t, 7) * 0.06;

  const chtBase = 96 + thr * 96 + c.ambientC * 0.72 - densityRatio * 12 + wear * 16;
  const cht = chtBase + fault * 26 + wave(t, 0.22, 0.7) * 1.4;

  const egtBase = 528 + thr * 236 + c.ambientC * 0.5 + wear * 22;
  const egt = egtBase + fault * 74 + wave(t, 0.27, 2.1) * 3.2 + noise(t, 11) * 2;

  const oilTemperature = 68 + thr * 34 + c.ambientC * 0.5 + wear * 10 + fault * 6;
  const oilPressure = clamp(5.6 - wear * 0.9 - (oilTemperature - 90) * 0.012 - fault * 0.2, 1.6, 6.2) + wave(t, 0.9) * 0.03;

  const vibrationRms = 0.42 + thr * 0.36 + wear * 0.5 + fault * 0.9 + Math.abs(wave(t, 2.4)) * 0.05;
  const alternatorVoltage = 28.2 - wear * 0.5 + wave(t, 0.5, 0.4) * 0.05;

  const injectorEfficiency = clamp(1 - fault * 0.34 - wear * 0.08, 0, 1);
  const thermalHealth = clamp(1 - (cht - 150) / 130 - wear * 0.1, 0, 1);
  const compressionHealth = clamp(1 - wear * 0.28 - fault * 0.1, 0, 1);
  const lubricationHealth = clamp(1 - wear * 0.2 - (oilTemperature - 95) / 160, 0, 1);
  const electricalHealth = clamp(1 - wear * 0.06, 0, 1);
  const combustionHealth = clamp(injectorEfficiency * 0.8 + 0.2 - fault * 0.16, 0, 1);
  const vibrationHealth = clamp(1 - (vibrationRms - 0.5) / 1.6, 0, 1);

  const health =
    combustionHealth * 0.26 +
    thermalHealth * 0.22 +
    lubricationHealth * 0.2 +
    vibrationHealth * 0.2 +
    electricalHealth * 0.12;

  const residual = fault * 22 + wear * 3 + Math.abs(wave(t, 0.8)) * 0.4;
  const anomalyScore = clamp(fault * 0.94 + wear * 0.1 + Math.abs(noise(t, 5)) * 0.02, 0, 1);

  return {
    t,
    rpm,
    throttle: c.throttlePct,
    manifoldPressure,
    fuelFlow,
    cht,
    egt,
    oilPressure,
    oilTemperature,
    vibrationRms,
    alternatorVoltage,
    injectorEfficiency,
    compressionHealth,
    lubricationHealth,
    thermalHealth,
    electricalHealth,
    combustionHealth,
    anomalyScore,
    residual,
    health: clamp(health, 0, 1),
  };
}

/** Remaining Useful Life estimate (demonstrator model AERIS-RUL-01). */
export function estimateRul(state: EngineState, c: Conditions, fault: number) {
  const base = 26 * state.health;
  const stress = 1 + (c.throttlePct / 100) * 0.55 + Math.max(0, c.ambientC - 25) / 45;
  const point = clamp((base / stress) * (1 - fault * 0.55), 0.4, 60);
  const confidence = clamp(0.86 - fault * 0.12 - (c.wearPct / 100) * 0.08, 0.4, 0.95);
  const spread = point * (0.14 + (1 - confidence) * 0.55);
  return {
    point,
    low: Math.max(0.2, point - spread),
    high: point + spread * 1.2,
    confidence,
  };
}

export type Risk = "LOW" | "MEDIUM" | "HIGH";

export function missionRisk(state: EngineState, c: Conditions, rulH: number) {
  const marginRatio = rulH / Math.max(0.5, c.durationH);
  let score = 0;
  const reasons: string[] = [];
  if (marginRatio < 1.6) {
    score += marginRatio < 1 ? 45 : 24;
    reasons.push("RUL MARGIN LIMITED");
  }
  if (state.thermalHealth < 0.72) {
    score += 20;
    reasons.push("LOW THERMAL MARGIN");
  }
  if (state.vibrationRms > 0.95) {
    score += 18;
    reasons.push("RISING VIBRATION TREND");
  }
  if (state.lubricationHealth < 0.8) {
    score += 12;
    reasons.push("LUBRICATION DEGRADATION");
  }
  if (state.anomalyScore > 0.5) {
    score += 14;
    reasons.push("ACTIVE ANOMALY SIGNATURE");
  }
  const readiness = clamp(100 - score, 4, 99);
  const risk: Risk = readiness > 78 ? "LOW" : readiness > 52 ? "MEDIUM" : "HIGH";
  if (reasons.length === 0) reasons.push("ALL SUBSYSTEM MARGINS NOMINAL");
  return { readiness, risk, reasons };
}

export const CYLINDERS = [
  { id: 1, cht: 178, egt: 726, vib: 0.71, health: 0.94, status: "NOMINAL", issue: "—" },
  { id: 2, cht: 181, egt: 733, vib: 0.76, health: 0.92, status: "NOMINAL", issue: "—" },
  { id: 3, cht: 194, egt: 782, vib: 1.24, health: 0.68, status: "DEGRADING", issue: "Injector degradation" },
  { id: 4, cht: 176, egt: 719, vib: 0.69, health: 0.95, status: "NOMINAL", issue: "—" },
] as const;
