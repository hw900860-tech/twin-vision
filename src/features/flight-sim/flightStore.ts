import { create } from 'zustand';
import { terrainHeightAt } from './terrainMath';
import { runEngineDecisionEngine, type EngineDecisionResult, type SubsystemStatus } from '../digital-twin/engineMlService';
import { sampleAtmosphere, type WeatherObservation } from '@/lib/domain/engine/environment';
import { serializeTelemetryLogs } from '@/lib/flight-analysis/sessionCsv';
import { applyWeatherToRegions, regionAtList, regionById, REGIONS_BY_BIOME, type FlightRegion, type RegionEvent, type RegionSeverity } from './regions';
import { legThreats, planEscape, ringPenetration } from './regionPilot';
import { pointInRegion } from './routePlanner';
import type { SortieRecord } from '@/lib/datalink/sortie';

export type Biome = 'himalaya' | 'thar' | 'coastal';
export type MissionPreset = 'nominalRoutine' | 'highAltitudeFailure' | 'coastalRecovery' | 'himalayaTransect' | 'tharTransect' | 'coastalTransect';
export type EmergencyState = 'nominal' | 'forcedLanding' | 'crashed' | 'recovery';
export type CameraMode = 'chase' | 'birdseye';

export interface CrashCoordinates {
  lat: number;
  lon: number;
  x: number;
  z: number;
  altitude: number;
}

export interface RegionAlert {
  id: string;
  regionId: string;
  name: string;
  severity: RegionSeverity;
  event: RegionEvent;
  text: string;
  tempDeltaC: number;
  densityRatio: number;
  pressureDelta: number;
  turbulence: number;
  at: number;
}

export interface FaultFlags {
  c2Overheat: boolean;
  turboFail: boolean;
  bearingFail: boolean;
  injectorClog: boolean;
  misfire3: boolean;
}

export interface FaultSmoothState {
  c2Overheat: number;
  turboFail: number;
  bearingFail: number;
  injectorClog: number;
  misfire3: number;
}

export type DemoPhase = 'idle' | 'launching' | 'cruise' | 'fault' | 'alert' | 'mayday' | 'rtb' | 'report';

export interface DemoChip {
  /** Mission-clock seconds when the event fired. */
  t: number;
  label: string;
  tone: 'cyan' | 'nominal' | 'amber' | 'critical';
}

export interface MissionExtremes {
  maxCht: [number, number, number, number];
  maxEgt: number;
  minMap: number;
  maxOilTemp: number;
  maxVib: number;
  minHealthPct: number;
  rulConsumed: number;
  maxAltFt: number;
}

/** Auto-generated debrief card produced when the guided demo sortie ends. */
export interface MissionReport {
  mission: string;
  biome: string;
  outcome: string;
  durationSec: number;
  faultInjected: string;
  faultAtSec: number;
  maydayAtSec: number;
  rtbAtSec: number;
  waypointCaptures: { wp: number; t: number }[];
  regionCrossings: string[];
  extremes: MissionExtremes;
  chips: DemoChip[];
}

/** One-click guided demo state, driven by features/flight-sim/guidedDemo.ts. */
export interface GuidedDemoState {
  active: boolean;
  phase: DemoPhase;
  chips: DemoChip[];
  report: MissionReport | null;
  faultInjected: boolean;
}

export interface TelemetryHistoryPoint {
  time: number;
  chtMax: number;
  egt: number;
  map: number;
  oilTemp: number;
  oilPressure: number;
  vibrationRMS: number;
  health: number;
}

export type VizMode = 'NORMAL' | 'PRESSURE' | 'THERMAL' | 'VIBRATION' | 'ML_RISK' | 'XRAY';

export interface ComponentStressState {
  cylinders: [number, number, number, number];
  exhaustRunners: [number, number, number, number];
  turbo: number;
  crankcase: number;
  oilSystem: number;
  gearbox: number;
  overallLoad: number;
}

export interface TelemetryLogEntry {
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
  injectionTiming: number;
  faultState: string;
}

export interface FlightState {
  x: number;
  z: number;
  heading: number;
  altitude: number;
  speed: number;
  targetHeading: number;
  targetAltitude: number;
  bankAngle: number;
  pitchAngle: number;
  cameraMode: CameraMode;
  throttle: number;
  rudder: number;
  biome: Biome;
  ambientTemp: number;
  /** Immutable biome/scenario OAT base — region & altitude deltas are applied ONCE per tick on top of this. */
  baseAmbientTemp: number;
  rpm: number;
  injectionTiming: number;
  cht: number[];
  egt: number;
  map: number;
  oilPressure: number;
  oilTemp: number;
  vibrationRMS: number;
  fftSpectrum: number[];
  healthIndex: number;
  rul: number;
  anomalyScore: number;
  missionPreset: MissionPreset;
  missionActive: boolean;
  missionProgress: number;
  missionElapsed: number;
  waypoints: { x: number; z: number; label: string }[];
  faults: FaultFlags;
  faultSmooth: FaultSmoothState;
  emergencyState: EmergencyState;
  emergencyTimer: number;
  crashCoordinates: CrashCoordinates | null;
  systemMessage: string | null;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;

  // Atmospheric regions (micro-weather air masses with their own engine effect).
  // `regions` is the ACTIVE set for the current biome — its positions/params are
  // deformed by the live OpenWeather ingestion when a station is synced.
  regions: FlightRegion[];
  currentRegion: FlightRegion | null;
  regionsInside: string[];
  regionAlerts: RegionAlert[];
  pendingRegionAlerts: RegionAlert[];
  /** Finished sortie records awaiting datalink transmission to the GCS. */
  pendingSorties: SortieRecord[];

  /** Operator MAYDAY RTB command — overrides waypoint nav to fly straight home. */
  rtbActive: boolean;

  /** One-click guided demo (launch → fault → MAYDAY → RTB → report). */
  demo: GuidedDemoState;

  // Real-Time Physics & 3D Load Field State
  airDensity: number;
  dynamicPressure: number;
  loadVector: [number, number, number];
  componentStress: ComponentStressState;
  vizMode: VizMode;
  focusedComponent: string | null;

  // Telemetry Logger & Replay
  isRecording: boolean;
  recordedLogs: TelemetryLogEntry[];
  sessionLogs: TelemetryLogEntry[];
  isReplaying: boolean;
  replayIndex: number;

  // Connected 6 ML Engine Digital Twin State
  engineDecision: EngineDecisionResult | null;
  selectedSubsystem: string | null;
  historyBuffer: TelemetryHistoryPoint[];

  // Layer-2 Environmental Ingestion (live weather bound to physics)
  weather: WeatherObservation | null;

  // Waypoint route planner (pre-launch only — editing disabled mid-mission)
  plannerMode: boolean;

  // Region-adaptive autopilot: seek an alternate path around a zone first;
  // if none exists, transit it under optimal (reduced-throttle) conditions.
  evadePath: { x: number; z: number }[];
  evadeIndex: number;
  regionMode: 'cruise' | 'evade' | 'transit';
  regionModeText: string | null;
  transitEcoThrottle: number | null;

  setThrottle: (v: number) => void;
  setRudder: (v: number) => void;
  setTargetHeading: (h: number) => void;
  setTargetAltitude: (a: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setBiome: (b: Biome) => void;
  setMissionPreset: (p: MissionPreset) => void;
  startMission: () => void;
  setDragging: (d: boolean, startX?: number, startY?: number) => void;
  toggleFault: (fault: keyof FaultFlags) => void;
  resetFaults: () => void;
  resetSimulation: () => void;
  setSelectedSubsystem: (name: string | null) => void;
  setVizMode: (mode: VizMode) => void;
  setFocusedComponent: (comp: string | null) => void;
  toggleRecording: () => void;
  clearLogs: () => void;
  exportCSV: () => void;
  startReplay: () => void;
  stopReplay: () => void;
  syncLiveWeather: (obs: WeatherObservation) => void;
  clearLiveWeather: () => void;
  clearPendingRegionAlerts: () => void;
  queueSortie: (rec: SortieRecord) => void;
  clearPendingSorties: () => void;
  triggerRtb: () => void;
  updateDemo: (patch: Partial<GuidedDemoState>) => void;
  setPlannerMode: (on: boolean) => void;
  addWaypoint: (x: number, z: number) => void;
  moveWaypoint: (index: number, x: number, z: number) => void;
  removeWaypoint: (index: number) => void;
  resetRoute: () => void;
  tick: (dt: number) => void;
}

const BIOME_CONFIG: Record<Biome, { ambientTemp: number; baseRPM: number }> = {
  himalaya: { ambientTemp: -5, baseRPM: 2400 },
  thar: { ambientTemp: 48, baseRPM: 2500 },
  coastal: { ambientTemp: 28, baseRPM: 2450 },
};

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function angleDiff(a: number, b: number): number {
  return mod(a - b + 180, 360) - 180;
}

function noise(t: number, seed: number): number {
  const a = Math.sin(t * 1.7 + seed * 12.9898) * 43758.5453;
  return (a - Math.floor(a)) * 2 - 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function updateEngineTelemetry(state: FlightState, dt: number): Partial<FlightState> {
  const thr = state.throttle / 100;
  const biomeConfig = BIOME_CONFIG[state.biome];
  const t = Date.now() / 1000;

  // Layer-2 environmental ingestion: when live weather is bound, ambient
  // temperature follows the ISA lapse to the current flight altitude and the
  // air-density ratio is computed from the true density altitude. When no
  // live weather is bound the legacy fixed-biome model is preserved exactly.
  const atmosphere = state.weather ? sampleAtmosphere(state.altitude, state.weather) : null;
  // Micro-weather region blend: temperature offset, air density and pressure
  // deltas from the atmospheric region the UAV currently sits inside (the
  // live-meteo-deformed set when a station is synced).
  const region = regionAtList(state.x, state.z, state.regions);
  // NOTE: the base is `baseAmbientTemp` (immutable) — never the previously
  // blended `ambientTemp`, or the region offset would accumulate every tick.
  const ambientTemp = (atmosphere ? atmosphere.oatC : state.baseAmbientTemp) + (region?.params.tempDeltaC ?? 0);
  const altitudeFactor = (atmosphere ? atmosphere.densityRatio : Math.exp(-state.altitude / 27000)) * (region?.params.densityRatio ?? 1);

  // Smooth fault intensity lerping (thermal and mechanical inertia)
  const fs: FaultSmoothState = {
    c2Overheat: lerp(state.faultSmooth.c2Overheat, state.faults.c2Overheat ? 1 : 0, dt * 2.2),
    turboFail: lerp(state.faultSmooth.turboFail, state.faults.turboFail ? 1 : 0, dt * 3.0),
    bearingFail: lerp(state.faultSmooth.bearingFail, state.faults.bearingFail ? 1 : 0, dt * 2.5),
    injectorClog: lerp(state.faultSmooth.injectorClog, state.faults.injectorClog ? 1 : 0, dt * 2.0),
    misfire3: lerp(state.faultSmooth.misfire3, state.faults.misfire3 ? 1 : 0, dt * 3.5),
  };

  // Atmospheric density & Dynamic pressure q = 0.5 * rho * V^2 (in kPa)
  const airDensity = 1.225 * altitudeFactor;
  const speedMs = state.speed * 0.5144;
  const dynamicPressure = (0.5 * airDensity * (speedMs ** 2)) / 1000.0;

  // Directional load vector (Lx, Ly, Lz) from pitch, bank, and speed
  const pitchRad = state.pitchAngle || 0;
  const bankRad = (state.bankAngle || 0) * (Math.PI / 180);
  const Lx = Math.sin(bankRad) * (speedMs / 50.0);
  const Ly = Math.sin(pitchRad) + 1.0;
  const Lz = Math.cos(pitchRad) * (speedMs / 100.0);

  // RPM — scales with throttle and atmospheric altitude density
  let rpm = biomeConfig.baseRPM + thr * 1600 * (0.86 + 0.14 * altitudeFactor);
  rpm += noise(t, 3) * 15;
  // Misfire on cylinder 3 — rough running: RPM surging at combustion frequency
  // plus a slower hunting cycle, exactly like a missing power stroke.
  rpm += fs.misfire3 * (Math.sin(t * 41) * 26 + Math.sin(t * 7.3) * 14);

  // MAP — barometric pressure equation, drops with altitude, turbo compensates.
  // A low-pressure trough region multiplies the manifold pressure down, forcing
  // the turbocharger to spool harder (EGT/CHT rise) exactly like a real trough.
  let map = 18 + thr * 14 * altitudeFactor;
  map *= (1 - fs.turboFail * 0.42);
  map *= region?.params.pressureDelta ?? 1;

  // Injection timing — advance (° BTDC) retarded slightly with load (knock
  // margin), advanced slightly at high RPM; injector clog retards it, and a
  // misfire makes the ECU timing hunt erratically between power strokes.
  const injKnock = fs.misfire3 * (Math.sin(t * 47) * 7 + noise(t, 9) * 9);
  const injectionTiming = 30 - thr * 6 + (rpm > 4000 ? 1.5 : 0) - fs.injectorClog * 3.5 + injKnock;

  // CHT per cylinder — rises with throttle, ambient temp; drops with air density cooling at altitude
  const chtBase = 96 + thr * 96 + ambientTemp * 0.72 - altitudeFactor * 12;
  const cht = [
    chtBase + (fs.c2Overheat * 75) + noise(t, 1) * 3,
    chtBase + (fs.c2Overheat * 122) + noise(t, 2) * 3,
    chtBase + noise(t, 3) * 3 - fs.misfire3 * 16,
    chtBase + noise(t, 4) * 3,
  ];

  // EGT — rises with throttle and ambient, imbalanced by injector clog
  let egt = 528 + thr * 236 + ambientTemp * 0.5;
  egt += fs.injectorClog * 68 + noise(t, 5) * 20;
  egt -= fs.turboFail * 40;

  // Oil — temperature rises with throttle and ambient, pressure inversely proportional
  const oilTemp = 68 + thr * 34 + ambientTemp * 0.5 + fs.c2Overheat * 18;
  const oilPressure = Math.max(1.6, Math.min(6.2, 5.6 - (oilTemp - 90) * 0.012 - fs.c2Overheat * 0.4));

  // Vibration — rises with throttle, spikes smoothly with bearing fault;
  // turbulent region air masses add gust excitation on top.
  let vib = 0.42 + thr * 0.36;
  vib += fs.bearingFail * 1.88 + Math.abs(noise(t, 6)) * 0.5;
  // Misfire knock — sharp combustion-pressure impulses at part load, stronger
  // under load (the classic knock regime of a retarded/hunting timing map).
  vib += fs.misfire3 * 0.72 * (0.6 + thr);
  vib += (region?.params.turbulence ?? 0) * (0.35 + thr * 0.45);

  // Component Stress Indices (0.0 .. 1.0)
  const normCht = cht.map((c) => Math.max(0, Math.min(1, (c - 110) / 110))) as [number, number, number, number];
  const exh3Boost = fs.injectorClog * 0.65;
  const normEgtBase = Math.max(0, Math.min(1, (egt - 550) / 280));
  const exhaustRunners: [number, number, number, number] = [
    Math.min(1, normEgtBase + 0.05),
    Math.min(1, normEgtBase),
    Math.min(1, normEgtBase + exh3Boost),
    Math.min(1, normEgtBase + 0.02),
  ];
  const rudderLoad = Math.abs(state.rudder) * 0.55;
  const turboStress = Math.max(0, Math.min(1, thr * 0.6 + (1 - altitudeFactor) * 0.35 + fs.turboFail * 0.85));
  const crankcaseStress = Math.max(0, Math.min(1, (vib - 0.4) / 1.8 + rudderLoad * 0.45 + fs.bearingFail * 0.75));
  const oilStress = Math.max(0, Math.min(1, Math.abs(oilPressure - 4.5) / 2.5 + (oilTemp - 80) / 50));
  const gearboxStress = Math.max(0, Math.min(1, thr * 0.55 + (speedMs / 100) * 0.3 + rudderLoad * 0.85 + fs.bearingFail * 0.3));
  const overallLoad = Math.max(0, Math.min(1, thr * 0.4 + ((Math.max(...cht) - 130) / 120) * 0.4 + vib * 0.2 + rudderLoad * 0.2));

  const componentStress: ComponentStressState = {
    cylinders: normCht,
    exhaustRunners,
    turbo: turboStress,
    crankcase: crankcaseStress,
    oilSystem: oilStress,
    gearbox: gearboxStress,
    overallLoad,
  };

  // FFT spectrum (64 frequency bins, 0-630 Hz)
  const fftSpectrum = Array.from({ length: 64 }, (_, i) => {
    let val = 0.1 + Math.exp(-i / 12) * 0.3;
    if (i >= 7 && i <= 9) val += 0.4 * thr;
    if (i >= 15 && i <= 17) val += 0.25 * thr;
    if (i >= 23 && i <= 25) val += 0.15 * thr;
    if (i >= 13 && i <= 15) val += fs.bearingFail * 1.6;
    if (i >= 4 && i <= 7) val += fs.misfire3 * 0.8;
    return Math.max(0, Math.min(2, val + noise(t, i + 7) * 0.05));
  });

  const activeFaultFlags: FaultFlags = {
    c2Overheat: fs.c2Overheat > 0.3,
    turboFail: fs.turboFail > 0.3,
    bearingFail: fs.bearingFail > 0.3,
    injectorClog: fs.injectorClog > 0.3,
    misfire3: fs.misfire3 > 0.3,
  };

  const engineDecision = runEngineDecisionEngine({
    altitude: state.altitude,
    ambientTemp,
    ambientDeltaC: atmosphere?.ambientDeltaC ?? 0,
    throttle: state.throttle,
    rpm,
    map,
    cht,
    egt,
    oilPressure,
    oilTemp,
    vibrationRMS: vib,
    fftSpectrum,
    healthIndex: state.healthIndex,
    rul: state.rul,
    anomalyScore: state.anomalyScore,
    faults: activeFaultFlags,
  });

  const healthIndex = engineDecision.overallHealth / 100;

  const newPoint: TelemetryHistoryPoint = {
    time: t,
    chtMax: Math.max(...cht),
    egt,
    map,
    oilTemp,
    oilPressure,
    vibrationRMS: vib,
    health: healthIndex * 100,
  };

  const prevBuffer = state.historyBuffer || [];
  const updatedBuffer = [...prevBuffer.slice(-39), newPoint];


  // Continuous telemetry logging for CSV export
  const activeFaultsStr = Object.entries(activeFaultFlags).filter(([_, v]) => v).map(([k]) => k).join('|') || 'NOMINAL';
  const logEntry: TelemetryLogEntry = {
    timestamp: Number(t.toFixed(2)),
    altitude: Number(state.altitude.toFixed(1)),
    speed: Number(state.speed.toFixed(1)),
    verticalSpeed: Number((state.pitchAngle * 1000).toFixed(1)),
    pitch: Number((state.pitchAngle * 57.3).toFixed(2)),
    roll: Number(state.bankAngle.toFixed(2)),
    heading: Number(state.heading.toFixed(1)),
    throttle: Number(state.throttle.toFixed(1)),
    engineLoad: Number((overallLoad * 100).toFixed(1)),
    rpm: Number(rpm.toFixed(0)),
    map: Number(map.toFixed(1)),
    boost: Number((map * 0.0338639).toFixed(2)),
    cht1: Number((cht[0] ?? 0).toFixed(1)),
    cht2: Number((cht[1] ?? 0).toFixed(1)),
    cht3: Number((cht[2] ?? 0).toFixed(1)),
    cht4: Number((cht[3] ?? 0).toFixed(1)),
    egt1: Number(egt.toFixed(1)),
    egt2: Number(egt.toFixed(1)),
    egt3: Number((egt + (fs.injectorClog > 0.3 ? 68 : 0) - (fs.misfire3 > 0.3 ? 55 : 0)).toFixed(1)),
    egt4: Number(egt.toFixed(1)),
    oilTemp: Number(oilTemp.toFixed(1)),
    oilPressure: Number(oilPressure.toFixed(2)),
    vibrationRMS: Number(vib.toFixed(3)),
    health: Number((healthIndex * 100).toFixed(1)),
    injectionTiming: Number(injectionTiming.toFixed(1)),
    faultState: activeFaultsStr,
  };

  const updatedSessionLogs = [...(state.sessionLogs || []).slice(-499), logEntry];
  const updatedLogs = state.isRecording ? [...state.recordedLogs, logEntry] : state.recordedLogs;

  return {
    rpm, injectionTiming, map, cht, egt, oilPressure, oilTemp,
    vibrationRMS: vib, fftSpectrum,
    airDensity, dynamicPressure, loadVector: [Lx, Ly, Lz], componentStress,
    healthIndex,
    ambientTemp,
    faultSmooth: fs,
    engineDecision,
    historyBuffer: updatedBuffer,
    recordedLogs: updatedLogs,
    sessionLogs: updatedSessionLogs,
  };
}

export const MISSIONS: Record<MissionPreset, {
  biome: Biome;
  altitude: number;
  throttle: number;
  label: string;
  waypoints: { x: number; z: number; label: string }[];
}> = {
  nominalRoutine: {
    biome: 'himalaya', altitude: 6000, throttle: 65,
    label: 'NOMINAL ROUTINE', waypoints: [
      { x: 0, z: 0, label: 'BASE / DEPARTURE' },
      { x: 220, z: -80, label: 'WP-01 SCAN' },
      { x: 420, z: 80, label: 'WP-02 SCAN' },
      { x: 0, z: 0, label: 'BASE / RECOVERY' },
    ],
  },
  highAltitudeFailure: {
    biome: 'himalaya', altitude: 18000, throttle: 88,
    label: 'HIGH ALTITUDE / HIGH TEMP FAILURE',
    waypoints: [
      { x: 0, z: 0, label: 'STAGING' },
      { x: 200, z: 100, label: 'WP-01 SCAN START' },
      { x: 400, z: 50, label: 'WP-02 SCAN ZONE A' },
      { x: 350, z: -100, label: 'WP-03 SCAN ZONE B' },
      { x: 100, z: -150, label: 'WP-04 RTB' },
      { x: 0, z: 0, label: 'BASE / RECOVERY' },
    ],
  },
  coastalRecovery: {
    biome: 'coastal', altitude: 8000, throttle: 70,
    label: 'COASTAL / EXTREME COLD RECOVERY',
    waypoints: [
      { x: 0, z: 0, label: 'NAVAL BASE' },
      { x: 250, z: -150, label: 'WP-01 MARITIME ZONE' },
      { x: 500, z: -100, label: 'WP-02 FAR PATROL' },
      { x: 400, z: 100, label: 'WP-03 COAST LINE' },
      { x: 100, z: 50, label: 'WP-04 RTB' },
      { x: 0, z: 0, label: 'NAVAL BASE / RECOVERY' },
    ],
  },
  himalayaTransect: {
    biome: 'himalaya', altitude: 9500, throttle: 72,
    label: 'HIMALAYA REGION TRANSECT',
    waypoints: [
      { x: 0, z: 0, label: 'BASE / DEPARTURE' },
      { x: 110, z: -35, label: 'CRYO TROUGH CORE' },
      { x: 320, z: 5, label: 'LOW PRESSURE CORE' },
      { x: 420, z: 85, label: 'THERMAL SHEAR CORE' },
      { x: 0, z: 0, label: 'BASE / RECOVERY' },
    ],
  },
  tharTransect: {
    biome: 'thar', altitude: 12000, throttle: 68,
    label: 'THAR REGION TRANSECT',
    waypoints: [
      { x: 0, z: 0, label: 'BASE / DEPARTURE' },
      { x: 150, z: 55, label: 'HEAT BASIN CORE' },
      { x: 320, z: -65, label: 'DUST STORM CORE' },
      { x: 450, z: 100, label: 'MIRAGE UPWELL CORE' },
      { x: 0, z: 0, label: 'BASE / RECOVERY' },
    ],
  },
  coastalTransect: {
    biome: 'coastal', altitude: 8500, throttle: 70,
    label: 'COASTAL REGION TRANSECT',
    waypoints: [
      { x: 0, z: 0, label: 'NAVAL BASE / DEPARTURE' },
      { x: 200, z: -125, label: 'MARITIME DENSE AIR CORE' },
      { x: 450, z: 5, label: 'COLD FRONT CORE' },
      { x: 250, z: 75, label: 'GUST LAYER CORE' },
      { x: 0, z: 0, label: 'NAVAL BASE / RECOVERY' },
    ],
  },
};

/** Every preset ends back at base — finishing when the last waypoint is reached. */
const END_ON_ARRIVAL: MissionPreset[] = ['nominalRoutine', 'highAltitudeFailure', 'coastalRecovery', 'himalayaTransect', 'tharTransect', 'coastalTransect'];

const INITIAL_FAULTS: FaultFlags = { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false, misfire3: false };
const INITIAL_SMOOTH: FaultSmoothState = { c2Overheat: 0, turboFail: 0, bearingFail: 0, injectorClog: 0, misfire3: 0 };
const DEFAULT_STRESS: ComponentStressState = {
  cylinders: [0.2, 0.2, 0.2, 0.2],
  exhaustRunners: [0.2, 0.2, 0.2, 0.2],
  turbo: 0.2, crankcase: 0.2, oilSystem: 0.2, gearbox: 0.2, overallLoad: 0.2,
};

export const useFlightStore = create<FlightState>((set, get) => ({
  x: 0, z: 0, heading: 0, altitude: 6000, speed: 145,
  targetHeading: 0, targetAltitude: 6000, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase',
  throttle: 65, rudder: 0,
  biome: 'himalaya', ambientTemp: -5, baseAmbientTemp: -5,
  rpm: 2400, injectionTiming: 27, cht: [140, 140, 140, 140], egt: 680, map: 93,
  oilPressure: 5.2, oilTemp: 95, vibrationRMS: 0.8,
  fftSpectrum: Array(64).fill(0.2),
  healthIndex: 0.96, rul: 480, anomalyScore: 0.04,
  missionPreset: 'nominalRoutine', missionActive: false, missionProgress: 0, missionElapsed: 0,
  waypoints: MISSIONS.nominalRoutine.waypoints,
  faults: INITIAL_FAULTS,
  faultSmooth: INITIAL_SMOOTH,
  emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
  isDragging: false, dragStartX: 0, dragStartY: 0,
  regions: REGIONS_BY_BIOME.himalaya,
  currentRegion: null,
  regionsInside: [],
  regionAlerts: [],
  pendingRegionAlerts: [],
  pendingSorties: [],
  rtbActive: false,
  demo: { active: false, phase: 'idle', chips: [], report: null, faultInjected: false },
  airDensity: 0.98, dynamicPressure: 1.42, loadVector: [0, 1.0, 0.2],
  componentStress: DEFAULT_STRESS,
  vizMode: 'NORMAL',
  focusedComponent: null,
  isRecording: false,
  recordedLogs: [],
  sessionLogs: [],
  isReplaying: false,
  replayIndex: 0,
  engineDecision: null,
  selectedSubsystem: 'CYLINDER HEAD (ROTAX RED)',
  historyBuffer: [],
  weather: null,
  plannerMode: false,
  evadePath: [],
  evadeIndex: 0,
  regionMode: 'cruise',
  regionModeText: null,
  transitEcoThrottle: null,

  setThrottle: (v) => set({ throttle: Math.max(0, Math.min(100, v)) }),
  setRudder: (v) => set({ rudder: Math.max(-1, Math.min(1, v)) }),
  setTargetHeading: (h) => set({ targetHeading: mod(h, 360) }),
  setTargetAltitude: (a) => set({ targetAltitude: Math.max(500, Math.min(30000, a)) }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setBiome: (b) =>
    set((st) => ({
      biome: b,
      ambientTemp: BIOME_CONFIG[b].ambientTemp,
      baseAmbientTemp: BIOME_CONFIG[b].ambientTemp,
      currentRegion: null,
      regionsInside: [],
      regions: st.weather ? applyWeatherToRegions(REGIONS_BY_BIOME[b], st.weather) : REGIONS_BY_BIOME[b],
    })),
  setSelectedSubsystem: (name) => set({ selectedSubsystem: name }),
  setVizMode: (mode) => set({ vizMode: mode }),
  setFocusedComponent: (comp) => set({ focusedComponent: comp }),
  toggleRecording: () => set((s) => ({ isRecording: !s.isRecording })),
  clearLogs: () => set({ recordedLogs: [] }),
  exportCSV: () => {
    const state = get();
    let logsToExport = state.recordedLogs;

    // Fallback 1: If user didn't hit REC TELEMETRY, export session logs
    if (!logsToExport || logsToExport.length === 0) {
      logsToExport = state.sessionLogs || [];
    }

    // Fallback 2: If session logs empty, construct snapshot from current flight state
    if (!logsToExport || logsToExport.length === 0) {
      const activeFaultsStr = Object.entries(state.faults || {}).filter(([_, v]) => v).map(([k]) => k).join('|') || 'NOMINAL';
      logsToExport = [{
        timestamp: Number((state.missionElapsed || 0).toFixed(2)),
        altitude: Number((state.altitude || 0).toFixed(1)),
        speed: Number((state.speed || 0).toFixed(1)),
        verticalSpeed: Number(((state.pitchAngle || 0) * 1000).toFixed(1)),
        pitch: Number(((state.pitchAngle || 0) * 57.3).toFixed(2)),
        roll: Number((state.bankAngle || 0).toFixed(2)),
        heading: Number((state.heading || 0).toFixed(1)),
        throttle: Number((state.throttle || 0).toFixed(1)),
        engineLoad: 50.0,
        rpm: Number((state.rpm || 2400).toFixed(0)),
        injectionTiming: Number((state.injectionTiming || 27).toFixed(1)),
        map: Number((state.map || 93).toFixed(1)),
        boost: Number(((state.map || 93) * 0.0338639).toFixed(2)),
        cht1: Number((state.cht?.[0] ?? 140).toFixed(1)),
        cht2: Number((state.cht?.[1] ?? 140).toFixed(1)),
        cht3: Number((state.cht?.[2] ?? 140).toFixed(1)),
        cht4: Number((state.cht?.[3] ?? 140).toFixed(1)),
        egt1: Number((state.egt || 680).toFixed(1)),
        egt2: Number((state.egt || 680).toFixed(1)),
        egt3: Number((state.egt || 680).toFixed(1)),
        egt4: Number((state.egt || 680).toFixed(1)),
        oilTemp: Number((state.oilTemp || 95).toFixed(1)),
        oilPressure: Number((state.oilPressure || 5.2).toFixed(2)),
        vibrationRMS: Number((state.vibrationRMS || 0.8).toFixed(3)),
        health: Number(((state.healthIndex || 0.95) * 100).toFixed(1)),
        faultState: activeFaultsStr,
      }];
    }

    const blob = new Blob([serializeTelemetryLogs(logsToExport)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AERIS_TWIN_Telemetry_Export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  startReplay: () => set({ isReplaying: true, replayIndex: 0 }),
  stopReplay: () => set({ isReplaying: false }),
  syncLiveWeather: (obs) =>
    set((st) => ({
      weather: obs,
      regions: applyWeatherToRegions(REGIONS_BY_BIOME[st.biome], obs),
    })),
  clearLiveWeather: () =>
    set((st) => ({
      weather: null,
      regions: REGIONS_BY_BIOME[st.biome],
    })),
  clearPendingRegionAlerts: () => set({ pendingRegionAlerts: [] }),
  queueSortie: (rec) => set((st) => ({ pendingSorties: [...(st.pendingSorties ?? []), rec].slice(-4) })),
  clearPendingSorties: () => set({ pendingSorties: [] }),
  triggerRtb: () =>
    set((s2) => ({
      rtbActive: true,
      throttle: Math.min(s2.throttle, 55),
      systemMessage: 'MAYDAY RTB COMMAND ACCEPTED — RETURNING TO BASE AT REDUCED POWER',
    })),
  updateDemo: (patch) => set((s2) => ({ demo: { ...s2.demo, ...patch } })),
  setMissionPreset: (p) => {
    const mission = MISSIONS[p];
    const scenarioFaults: FaultFlags = p === 'highAltitudeFailure'
      ? { c2Overheat: true, turboFail: true, bearingFail: false, injectorClog: false, misfire3: false }
      : INITIAL_FAULTS;
    const wx = get().weather;
    set({
      x: 0, z: 0, heading: 0, targetHeading: 0,
      altitude: mission.altitude, targetAltitude: mission.altitude,
      speed: 145, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase',
      currentRegion: null, regionsInside: [],
      regions: wx ? applyWeatherToRegions(REGIONS_BY_BIOME[mission.biome], wx) : REGIONS_BY_BIOME[mission.biome],
      missionPreset: p,
      biome: mission.biome,
      ambientTemp: p === 'highAltitudeFailure' ? 42 : p === 'coastalRecovery' ? -25 : BIOME_CONFIG[mission.biome].ambientTemp,
      baseAmbientTemp: p === 'highAltitudeFailure' ? 42 : p === 'coastalRecovery' ? -25 : BIOME_CONFIG[mission.biome].ambientTemp,
      throttle: mission.throttle,
      waypoints: mission.waypoints,
      missionActive: false,
      missionProgress: 0,
      missionElapsed: 0,
      faults: scenarioFaults,
      faultSmooth: INITIAL_SMOOTH,
      emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
      evadePath: [], evadeIndex: 0, regionMode: 'cruise' as const, regionModeText: null, transitEcoThrottle: null, rtbActive: false,
    });
  },
  startMission: () => set({ missionActive: true, missionProgress: 0, missionElapsed: 0, emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null, plannerMode: false, evadePath: [], evadeIndex: 0, regionMode: 'cruise', regionModeText: null, transitEcoThrottle: null, rtbActive: false }),
  setDragging: (d, sx, sy) => set({ isDragging: d, dragStartX: sx ?? 0, dragStartY: sy ?? 0 }),
  setPlannerMode: (on) => set({ plannerMode: on }),
  addWaypoint: (x, z) =>
    set((s) => {
      if (s.missionActive) return {};
      const label = `WP-${String(s.waypoints.length).padStart(2, '0')} PLAN`;
      return { waypoints: [...s.waypoints, { x, z, label }] };
    }),
  moveWaypoint: (index, x, z) =>
    set((s) => {
      if (s.missionActive || index < 0 || index >= s.waypoints.length) return {};
      const waypoints = s.waypoints.map((wp, i) => (i === index ? { ...wp, x, z } : wp));
      return { waypoints };
    }),
  removeWaypoint: (index) =>
    set((s) => {
      if (s.missionActive || s.waypoints.length <= 2 || index < 0 || index >= s.waypoints.length) return {};
      return { waypoints: s.waypoints.filter((_, i) => i !== index) };
    }),
  resetRoute: () => set((s) => ({ waypoints: MISSIONS[s.missionPreset].waypoints })),
  toggleFault: (fault) => set((s) => ({
    faults: { ...s.faults, [fault]: !s.faults[fault] },
  })),
  resetFaults: () => set({
    faults: INITIAL_FAULTS,
    faultSmooth: INITIAL_SMOOTH,
  }),
  resetSimulation: () => {
    const wx = get().weather;
    set({
    x: 0, z: 0, heading: 0, targetHeading: 0, altitude: 6000, targetAltitude: 6000,
    speed: 145, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase', throttle: 65, rudder: 0,
    missionPreset: 'nominalRoutine', biome: 'himalaya', ambientTemp: -5, baseAmbientTemp: -5,
    currentRegion: null, regionsInside: [],
    regions: wx ? applyWeatherToRegions(REGIONS_BY_BIOME.himalaya, wx) : REGIONS_BY_BIOME.himalaya,
    missionActive: false, missionProgress: 0, missionElapsed: 0,
    waypoints: MISSIONS.nominalRoutine.waypoints,
    faults: INITIAL_FAULTS,
    faultSmooth: INITIAL_SMOOTH,
    emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
    evadePath: [], evadeIndex: 0, regionMode: 'cruise', regionModeText: null, transitEcoThrottle: null, rtbActive: false,
  });
    },

  tick: (dt) => set((state) => {
    if (state.emergencyState === 'crashed') return state;

    // Effective navigation goal (detour point or mission waypoint) — used to
    // tighten the turn near a waypoint so the UAV can actually capture it
    // (with a bounded turn rate a pure chase orbits any point closer than its
    // minimum turn radius and never arrives).
    let goalProbe: { x: number; z: number } | null = null;
    if (state.missionActive && state.waypoints.length > 0 && state.emergencyState === 'nominal' && !state.isDragging) {
      const gIdx = Math.min(Math.floor(state.missionProgress), state.waypoints.length - 1);
      const gwp = state.waypoints[gIdx];
      if (state.evadePath.length > 0) {
        const seg = state.evadePath[Math.min(state.evadeIndex, state.evadePath.length - 1)];
        if (seg) goalProbe = seg;
      } else if (gwp) {
        goalProbe = { x: gwp.x, z: gwp.z };
      }
    }
    const dGoal = goalProbe ? Math.hypot(state.x - goalProbe.x, state.z - goalProbe.z) : Infinity;
    // Up to 165 deg/s when the goal is right on top of the aircraft — shrinks
    // the achievable turn radius below the capture gate.
    const turnRate = goalProbe ? 30 + Math.max(0, 165 - (dGoal * 165) / 260) : 30; // deg/s max
    const hdgDiff = angleDiff(state.targetHeading, state.heading);
    const turn = Math.sign(hdgDiff) * Math.min(Math.abs(hdgDiff), turnRate * dt);

    let hdg = mod(state.heading + turn + state.rudder * 60 * dt, 360);
    const bankAngle = Math.max(-35, Math.min(35, hdgDiff * 0.8));

    const altDiff = state.targetAltitude - state.altitude;
    const climbRate = 800 * dt;
    let alt = state.altitude + Math.sign(altDiff) * Math.min(Math.abs(altDiff), climbRate);
    alt = Math.max(500, Math.min(30000, alt));

    const altitudeFactor = Math.exp(-alt / 27000);
    let speed = 40 + (state.throttle / 100) * 160 * (0.7 + 0.3 * altitudeFactor);
    // Route completed at base → park: no more drift after landing.
    if (!state.missionActive && state.emergencyState === 'nominal' &&
        state.waypoints.length > 0 && state.missionProgress >= state.waypoints.length) {
      speed = 0;
    }
    // Speed damping inside the capture horizon — keeps the waypoint within
    // reach of the banked turn instead of being orbited at min-turn radius.
    if (dGoal < 120) {
      speed = Math.max(14, speed * (0.22 + 0.78 * (dGoal / 120)));
    }

    const missionElapsed = state.missionElapsed + (state.missionActive ? dt : 0);
    const highAltitudeFailure = state.missionPreset === 'highAltitudeFailure' && state.missionActive;
    const coastalRecovery = state.missionPreset === 'coastalRecovery' && state.missionActive;
    const stallProgress = highAltitudeFailure ? Math.max(0, Math.min(1, (missionElapsed - 3) / 5)) : 0;
    const coldProgress = coastalRecovery ? Math.max(0, Math.min(1, (missionElapsed - 2) / 5)) : 0;
    const failureProgress = highAltitudeFailure ? Math.max(0, Math.min(1, (missionElapsed - 5) / 8)) : 0;
    speed *= Math.max(0, 1 - stallProgress * 0.88 - coldProgress * 0.65);

    const speedMs = speed * 0.5144;
    const headingRad = (hdg * Math.PI) / 180;
    const dx = Math.sin(headingRad) * speedMs * dt;
    const dz = -Math.cos(headingRad) * speedMs * dt;
    const x = state.x + dx;
    const z = state.z + dz;

    // ---- Atmospheric region enter/exit detection (active, weather-deformed set) ----
    const activeRegions = state.regions ?? REGIONS_BY_BIOME[state.biome];
    const insideIds = activeRegions
      .filter((r) => { const rx = x - r.cx; const rz = z - r.cz; return rx * rx + rz * rz < r.radius * r.radius; })
      .map((r) => r.id);
    const prevInside = state.regionsInside ?? [];
    const enteredIds = insideIds.filter((id) => !prevInside.includes(id));
    const exitedIds = prevInside.filter((id) => !insideIds.includes(id));
    const newAlerts: RegionAlert[] = [];
    for (const id of enteredIds) {
      const r = activeRegions.find((rr) => rr.id === id) ?? regionById(id);
      if (!r) continue;
      newAlerts.push({
        id: `${id}-${Math.floor(performance.now())}`, regionId: r.id, name: r.name,
        severity: r.severity, event: 'ENTER', text: r.advisory,
        tempDeltaC: r.params.tempDeltaC, densityRatio: r.params.densityRatio,
        pressureDelta: r.params.pressureDelta, turbulence: r.params.turbulence, at: Date.now(),
      });
    }
    for (const id of exitedIds) {
      const r = activeRegions.find((rr) => rr.id === id) ?? regionById(id);
      if (!r) continue;
      newAlerts.push({
        id: `${id}-${Math.floor(performance.now())}`, regionId: r.id, name: r.name,
        severity: 'info', event: 'EXIT', text: `UAV LEFT ${r.name} — CONDITIONS NORMALIZING`,
        tempDeltaC: r.params.tempDeltaC, densityRatio: r.params.densityRatio,
        pressureDelta: r.params.pressureDelta, turbulence: r.params.turbulence, at: Date.now(),
      });
    }

    const terrainY = terrainHeightAt(x, z, state.biome);
    const terrainAltitude = Math.max(500, ((terrainY + 1 - 2.5) / 0.0015) + 350);
    if (state.emergencyState === 'nominal' && alt < terrainAltitude) alt = terrainAltitude;

    const rul = Math.max(0, state.rul - dt * 0.01);
    const anomalyScore = Math.min(1, state.anomalyScore + (state.faults.c2Overheat ? 0.001 : 0) +
      (state.faults.bearingFail ? 0.002 : 0) + (state.faults.turboFail ? 0.0015 : 0) +
      (state.faults.misfire3 ? 0.0012 : 0) + (coldProgress * 0.003));

    const engineUpdates = updateEngineTelemetry({ ...state, x, z, heading: hdg, altitude: alt, speed, anomalyScore }, dt);
    engineUpdates.rpm = (engineUpdates.rpm ?? state.rpm) * (1 - stallProgress * 0.8 - coldProgress * 0.45);
    engineUpdates.healthIndex = Math.max(0, Math.min(1, (engineUpdates.healthIndex ?? state.healthIndex) * (1 - failureProgress)));

    let missionProgress = state.missionProgress;
    let newTargetHeading = state.targetHeading;
    let newTargetAltitude = state.targetAltitude;
    let missionActive = state.missionActive;
    let systemMessage = state.systemMessage;
    let emergencyState: EmergencyState = state.emergencyState;
    let emergencyTimer = state.emergencyTimer;
    let crashCoordinates = state.crashCoordinates;

    // Region-adaptive autopilot state (evade / optimal-transit).
    let evadePath = state.evadePath ?? [];
    let evadeIndex = state.evadeIndex ?? 0;
    let regionMode: 'cruise' | 'evade' | 'transit' = state.regionMode ?? 'cruise';
    let regionModeText: string | null = state.regionModeText ?? null;
    let transitEcoThrottle: number | null = state.transitEcoThrottle ?? null;
    let finalThrottle = state.throttle;
    let rtbActive = state.rtbActive;

    if (state.emergencyState === 'nominal' && alt > state.targetAltitude) {
      newTargetAltitude = Math.max(newTargetAltitude, alt);
    }
    if (state.missionActive && state.waypoints.length > 0 && state.emergencyState === 'nominal' && !state.isDragging) {
      const wpIdx = Math.min(Math.floor(missionProgress), state.waypoints.length - 1);
      const wp = state.waypoints[wpIdx];
      if (wp) {
        if (rtbActive) {
          // MAYDAY RTB: ignore waypoint order and fly straight home to base.
          const home = state.waypoints[0] ?? { x: 0, z: 0 };
          const dHome = Math.hypot(x - home.x, z - home.z);
          if (dHome < 30) {
            missionActive = false;
            rtbActive = false;
            emergencyState = 'recovery';
            emergencyTimer = 0;
            systemMessage = 'MAYDAY RTB COMPLETE — UAV RECOVERED AT BASE · POST-FLIGHT INSPECTION QUEUED';
          } else {
            newTargetHeading = mod((Math.atan2(home.x - x, -(home.z - z)) * 180 / Math.PI) + 360, 360);
          }
        } else {
          // -- follow any active evade detour first --
          let goal = wp;
        if (evadePath.length > 0) {
          const seg = evadePath[Math.min(evadeIndex, evadePath.length - 1)];
          if (seg) goal = seg as typeof wp;
          if (Math.hypot(x - goal.x, z - goal.z) < 26) {
            if (evadeIndex >= evadePath.length - 1) {
              // detour finished — resume the straight mission leg
              evadePath = [];
              evadeIndex = 0;
              regionMode = 'cruise';
              regionModeText = null;
              goal = wp;
            } else {
              evadeIndex += 1;
            }
          }
        }

        const distWp = Math.sqrt((x - wp.x) ** 2 + (z - wp.z) ** 2);
        if (distWp < 30) {
          missionProgress = Math.min(state.waypoints.length, missionProgress + 1);
          evadePath = [];
          evadeIndex = 0;
          if (missionProgress >= state.waypoints.length && END_ON_ARRIVAL.includes(state.missionPreset)) {
            missionActive = false;
            regionMode = 'cruise';
            regionModeText = null;
            systemMessage = `${MISSIONS[state.missionPreset]?.label ?? 'MISSION'} COMPLETE — ALL WAYPOINTS SURVEYED · UAV RETURNED TO BASE`;
          }
        } else if (evadePath.length === 0) {
          // ---- an alternate path exists only while we are still OUTSIDE the ring ----
          const threats = legThreats({ x, z }, { x: wp.x, z: wp.z }, activeRegions);
          const threat = threats.find((t) => t.entryT > 0.001 && ringPenetration(x, z, wp.x, wp.z, t.region) >= 5);
          if (threat) {
            const ex = x + (wp.x - x) * threat.entryT;
            const ez = z + (wp.z - z) * threat.entryT;
            const dEntry = Math.hypot(ex - x, ez - z);
            if (dEntry < 170 && !insideIds.includes(threat.region.id)) {
              const esc = planEscape(x, z, wp.x, wp.z, threat.region, activeRegions);
              if (esc && esc.length > 0) {
                evadePath = esc;
                evadeIndex = 0;
                regionMode = 'evade';
                regionModeText = `ALTERNATE PATH FOUND — DIVERTING AROUND ${threat.region.name} (${Math.round(dEntry)}M TO BOUNDARY)`;
              }
            }
            const wpInside = pointInRegion(wp.x, wp.z, threat.region);
            if (wpInside) {
              // waypoint itself sits in the zone: no alternate route exists —
              // the aircraft will transit it under optimal conditions.
              regionModeText = `NO ALTERNATE ROUTE — ${threat.region.name} IS THE MISSION TARGET · OPTIMAL TRANSIT ON ENTRY`;
            }
          }
          // re-read the goal after a possible detour was planned
          const seg = evadePath.length > 0 ? evadePath[Math.min(evadeIndex, evadePath.length - 1)] : null;
          if (seg) goal = seg as typeof wp;
        }

        // ---- optimal-condition transit while inside an unavoidable zone ----
        if (evadePath.length === 0) {
          const insideThreat = activeRegions.find((r) => r.severity !== 'info' && insideIds.includes(r.id));
          if (insideThreat) {
            regionMode = 'transit';
            if (transitEcoThrottle === null) {
              transitEcoThrottle = state.throttle;
              regionModeText = `NO ALTERNATE ROUTE — TRANSITING ${insideThreat.name} AT OPTIMAL POWER · THROTTLE REDUCED TO ${Math.min(state.throttle, 58)}%`;
            }
            finalThrottle = Math.min(finalThrottle, 58);
          } else if (regionMode === 'transit') {
            regionMode = 'cruise';
            regionModeText = null;
            if (transitEcoThrottle !== null) {
              finalThrottle = Math.min(100, transitEcoThrottle);
              transitEcoThrottle = null;
            }
          }
        }

          const dx = goal.x - x;
          const dz = goal.z - z;
          if (Math.hypot(dx, dz) > 0.5) {
            newTargetHeading = mod((Math.atan2(dx, -dz) * 180 / Math.PI) + 360, 360);
          }
        }
      }
    }

    const healthIndex = engineUpdates.healthIndex ?? state.healthIndex;
    const coordinates = {
      lat: 28.6139 + x * 0.00001,
      lon: 77.209 + z * 0.00001,
      x,
      z,
      altitude: alt,
    };

    if (healthIndex <= 0 && emergencyState === 'nominal') {
      emergencyState = 'forcedLanding';
      emergencyTimer = 0;
      missionActive = false;
      newTargetAltitude = 500;
      systemMessage = `ENGINE HEALTH 0% — EMERGENCY LANDING INITIATED AT ${coordinates.lat.toFixed(5)}°N, ${coordinates.lon.toFixed(5)}°E`;
    }

    let finalAltitude = alt;
    let finalSpeed = speed;
    if (emergencyState === 'forcedLanding') {
      emergencyTimer += dt;
      finalAltitude = Math.max(500, alt - 2200 * dt);
      finalSpeed = Math.max(0, speed * Math.max(0, 1 - emergencyTimer / 10));
      newTargetAltitude = 500;
      const impactAltitude = Math.max(500, terrainAltitude);
      if (finalAltitude <= impactAltitude || emergencyTimer > 12) {
        emergencyState = 'crashed';
        finalAltitude = impactAltitude;
        finalSpeed = 0;
        crashCoordinates = { ...coordinates, altitude: finalAltitude };
        systemMessage = `CRASH CONFIRMED — MAINTENANCE TEAM ALERTED · ${coordinates.lat.toFixed(5)}°N, ${coordinates.lon.toFixed(5)}°E`;
      }
    } else if (coastalRecovery && missionElapsed >= 5 && emergencyState === 'nominal') {
      emergencyState = 'recovery';
      missionActive = false;
      emergencyTimer = 0;
      newTargetAltitude = 1800;
      systemMessage = `PREDICTIVE ABORT — TURBINE ICE DETECTED AT ${coordinates.lat.toFixed(5)}°N, ${coordinates.lon.toFixed(5)}°E · RECOVERY ROUTE ACTIVE`;
    } else if (emergencyState === 'recovery') {
      // Predictive abort engaged: fly the aircraft home to the base waypoint at
      // a safe 1800 ft cruise instead of drifting — a real RTB leg.
      finalAltitude = Math.max(1800, alt - 700 * dt);
      finalSpeed = Math.max(60, speed);
      newTargetAltitude = 1800;
      const home = state.waypoints[0] ?? { x: 0, z: 0 };
      const dHome = Math.hypot(x - home.x, z - home.z);
      if (dHome < 30) {
        finalSpeed = 0;
        systemMessage = 'PREDICTIVE-ABORT RECOVERY COMPLETE — UAV RECOVERED AT BASE · POST-FLIGHT INSPECTION QUEUED';
      } else {
        newTargetHeading = mod((Math.atan2(home.x - x, -(home.z - z)) * 180 / Math.PI) + 360, 360);
      }
    }

    const regionEntered = newAlerts.find((a) => a.event === 'ENTER');
    return {
      x, z, heading: hdg, altitude: finalAltitude, speed: finalSpeed,
      targetHeading: newTargetHeading,
      targetAltitude: newTargetAltitude,
      bankAngle, pitchAngle: Math.max(-0.35, Math.min(0.35, altDiff * 0.00012)),
      rul, anomalyScore, missionProgress, missionActive, missionElapsed,
      emergencyState, emergencyTimer, crashCoordinates,
      rtbActive,
      systemMessage:
        regionModeText && state.emergencyState === 'nominal'
          ? regionModeText
          : regionEntered && state.emergencyState === 'nominal' && !systemMessage
            ? regionEntered.text
            : systemMessage,
      currentRegion: regionAtList(x, z, activeRegions),
      regionsInside: insideIds,
      regionAlerts: [...newAlerts, ...(state.regionAlerts ?? [])].slice(0, 12),
      pendingRegionAlerts: [...(state.pendingRegionAlerts ?? []), ...newAlerts].slice(0, 20),
      ...engineUpdates,
      throttle: finalThrottle,
      evadePath,
      evadeIndex,
      regionMode,
      regionModeText,
      transitEcoThrottle,
    };
  }),
}));
