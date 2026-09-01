import { useFlightStore, type Biome, type MissionPreset, type FaultFlags } from './flightStore';
import { Panel } from '@/components/hud/primitives';
import { Mountain, Waves, CloudSun, Play, Square, AlertTriangle, RotateCcw, Eye, Navigation } from 'lucide-react';

const BIOMES: { key: Biome; label: string; icon: typeof Mountain }[] = [
  { key: 'himalaya', label: 'HIMALAYA', icon: Mountain },
  { key: 'thar', label: 'THAR DESERT', icon: CloudSun },
  { key: 'coastal', label: 'COASTAL', icon: Waves },
];

const MISSIONS: { key: MissionPreset; label: string; desc: string }[] = [
  { key: 'nominalRoutine', label: 'NOMINAL ROUTINE', desc: 'Scan waypoints and return safely' },
  { key: 'highAltitudeFailure', label: 'HIGH ALT / HIGH TEMP', desc: 'Engine stall, failure, and crash protocol' },
  { key: 'coastalRecovery', label: 'COASTAL COLD / RECOVERY', desc: 'Turbine ice, predictive abort, retrieval' },
];

const FAULTS: { key: keyof FaultFlags; label: string; desc: string }[] = [
  { key: 'c2Overheat', label: 'CYL 2 OVERHEAT', desc: 'CHT2 > 220°C' },
  { key: 'turboFail', label: 'TURBO FAILURE', desc: 'MAP collapse, power loss' },
  { key: 'bearingFail', label: 'BEARING SPALL', desc: 'BPFO peak at 140 Hz' },
  { key: 'injectorClog', label: 'INJECTOR CLOG', desc: 'EGT imbalance' },
];

export function ControlPanel() {
  const s = useFlightStore();

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 max-h-[52svh] overflow-y-auto border-t border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur-md z-10 lg:top-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[300px] lg:border-t-0 lg:border-l">
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
          {s.cameraMode === 'birdseye' ? 'DRAG TO ORBIT THE SURROUNDINGS' : 'DRAG THE UAV TO STEER'}
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
