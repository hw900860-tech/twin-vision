/**
 * GCS "UAV DATA STREAM" band — the operator-facing readout of everything the
 * aircraft is sending. Big, color-coded tiles with plain-language captions so
 * a non-specialist can tell at a glance what the stream is saying, plus a
 * heartbeat + packet counters that prove the data is crossing the link live.
 */
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { useLinkStore } from "./linkStore";

type Tone = "ok" | "warn" | "crit" | "dim";

function toneColor(t: Tone): string {
  return t === "ok" ? "#34d399" : t === "warn" ? "#f0a63c" : t === "crit" ? "#ef4444" : "#64748b";
}

function Tile({
  label, value, unit, tone = "ok", caption,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: Tone;
  caption: string;
}) {
  return (
    <div className="border px-2.5 py-2" style={{ borderColor: `${toneColor(tone)}55`, background: `rgba(2,8,14,0.7)` }}>
      <div className="label-xs mb-1 text-muted-foreground tracking-widest">{label}</div>
      <div className="flex items-baseline gap-1 font-mono">
        <span className="text-xl font-bold leading-none" style={{ color: toneColor(tone) }}>{value}</span>
        <span className="text-[9px] opacity-70">{unit}</span>
      </div>
      <div className="mt-1 text-[8px] leading-tight opacity-60">{caption}</div>
    </div>
  );
}

export function GcsLiveDataBand() {
  const flight = useFlightStore();
  const link = useLinkStore();

  const fresh = link.wsStatus === "online" && link.airborneOnline && link.rxFrames > 0 && link.lastFrameAgeMs < 1500;
  const stale = link.rxFrames > 0 && link.lastFrameAgeMs > 3000;
  const noLink = !link.airborneOnline && link.rxFrames === 0;

  const chtMax = Math.max(...flight.cht, 0);
  const faultsOn = Object.values(flight.faults).filter(Boolean).length;
  const anyFault = faultsOn > 0;
  const egtTone: Tone = flight.egt > 850 ? "crit" : flight.egt > 720 ? "warn" : "ok";
  const chtTone: Tone = chtMax > 220 ? "crit" : chtMax > 195 ? "warn" : "ok";
  const mapTone: Tone = flight.map < 42 ? "crit" : flight.map < 70 ? "warn" : "ok";
  const oilTone: Tone = flight.oilTemp > 125 ? "crit" : flight.oilTemp > 110 ? "warn" : "ok";
  const vibTone: Tone = flight.vibrationRMS > 3 ? "crit" : flight.vibrationRMS > 1.6 ? "warn" : "ok";
  const statusTone: Tone = noLink ? "dim" : stale || anyFault ? "warn" : "ok";

  const h = Math.round(flight.heading);
  const hotCyl = flight.cht.findIndex((c) => c > 195) + 1;

  return (
    <div className="mb-4 border bg-panel/85 p-3 backdrop-blur">
      {/* header row */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label-xs font-bold tracking-widest" style={{ color: statusTone === "dim" ? "#64748b" : statusTone === "warn" ? "#f0a63c" : "#34d399" }}>
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" style={{ background: toneColor(statusTone) }} />
          UAV DATA STREAM
          {noLink ? " — AWAITING AIRBORNE" : stale ? " — STALE (>3s)" : " — LIVE"}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] text-muted-foreground">
          <span>PKT <b className="text-cyan">{link.rxFrames}</b> @ <b className={link.rxRateHz === 0 && link.airborneOnline ? "text-critical" : "text-cyan"}>{link.rxRateHz} Hz</b></span>
          <span>AGE <b className={stale ? "text-critical" : "text-cyan"}>{Math.round(link.lastFrameAgeMs)} ms</b></span>
          <span>GAPS <b className="text-amber">{link.rxGaps}</b> · REC <b className="text-nominal">{link.gapRecovered}</b></span>
          <span title="One 112-byte binary frame carries flight state + 4-cylinder engine data + fault flags, CRC-16 protected">
            FRAME <b className="text-cyan">112 B · CRC-16</b> ≈ 18 kbit/s @ 20 Hz
          </span>
        </div>
      </div>

      {/* flight + engine tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Tile label="ALTITUDE" value={flight.altitude.toFixed(0)} unit="FT"
          caption={flight.altitude < 1000 ? "Low-level — terrain clearance watch" : flight.altitude > 24000 ? "High altitude — thin air, turbo range" : "Within nominal cruise band"} />
        <Tile label="AIRSPEED" value={flight.speed.toFixed(0)} unit="KTS"
          caption={flight.speed < 60 ? "Slow — stall margin low" : "Calibrated airspeed over ground"} />
        <Tile label="HEADING" value={String(h).padStart(3, "0")} unit="°M"
          caption={flight.missionActive ? "Autopilot steering to waypoint" : "Manual flight mode"} />
        <Tile label="THROTTLE" value={flight.throttle.toFixed(0)} unit="%"
          tone={flight.regionMode === "transit" ? "warn" : "ok"}
          caption={flight.regionMode === "transit" ? "ECO clamp — region optimal-power transit" : flight.missionActive ? "Mission cruise power" : "Operator-set"} />
        <Tile label="CHT (max)" value={chtMax.toFixed(0)} unit={`°C${hotCyl ? ` · CYL ${hotCyl}` : ""}`} tone={chtTone}
          caption={chtTone === "crit" ? "Critical — cooling fault, descend & reduce power" : chtTone === "warn" ? "Thermal elevation — watch cylinder temps" : "All cylinders within limits"} />
        <Tile label="EGT" value={flight.egt.toFixed(0)} unit="°C" tone={egtTone}
          caption={egtTone === "crit" ? "Over temp — possible injector/fuel issue" : egtTone === "warn" ? "Elevated — high-power or rich-burn check" : "Exhaust temps nominal"} />
        <Tile label="MAP" value={flight.map.toFixed(1)} unit="kPa" tone={mapTone}
          caption={mapTone === "crit" ? "Very low boost — power loss (trough/turbo)" : mapTone === "warn" ? "Reduced boost — density/altitude effect" : "Manifold pressure healthy"} />
        <Tile label="VIBRATION" value={flight.vibrationRMS.toFixed(2)} unit="m/s²" tone={vibTone}
          caption={vibTone === "crit" ? "Severe vibration — bearing/spall risk" : vibTone === "warn" ? "Elevated — shear/turbulence excitation" : "Dynamic balance nominal"} />
      </div>

      {/* status footer */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono">
        <span className="text-muted-foreground">
          {anyFault
            ? <span className="text-critical">⚠ FAULT FLAGS: {Object.entries(flight.faults).filter(([, v]) => v).map(([k]) => k.replace("c2Overheat", "CYL2 OVERHEAT").replace("turboFail", "TURBO FAIL").replace("bearingFail", "BEARING").replace("injectorClog", "INJECTOR")).join(" · ")}</span>
            : <span className="text-nominal">NO FAULT FLAGS — ENGINE PARAMETERS IN LIMITS</span>}
        </span>
        <span className="text-muted-foreground">
          HEALTH <b style={{ color: flight.healthIndex > 0.6 ? "#34d399" : flight.healthIndex > 0.3 ? "#f0a63c" : "#ef4444" }}>{(flight.healthIndex * 100).toFixed(0)}%</b>
          {" · "}OIL <b style={{ color: oilTone === "ok" ? "#6fd8e8" : toneColor(oilTone) }}>{flight.oilTemp.toFixed(0)}°C</b>
          {" · "}OIL PRESS <b className="text-cyan">{flight.oilPressure.toFixed(1)} bar</b>
          {" · "}RUL <b className="text-cyan">{flight.rul.toFixed(0)} h</b>
          {flight.missionActive && <span className="ml-1 text-cyan">· MISSION ACTIVE</span>}
        </span>
      </div>
    </div>
  );
}
