import { useFlightStore } from './flightStore';

const REGION_TONE: Record<string, string> = {
  info: '#7fb0ff',
  caution: '#f0a63c',
  critical: '#ff7a6b',
};

export function FlightHUD() {
  const s = useFlightStore();
  const lat = 28.6139 + s.x * 0.00001;
  const lon = 77.209 + s.z * 0.00001;
  const maxCht = Math.max(...s.cht);
  const region = s.currentRegion;
  const regionTone = region ? (REGION_TONE[region.severity] ?? '#7fb0ff') : null;

  const advisoryColor = maxCht > 220 ? 'text-[#e2523f]' : maxCht > 180 ? 'text-[#f0a63c]' : 'text-[#4fd6a6]';
  const advisoryText = s.systemMessage ?? (maxCht > 220
    ? 'CRITICAL: CHT OVERLIMIT — REDUCE THROTTLE IMMEDIATELY'
    : maxCht > 180
      ? 'CAUTION: THERMAL ELEVATION — MONITOR ENGINE'
      : 'PROPULSION NOMINAL — MISSION CLEARED');
  const emergency = s.emergencyState !== 'nominal';

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top Left - Compact Integrated Flight Data Ribbon (Airspeed, Altitude, Heading, RPM) */}
      <div className="absolute top-2 left-2 flex items-center gap-2 font-mono text-[9px]">
        <div className="border border-cyan/40 bg-panel/90 px-2.5 py-1 backdrop-blur-md rounded shadow-lg text-cyan flex items-center gap-2">
          <span className="text-[7.5px] text-muted-foreground font-bold">AIRSPEED</span>
          <span className="font-bold text-[11px] text-foreground">{s.speed.toFixed(0)} <span className="text-[7.5px] text-cyan">KTS</span></span>
        </div>

        <div className="border border-cyan/40 bg-panel/90 px-2.5 py-1 backdrop-blur-md rounded shadow-lg text-cyan flex items-center gap-2">
          <span className="text-[7.5px] text-muted-foreground font-bold">ALTITUDE</span>
          <span className="font-bold text-[11px] text-foreground">{s.altitude.toFixed(0)} <span className="text-[7.5px] text-cyan">FT</span></span>
        </div>

        <div className="border border-cyan/40 bg-panel/90 px-2.5 py-1 backdrop-blur-md rounded shadow-lg text-cyan flex items-center gap-2">
          <span className="text-[7.5px] text-muted-foreground font-bold">HDG</span>
          <span className="font-bold text-[11px] text-foreground">{s.heading.toFixed(0)}°</span>
        </div>

        <div className="border border-cyan/40 bg-panel/90 px-2.5 py-1 backdrop-blur-md rounded shadow-lg text-cyan flex items-center gap-2">
          <span className="text-[7.5px] text-muted-foreground font-bold">RPM</span>
          <span className="font-bold text-[11px] text-foreground">{s.rpm.toFixed(0)}</span>
        </div>
      </div>

      {/* Advisory banner - Moved cleanly to top center */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div
          role={emergency ? 'alert' : 'status'}
          aria-live={emergency ? 'assertive' : 'polite'}
          className={`border border-border/80 bg-panel/90 px-3 py-1 backdrop-blur-md rounded text-[8.5px] font-mono ${
            emergency
              ? (s.emergencyState === 'crashed' ? 'animate-pulse text-[#e2523f] border-[#e2523f]' : 'text-[#f0a63c] border-[#f0a63c]')
              : `${advisoryColor} border-cyan/30`
          } tracking-wider font-bold shadow-lg`}
        >
          {advisoryText}
        </div>
      </div>

      {/* Bottom Right - GPS coordinates anchored cleanly */}
      <div className="absolute bottom-2 left-2 z-10 font-mono text-[8px]">
        <div className="border border-border/60 bg-panel/90 px-2 py-1 backdrop-blur-md rounded text-muted-foreground flex items-center gap-3">
          <span>LAT: <strong className="text-foreground">{lat.toFixed(4)}°N</strong></span>
          <span>LON: <strong className="text-foreground">{lon.toFixed(4)}°E</strong></span>
        </div>
      </div>

      {/* Current atmospheric region readout (top right) */}
      {region && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1 font-mono text-[8.5px]">
          <div
            className="border bg-panel/90 px-2.5 py-1 backdrop-blur-md rounded shadow-lg"
            style={{ borderColor: regionTone ?? '#7fb0ff', color: regionTone ?? '#7fb0ff' }}
          >
            <span className="font-bold tracking-wider">◈ IN REGION — {region.name}</span>
            <div className="mt-0.5 text-muted-foreground">
              OAT {region.params.tempDeltaC >= 0 ? '+' : ''}{region.params.tempDeltaC.toFixed(0)}°C
              {' · '}DENS ×{region.params.densityRatio.toFixed(2)}
              {' · '}MAP ×{region.params.pressureDelta.toFixed(2)}
              {' · '}TURB {region.params.turbulence.toFixed(1)}
            </div>
          </div>
          <div className="border border-border/50 bg-panel/80 px-2 py-0.5 backdrop-blur-md rounded text-muted-foreground">
            LEFT-DRAG UAV TO STEER · DRAG SCENE / RIGHT-DRAG TO LOOK · W/S THROTTLE · A/D ALTITUDE
          </div>
        </div>
      )}
      {!region && (
        <div className="absolute top-2 right-2 font-mono text-[8px] text-muted-foreground/70">
          <div className="border border-border/40 bg-panel/70 px-2 py-0.5 backdrop-blur-md rounded">
            LEFT-DRAG UAV TO STEER · DRAG SCENE / RIGHT-DRAG TO LOOK · W/S THROTTLE · A/D ALTITUDE
          </div>
        </div>
      )}

      {/* Emergency Crash Modal Alert */}
      {s.crashCoordinates && (
        <div role="alert" className="absolute top-14 left-1/2 w-[min(92vw,400px)] -translate-x-1/2 border border-[#e2523f] bg-[#230f0d]/95 px-4 py-3 text-center backdrop-blur-md rounded shadow-2xl z-50">
          <div className="label-xs text-[#e2523f]">MAINTENANCE TEAM · CRASH COORDINATES</div>
          <div className="readout mt-1 text-sm text-white font-mono">{s.crashCoordinates.lat.toFixed(5)}°N · {s.crashCoordinates.lon.toFixed(5)}°E</div>
          <div className="label-xs mt-1 text-slate-300">IMPACT ALT {s.crashCoordinates.altitude.toFixed(0)} FT · UPLINK BROADCAST</div>
        </div>
      )}
    </div>
  );
}
