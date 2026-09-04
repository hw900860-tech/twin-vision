import { useFlightStore, type Biome, type MissionPreset, type FaultFlags } from './flightStore';
import { Panel } from '@/components/hud/primitives';
import { Mountain, Waves, CloudSun, Play, Square, AlertTriangle, RotateCcw, Eye, Navigation, Route, Trash2, Undo2, Plus } from 'lucide-react';
import { analyzeLegs, LEG_RISK_COLOR } from './routePlanner';
import { startGuidedDemo, stopGuidedDemo } from './guidedDemo';

const BIOMES: { key: Biome; label: string; icon: typeof Mountain }[] = [
  { key: 'himalaya', label: 'HIMALAYA', icon: Mountain },
  { key: 'thar', label: 'THAR DESERT', icon: CloudSun },
  { key: 'coastal', label: 'COASTAL', icon: Waves },
];

const MISSIONS: { key: MissionPreset; label: string; desc: string }[] = [
  { key: 'nominalRoutine', label: 'NOMINAL ROUTINE', desc: 'Scan waypoints, auto-divert around hazard zones, return safely' },
  { key: 'himalayaTransect', label: 'HIMALAYA REGION TRANSECT', desc: 'Fly CRYO → LOW PRESSURE → THERMAL SHEAR cores (optimal transit)' },
  { key: 'tharTransect', label: 'THAR REGION TRANSECT', desc: 'Heat Basin → Dust Storm → Mirage Upwell — full zone sweep' },
  { key: 'coastalTransect', label: 'COASTAL REGION TRANSECT', desc: 'Dense air → Cold front → Gust layer over the sea' },
  { key: 'highAltitudeFailure', label: 'HIGH ALT / HIGH TEMP', desc: 'Engine stall, failure, and crash protocol' },
  { key: 'coastalRecovery', label: 'COASTAL COLD / RECOVERY', desc: 'Turbine ice, predictive abort, retrieval' },
];

const FAULTS: { key: keyof FaultFlags; label: string; desc: string }[] = [
  { key: 'c2Overheat', label: 'CYL 2 OVERHEAT', desc: 'CHT2 > 220°C' },
  { key: 'turboFail', label: 'TURBO FAILURE', desc: 'MAP collapse, power loss' },
  { key: 'bearingFail', label: 'BEARING SPALL', desc: 'BPFO peak at 140 Hz' },
  { key: 'injectorClog', label: 'INJECTOR CLOG', desc: 'EGT imbalance' },
  { key: 'misfire3', label: 'MISFIRE CYL 3', desc: 'Knock · EGT3 drop · rough RPM' },
];

export function ControlPanel() {
  const s = useFlightStore();

  const CHIP_TONE: Record<string, string> = {
    cyan: 'text-[var(--cyan)]',
    nominal: 'text-[var(--nominal)]',
    amber: 'text-[var(--amber)]',
    critical: 'text-[var(--critical)]',
  };

  return (
    <div className="pointer-events-auto w-full h-full overflow-y-auto bg-[var(--panel)]/95 backdrop-blur-md">
      {/* Guided Demo — one-click full value chain */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 text-[var(--amber)]">GUIDED DEMO · FULL VALUE CHAIN</div>
        {!s.demo.active ? (
          <button
            onClick={startGuidedDemo}
            className="w-full flex flex-col items-center gap-1 p-2 text-[9px] tracking-wider border border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)] hover:bg-[var(--amber)]/20 transition-colors animate-pulse"
          >
            <span className="flex items-center gap-1 font-semibold">
              <Play className="h-3 w-3" /> RUN GUIDED DEMO
            </span>
            <span className="text-[7.5px] text-[var(--muted-foreground)] leading-tight text-center">
              LAUNCH → TRANSECT → FAULT → GCS ALERT → MAYDAY → RTB → AUTO REPORT
            </span>
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono font-bold tracking-wider text-[var(--amber)] animate-pulse">
                PHASE: {s.demo.phase.toUpperCase()}
              </span>
              <button
                onClick={stopGuidedDemo}
                className="text-[7.5px] border border-[var(--border)] px-1.5 py-0.5 hover:border-[var(--critical)] hover:text-[var(--critical)] transition-colors"
              >
                ABORT
              </button>
            </div>
            <div className="space-y-0.5">
              {s.demo.chips.map((c, i) => (
                <div key={i} className={`flex items-start gap-1 text-[7.5px] leading-tight ${CHIP_TONE[c.tone] ?? ''}`}>
                  <span className="font-mono shrink-0 opacity-80">T+{String(c.t).padStart(2, '0')}s</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Terrain Selector */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 text-[var(--cyan)]">TERRAIN</div>
        <div className="grid grid-cols-3 gap-1">
          {BIOMES.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.key}
                onClick={() => s.setBiome(b.key)}
                aria-pressed={s.biome === b.key}
                className={`flex flex-col items-center gap-1 p-2 text-[9px] tracking-wider transition-colors ${
                  s.biome === b.key
                    ? 'border border-[var(--cyan)] bg-[var(--cyan)]/10 text-[var(--cyan)]'
                    : 'border border-[var(--border)] hover:border-[var(--cyan)]/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 text-[var(--cyan)]">CAMERA VIEW</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => s.setCameraMode('chase')}
            aria-pressed={s.cameraMode === 'chase'}
            className={`flex min-h-11 items-center justify-center gap-1 p-2 text-[9px] tracking-wider transition-colors ${s.cameraMode === 'chase' ? 'border border-[var(--cyan)] bg-[var(--cyan)]/10 text-[var(--cyan)]' : 'border border-[var(--border)] hover:border-[var(--cyan)]/50'}`}
          >
            <Navigation className="h-3.5 w-3.5" /> CHASE
          </button>
          <button
            type="button"
            onClick={() => s.setCameraMode('birdseye')}
            aria-pressed={s.cameraMode === 'birdseye'}
            className={`flex min-h-11 items-center justify-center gap-1 p-2 text-[9px] tracking-wider transition-colors ${s.cameraMode === 'birdseye' ? 'border border-[var(--cyan)] bg-[var(--cyan)]/10 text-[var(--cyan)]' : 'border border-[var(--border)] hover:border-[var(--cyan)]/50'}`}
          >
            <Eye className="h-3.5 w-3.5" /> BIRD&apos;S-EYE
          </button>
        </div>
        <div className="mt-2 text-[8px] text-[var(--muted-foreground)]">
          {s.cameraMode === 'birdseye'
            ? 'DRAG TO ORBIT · LEFT-DRAG UAV TO COMMAND HEADING'
            : 'LEFT-DRAG UAV TO STEER · DRAG SCENE OR RIGHT-DRAG TO LOOK AROUND'}
        </div>
      </div>

      {/* Mission Presets */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 text-[var(--cyan)]">MISSION SCENARIOS</div>
        <div className="space-y-1.5">
          {MISSIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => s.setMissionPreset(m.key)}
              className={`min-h-14 w-full text-left p-2 text-[9px] tracking-wider transition-colors ${
                s.missionPreset === m.key
                  ? 'border border-[var(--cyan)] bg-[var(--cyan)]/10 text-[var(--cyan)]'
                  : 'border border-[var(--border)] hover:border-[var(--cyan)]/50'
              }`}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-[8px] text-[var(--muted-foreground)] mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
        {s.waypoints.length > 0 && (
          <div className="mt-2 flex gap-1">
            <button
              onClick={() => s.startMission()}
              className="flex-1 flex items-center justify-center gap-1 p-1.5 text-[9px] border border-[var(--nominal)] text-[var(--nominal)] hover:bg-[var(--nominal)]/10"
            >
              <Play className="h-2.5 w-2.5" /> START
            </button>
            <button
               onClick={() => s.resetSimulation()}
              className="flex items-center justify-center p-1.5 text-[9px] border border-[var(--border)] hover:border-[var(--amber)]/50"
            >
              <Square className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
        {s.systemMessage && (
          <div role="alert" className={`mt-3 border px-2 py-2 text-[8px] leading-relaxed tracking-wider ${s.emergencyState === 'crashed' ? 'border-[var(--critical)] bg-[var(--critical)]/10 text-[var(--critical)]' : 'border-[var(--amber)]/50 bg-[var(--amber)]/10 text-[var(--amber)]'}`}>
            {s.systemMessage}
          </div>
        )}
        {s.missionActive && s.waypoints.length > 0 && (
          <div className="mt-2">
            <div className="label-xs mb-1">WAYPOINTS</div>
            <div className="space-y-1">
              {s.waypoints.map((wp, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-[8px] tracking-wider ${
                    i < Math.floor(s.missionProgress) ? 'text-[var(--nominal)]' :
                    i === Math.floor(s.missionProgress) ? 'text-[var(--cyan)]' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  <span className={`h-1 w-1 ${
                    i < Math.floor(s.missionProgress) ? 'bg-[var(--nominal)]' :
                    i === Math.floor(s.missionProgress) ? 'bg-[var(--cyan)]' : 'bg-[var(--muted-foreground)]'
                  }`} />
                  {wp.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Throttle + Rudder */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 text-[var(--cyan)]">ENGINE CONTROL</div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <span className="label-xs">THROTTLE</span>
              <span className="readout text-xs text-[var(--cyan)]">{s.throttle.toFixed(0)}%</span>
            </div>
            <input
              aria-label="Throttle"
              type="range" min={0} max={100} value={s.throttle}
              onChange={(e) => s.setThrottle(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none bg-[var(--panel-2)] accent-[var(--cyan)]"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="label-xs">RUDDER</span>
              <span className="readout text-xs text-[var(--cyan)]">{s.rudder.toFixed(2)}</span>
            </div>
            <input
              aria-label="Rudder"
              type="range" min={-100} max={100} value={s.rudder * 100}
              onChange={(e) => s.setRudder(Number(e.target.value) / 100)}
              className="h-1 w-full cursor-pointer appearance-none bg-[var(--panel-2)] accent-[var(--amber)]"
            />
          </div>
        </div>
      </div>

      {/* Fault Injection */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="label-xs text-[var(--critical)]">FAULT INJECTION</div>
             <button aria-label="Reset all injected faults" onClick={s.resetFaults} className="min-h-10 text-[8px] text-[var(--muted-foreground)] hover:text-[var(--cyan)] flex items-center gap-0.5">
            <RotateCcw className="h-2.5 w-2.5" /> RESET
          </button>
        </div>
        <div className="space-y-1.5">
          {FAULTS.map((f) => (
            <button
              key={f.key}
              onClick={() => s.toggleFault(f.key)}
              aria-pressed={s.faults[f.key]}
              className={`w-full flex items-center gap-2 p-2 text-[9px] tracking-wider transition-colors ${
                s.faults[f.key]
                  ? 'border border-[var(--critical)] bg-[var(--critical)]/10 text-[var(--critical)]'
                  : 'border border-[var(--border)] hover:border-[var(--critical)]/30'
              }`}
            >
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <div className="text-left">
                <div className="font-semibold">{f.label}</div>
                <div className="text-[8px] opacity-60">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Atmospheric Regions in this terrain (live-meteo deformed when bound) */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 flex items-center justify-between text-[var(--cyan)]">
          <span>ATMOSPHERIC REGIONS</span>
          {s.weather ? (
            <span className="text-[var(--amber)]" title={`Station ${s.weather.code} · wind ${s.weather.windSpeedKts.toFixed(0)} KT · QNH ${s.weather.qnhHpa.toFixed(0)} hPa`}>
              ◈ LIVE METEO BOUND
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">STATIC MAP</span>
          )}
        </div>
        <div className="space-y-1.5">
          {s.regions.map((r) => {
            const active = s.regionsInside.includes(r.id);
            const tone = r.severity === 'critical' ? 'var(--critical)' : r.severity === 'caution' ? 'var(--amber)' : 'var(--cyan)';
            return (
              <div
                key={r.id}
                className={`border px-2 py-1.5 text-[8px] tracking-wider ${active ? 'shadow-[0_0_10px_rgba(111,216,232,0.25)]' : ''}`}
                style={{ borderColor: active ? tone : 'var(--border)', background: active ? 'rgba(111,216,232,0.06)' : 'transparent', color: active ? tone : 'var(--muted-foreground)' }}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{active ? '◈ ' : '◇ '}{r.name}</span>
                  <span style={{ color: active ? tone : 'var(--muted-foreground)' }}>
                    {active ? 'INSIDE' : `${Math.round(Math.hypot(s.x - r.cx, s.z - r.cz) - r.radius)}m`}
                  </span>
                </div>
                <div className="mt-0.5 opacity-80">
                  OAT {r.params.tempDeltaC >= 0 ? '+' : ''}{r.params.tempDeltaC.toFixed(0)}°C · DENS ×{r.params.densityRatio.toFixed(2)} · MAP ×{r.params.pressureDelta.toFixed(2)} · TURB {r.params.turbulence.toFixed(1)}
                  {r.stretch ? ` · WIND ×${r.stretch.toFixed(2)} @ ${((r.axisDeg ?? 0) % 360).toFixed(0)}°` : ''}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[8px] text-[var(--muted-foreground)]">
          CROSSING A REGION ALTERS ENGINE TELEMETRY + STREAMS AN ALERT TO GCS
        </div>
        {(s.regionMode !== 'cruise' || s.regionModeText) && (
          <div
            role="status"
            className="mt-2 border px-2 py-1.5 text-[8px] leading-relaxed tracking-wider"
            style={{
              borderColor: s.regionMode === 'evade' ? 'var(--nominal)' : 'var(--amber)',
              background: s.regionMode === 'evade' ? 'rgba(16,185,129,0.08)' : 'rgba(240,166,60,0.08)',
              color: s.regionMode === 'evade' ? 'var(--nominal)' : 'var(--amber)',
            }}
          >
            <div className="font-semibold">
              {s.regionMode === 'evade' ? '↻ EVASIVE REROUTE ACTIVE' : s.regionMode === 'transit' ? '◈ OPTIMAL TRANSIT ACTIVE' : 'REGION NAVIGATION'}
            </div>
            <div className="mt-0.5 opacity-90">{s.regionModeText ?? 'Flying clear of hazard zones'}</div>
            {s.transitEcoThrottle !== null && s.regionMode === 'transit' && (
              <div className="mt-0.5 text-[var(--cyan)]">THROTTLE <b>{s.throttle.toFixed(0)}%</b> (ECO CLAMP) — RESTORES TO {s.transitEcoThrottle.toFixed(0)}% AFTER ZONE</div>
            )}
            {s.evadePath.length > 0 && (
              <div className="mt-0.5 text-[var(--cyan)]">DETOUR WAYPOINT {Math.min(s.evadeIndex + 1, s.evadePath.length)}/{s.evadePath.length}</div>
            )}
          </div>
        )}
      </div>

      {/* Waypoint Route Planner — pre-launch re-routing around region rings */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="label-xs mb-2 flex items-center justify-between text-[var(--cyan)]">
          <span>ROUTE PLANNER</span>
          <button
            type="button"
            onClick={() => s.setPlannerMode(!s.plannerMode)}
            disabled={s.missionActive}
            aria-pressed={s.plannerMode}
            className={`flex items-center gap-1 px-2 py-1 text-[8px] tracking-wider transition-colors ${s.plannerMode ? 'border border-[var(--cyan)] bg-[var(--cyan)]/15 text-[var(--cyan)]' : 'border border-[var(--border)] hover:border-[var(--cyan)]/50'} disabled:opacity-40`}
          >
            <Route className="h-2.5 w-2.5" />
            {s.plannerMode ? 'PLANNING…' : 'PLAN ROUTE'}
          </button>
        </div>

        {s.plannerMode && (
          <>
            <div className="mb-2 flex gap-1">
              <button
                type="button"
                onClick={() => s.resetRoute()}
                className="flex items-center gap-1 px-2 py-1 text-[8px] border border-[var(--border)] hover:border-[var(--cyan)]/50 text-[var(--muted-foreground)]"
              >
                <Undo2 className="h-2.5 w-2.5" /> RESET TO MISSION ROUTE
              </button>
            </div>

            {/* Per-leg risk analysis over the region rings */}
            <div className="space-y-1">
              {analyzeLegs(s.waypoints, s.regions).map((leg) => {
                const tone = LEG_RISK_COLOR[leg.risk];
                const warn = leg.crossings
                  .map((c) => `${c.region.name}${c.region.severity === 'critical' ? ' (CRITICAL)' : ''}`)
                  .join(' · ');
                return (
                  <div
                    key={leg.index}
                    className="flex items-center justify-between border px-2 py-1 text-[8px] tracking-wider"
                    style={{ borderColor: leg.risk === 'clear' ? 'var(--border)' : tone, color: leg.risk === 'clear' ? 'var(--muted-foreground)' : tone, background: leg.risk === 'clear' ? 'transparent' : `${tone}14` }}
                  >
                    <span className="font-semibold">LEG {leg.index + 1}</span>
                    <span className="truncate px-1 opacity-90">{warn || 'CLEAR PATH'}</span>
                    <span style={{ color: tone }}>{leg.risk.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>

            {/* Waypoint list with remove buttons */}
            <div className="mt-2 space-y-1">
              {s.waypoints.map((wp, i) => {
                const isBase = i === 0 || i === s.waypoints.length - 1;
                const inRegion = s.regions.find((r) => {
                  const p = { x: wp.x, z: wp.z };
                  const ax = (r.axisDeg ?? 0) * Math.PI / 180;
                  const stretch = r.stretch ?? 1;
                  const dx = (wp.x - r.cx) / stretch;
                  const dz = wp.z - r.cz;
                  const cos = Math.cos(-ax);
                  const sin = Math.sin(-ax);
                  const lx = dx * cos - dz * sin;
                  const lz = dx * sin + dz * cos;
                  return lx * lx + lz * lz <= r.radius * r.radius;
                });
                return (
                  <div key={i} className="flex items-center justify-between gap-1 border border-[var(--border)] px-2 py-1 text-[8px]">
                    <span className={`font-semibold ${isBase ? 'text-[var(--nominal)]' : 'text-[var(--cyan)]'}`}>{wp.label}</span>
                    <span className="opacity-70">X {wp.x.toFixed(0)} · Z {wp.z.toFixed(0)}</span>
                    {inRegion && <span className="text-[var(--amber)]">⚠ {inRegion.id}</span>}
                    <button
                      type="button"
                      onClick={() => s.removeWaypoint(i)}
                      disabled={isBase || s.missionActive}
                      className="text-[var(--critical)] hover:bg-[var(--critical)]/10 p-0.5 disabled:opacity-30"
                      aria-label={`Remove ${wp.label}`}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-1 text-[8px] text-[var(--muted-foreground)]">
              <Plus className="h-2.5 w-2.5" /> CLICK TERRAIN TO APPEND WAYPOINT
            </div>
            <div className="mt-0.5 text-[8px] text-[var(--muted-foreground)]">
              DRAG A WAYPOINT MARKER TO MOVE IT · LEGS TINTED BY REGION RISK
            </div>
          </>
        )}

        {!s.plannerMode && (
          <div className="text-[8px] text-[var(--muted-foreground)]">
            ROUTE THE MISSION AROUND {s.regions.filter((r) => r.severity === 'critical').map((r) => r.name).join(' · ') || 'CRITICAL REGIONS'} BEFORE LAUNCH
          </div>
        )}
      </div>

      {/* Live Engine Stats */}
      <div className="p-3">
        <div className="label-xs mb-2 text-[var(--cyan)]">LIVE ENGINE DATA</div>
        <div className="space-y-1">
          {[
            { k: 'RPM', v: s.rpm.toFixed(0), t: 'var(--cyan)' },
            { k: 'EGT', v: `${s.egt.toFixed(0)}°C`, t: s.egt > 750 ? 'var(--critical)' : s.egt > 700 ? 'var(--amber)' : 'var(--cyan)' },
            { k: 'MAP', v: `${s.map.toFixed(1)} kPa`, t: 'var(--cyan)' },
            { k: 'OIL PRESS', v: `${s.oilPressure.toFixed(1)} bar`, t: 'var(--cyan)' },
            { k: 'OIL TEMP', v: `${s.oilTemp.toFixed(0)}°C`, t: 'var(--cyan)' },
            { k: 'VIB RMS', v: `${s.vibrationRMS.toFixed(2)} m/s²`, t: s.vibrationRMS > 1.5 ? 'var(--critical)' : 'var(--cyan)' },
            { k: 'HEALTH', v: `${(s.healthIndex * 100).toFixed(1)}%`, t: s.healthIndex > 0.8 ? 'var(--nominal)' : 'var(--amber)' },
            { k: 'RUL', v: `${s.rul.toFixed(0)}h`, t: 'var(--cyan)' },
          ].map((r) => (
            <div key={r.k} className="flex justify-between items-center py-0.5">
              <span className="label-xs text-[8px]">{r.k}</span>
              <span className="readout text-[10px]" style={{ color: r.t }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
