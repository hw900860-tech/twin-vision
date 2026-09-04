/**
 * Special-operations ATMOSPHERIC REGIONS.
 *
 * Each biome carries a set of named air-mass regions with their own micro-
 * atmosphere: temperature offset, air-density ratio, manifold-pressure delta
 * and turbulence. When the UAV crosses into one of these regions the flight
 * physics blend its parameters into the engine model (CHT/EGT/MAP/vibration
 * react), the terrain renders a visible tactical ring, and an alert is sent
 * over the datalink to the GCS so the ground operator sees exactly which
 * air mass the aircraft is flying through and what it does to the engine.
 */
import type { Biome } from "./flightStore";
import type { WeatherObservation } from "@/lib/domain/engine/environment";

export type RegionSeverity = "info" | "caution" | "critical";

export interface RegionParams {
  /** °C offset applied to the ambient (outside-air) temperature. */
  tempDeltaC: number;
  /** Air-density multiplier (1 = neutral, <1 thin air, >1 dense air). */
  densityRatio: number;
  /** Manifold-pressure multiplier (1 = neutral, <1 low-pressure trough). */
  pressureDelta: number;
  /** 0..1 added turbulence → vibration RMS / gust excitation. */
  turbulence: number;
}

export interface FlightRegion {
  /** ≤8 ASCII chars — this is also the wire id in the datalink frame. */
  id: string;
  name: string;
  cx: number;
  cz: number;
  radius: number;
  biome: Biome;
  severity: RegionSeverity;
  params: RegionParams;
  /** Tactical advisory streamed to the GCS when the UAV enters. */
  advisory: string;
  /** Live-meteo deformation: ellipse stretch ratio along `axisDeg` (1 = circle). */
  stretch?: number;
  /** World azimuth (deg) of the ellipse major axis (wind-down direction). */
  axisDeg?: number;
}

export type RegionEvent = "ENTER" | "EXIT";

export const REGIONS: FlightRegion[] = [
  // ---------------- HIMALAYA ----------------
  {
    id: "CRYOTRG", name: "CRYO TROUGH", cx: 110, cz: -35, radius: 55, biome: "himalaya", severity: "caution",
    params: { tempDeltaC: -16, densityRatio: 1.05, pressureDelta: 0.97, turbulence: 0.2 },
    advisory: "CRYO TROUGH — OAT -16°C · ICE ACCRETION RISK · MONITOR CARB HEAT",
  },
  {
    id: "LOWPRES", name: "LOW PRESSURE TROUGH", cx: 320, cz: 5, radius: 70, biome: "himalaya", severity: "critical",
    params: { tempDeltaC: 4, densityRatio: 0.95, pressureDelta: 0.82, turbulence: 0.45 },
    advisory: "LOW PRESSURE TROUGH — MAP COLLAPSE · TURBO SPOOLING · REDUCE THROTTLE TO 75%",
  },
  {
    id: "THERMSH", name: "THERMAL SHEAR ZONE", cx: 420, cz: 85, radius: 55, biome: "himalaya", severity: "caution",
    params: { tempDeltaC: 3, densityRatio: 0.97, pressureDelta: 1.0, turbulence: 0.85 },
    advisory: "THERMAL SHEAR — SEVERE TURBULENCE · VIB EXCURSION EXPECTED",
  },
  // ---------------- THAR ----------------
  {
    id: "HEATBSN", name: "HEAT BASIN", cx: 150, cz: 55, radius: 70, biome: "thar", severity: "critical",
    params: { tempDeltaC: 20, densityRatio: 0.93, pressureDelta: 0.96, turbulence: 0.3 },
    advisory: "HEAT BASIN +20°C — CHT/EGT ELEVATION · WATCH CYLINDER THERMALS",
  },
  {
    id: "DSTCORE", name: "DUST STORM CORE", cx: 320, cz: -65, radius: 70, biome: "thar", severity: "critical",
    params: { tempDeltaC: 9, densityRatio: 0.9, pressureDelta: 0.92, turbulence: 0.9 },
    advisory: "DUST STORM CORE — INGESTION RISK · REDUCE THROTTLE · CLIMB IF POSSIBLE",
  },
  {
    id: "MIRAGEU", name: "MIRAGE UPWELL", cx: 450, cz: 100, radius: 55, biome: "thar", severity: "caution",
    params: { tempDeltaC: 12, densityRatio: 0.95, pressureDelta: 1.0, turbulence: 0.5 },
    advisory: "MIRAGE UPWELL — DENSITY ALTITUDE RISE · THIN-AIR PERFORMANCE PENALTY",
  },
  // ---------------- COASTAL ----------------
  {
    id: "DENSAIR", name: "MARITIME DENSE AIR", cx: 200, cz: -125, radius: 60, biome: "coastal", severity: "info",
    params: { tempDeltaC: 1, densityRatio: 1.09, pressureDelta: 1.05, turbulence: 0.3 },
    advisory: "MARITIME DENSE AIR — MAP UP · HIGH HUMIDITY · MONITOR OIL TEMP",
  },
  {
    id: "COLDFRT", name: "COLD FRONT", cx: 450, cz: 5, radius: 65, biome: "coastal", severity: "caution",
    params: { tempDeltaC: -13, densityRatio: 1.04, pressureDelta: 0.97, turbulence: 0.6 },
    advisory: "COLD FRONT — OAT -13°C · ICING WINDOW · CARB HEAT ON",
  },
  {
    id: "GUSTLAY", name: "COASTAL GUST LAYER", cx: 250, cz: 75, radius: 50, biome: "coastal", severity: "caution",
    params: { tempDeltaC: 0, densityRatio: 1.0, pressureDelta: 0.99, turbulence: 0.8 },
    advisory: "COASTAL GUST LAYER — WIND SHEAR · VIB EXCURSION EXPECTED",
  },
];

export const REGIONS_BY_BIOME: Record<Biome, FlightRegion[]> = {
  himalaya: REGIONS.filter((r) => r.biome === "himalaya"),
  thar: REGIONS.filter((r) => r.biome === "thar"),
  coastal: REGIONS.filter((r) => r.biome === "coastal"),
};

export const REGION_REGISTRY: Record<string, FlightRegion> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
);

export function regionById(id: string): FlightRegion | undefined {
  return REGION_REGISTRY[id];
}

/** Region containing a world position, or null. */
export function regionAt(x: number, z: number, biome: Biome): FlightRegion | null {
  return regionAtList(x, z, REGIONS_BY_BIOME[biome]);
}

/** Region containing a world position within an arbitrary (possibly weather-transformed) region set. */
export function regionAtList(x: number, z: number, regions: FlightRegion[]): FlightRegion | null {
  for (const r of regions) {
    const dx = x - r.cx;
    const dz = z - r.cz;
    if (dx * dx + dz * dz < r.radius * r.radius) return r;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Live-meteo deformation (Layer-2 OpenWeather ingestion)             */
/* ------------------------------------------------------------------ */

/** Nominal biome ambient OAT (°C) — matches flightStore BIOME_CONFIG. */
export const BIOME_BASE_OAT: Record<Biome, number> = {
  himalaya: -5,
  thar: 48,
  coastal: 28,
};

export interface RegionWeatherDeform {
  /** Downwind translation of region centres (world units). */
  shiftX: number;
  shiftZ: number;
  /** Ellipse stretch ratio along the downwind axis (1 = circle). */
  stretch: number;
  /** World azimuth (deg) of the stretch axis — the wind-down direction. */
  axisDeg: number;
}

/**
 * How a live weather observation deforms the tactical region map:
 *  - strong wind DRAGS the air-mass regions downwind and stretches them into
 *    ellipses along the flow (a weather system blown sideways);
 *  - a low QNH deepens low-pressure troughs (and suppresses high-pressure air);
 *  - a hot/cold station day scales the thermal character of every region;
 *  - wind adds turbulence to every region.
 */
export function weatherRegionDeform(weather: WeatherObservation): RegionWeatherDeform {
  const windKts = weather.windSpeedKts || 0;
  // Meteorological wind direction is FROM; air masses advect TOWARD +180°.
  const downwindDeg = (weather.windDirDeg + 180) % 360;
  const downwindRad = (downwindDeg * Math.PI) / 180;
  const shift = Math.min(42, windKts * 0.22);
  return {
    shiftX: Math.sin(downwindRad) * shift,
    shiftZ: -Math.cos(downwindRad) * shift,
    stretch: Math.min(1.55, Math.max(1, 1 + windKts * 0.01)),
    axisDeg: downwindDeg,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Weather-adjusted copy of a region set (id/name/severity/advisory preserved). */
export function applyWeatherToRegions(
  regions: FlightRegion[],
  weather: WeatherObservation,
): FlightRegion[] {
  const d = weatherRegionDeform(weather);
  const windKts = weather.windSpeedKts || 0;
  const oatDev = weather.oatC - BIOME_BASE_OAT[weather.biome as Biome];
  const qnhDev = weather.qnhHpa - 1013.25;
  return regions.map((r) => ({
    ...r,
    cx: r.cx + d.shiftX,
    cz: r.cz + d.shiftZ,
    ...(d.stretch > 1.01 ? { stretch: d.stretch, axisDeg: d.axisDeg } : {}),
    params: {
      tempDeltaC: clamp(r.params.tempDeltaC + oatDev * 0.22, -24, 28),
      densityRatio: clamp(r.params.densityRatio * (1 - oatDev * 0.0015), 0.85, 1.12),
      pressureDelta: clamp(r.params.pressureDelta - qnhDev * 0.0006, 0.72, 1.12),
      turbulence: clamp(r.params.turbulence + windKts * 0.012, 0, 1),
    },
  }));
}
