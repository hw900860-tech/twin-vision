import type { FaultFlags } from '../flight-sim/flightStore';
import { chtRedlineShiftC, oilRedlineShiftC } from '@/lib/domain/engine/environment';

export type SubsystemStatus = 'NOMINAL' | 'WARNING' | 'CRITICAL';

export interface ParameterThreshold {
  label: string;
  normal: [number, number];
  warning: number;
  critical: number;
  unit: string;
}

export const ENGINE_LIMITS: Record<string, ParameterThreshold> = {
  cht: { label: 'Cylinder Head Temp', normal: [140, 170], warning: 180, critical: 220, unit: '°C' },
  egt: { label: 'Exhaust Gas Temp', normal: [550, 700], warning: 720, critical: 780, unit: '°C' },
  map: { label: 'Manifold Air Press', normal: [20, 32], warning: 34, critical: 38, unit: 'kPa' },
  oilPressure: { label: 'Oil Pressure', normal: [3.5, 5.5], warning: 3.0, critical: 2.0, unit: 'bar' },
  oilTemp: { label: 'Oil Temperature', normal: [80, 100], warning: 110, critical: 125, unit: '°C' },
  vibration: { label: 'Vibration RMS', normal: [0.3, 0.8], warning: 1.2, critical: 1.8, unit: 'm/s²' },
  rpm: { label: 'Engine Speed', normal: [4500, 5500], warning: 5800, critical: 6200, unit: 'RPM' },
  healthIndex: { label: 'Health Index', normal: [0.8, 1.0], warning: 0.7, critical: 0.5, unit: '%' },
};

export function evalStatus(value: number, key: keyof typeof ENGINE_LIMITS): SubsystemStatus {
  const limit = ENGINE_LIMITS[key];
  if (!limit) return 'NOMINAL';

  if (key === 'oilPressure') {
    if (value <= limit.critical) return 'CRITICAL';
    if (value <= limit.warning) return 'WARNING';
    return 'NOMINAL';
  } else if (key === 'healthIndex') {
    if (value <= limit.critical) return 'CRITICAL';
    if (value <= limit.warning) return 'WARNING';
    return 'NOMINAL';
  } else {
    if (value >= limit.critical) return 'CRITICAL';
    if (value >= limit.warning) return 'WARNING';
    return 'NOMINAL';
  }
}

export interface CylinderHeadMLOutput {
  id: 'CylinderHeadML';
  subsystemName: string;
  cht1: number;
  cht2: number;
  cht3: number;
  cht4: number;
  maxCHT: number;
  thermalStress: number;
  overheatRisk: number;
  imbalance: number;
  status: SubsystemStatus;
  health: number;
}

export interface ExhaustMLOutput {
  id: 'ExhaustML';
  subsystemName: string;
  egt1: number;
  egt2: number;
  egt3: number;
  egt4: number;
  avgEGT: number;
  runnerBalance: number;
  combustionEfficiency: number;
  injectorAnomalyRisk: number;
  status: SubsystemStatus;
  health: number;
}

export interface TurboIntakeMLOutput {
  id: 'TurboIntakeML';
  subsystemName: string;
  turboRPM: number;
  boostPressure: number;
  boostDeviation: number;
  compressorEfficiency: number;
  wastegateAnomaly: number;
  stallRisk: number;
  status: SubsystemStatus;
  health: number;
}

export interface CrankcaseMLOutput {
  id: 'CrankcaseML';
  subsystemName: string;
  vibrationRMS: number;
  dominantFreqHz: number;
  bpfoPeak: number;
  structuralHealth: number;
  bearingFatigueIndex: number;
  pistonSlapProbability: number;
  estimatedRUL: number;
  status: SubsystemStatus;
  health: number;
}

export interface OilSumpMLOutput {
  id: 'OilSumpML';
  subsystemName: string;
  oilTemp: number;
  oilPressure: number;
  viscosityIndex: number;
  filterCloggingScore: number;
  lubricationRisk: number;
  status: SubsystemStatus;
  health: number;
}

export interface PropGearboxMLOutput {
  id: 'PropGearboxML';
  subsystemName: string;
  propVibration: number;
  torsionalAnomaly: number;
  gearWearIndex: number;
  gearPittingRisk: number;
  propImbalanceRisk: number;
  slippageRisk: number;
  status: SubsystemStatus;
  health: number;
}

export interface EngineStateInputs {
  altitude: number;
  ambientTemp: number;
  /** OAT − ISA at flight altitude, °C — 0 when no live weather is bound */
  ambientDeltaC: number;
  throttle: number;
  rpm: number;
  map: number;
  cht: number[];
  egt: number;
  oilPressure: number;
  oilTemp: number;
  vibrationRMS: number;
  fftSpectrum: number[];
  healthIndex: number;
  rul: number;
  anomalyScore: number;
  faults: FaultFlags;
}

// 1. Model 1 — CYLINDER HEAD (CylinderHeadML)
export function runCylinderHeadModel(state: EngineStateInputs): CylinderHeadMLOutput {
  const [c1 = 0, c2 = 0, c3 = 0, c4 = 0] = state.cht;
  const maxCHT = Math.max(c1, c2, c3, c4);
  const minCHT = Math.min(c1, c2, c3, c4);
  const imbalance = maxCHT - minCHT;

  // Environment-normalized CHT: climate moves the whole head temperature up
  // (≈0.72 °C per ambient °C vs ISA); normalize it away so a hot/cold day never
  // reads as thermal degradation. Cylinder-to-cylinder imbalance is preserved.
  const envShift = chtRedlineShiftC(state.ambientDeltaC);
  const maxCHTnorm = maxCHT - envShift;

  const thermalStress = Math.min(100, Math.max(0, ((maxCHTnorm - 140) / 80) * 100));
  const overheatRisk = Math.min(100, Math.max(0, ((maxCHTnorm - 170) / 50) * 100));
  const status = evalStatus(maxCHTnorm, 'cht');
  const health = Math.max(0, Math.min(1, 1 - overheatRisk / 100 - (state.faults.c2Overheat ? 0.4 : 0)));

  return {
    id: 'CylinderHeadML',
    subsystemName: 'CYLINDER HEAD (ROTAX RED)',
    cht1: c1,
    cht2: c2,
    cht3: c3,
    cht4: c4,
    maxCHT,
    thermalStress,
    overheatRisk,
    imbalance,
    status,
    health,
  };
}

// 2. Model 2 — EXHAUST (ExhaustML)
export function runExhaustModel(state: EngineStateInputs): ExhaustMLOutput {
  const baseEGT = state.egt;
  const clogOffset = state.faults.injectorClog ? 65 : 0;
  const e1 = baseEGT + clogOffset;
  const e2 = baseEGT - 12;
  const e3 = baseEGT + 8;
  const e4 = baseEGT - 5;

  const avgEGT = (e1 + e2 + e3 + e4) / 4;
  const runnerBalance = Math.max(0, 100 - (clogOffset * 0.8));
  const combustionEfficiency = Math.max(40, Math.min(99, 98 - (state.throttle > 90 ? 8 : 0) - clogOffset * 0.4));
  const injectorAnomalyRisk = state.faults.injectorClog ? 88 : Math.min(100, Math.max(0, (avgEGT - 680) * 0.4));

  const status = evalStatus(avgEGT, 'egt');
  const health = Math.max(0, Math.min(1, (runnerBalance / 100) * (1 - injectorAnomalyRisk / 200)));

  return {
    id: 'ExhaustML',
    subsystemName: 'EXHAUST MANIFOLD',
    egt1: e1, egt2: e2, egt3: e3, egt4: e4,
    avgEGT,
    runnerBalance,
    combustionEfficiency,
    injectorAnomalyRisk,
    status,
    health,
  };
}

// 3. Model 3 — TURBO / INTAKE (TurboIntakeML)
export function runTurboModel(state: EngineStateInputs): TurboIntakeMLOutput {
  const altFactor = Math.exp(-state.altitude / 27000);
  const turboComp = (1 - altFactor) * 100;
  const turboRPM = 85000 + (state.throttle / 100) * 45000 + turboComp * 400;

  const boostPressure = state.map * 1.05;
  const expectedBoost = 18 + (state.throttle / 100) * 14;
  const boostDeviation = Math.abs(boostPressure - expectedBoost);

  const compressorEfficiency = Math.max(30, 95 - turboComp * 0.8 - (state.faults.turboFail ? 45 : 0));
  const wastegateAnomaly = state.faults.turboFail ? 92 : Math.min(100, Math.max(0, (state.altitude - 15000) / 200));
  const stallRisk = Math.min(100, Math.max(0, wastegateAnomaly * 0.9));

  const status = state.faults.turboFail || boostPressure < 15 ? 'CRITICAL' : boostDeviation > 5 ? 'WARNING' : 'NOMINAL';
  const health = Math.max(0, Math.min(1, compressorEfficiency / 100));

  return {
    id: 'TurboIntakeML',
    subsystemName: 'INTAKE / TURBO & CARBS',
    turboRPM,
    boostPressure,
    boostDeviation,
    compressorEfficiency,
    wastegateAnomaly,
    stallRisk,
    status,
    health,
  };
}

// 4. Model 4 — CRANKCASE / BEARING (CrankcaseML)
export function runCrankcaseModel(state: EngineStateInputs): CrankcaseMLOutput {
  const vib = state.vibrationRMS;
  const bpfoPeak = state.faults.bearingFail ? 1.85 : 0.12;
  const dominantFreqHz = state.faults.bearingFail ? 140 : 80;

  const structuralHealth = Math.max(0, 100 - (vib * 35) - (state.faults.bearingFail ? 50 : 0));
  const bearingFatigueIndex = state.faults.bearingFail ? 94 : Math.min(100, Math.max(0, (vib - 0.5) * 60));
  const pistonSlapProbability = Math.min(100, Math.max(0, (vib - 1.0) * 40));
  const estimatedRUL = Math.max(10, state.rul * (1 - bearingFatigueIndex / 150));

  const status = evalStatus(vib, 'vibration');
  const health = Math.max(0, Math.min(1, structuralHealth / 100));

  return {
    id: 'CrankcaseML',
    subsystemName: 'CRANKCASE BLOCK',
    vibrationRMS: vib,
    dominantFreqHz,
    bpfoPeak,
    structuralHealth,
    bearingFatigueIndex,
    pistonSlapProbability,
    estimatedRUL,
    status,
    health,
  };
}

// 5. Model 5 — OIL SYSTEM (OilSumpML)
export function runOilModel(state: EngineStateInputs): OilSumpMLOutput {
  const oTemp = state.oilTemp;
  const oPress = state.oilPressure;

  // Environment-normalized oil temperature for status/risk classification.
  const oTempNorm = oTemp - oilRedlineShiftC(state.ambientDeltaC);
  const viscosityIndex = Math.max(30, 100 - (oTemp - 90) * 1.5);
  const filterCloggingScore = Math.min(100, Math.max(5, (100 - viscosityIndex) * 0.6));
  const lubricationRisk = oPress < 3.0 ? 85 : oTempNorm > 110 ? 70 : 12;

  const status = evalStatus(oTempNorm, 'oilTemp') === 'CRITICAL' || evalStatus(oPress, 'oilPressure') === 'CRITICAL' ? 'CRITICAL' : evalStatus(oTempNorm, 'oilTemp') === 'WARNING' || evalStatus(oPress, 'oilPressure') === 'WARNING' ? 'WARNING' : 'NOMINAL';
  const health = Math.max(0, Math.min(1, (viscosityIndex / 100) * (oPress / 5.2)));

  return {
    id: 'OilSumpML',
    subsystemName: 'OIL SUMP & FILTER',
    oilTemp: oTemp,
    oilPressure: oPress,
    viscosityIndex,
    filterCloggingScore,
    lubricationRisk,
    status,
    health,
  };
}

// 6. Model 6 — GEARBOX / PROP (PropGearboxML)
export function runGearboxModel(state: EngineStateInputs): PropGearboxMLOutput {
  const propVib = state.vibrationRMS * 0.72;
  const torsionalAnomaly = state.faults.bearingFail ? 78 : Math.min(100, Math.max(0, (state.throttle - 85) * 1.5));
  const gearWearIndex = Math.min(100, Math.max(10, (1 - state.healthIndex) * 100));
  const gearPittingRisk = Math.min(100, Math.max(0, (propVib - 0.8) * 50));
  const propImbalanceRisk = Math.min(100, Math.max(0, (propVib - 0.6) * 40));
  const slippageRisk = state.throttle > 95 ? 65 : 15;

  const status = propVib > 1.4 ? 'CRITICAL' : propVib > 0.9 ? 'WARNING' : 'NOMINAL';
  const health = Math.max(0, Math.min(1, 1 - propVib / 2.2));

  return {
    id: 'PropGearboxML',
    subsystemName: 'GEARBOX & PROP FLANGE',
    propVibration: propVib,
    torsionalAnomaly,
    gearWearIndex,
    gearPittingRisk,
    propImbalanceRisk,
    slippageRisk,
    status,
    health,
  };
}

import { generateAlerts, type EngineAlert } from './EngineAlerts';

export interface EngineDecisionResult {
  overallHealth: number; // 0-100%
  overallStatus: SubsystemStatus;
  primaryFaultSubsystem: string;
  primaryFaultId: string;
  confidence: number;
  diagnosisText: string;
  recommendedAction: string;
  alerts: EngineAlert[];
  modelOutputs: {
    cylhead: CylinderHeadMLOutput;
    exhaust: ExhaustMLOutput;
    turbo: TurboIntakeMLOutput;
    crankcase: CrankcaseMLOutput;
    oil: OilSumpMLOutput;
    gearbox: PropGearboxMLOutput;
  };
}

export function runEngineDecisionEngine(state: EngineStateInputs): EngineDecisionResult {
  const cylhead = runCylinderHeadModel(state);
  const exhaust = runExhaustModel(state);
  const turbo = runTurboModel(state);
  const crankcase = runCrankcaseModel(state);
  const oil = runOilModel(state);
  const gearbox = runGearboxModel(state);

  const outputs = [
    { sub: 'CYLINDER HEAD (ROTAX RED)', id: 'cylhead', h: cylhead.health, s: cylhead.status, risk: cylhead.overheatRisk },
    { sub: 'EXHAUST MANIFOLD', id: 'exhaust', h: exhaust.health, s: exhaust.status, risk: exhaust.injectorAnomalyRisk },
    { sub: 'INTAKE / TURBO & CARBS', id: 'turbo', h: turbo.health, s: turbo.status, risk: turbo.wastegateAnomaly },
    { sub: 'CRANKCASE BLOCK', id: 'crankcase', h: crankcase.health, s: crankcase.status, risk: crankcase.bearingFatigueIndex },
    { sub: 'OIL SUMP & FILTER', id: 'oil', h: oil.health, s: oil.status, risk: oil.lubricationRisk },
    { sub: 'GEARBOX & PROP FLANGE', id: 'gearbox', h: gearbox.health, s: gearbox.status, risk: gearbox.gearPittingRisk },
  ];

  // Lowest health component is the primary fault driver
  const sortedByHealth = [...outputs].sort((a, b) => a.h - b.h);
  const primary = sortedByHealth[0]!;

  const avgHealth = (cylhead.health + exhaust.health + turbo.health + crankcase.health + oil.health + gearbox.health) / 6;
  const overallHealth = Math.round(Math.min(avgHealth * 100, primary.h * 100));

  const hasCritical = outputs.some((o) => o.s === 'CRITICAL');
  const hasWarning = outputs.some((o) => o.s === 'WARNING');
  const overallStatus: SubsystemStatus = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'NOMINAL';

  const confidence = 94.2 + (state.altitude > 15000 ? 3.5 : 0);

  // Generate live telemetry alerts (environment-normalized when weather is bound)
  const alerts = generateAlerts({
    cht: state.cht,
    egt: state.egt,
    map: state.map,
    oilPressure: state.oilPressure,
    oilTemp: state.oilTemp,
    vibrationRMS: state.vibrationRMS,
    rpm: state.rpm,
    health: overallHealth / 100,
    ...(state.ambientDeltaC !== 0 ? { envDeltaC: state.ambientDeltaC } : {}),
  });

  // Dynamic Explainable Diagnostics Generation
  let diagnosisText = 'All 6 engine subsystems operating within normal parameters. Telemetry streams balanced.';
  let recommendedAction = 'Maintain current flight profile and monitor flight instrumentation.';

  if (state.faults.c2Overheat || cylhead.status !== 'NOMINAL') {
    const envNote = state.ambientDeltaC !== 0
      ? ` Ambient is ${state.ambientDeltaC >= 0 ? '+' : ''}${state.ambientDeltaC.toFixed(1)}°C vs ISA (environment-normalized redline ${(180 + chtRedlineShiftC(state.ambientDeltaC)).toFixed(0)}°C).`
      : '';
    diagnosisText = `CYLINDER HEAD WARNING — Cylinder 2 CHT elevated to ${cylhead.cht2.toFixed(0)}°C (Limit: 180°C). Localized thermal gradient detected. Altitude ${state.altitude.toFixed(0)} ft reduces air cooling density.${envNote}`;
    recommendedAction = 'Reduce throttle setting below 75%, descend to lower altitude for denser air cooling, and monitor CHT telemetry closely.';
  } else if (state.faults.turboFail || turbo.status !== 'NOMINAL') {
    diagnosisText = `TURBOCHARGER ANOMALY — Manifold boost pressure dropped to ${turbo.boostPressure.toFixed(1)} kPa. Altitude ${state.altitude.toFixed(0)} ft requires 100% turbo boost compensation. Wastegate actuator deviation detected.`;
    recommendedAction = 'Initiate gradual descent to sub-12,000 ft altitude. Avoid rapid throttle additions to prevent compressor stall.';
  } else if (state.faults.bearingFail || crankcase.status !== 'NOMINAL') {
    diagnosisText = `BEARING SPALL FAILURE — High-frequency vibration peak detected at 140 Hz (BPFO signature). Structural vibration RMS ${crankcase.vibrationRMS.toFixed(2)} m/s² exceeds 1.2 m/s² safety limit.`;
    recommendedAction = 'Emergency maintenance advisory: Reduce engine RPM immediately. Initiate divert route to nearest recovery waypoint.';
  } else if (state.faults.injectorClog || exhaust.status !== 'NOMINAL') {
    diagnosisText = `INJECTOR COMBUSTION IMBALANCE — Cylinder 1 EGT elevated to ${exhaust.egt1.toFixed(0)}°C. Fuel runner balance degraded to ${exhaust.runnerBalance.toFixed(0)}%.`;
    recommendedAction = 'Enrich fuel mixture, avoid maximum power continuous operation, and inspect fuel injectors upon landing.';
  } else if (state.altitude > 20000) {
    diagnosisText = `HIGH ALTITUDE STRESS — Operating at ${state.altitude.toFixed(0)} ft. Air density ratio reduced to ${(Math.exp(-state.altitude / 27000) * 100).toFixed(0)}%. Turbo compensation operating near thermal limit.`;
    recommendedAction = 'Monitor CHT and MAP closely. Limit high-throttle bursts at extreme altitude.';
  }

  return {
    overallHealth,
    overallStatus,
    primaryFaultSubsystem: primary.sub,
    primaryFaultId: primary.id,
    confidence,
    diagnosisText,
    recommendedAction,
    alerts,
    modelOutputs: { cylhead, exhaust, turbo, crankcase, oil, gearbox },
  };
}
