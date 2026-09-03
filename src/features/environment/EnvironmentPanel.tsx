import { useEffect, useMemo, useState } from "react";
import { CloudSun, Loader2, MapPin, Plus, RefreshCw, Search, ThermometerSun, Waves, Wind, X } from "lucide-react";
import { Panel } from "@/components/hud/primitives";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import {
  AIRFIELDS,
  PRESET_AIRFIELDS,
  chtRedlineShiftC,
  oilRedlineShiftC,
  sampleAtmosphere,
  windDirLabel,
  type Airfield,
  type BiomeKey,
} from "@/lib/domain/engine/environment";
import { fetchLiveWeather, searchPlaces, type PlaceCandidate } from "@/lib/domain/engine/openWeather";

const CUSTOM_STATIONS_KEY = "aeris.customStations.v1";

function loadCustomStations(): Airfield[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_STATIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Airfield => {
      if (typeof item !== "object" || item === null) return false;
      const field = item as Record<string, unknown>;
      return (
        typeof field["id"] === "string" &&
        typeof field["name"] === "string" &&
        typeof field["code"] === "string" &&
        typeof field["lat"] === "number" &&
        typeof field["lon"] === "number" &&
        typeof field["elevationFt"] === "number" &&
        (field["biome"] === "himalaya" || field["biome"] === "thar" || field["biome"] === "coastal")
      );
    });
  } catch {
    return [];
  }
}

function persistCustomStations(stations: Airfield[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_STATIONS_KEY, JSON.stringify(stations));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

/**
 * Layer-2 Environmental Ingestion control (OpenWeatherMap feed).
 *
 * Pulls regional meteorological observations (OAT, humidity, wind, QNH and
 * condition) into the physics engine through the SSR weather gateway, so the
 * API key never leaves the server. While a live observation is bound, the
 * engine's ambient temperature follows the ISA lapse to the aircraft altitude,
 * density altitude is computed from the true OAT, and the thermal redlines
 * used by the alert/ML layers are environment-normalized — so flying from
 * Thar heat into Himalayan cold no longer produces climate-driven false
 * alarms.
 */
export function EnvironmentPanel() {
  const biome = useFlightStore((s) => s.biome);
  const altitude = useFlightStore((s) => s.altitude);
  const weather = useFlightStore((s) => s.weather);
  const syncLiveWeather = useFlightStore((s) => s.syncLiveWeather);
  const clearLiveWeather = useFlightStore((s) => s.clearLiveWeather);
  const setBiome = useFlightStore((s) => s.setBiome);

  const [station, setStation] = useState<Airfield>(AIRFIELDS[biome]);
  const [customs, setCustoms] = useState<Airfield[]>([]);
  const [customsHydrated, setCustomsHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-location form state
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [biomePick, setBiomePick] = useState<BiomeKey>("coastal");
  const [elevationRaw, setElevationRaw] = useState("");

  useEffect(() => {
    setCustoms(loadCustomStations());
    setCustomsHydrated(true);
  }, []);

  useEffect(() => {
    if (customsHydrated) persistCustomStations(customs);
  }, [customs, customsHydrated]);

  const stations = useMemo(() => [...PRESET_AIRFIELDS, ...customs], [customs]);

  const atmosphere = useMemo(() => {
    if (!weather) return null;
    try {
      return sampleAtmosphere(altitude, weather);
    } catch {
      return null;
    }
  }, [weather, altitude]);

  async function handleSync(applyBiome: boolean) {
    setBusy(true);
    setError(null);
    try {
      const live = await fetchLiveWeather({ data: { lat: station.lat, lon: station.lon } });
      syncLiveWeather({
        source: "LIVE",
        station: station.name,
        code: station.code,
        biome: station.biome,
        lat: station.lat,
        lon: station.lon,
        elevationFt: station.elevationFt,
        oatC: live.oatC,
        relativeHumidityPct: live.relativeHumidityPct,
        windSpeedKts: live.windSpeedKts,
        windDirDeg: live.windDirDeg,
        qnhHpa: live.qnhHpa,
        condition: live.condition,
        conditionCode: live.conditionCode,
        updatedAt: live.updatedAt,
      });
      if (applyBiome) setBiome(station.biome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Weather service unreachable");
    } finally {
      setBusy(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const hits = await searchPlaces({ data: { q } });
      setResults(hits);
      if (hits.length === 0) setSearchError("No matching locations found.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Location search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addCustomStation(candidate: PlaceCandidate) {
    const parsedElevation = Number.parseInt(elevationRaw, 10);
    const elevationFt = Number.isFinite(parsedElevation) ? Math.max(0, Math.min(30000, parsedElevation)) : 0;
    const name = candidate.region ? `${candidate.name} (${candidate.region})` : candidate.name;
    const field: Airfield = {
      biome: biomePick,
      id: `usr-${Date.now().toString(36)}`,
      name: name.toUpperCase(),
      code: "USR",
      lat: candidate.lat,
      lon: candidate.lon,
      elevationFt,
      custom: true,
    };
    setCustoms((prev) => [...prev, field]);
    setStation(field);
    setResults([]);
    setQuery("");
    setElevationRaw("");
    setShowSearch(false);
    setSearchError(null);
  }

  function removeCustomStation(id: string) {
    setCustoms((prev) => prev.filter((field) => field.id !== id));
    if (station.id === id) {
      const next = PRESET_AIRFIELDS.find((f) => f.biome === biome) ?? AIRFIELDS.himalaya;
      setStation(next);
    }
  }

  const live = weather !== null;
  const chtShift = atmosphere ? chtRedlineShiftC(atmosphere.ambientDeltaC) : 0;
  const oilShift = atmosphere ? oilRedlineShiftC(atmosphere.ambientDeltaC) : 0;

  const stationButtonClass = (selected: boolean) =>
    `px-2.5 py-1.5 text-left font-mono text-[9px] font-bold tracking-wider transition-colors ${
      selected
        ? "border border-cyan bg-cyan/20 text-cyan"
        : "border border-border bg-background/50 text-muted-foreground hover:border-cyan/50 hover:text-foreground"
    }`;

  return (
    <Panel
      label="ENVIRONMENTAL INGESTION — LAYER-2 LIVE METEO (OPENWEATHERMAP)"
      corner={
        live
          ? `LIVE OBS ${weather?.code ?? station.code} · ${new Date(weather?.updatedAt ?? Date.now()).toLocaleTimeString()}`
          : "SIM ATMOSPHERE (FIXED BIOME PROFILE)"
      }
    >
      <div className="flex flex-wrap items-stretch gap-px bg-border">
        {/* Station picker */}
        <div className="flex min-w-[300px] flex-1 flex-col gap-2 bg-panel/90 p-3">
          <div className="flex items-center gap-2">
            <CloudSun className="h-3.5 w-3.5 text-cyan" />
            <span className="label-xs font-bold text-cyan">STATION (CURRENT BIOME: {biome.toUpperCase()})</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stations.map((field) => (
              <button
                key={field.id}
                onClick={() => {
                  setStation(field);
                  setError(null);
                }}
                aria-pressed={station.id === field.id}
                className={`group relative ${stationButtonClass(station.id === field.id)} ${field.custom ? "border-dashed" : ""}`}
                title={`${field.name} · ${field.lat.toFixed(3)}, ${field.lon.toFixed(3)} · ${field.elevationFt} FT`}
              >
                {field.custom ? "USR" : field.code}
                <span className="mt-0.5 block text-[8px] font-normal opacity-70">{field.name}</span>
                {field.custom && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${field.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeCustomStation(field.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        removeCustomStation(field.id);
                      }
                    }}
                    className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center border border-border bg-background text-muted-foreground hover:border-[#e2523f] hover:text-[#e2523f] group-hover:flex"
                  >
                    <X className="h-2 w-2" />
                  </span>
                )}
              </button>
            ))}
          </div>

          {!showSearch ? (
            <button
              onClick={() => setShowSearch(true)}
              className="flex w-fit items-center gap-1.5 border border-dashed border-cyan/50 px-2.5 py-1 font-mono text-[9px] font-bold tracking-wider text-cyan/80 transition-colors hover:border-cyan hover:text-cyan"
            >
              <Plus className="h-3 w-3" /> ADD LOCATION
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 border border-cyan/30 bg-background/40 p-2">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-cyan" />
                <span className="label-xs text-[8px] font-bold text-cyan">SEARCH ANY PLACE (CITY / AIRFIELD)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSearch();
                  }}
                  placeholder="e.g. Srinagar, Thoise, Cochin…"
                  className="h-6 min-w-0 flex-1 border border-border bg-background/70 px-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/60 focus:border-cyan"
                />
                <button
                  onClick={() => void handleSearch()}
                  disabled={searching || !query.trim()}
                  className="flex items-center gap-1 border border-cyan/70 bg-cyan/15 px-2 py-1 font-mono text-[9px] font-bold tracking-wider text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  SEARCH
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="label-xs text-[8px] text-muted-foreground">TERRAIN:</span>
                {(["himalaya", "thar", "coastal"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setBiomePick(key)}
                    aria-pressed={biomePick === key}
                    className={`border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider transition-colors ${
                      biomePick === key
                        ? "border-cyan bg-cyan/20 text-cyan"
                        : "border-border text-muted-foreground hover:border-cyan/50 hover:text-foreground"
                    }`}
                  >
                    {key.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="label-xs text-[8px] text-muted-foreground">ELEV FT (OPT):</span>
                <input
                  value={elevationRaw}
                  onChange={(event) => setElevationRaw(event.target.value)}
                  inputMode="numeric"
                  placeholder="0 = sea level"
                  className="h-5 w-28 border border-border bg-background/70 px-1.5 font-mono text-[9px] text-foreground placeholder:text-muted-foreground/60 focus:border-cyan"
                />
                <span className="label-xs text-[7px] text-muted-foreground/80">ANCHORS ISA LAPSE AT ALTITUDE</span>
              </div>
              {results.length > 0 && (
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                  {results.map((candidate, index) => (
                    <button
                      key={`${candidate.name}-${candidate.lat}-${candidate.lon}-${index}`}
                      onClick={() => addCustomStation(candidate)}
                      className="flex items-center justify-between gap-2 border border-border bg-background/60 px-2 py-1 text-left transition-colors hover:border-cyan/60 hover:bg-cyan/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[9px] font-bold text-foreground/90">{candidate.name}</span>
                        <span className="label-xs block text-[7px] opacity-70">
                          {candidate.region || "—"} · {candidate.lat.toFixed(3)}, {candidate.lon.toFixed(3)}
                        </span>
                      </span>
                      <Plus className="h-3 w-3 shrink-0 text-cyan" />
                    </button>
                  ))}
                </div>
              )}
              {searchError && <div className="font-mono text-[9px] font-bold tracking-wider text-[#e2523f]">SEARCH: {searchError}</div>}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSync(true)}
              disabled={busy}
              className="flex items-center gap-2 border border-cyan/70 bg-cyan/15 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan transition-colors hover:bg-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {busy ? "FETCHING LIVE WEATHER…" : live ? "RE-SYNC LIVE WEATHER" : "PULL LIVE WEATHER INTO TWIN"}
            </button>
            <button
              onClick={() => void handleSync(false)}
              disabled={busy}
              title="Fetch weather but keep the current biome/terrain"
              className="border border-border bg-background/60 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-50"
            >
              SYNC (KEEP BIOME)
            </button>
            {live && (
              <button
                onClick={() => {
                  clearLiveWeather();
                  setError(null);
                }}
                className="border border-amber/50 bg-amber/10 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-amber transition-colors hover:bg-amber/20"
              >
                RETURN TO SIM
              </button>
            )}
          </div>
          {error && <div className="mt-1 font-mono text-[9px] font-bold tracking-wider text-[#e2523f]">FETCH FAILED: {error}</div>}
        </div>

        {/* Observed weather readouts */}
        <div className="grid min-w-[300px] flex-1 grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <div className="bg-panel/90 p-3">
            <div className="label-xs text-[9px]">STATION OAT ({station.code})</div>
            <div className="readout mt-1 flex items-baseline gap-1 text-lg" style={{ color: live ? "var(--cyan)" : undefined }}>
              {live ? `${weather?.oatC.toFixed(1)}°C` : "—"}
              <ThermometerSun className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="label-xs mt-0.5 text-[8px] opacity-60">
              {live ? `${weather?.condition ?? "—"} · RH ${(weather?.relativeHumidityPct ?? 0).toFixed(0)}%` : "GROUND LEVEL"}
            </div>
          </div>
          <div className="bg-panel/90 p-3">
            <div className="label-xs text-[9px]">OAT @ {altitude.toFixed(0)} FT</div>
            <div className="readout mt-1 text-lg text-cyan">{atmosphere ? `${atmosphere.oatC.toFixed(1)}°C` : "SIM PROFILE"}</div>
            <div className="label-xs mt-0.5 text-[8px] opacity-60">ISA LAPSE APPLIED</div>
          </div>
          <div className="bg-panel/90 p-3">
            <div className="label-xs text-[9px]">WIND</div>
            <div className="readout mt-1 flex items-baseline gap-1 text-lg text-cyan">
              {live ? `${weather?.windSpeedKts.toFixed(0)} KT` : "—"}
              <Wind className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="label-xs mt-0.5 text-[8px] opacity-60">
              {live
                ? `${windDirLabel(weather?.windDirDeg ?? 0)} ${(weather?.windDirDeg ?? 0).toFixed(0).padStart(3, "0")}° · QNH ${(weather?.qnhHpa ?? 1013.25).toFixed(0)} hPa`
                : "QNH 1013 hPa (SIM)"}
            </div>
          </div>
          <div className="bg-panel/90 p-3">
            <div className="label-xs text-[9px]">DENSITY ALTITUDE</div>
            <div className="readout mt-1 text-lg text-amber">{atmosphere ? `${atmosphere.densityAltFt.toFixed(0)} FT` : "—"}</div>
            <div className="label-xs mt-0.5 text-[8px] opacity-60">
              σ = {atmosphere ? atmosphere.densityRatio.toFixed(3) : Math.exp(-altitude / 27000).toFixed(3)}
            </div>
          </div>
        </div>

        {/* Environment normalization guard */}
        <div className="flex min-w-[240px] flex-col justify-center gap-1 bg-panel/90 p-3">
          <div className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-nominal" />
            <span className="label-xs font-bold text-nominal">ENVIRONMENT-NORMALIZED REDLINES</span>
          </div>
          {atmosphere ? (
            <>
              <div className="label-xs text-[9px] text-foreground/90">
                AMBIENT DELTA: {atmosphere.ambientDeltaC >= 0 ? "+" : ""}
                {atmosphere.ambientDeltaC.toFixed(1)}°C VS ISA @ {atmosphere.pressureAltFt.toFixed(0)} FT PA
              </div>
              <div className="label-xs text-[9px] text-foreground/90">
                CHT REDLINE SHIFT: {chtShift >= 0 ? "+" : ""}{chtShift.toFixed(1)}°C · OIL: {oilShift >= 0 ? "+" : ""}{oilShift.toFixed(1)}°C
              </div>
              <div className="label-xs text-[8px] leading-relaxed text-muted-foreground">
                Climate stress is removed from fault detection — only residual deviation above the shifted redline reads as mechanical degradation.
              </div>
            </>
          ) : (
            <div className="label-xs text-[8px] leading-relaxed text-muted-foreground">
              No live observation bound. Engine runs on the fixed biome profile. Sync a station to decouple climate stress from fault detection.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
