/**
 * Dynamic Application Context Aggregator for JARVIS.
 * Collects live state across telemetry, ML, physics, screen, 3D model, and environment.
 */

import { useFlightStore } from "@/features/flight-sim/flightStore";
import { useJarvisStore } from "./jarvisStore";

export interface SystemSnapshot {
  screen: {
    route: string;
    gcsTab?: string;
    inspectedPart: string | null;
    isEngineExploded: boolean;
    isDismantleLabOpen: boolean;
    flightSimDrawerOpen: boolean;
  };
  telemetry: {
    rpm: number;
    manifoldAirPressure_kPa: number;
    boost_bar: number;
    cht_C: [number, number, number, number];
    chtMax_C: number;
    egt_C: number;
    oilPressure_bar: number;
    oilTemp_C: number;
    vibrationRMS_G: number;
    healthIndex_pct: number;
    rul_hours: number;
    throttle_pct: number;
  };
  flight: {
    altitude_ft: number;
    targetAltitude_ft: number;
    airspeed_knots: number;
    pitch_deg: number;
    roll_deg: number;
    heading_deg: number;
    emergencyState: string;
    activeMissionPreset: string;
  };
  environment: {
    biome: string;
    ambientTemperature_C: number;
    densityRatio: number;
    airDensity: number;
    weatherCondition: string;
  };
  mlIntelligence: {
    overallStatus: string;
    overallHealth: number;
    anomalyScore: number;
    primaryFaultSubsystem: string;
    diagnosisText: string;
    recommendedAction: string;
    subsystemHealths: Record<string, { health: number; status: string }>;
    activeAlerts: Array<{ title: string; desc: string; tone: string }>;
  };
  faults: {
    c2Overheat: boolean;
    turboFail: boolean;
    bearingFail: boolean;
    injectorClog: boolean;
  };
  recentTrends: {
    windowSeconds: number;
    healthDelta: number;
    chtMaxDelta: number;
    egtDelta: number;
    vibrationDelta: number;
    oilPressureDelta: number;
    oilTempDelta: number;
  };
}

export function captureSystemSnapshot(): SystemSnapshot {
  const flightState = useFlightStore.getState();
  const jarvisState = useJarvisStore.getState();

  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/gcs";

  // Calculate recent trends from flightState.historyBuffer
  const history = flightState.historyBuffer || [];
  let healthDelta = 0;
  let chtMaxDelta = 0;
  let egtDelta = 0;
  let vibrationDelta = 0;
  let oilPressureDelta = 0;
  let oilTempDelta = 0;

  if (history.length >= 2) {
    const latest = history[history.length - 1];
    const baselineIndex = Math.max(0, history.length - 25);
    const baseline = history[baselineIndex];

    if (latest && baseline) {
      healthDelta = latest.health - baseline.health;
      chtMaxDelta = latest.chtMax - baseline.chtMax;
      egtDelta = latest.egt - baseline.egt;
      vibrationDelta = latest.vibrationRMS - baseline.vibrationRMS;
      oilPressureDelta = latest.oilPressure - baseline.oilPressure;
      oilTempDelta = latest.oilTemp - baseline.oilTemp;
    }
  }

  const chtValues: [number, number, number, number] = [
    flightState.cht?.[0] ?? 140,
    flightState.cht?.[1] ?? 140,
    flightState.cht?.[2] ?? 140,
    flightState.cht?.[3] ?? 140,
  ];

  const maxCht = Math.max(...chtValues);

  const decision = flightState.engineDecision;
  const subsystemHealths: Record<string, { health: number; status: string }> = {};

  if (decision?.subsystems) {
    Object.entries(decision.subsystems).forEach(([k, v]) => {
      subsystemHealths[k] = {
        health: (v as any).health ?? 1.0,
        status: (v as any).status ?? "NOMINAL",
      };
    });
  }

  const activeAlerts = (decision?.alerts || []).map((a) => ({
    title: a.title || "ALERT",
    desc: a.message || "",
    tone: a.severity === "CRITICAL" ? "critical" : a.severity === "WARNING" ? "amber" : "cyan",
  }));

  return {
    screen: {
      route: currentPath,
      gcsTab: jarvisState.activeGcsTab || "LIVE TWIN",
      inspectedPart: jarvisState.selectedPart,
      isEngineExploded: jarvisState.isExploded,
      isDismantleLabOpen: jarvisState.isStudioOpen,
      flightSimDrawerOpen: true,
    },
    telemetry: {
      rpm: Math.round(flightState.rpm || 0),
      manifoldAirPressure_kPa: Number((flightState.map || 0).toFixed(1)),
      boost_bar: Number(Math.max(0, ((flightState.map || 29.9) - 29.9) * 0.0338).toFixed(2)),
      cht_C: chtValues.map((v) => Number(v.toFixed(1))) as [number, number, number, number],
      chtMax_C: Number(maxCht.toFixed(1)),
      egt_C: Number((flightState.egt || 680).toFixed(1)),
      oilPressure_bar: Number((flightState.oilPressure || 0).toFixed(2)),
      oilTemp_C: Number((flightState.oilTemp || 0).toFixed(1)),
      vibrationRMS_G: Number((flightState.vibrationRMS || 0).toFixed(2)),
      healthIndex_pct: Number(((flightState.healthIndex || 1.0) * 100).toFixed(1)),
      rul_hours: Number((flightState.rul || 420).toFixed(1)),
      throttle_pct: Math.round(flightState.throttle || 0),
    },
    flight: {
      altitude_ft: Math.round(flightState.altitude || 0),
      targetAltitude_ft: Math.round(flightState.targetAltitude || 0),
      airspeed_knots: Math.round(flightState.speed || 0),
      pitch_deg: Number((flightState.pitchAngle || 0).toFixed(1)),
      roll_deg: Number((flightState.bankAngle || 0).toFixed(1)),
      heading_deg: Math.round(flightState.heading || 0),
      emergencyState: flightState.emergencyState || "nominal",
      activeMissionPreset: flightState.missionPreset || "nominalRoutine",
    },
    environment: {
      biome: flightState.biome || "himalaya",
      ambientTemperature_C: Number((flightState.ambientTemp ?? flightState.weather?.oatC ?? 15).toFixed(1)),
      densityRatio: Number((flightState.airDensity ? flightState.airDensity / 1.225 : 1.0).toFixed(3)),
      airDensity: Number((flightState.airDensity || 1.225).toFixed(3)),
      weatherCondition: flightState.weather?.condition || "ISA Standard Clear Sky",
    },
    mlIntelligence: {
      overallStatus: decision?.overallStatus || "NOMINAL",
      overallHealth: decision?.overallHealth || 98,
      anomalyScore: Number((flightState.anomalyScore || 0).toFixed(3)),
      primaryFaultSubsystem: decision?.primaryFaultSubsystem || "NONE",
      diagnosisText: decision?.diagnosisText || "Nominal parameters",
      recommendedAction: decision?.recommendedAction || "Maintain profile",
      subsystemHealths,
      activeAlerts,
    },
    faults: {
      c2Overheat: Boolean(flightState.faults?.c2Overheat),
      turboFail: Boolean(flightState.faults?.turboFail),
      bearingFail: Boolean(flightState.faults?.bearingFail),
      injectorClog: Boolean(flightState.faults?.injectorClog),
    },
    recentTrends: {
      windowSeconds: 20,
      healthDelta: Number(healthDelta.toFixed(3)),
      chtMaxDelta: Number(chtMaxDelta.toFixed(1)),
      egtDelta: Number(egtDelta.toFixed(1)),
      vibrationDelta: Number(vibrationDelta.toFixed(2)),
      oilPressureDelta: Number(oilPressureDelta.toFixed(2)),
      oilTempDelta: Number(oilTempDelta.toFixed(1)),
    },
  };
}
