/**
 * Environmental ingestion layer (AERIS-TWIN Layer-2 feed).
 *
 * Live meteorological observations (OAT, wind, QNH, humidity, condition) are
 * pulled from OpenWeatherMap by the RPC functions in `./openWeather.ts` (the
 * API key stays on the SSR server) and merged into `WeatherObservation`
 * snapshots here. This module owns the pure/derived side of the pipeline:
 *
 *   - the airfield registry (built-in presets + user-added custom stations),
 *   - ISA lapse of the ground observation up to flight altitude,
 *   - pressure / density altitude from QNH and OAT,
 *   - environment-normalized thermal redline shifts so climate stress is
 *     decoupled from mechanical degradation (fewer false alarms when a twin
 *     hops between desert heat and Himalayan cold).
 *
 * Every exported function is pure/deterministic — no I/O lives here.
 */

export type BiomeKey = "himalaya" | "thar" | "coastal";

export interface Airfield {
  biome: BiomeKey;
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
  elevationFt: number;
  /** True for stations added by the operator (persisted locally). */
  custom?: boolean;
}

/** Built-in operating airfields — one canonical default per AERIS-TWIN biome. */
const LEH: Airfield = { biome: "himalaya", id: "leh", name: "KUSHOK BAKULA RIMPOCHE", code: "VIH", lat: 34.1359, lon: 77.5465, elevationFt: 10682 };
const SRINAGAR: Airfield = { biome: "himalaya", id: "srinagar", name: "SRINAGAR", code: "VISR", lat: 33.9871, lon: 74.7743, elevationFt: 5430 };
const JAISALMER: Airfield = { biome: "thar", id: "jaisalmer", name: "JAISALMER", code: "VIJR", lat: 26.8887, lon: 70.8645, elevationFt: 778 };
const JODHPUR: Airfield = { biome: "thar", id: "jodhpur", name: "JODHPUR", code: "VIJO", lat: 26.2513, lon: 73.048, elevationFt: 717 };
const GOA: Airfield = { biome: "coastal", id: "goa", name: "DABOLIM NAVAL", code: "VOGO", lat: 15.3809, lon: 73.8314, elevationFt: 150 };
const CHENNAI: Airfield = { biome: "coastal", id: "chennai", name: "CHENNAI INTL", code: "VOMM", lat: 12.9941, lon: 80.1709, elevationFt: 52 };

/** Canonical airfield per biome (used as the default when a biome is active). */
export const AIRFIELDS: Record<BiomeKey, Airfield> = {
  himalaya: LEH,
  thar: JAISALMER,
  coastal: GOA,
};

/** Built-in preset registry shown in the GCS station picker. */
export const PRESET_AIRFIELDS: Airfield[] = [LEH, SRINAGAR, JAISALMER, JODHPUR, GOA, CHENNAI];

/** @deprecated use {@link PRESET_AIRFIELDS} */
export const AIRFIELD_LIST: Airfield[] = PRESET_AIRFIELDS;

export interface WeatherObservation {
  source: "LIVE";
  station: string;
  code: string;
  biome: BiomeKey;
  lat: number;
  lon: number;
  elevationFt: number;
  /** Ground-level (station) outside air temperature, °C */
  oatC: number;
  relativeHumidityPct: number;
  windSpeedKts: number;
  windDirDeg: number;
  /** Station QNH / sea-level pressure, hPa */
  qnhHpa: number;
  /** Human-readable weather condition (e.g. "Clear sky"). */
  condition?: string;
  /** OpenWeatherMap condition code (700s = haze, 800 = clear, 8xx = clouds…). */
  conditionCode?: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Standard atmosphere                                                */
/* ------------------------------------------------------------------ */

/** ISA temperature at pressure altitude (below tropopause), °C. */
export function isaTempC(pressureAltFt: number): number {
  return 15 - 0.0019812 * pressureAltFt;
}

/**
 * OAT at a given flight altitude, extrapolated from the station OAT along the
 * ISA lapse rate (≈ −1.98 °C per 1,000 ft). `stationElevationFt` anchors the
 * observation so a high-altitude field does not double-count the lapse.
 */
export function oatAtAltitude(groundOatC: number, flightAltFt: number, stationElevationFt = 0): number {
  return groundOatC - 0.0019812 * Math.max(0, flightAltFt - stationElevationFt);
}

/** QNH correction to altitude: ≈ 30 ft per hPa below standard 1013.25 hPa. */
export function qnhCorrectionFt(qnhHpa: number): number {
  return (1013.25 - qnhHpa) * 30;
}

/**
 * Density altitude from pressure altitude and actual OAT.
 * `pressureAltitudeFt` input must already include the QNH correction.
 */
export function densityAltitudeFt(pressureAltFt: number, oatC: number): number {
  return pressureAltFt + (oatC - isaTempC(pressureAltFt)) / 0.0019812;
}

/** Density ratio σ = ρ/ρ₀ from density altitude. 1.0 at sea-level ISA. */
export function airDensityRatio(daFt: number): number {
  const factor = 1 - 6.8755856e-6 * daFt;
  return factor > 0 ? Math.pow(factor, 4.2559) : 0;
}

/** Live-weather atmosphere snapshot for the engine's current flight altitude. */
export interface AtmosphereSample {
  /** OAT at the aircraft's current altitude, °C */
  oatC: number;
  pressureAltFt: number;
  densityAltFt: number;
  /** σ = ρ/ρ₀ — engine power & cooling density scaling */
  densityRatio: number;
  /** (OAT − ISA) at altitude, °C — positive = hotter than standard day */
  ambientDeltaC: number;
}

export function sampleAtmosphere(
  flightAltFt: number,
  obs: Pick<WeatherObservation, "oatC" | "qnhHpa" | "elevationFt">,
): AtmosphereSample {
  const oatC = oatAtAltitude(obs.oatC, flightAltFt, obs.elevationFt);
  const pa = flightAltFt + qnhCorrectionFt(obs.qnhHpa);
  const da = densityAltitudeFt(pa, oatC);
  return {
    oatC,
    pressureAltFt: pa,
    densityAltFt: da,
    densityRatio: airDensityRatio(da),
    ambientDeltaC: oatC - isaTempC(pa),
  };
}

/* ------------------------------------------------------------------ */
/* Environmental thermal expectations                                  */
/* ------------------------------------------------------------------ */

/**
 * Thermal sensitivity of the AE-P4 demonstrator model: every +1 °C of ambient
 * raises CHT ≈ 0.72 °C and oil temperature ≈ 0.5 °C at fixed throttle.
 * Compensating the redlines by exactly this factor means pure climate stress
 * can never push a healthy engine across an alarm threshold by itself.
 */
export const CHT_AMBIENT_SENSITIVITY = 0.72;
export const OIL_AMBIENT_SENSITIVITY = 0.5;

/** How far the CHT redline should shift for a given ambient delta (°C). */
export function chtRedlineShiftC(ambientDeltaC: number): number {
  return ambientDeltaC * CHT_AMBIENT_SENSITIVITY;
}

/** How far the oil-temperature redline should shift for a given ambient delta (°C). */
export function oilRedlineShiftC(ambientDeltaC: number): number {
  return ambientDeltaC * OIL_AMBIENT_SENSITIVITY;
}

/** Readable wind direction label (aviation-style 16-point rose). */
export function windDirLabel(deg: number): string {
  const rose = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return rose[idx] ?? "—";
}
