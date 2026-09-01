import { useFlightStore } from './flightStore';

export function FlightHUD() {
  const s = useFlightStore();
  const lat = 28.6139 + s.x * 0.00001;
  const lon = 77.209 + s.z * 0.00001;
  const maxCht = Math.max(...s.cht);

  const advisoryColor = maxCht > 220 ? 'text-[#e2523f]' : maxCht > 180 ? 'text-[#f0a63c]' : 'text-[#4fd6a6]';
  const advisoryText = s.systemMessage ?? (maxCht > 220
    ? 'CRITICAL: CHT OVERLIMIT — REDUCE THROTTLE IMMEDIATELY'
    : maxCht > 180
      ? 'CAUTION: THERMAL ELEVATION — MONITOR ENGINE'
      : 'PROPULSION NOMINAL — MISSION CLEARED');
  const emergency = s.emergencyState !== 'nominal';

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top center - Compass */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-6 py-2">
          <div className="readout text-center text-2xl text-[var(--cyan)]">{s.heading.toFixed(0)}°</div>
          <div className="label-xs text-center">HDG</div>
        </div>
      </div>

      {/* Left panel - Flight data */}
      <div className="absolute top-20 left-4 space-y-2">
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[140px]">
          <div className="label-xs">AIRSPEED</div>
          <div className="readout text-xl text-[var(--cyan)]">{s.speed.toFixed(0)} <span className="text-[10px] text-[var(--muted-foreground)]">KTS</span></div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[140px]">
          <div className="label-xs">ALTITUDE</div>
          <div className="readout text-xl text-[var(--cyan)]">{s.altitude.toFixed(0)} <span className="text-[10px] text-[var(--muted-foreground)]">FT</span></div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[140px]">
          <div className="label-xs">AMBIENT</div>
          <div className="readout text-xl text-[var(--amber)]">{s.ambientTemp.toFixed(1)} <span className="text-[10px]">°C</span></div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[140px]">
          <div className="label-xs">ENGINE RPM</div>
          <div className="readout text-xl text-[var(--cyan)]">{s.rpm.toFixed(0)}</div>
        </div>
      </div>

      {/* Right panel - Engine data */}
      <div className="absolute top-20 right-4 hidden space-y-2 sm:block lg:right-[324px]">
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[160px]">
          <div className="label-xs">CHT (1-4)</div>
          <div className="flex gap-2 mt-1">
            {s.cht.map((t, i) => (
              <span key={i} className={`readout text-sm ${t > 200 ? 'text-[#e2523f]' : t > 170 ? 'text-[#f0a63c]' : 'text-[var(--cyan)]'}`}>
                {t.toFixed(0)}°
              </span>
            ))}
          </div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[160px]">
          <div className="label-xs">EGT / MAP</div>
          <div className="readout text-sm">{s.egt.toFixed(0)}°C / {s.map.toFixed(1)} kPa</div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[160px]">
          <div className="label-xs">OIL</div>
          <div className="readout text-sm">{s.oilPressure.toFixed(1)} bar / {s.oilTemp.toFixed(0)}°C</div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2 min-w-[160px]">
          <div className="label-xs">VIBRATION</div>
          <div className={`readout text-sm ${s.vibrationRMS > 1.5 ? 'text-[#e2523f]' : s.vibrationRMS > 0.9 ? 'text-[#f0a63c]' : 'text-[var(--cyan)]'}`}>
            {s.vibrationRMS.toFixed(2)} m/s²
          </div>
        </div>
      </div>

      {/* Bottom center - GPS coordinates */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-6 py-2">
          <div className="flex gap-6">
            <div>
              <div className="label-xs">LAT</div>
              <div className="readout text-sm">{lat.toFixed(4)}°N</div>
            </div>
            <div>
              <div className="label-xs">LON</div>
              <div className="readout text-sm">{lon.toFixed(4)}°E</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom - Health bar */}
      <div className="absolute bottom-[54vh] left-4 right-4 sm:bottom-4 lg:right-[324px]">
        <div className="border border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm px-4 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="label-xs">ENGINE HEALTH</span>
            <span className={`readout text-sm ${s.healthIndex > 0.8 ? 'text-[var(--nominal)]' : s.healthIndex > 0.5 ? 'text-[var(--amber)]' : 'text-[var(--critical)]'}`}>
              {(s.healthIndex * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1 w-full bg-[var(--panel-2)]">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${s.healthIndex * 100}%`,
                backgroundColor: s.healthIndex > 0.8 ? 'var(--nominal)' : s.healthIndex > 0.5 ? 'var(--amber)' : 'var(--critical)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Advisory banner */}
      <div className="absolute top-14 left-4 right-4 text-center sm:left-20 sm:right-20">
        <div role={emergency ? 'alert' : 'status'} aria-live={emergency ? 'assertive' : 'polite'} className={`label-xs ${emergency ? (s.emergencyState === 'crashed' ? 'animate-pulse text-[#e2523f]' : 'text-[#f0a63c]') : advisoryColor} tracking-wider`}>
          {advisoryText}
        </div>
      </div>
      {s.crashCoordinates && (
        <div role="alert" className="absolute top-20 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 border border-[#e2523f] bg-[#230f0d]/95 px-4 py-3 text-center backdrop-blur-sm">
          <div className="label-xs text-[#e2523f]">MAINTENANCE TEAM · CRASH COORDINATES</div>
          <div className="readout mt-1 text-sm text-white">{s.crashCoordinates.lat.toFixed(5)}°N · {s.crashCoordinates.lon.toFixed(5)}°E</div>
          <div className="label-xs mt-1 text-slate-300">IMPACT ALT {s.crashCoordinates.altitude.toFixed(0)} FT · UPLINK BROADCAST</div>
        </div>
      )}
    </div>
  );
}
