import { create } from 'zustand';
import { terrainHeightAt } from './terrainMath';

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
  emergencyState: EmergencyState;
  emergencyTimer: number;
  crashCoordinates: CrashCoordinates | null;
  systemMessage: string | null;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
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
  tick: (dt: number) => void;
}

const BIOME_CONFIG: Record<Biome, { ambientTemp: number; baseRPM: number }> = {
  himalaya: { ambientTemp: -5, baseRPM: 2400 },
  thar: { ambientTemp: 48, baseRPM: 2500 },
  coastal: { ambientTemp: 28, baseRPM: 2450 },
};

/** Safe modulo that always returns [0, modulus) */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Wrap angle difference to [-180, 180] */
function angleDiff(a: number, b: number): number {
  return mod(a - b + 180, 360) - 180;
}

/** Deterministic noise — same input always yields the same output */
function noise(t: number, seed: number): number {
  const a = Math.sin(t * 1.7 + seed * 12.9898) * 43758.5453;
  return (a - Math.floor(a)) * 2 - 1;
}

function updateEngineTelemetry(state: FlightState, _dt: number): Partial<FlightState> {
  const altitudeFactor = Math.exp(-state.altitude / 27000);
  const thr = state.throttle / 100;
  const biomeConfig = BIOME_CONFIG[state.biome];
  const ambientTemp = state.ambientTemp;
  const t = Date.now() / 1000;

  // RPM — scales with throttle and altitude density
  let rpm = biomeConfig.baseRPM + thr * 1600 * (0.86 + 0.14 * altitudeFactor);
  rpm += noise(t, 3) * 15;

  // MAP — barometric pressure equation, drops with altitude, turbo compensates
  let map = 18 + thr * 14 * altitudeFactor;
  if (state.faults.turboFail) map *= 0.6;

  // CHT per cylinder — rises with throttle, ambient temp, wear; drops with altitude air cooling
  const chtBase = 96 + thr * 96 + ambientTemp * 0.72 - altitudeFactor * 12;
  const cht = [
    chtBase + (state.faults.c2Overheat ? 80 : 0) + noise(t, 1) * 3,
    chtBase + (state.faults.c2Overheat ? 120 : 0) + noise(t, 2) * 3,
    chtBase + noise(t, 3) * 3,
    chtBase + noise(t, 4) * 3,
  ];

  // EGT — rises with throttle and ambient, imbalanced by injector clog
  let egt = 528 + thr * 236 + ambientTemp * 0.5;
  if (state.faults.injectorClog) egt += 60 + noise(t, 5) * 20;
  if (state.faults.turboFail) egt -= 40;

  // Oil — temperature rises with throttle and ambient, pressure inversely proportional
  const oilTemp = 68 + thr * 34 + ambientTemp * 0.5;
  const oilPressure = Math.max(1.6, Math.min(6.2, 5.6 - (oilTemp - 90) * 0.012));

  // Vibration — rises with throttle, spikes with bearing fault
  let vib = 0.42 + thr * 0.36;
  if (state.faults.bearingFail) vib += 1.8 + Math.abs(noise(t, 6)) * 0.5;

  // FFT spectrum (64 frequency bins, 0-630 Hz)
  const fftSpectrum = Array.from({ length: 64 }, (_, i) => {
    let val = 0.1 + Math.exp(-i / 12) * 0.3;
    if (i >= 7 && i <= 9) val += 0.4 * thr;   // fundamental ~80 Hz
    if (i >= 15 && i <= 17) val += 0.25 * thr; // 2nd harmonic ~160 Hz
    if (i >= 23 && i <= 25) val += 0.15 * thr; // 3rd harmonic ~240 Hz
    if (state.faults.bearingFail && i >= 13 && i <= 15) val += 1.5; // BPFO 140 Hz
    return Math.max(0, Math.min(2, val + noise(t, i + 7) * 0.05));
  });

  // Composite health
  const thermalHealth = Math.max(0, 1 - (Math.max(...cht) - 150) / 130);
  const vibHealth = Math.max(0, 1 - (vib - 0.5) / 1.6);
  const health = thermalHealth * 0.3 + vibHealth * 0.3 + (1 - state.anomalyScore) * 0.4;

  return {
    rpm, map, cht, egt, oilPressure, oilTemp,
    vibrationRMS: vib, fftSpectrum,
    healthIndex: Math.max(0, Math.min(1, health)),
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

export const useFlightStore = create<FlightState>((set) => ({
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
  faults: { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false },
  emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
  isDragging: false, dragStartX: 0, dragStartY: 0,

  setThrottle: (v) => set({ throttle: Math.max(0, Math.min(100, v)) }),
  setRudder: (v) => set({ rudder: Math.max(-1, Math.min(1, v)) }),
  setTargetHeading: (h) => set({ targetHeading: mod(h, 360) }),
  setTargetAltitude: (a) => set({ targetAltitude: Math.max(500, Math.min(30000, a)) }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setBiome: (b) => set({ biome: b, ambientTemp: BIOME_CONFIG[b].ambientTemp }),
  setMissionPreset: (p) => {
    const mission = MISSIONS[p];
    const scenarioFaults: FaultFlags = p === 'highAltitudeFailure'
      ? { c2Overheat: true, turboFail: true, bearingFail: false, injectorClog: false }
      : { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false };
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
      emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
    });
  },
  startMission: () => set({ missionActive: true, missionProgress: 0, missionElapsed: 0, emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null }),
  setDragging: (d, sx, sy) => set({ isDragging: d, dragStartX: sx ?? 0, dragStartY: sy ?? 0 }),
  toggleFault: (fault) => set((s) => ({
    faults: { ...s.faults, [fault]: !s.faults[fault] },
  })),
  resetFaults: () => set({
    faults: { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false },
  }),
  resetSimulation: () => set({
    x: 0, z: 0, heading: 0, targetHeading: 0, altitude: 6000, targetAltitude: 6000,
    speed: 145, bankAngle: 0, pitchAngle: 0, cameraMode: 'chase', throttle: 65, rudder: 0,
    missionPreset: 'nominalRoutine', biome: 'himalaya', ambientTemp: -5,
    missionActive: false, missionProgress: 0, missionElapsed: 0,
    waypoints: MISSIONS.nominalRoutine.waypoints,
    faults: { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false },
    emergencyState: 'nominal', emergencyTimer: 0, crashCoordinates: null, systemMessage: null,
  }),

  tick: (dt) => set((state) => {
    if (state.emergencyState === 'crashed') return state;

    const turnRate = 30; // deg/s max
    const hdgDiff = angleDiff(state.targetHeading, state.heading);
    const turn = Math.sign(hdgDiff) * Math.min(Math.abs(hdgDiff), turnRate * dt);

    // Rudder influence + wrapping
    let hdg = mod(state.heading + turn + state.rudder * 60 * dt, 360);

    const bankAngle = Math.max(-35, Math.min(35, hdgDiff * 0.8));

    // Altitude — smooth climb/descent
    const altDiff = state.targetAltitude - state.altitude;
    const climbRate = 800 * dt;
    let alt = state.altitude + Math.sign(altDiff) * Math.min(Math.abs(altDiff), climbRate);
    alt = Math.max(500, Math.min(30000, alt));

    // Speed from throttle and altitude density
    const altitudeFactor = Math.exp(-alt / 27000);
    let speed = 40 + (state.throttle / 100) * 160 * (0.7 + 0.3 * altitudeFactor);

    const missionElapsed = state.missionElapsed + (state.missionActive ? dt : 0);
    const highAltitudeFailure = state.missionPreset === 'highAltitudeFailure' && state.missionActive;
    const coastalRecovery = state.missionPreset === 'coastalRecovery' && state.missionActive;
    const stallProgress = highAltitudeFailure ? Math.max(0, Math.min(1, (missionElapsed - 3) / 5)) : 0;
    const coldProgress = coastalRecovery ? Math.max(0, Math.min(1, (missionElapsed - 2) / 5)) : 0;
    const failureProgress = highAltitudeFailure ? Math.max(0, Math.min(1, (missionElapsed - 5) / 8)) : 0;
    speed *= Math.max(0, 1 - stallProgress * 0.88 - coldProgress * 0.65);

    // Position update
    const speedMs = speed * 0.5144;
    const headingRad = (hdg * Math.PI) / 180;
    const dx = Math.sin(headingRad) * speedMs * dt;
    const dz = -Math.cos(headingRad) * speedMs * dt;
    const x = state.x + dx;
    const z = state.z + dz;
    const terrainY = terrainHeightAt(x, z, state.biome);
    const terrainAltitude = Math.max(500, ((terrainY + 1 - 2.5) / 0.0015) + 350);
    if (state.emergencyState === 'nominal' && alt < terrainAltitude) alt = terrainAltitude;

    // RUL decay and anomaly accumulation
    const rul = Math.max(0, state.rul - dt * 0.01);
    const anomalyScore = Math.min(1, state.anomalyScore + (state.faults.c2Overheat ? 0.001 : 0) +
      (state.faults.bearingFail ? 0.002 : 0) + (state.faults.turboFail ? 0.0015 : 0) + (coldProgress * 0.003));

    const engineUpdates = updateEngineTelemetry({ ...state, x, z, heading: hdg, altitude: alt, speed, anomalyScore }, dt);
    engineUpdates.rpm = (engineUpdates.rpm ?? state.rpm) * (1 - stallProgress * 0.8 - coldProgress * 0.45);
    engineUpdates.healthIndex = Math.max(0, Math.min(1, (engineUpdates.healthIndex ?? state.healthIndex) * (1 - failureProgress)));

    // Mission waypoint tracking — auto-navigate to waypoints
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
          // Auto-navigate: set heading toward waypoint
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
