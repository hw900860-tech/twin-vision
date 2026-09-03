import { create } from 'zustand';
import { terrainHeightAt } from './terrainMath';
import { runEngineDecisionEngine, type EngineDecisionResult, type SubsystemStatus } from '../digital-twin/engineMlService';
import { sampleAtmosphere, type WeatherObservation } from '@/lib/domain/engine/environment';
import { serializeTelemetryLogs } from '@/lib/flight-analysis/sessionCsv';

export type Biome = 'himalaya' | 'thar' | 'coastal';
export type MissionPreset = 'nominalRoutine' | 'highAltitudeFailure' | 'coastalRecovery';
export type EmergencyState = 'nominal' | 'forcedLanding' | 'crashed' | 'recovery';
export type CameraMode = 'chase' | 'birdseye';

export interface CrashCoordinates {
  lat: number;
  lon: number;
  x: number;
  z: number;
  altitude: number;
}

export interface FaultFlags {
  c2Overheat: boolean;
  turboFail: boolean;
  bearingFail: boolean;
  injectorClog: boolean;
}

export interface FaultSmoothState {
  c2Overheat: number;
  turboFail: number;
  bearingFail: number;
  injectorClog: number;
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
  rpm: number;
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
  const ambientTemp = atmosphere ? atmosphere.oatC : state.ambientTemp;
  const altitudeFactor = atmosphere ? atmosphere.densityRatio : Math.exp(-state.altitude / 27000);

  // Smooth fault intensity lerping (thermal and mechanical inertia)
  const fs: FaultSmoothState = {
    c2Overheat: lerp(state.faultSmooth.c2Overheat, state.faults.c2Overheat ? 1 : 0, dt * 2.2),
    turboFail: lerp(state.faultSmooth.turboFail, state.faults.turboFail ? 1 : 0, dt * 3.0),
    bearingFail: lerp(state.faultSmooth.bearingFail, state.faults.bearingFail ? 1 : 0, dt * 2.5),
    injectorClog: lerp(state.faultSmooth.injectorClog, state.faults.injectorClog ? 1 : 0, dt * 2.0),
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

  // MAP — barometric pressure equation, drops with altitude, turbo compensates
  let map = 18 + thr * 14 * altitudeFactor;
  map *= (1 - fs.turboFail * 0.42);

  // CHT per cylinder — rises with throttle, ambient temp; drops with air density cooling at altitude
  const chtBase = 96 + thr * 96 + ambientTemp * 0.72 - altitudeFactor * 12;
  const cht = [
    chtBase + (fs.c2Overheat * 75) + noise(t, 1) * 3,
    chtBase + (fs.c2Overheat * 122) + noise(t, 2) * 3,
    chtBase + noise(t, 3) * 3,
    chtBase + noise(t, 4) * 3,
  ];

  // EGT — rises with throttle and ambient, imbalanced by injector clog
  let egt = 528 + thr * 236 + ambientTemp * 0.5;
  egt += fs.injectorClog * 68 + noise(t, 5) * 20;
  egt -= fs.turboFail * 40;

  // Oil — temperature rises with throttle and ambient, pressure inversely proportional
  const oilTemp = 68 + thr * 34 + ambientTemp * 0.5 + fs.c2Overheat * 18;
  const oilPressure = Math.max(1.6, Math.min(6.2, 5.6 - (oilTemp - 90) * 0.012 - fs.c2Overheat * 0.4));

  // Vibration — rises with throttle, spikes smoothly with bearing fault
  let vib = 0.42 + thr * 0.36;
  vib += fs.bearingFail * 1.88 + Math.abs(noise(t, 6)) * 0.5;

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
    return Math.max(0, Math.min(2, val + noise(t, i + 7) * 0.05));
  });

  const activeFaultFlags: FaultFlags = {
    c2Overheat: fs.c2Overheat > 0.3,
    turboFail: fs.turboFail > 0.3,
    bearingFail: fs.bearingFail > 0.3,
    injectorClog: fs.injectorClog > 0.3,
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
    egt3: Number((egt + (fs.injectorClog > 0.3 ? 68 : 0)).toFixed(1)),
    egt4: Number(egt.toFixed(1)),
    oilTemp: Number(oilTemp.toFixed(1)),
    oilPressure: Number(oilPressure.toFixed(2)),
    vibrationRMS: Number(vib.toFixed(3)),
    health: Number((healthIndex * 100).toFixed(1)),
    faultState: activeFaultsStr,
  };

  const updatedSessionLogs = [...(state.sessionLogs || []).slice(-499), logEntry];
  const updatedLogs = state.isRecording ? [...state.recordedLogs, logEntry] : state.recordedLogs;

  return {
    rpm, map, cht, egt, oilPressure, oilTemp,
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

const MISSIONS: Record<MissionPreset, {
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
    ],
  },
};

const INITIAL_FAULTS: FaultFlags = { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false };
const INITIAL_SMOOTH: FaultSmoothState = { c2Overheat: 0, turboFail: 0, bearingFail: 0, injectorClog: 0 };
const DEFAULT_STRESS: ComponentStressState = {
  cylinders: [0.2, 0.2, 0.2, 0.2],
  exhaustRunners: [0.2, 0.2, 0.2, 0.2],
  turbo: 0.2, crankcase: 0.2, oilSystem: 0.2, gearbox: 0.2, overallLoad: 0.2,
};

export const useFlightStore = create<FlightState>((set, get) => ({
  x: 0, z: 0, heading: 0, altitude: 6000, speed: 145,
  targetHeading: 0, targetAltitude: 6000, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase',
  throttle: 65, rudder: 0,
  biome: 'himalaya', ambientTemp: -5,
  rpm: 2400, cht: [140, 140, 140, 140], egt: 680, map: 93,
  oilPressure: 5.2, oilTemp: 95, vibrationRMS: 0.8,
  fftSpectrum: Array(64).fill(0.2),
  healthIndex: 0.96, rul: 480, anomalyScore: 0.04,
  missionPreset: 'nominalRoutine', missionActive: false, missionProgress: 0, missionElapsed: 0,
  waypoints: MISSIONS.nominalRoutine.waypoints,
  faults: INITIAL_FAULTS,
  faultSmooth: INITIAL_SMOOTH,
  emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
  isDragging: false, dragStartX: 0, dragStartY: 0,
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

  setThrottle: (v) => set({ throttle: Math.max(0, Math.min(100, v)) }),
  setRudder: (v) => set({ rudder: Math.max(-1, Math.min(1, v)) }),
  setTargetHeading: (h) => set({ targetHeading: mod(h, 360) }),
  setTargetAltitude: (a) => set({ targetAltitude: Math.max(500, Math.min(30000, a)) }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setBiome: (b) => set({ biome: b, ambientTemp: BIOME_CONFIG[b].ambientTemp }),
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
  syncLiveWeather: (obs) => set({ weather: obs }),
  clearLiveWeather: () => set({ weather: null }),
  setMissionPreset: (p) => {
    const mission = MISSIONS[p];
    const scenarioFaults: FaultFlags = p === 'highAltitudeFailure'
      ? { c2Overheat: true, turboFail: true, bearingFail: false, injectorClog: false }
      : INITIAL_FAULTS;
    set({
      x: 0, z: 0, heading: 0, targetHeading: 0,
      altitude: mission.altitude, targetAltitude: mission.altitude,
      speed: 145, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase',
      missionPreset: p,
      biome: mission.biome,
      ambientTemp: p === 'highAltitudeFailure' ? 42 : p === 'coastalRecovery' ? -25 : BIOME_CONFIG[mission.biome].ambientTemp,
      throttle: mission.throttle,
      waypoints: mission.waypoints,
      missionActive: false,
      missionProgress: 0,
      missionElapsed: 0,
      faults: scenarioFaults,
      faultSmooth: INITIAL_SMOOTH,
      emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
    });
  },
  startMission: () => set({ missionActive: true, missionProgress: 0, missionElapsed: 0, emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null }),
  setDragging: (d, sx, sy) => set({ isDragging: d, dragStartX: sx ?? 0, dragStartY: sy ?? 0 }),
  toggleFault: (fault) => set((s) => ({
    faults: { ...s.faults, [fault]: !s.faults[fault] },
  })),
  resetFaults: () => set({
    faults: INITIAL_FAULTS,
    faultSmooth: INITIAL_SMOOTH,
  }),
  resetSimulation: () => set({
    x: 0, z: 0, heading: 0, targetHeading: 0, altitude: 6000, targetAltitude: 6000,
    speed: 145, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase', throttle: 65, rudder: 0,
    missionPreset: 'nominalRoutine', biome: 'himalaya', ambientTemp: -5,
    missionActive: false, missionProgress: 0, missionElapsed: 0,
    waypoints: MISSIONS.nominalRoutine.waypoints,
    faults: INITIAL_FAULTS,
    faultSmooth: INITIAL_SMOOTH,
    emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
  }),

  tick: (dt) => set((state) => {
    if (state.emergencyState === 'crashed') return state;

    const turnRate = 30; // deg/s max
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
    const terrainY = terrainHeightAt(x, z, state.biome);
    const terrainAltitude = Math.max(500, ((terrainY + 1 - 2.5) / 0.0015) + 350);
    if (state.emergencyState === 'nominal' && alt < terrainAltitude) alt = terrainAltitude;

    const rul = Math.max(0, state.rul - dt * 0.01);
    const anomalyScore = Math.min(1, state.anomalyScore + (state.faults.c2Overheat ? 0.001 : 0) +
      (state.faults.bearingFail ? 0.002 : 0) + (state.faults.turboFail ? 0.0015 : 0) + (coldProgress * 0.003));

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
    if (state.emergencyState === 'nominal' && alt > state.targetAltitude) {
      newTargetAltitude = Math.max(newTargetAltitude, alt);
    }
    if (state.missionActive && state.waypoints.length > 0 && state.emergencyState === 'nominal') {
      const wpIdx = Math.min(Math.floor(missionProgress), state.waypoints.length - 1);
      const wp = state.waypoints[wpIdx];
      if (wp) {
        const dist = Math.sqrt((x - wp.x) ** 2 + (z - wp.z) ** 2);
        if (dist < 30) {
          missionProgress = Math.min(state.waypoints.length, missionProgress + 1);
          if (missionProgress >= state.waypoints.length && state.missionPreset === 'nominalRoutine') {
            missionActive = false;
            systemMessage = 'NOMINAL ROUTINE COMPLETE — UAV RETURNED SAFELY TO BASE';
          }
        } else {
          const dx = wp.x - x;
          const dz = wp.z - z;
          newTargetHeading = mod((Math.atan2(dx, -dz) * 180 / Math.PI) + 360, 360);
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
      finalAltitude = Math.max(1800, alt - 700 * dt);
      finalSpeed = Math.max(35, speed);
      newTargetAltitude = 1800;
    }

    return {
      x, z, heading: hdg, altitude: finalAltitude, speed: finalSpeed,
      targetHeading: newTargetHeading,
      targetAltitude: newTargetAltitude,
      bankAngle, pitchAngle: Math.max(-0.35, Math.min(0.35, altDiff * 0.00012)),
      rul, anomalyScore, missionProgress, missionActive, missionElapsed,
      emergencyState, emergencyTimer, crashCoordinates, systemMessage,
      ...engineUpdates,
    };
  }),
}));
