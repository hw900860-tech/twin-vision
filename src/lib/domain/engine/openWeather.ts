/**
 * OpenWeatherMap ingestion for AERIS-TWIN (replaces the keyless Open-Meteo
 * feed). Everything here is behind TanStack Start server functions, so the
 * `OPENWEATHERMAP_API_KEY` never reaches the browser bundle — the handlers
 * execute in the SSR server process only.
 *
 *  - `fetchLiveWeather(lat, lon)` → current observation in metric units:
 *    OAT (°C), humidity, wind speed (m/s → knots), direction, sea-level
 *    pressure (hPa, the QNH proxy) and human-readable condition text.
 *  - `searchPlaces(q)` → OpenWeatherMap geocoding candidates so an operator
 *    can add custom operating locations to the GCS station registry.
 */
import { createServerFn } from "@tanstack/react-start";

/** Units of a mapped current-weather observation (all numbers normalized). */
export interface LiveWeatherPayload {
  /** Outside air temperature at the station, °C */
  oatC: number;
  relativeHumidityPct: number;
  /** 10 m wind speed, knots */
  windSpeedKts: number;
  /** Meteorological wind direction, degrees (0–360, from-north) */
  windDirDeg: number;
  /** Sea-level pressure (QNH proxy), hPa */
  qnhHpa: number;
  /** Human-readable condition, e.g. "Clear Sky". */
  condition: string;
  /** OpenWeatherMap weather condition id. */
  conditionCode: number;
  /** Observation epoch, ms. */
  updatedAt: number;
}

/** Geocoding candidate for a user-added station. */
export interface PlaceCandidate {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

function readApiKey(): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const direct = proc?.env?.["OPENWEATHERMAP_API_KEY"];
  if (direct) return direct;
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  // Vite exposes only VITE_-prefixed keys to import.meta.env; accept both so
  // the dev server (import.meta.env) and the prod runtime (process.env) work.
  return meta.env?.["VITE_OPENWEATHERMAP_API_KEY"] ?? meta.env?.["OPENWEATHERMAP_API_KEY"];
}

async function owmFetchJson(path: string, timeoutMs = 9000): Promise<unknown> {
  const key = readApiKey();
  if (!key) {
    throw new Error("OPENWEATHERMAP_API_KEY is not configured — add it in Settings → Environment.");
  }
  const separator = path.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.openweathermap.org${path}${separator}appid=${encodeURIComponent(key)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      let detail = `OpenWeatherMap responded ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) detail = `${detail} — ${body.message}`;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(detail);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Live current weather                                               */
/* ------------------------------------------------------------------ */

interface OwmCurrent {
  weather?: Array<{ id?: number; description?: string }>;
  main?: {
    temp?: number;
    humidity?: number;
    pressure?: number;
    sea_level?: number;
    grnd_level?: number;
  };
  wind?: { speed?: number; deg?: number };
  dt?: number;
}

export const fetchLiveWeather = createServerFn({ method: "GET" })
  .validator((input: { lat: number; lon: number }) => ({
    lat: Math.max(-90, Math.min(90, Number(input.lat))),
    lon: Math.max(-180, Math.min(180, Number(input.lon))),
  }))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      lat: String(data.lat),
      lon: String(data.lon),
      units: "metric",
      lang: "en",
    });
    const json = (await owmFetchJson(`/data/2.5/weather?${params.toString()}`)) as OwmCurrent;
    const main = json.main ?? {};
    const wind = json.wind ?? {};
    const weather = json.weather?.[0];

    const oatC = typeof main.temp === "number" ? main.temp : Number.NaN;
    if (!Number.isFinite(oatC)) {
      throw new Error("OpenWeatherMap returned no temperature for this location.");
    }

    const payload: LiveWeatherPayload = {
      oatC,
      relativeHumidityPct: typeof main.humidity === "number" ? main.humidity : 0,
      // OpenWeatherMap reports m/s under units=metric → knots (×1.943844).
      windSpeedKts: (wind.speed ?? 0) * 1.943844,
      windDirDeg: wind.deg ?? 0,
      // Prefer explicit sea-level pressure; `pressure` is sea-level when the
      // `sea_level` field is absent (QNH-equivalent for our correction math).
      qnhHpa: typeof main.sea_level === "number" ? main.sea_level : (main.pressure ?? 1013.25),
      condition: weather?.description ? titleCase(weather.description) : "Unknown",
      conditionCode: typeof weather?.id === "number" ? weather.id : 0,
      updatedAt: typeof json.dt === "number" ? json.dt * 1000 : Date.now(),
    };
    return payload;
  });

/* ------------------------------------------------------------------ */
/* Place search (geocoding) for custom stations                       */
/* ------------------------------------------------------------------ */

interface OwmGeoHit {
  name?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export const searchPlaces = createServerFn({ method: "GET" })
  .validator((input: { q: string }) => ({ q: String(input.q ?? "").trim().slice(0, 80) }))
  .handler(async ({ data }) => {
    if (!data.q) return [] as PlaceCandidate[];
    const params = new URLSearchParams({ q: data.q, limit: "6", lang: "en" });
    const json = (await owmFetchJson(`/geo/1.0/direct?${params.toString()}`)) as OwmGeoHit[];
    if (!Array.isArray(json)) {
      throw new Error("OpenWeatherMap geocoding returned an unexpected payload.");
    }
    const seen = new Set<string>();
    const hits: PlaceCandidate[] = [];
    for (const hit of json) {
      if (typeof hit.lat !== "number" || typeof hit.lon !== "number" || !hit.name) continue;
      const label = `${hit.name}|${hit.state ?? ""}|${hit.country ?? ""}`;
      if (seen.has(label)) continue;
      seen.add(label);
      const region = [hit.state, hit.country].filter((part): part is string => Boolean(part)).join(", ");
      hits.push({ name: hit.name, region, lat: hit.lat, lon: hit.lon });
    }
    return hits;
  });
