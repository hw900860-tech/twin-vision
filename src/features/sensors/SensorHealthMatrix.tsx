import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Cpu,
  Flame,
  Gauge,
  RotateCcw,
  Snowflake,
  Thermometer,
  Unplug,
} from "lucide-react";

/**
 * AERIS-TWIN — Analytical Sensor Redundancy & Health Matrix.
 *
 * MALE UAVs cannot afford triple physical redundancy (SWaP). Instead the 0D
 * thermodynamic twin synthesizes what a lost/drifting sensor *should* read
 * from the remaining healthy channels, and the GCS seamlessly switches the
 * active data stream to that twin estimate ("Virtual Override") so the
 * mission continues.
 *
 * This panel is a self-contained demonstrator: 4 mission-critical sensors
 * start nominal; the Fault Sandbox injects realistic failure modes
 * (wire snap, thermal drift, MAP icing) so judges can watch the twin
 * take over in real time.
 */

type SensorStatus = "nominal" | "drifting" | "dead";

interface SensorState {
  id: string;
  name: string;
  sub: string;
  rawReading: number;
  expectedReading: number;
  unit: string;
  status: SensorStatus;
  isVirtualOverride: boolean;
  /** Residual above this → yellow (drifting, recalibrate post-flight). */
  driftThreshold: number;
  /** Residual above this, or a physically impossible reading → red (override). */
  criticalThreshold: number;
  /** Physical plausibility envelope — outside of it the channel is dead. */
  minPlausible: number;
  maxPlausible: number;
}

const INITIAL_SENSORS: SensorState[] = [
  {
    id: "cht2",
    name: "CHT 2",
    sub: "CYL 2 · TYPE K T/C",
    rawReading: 146,
    expectedReading: 150,
    unit: "°C",
    status: "nominal",
    isVirtualOverride: false,
    driftThreshold: 15,
    criticalThreshold: 40,
    minPlausible: -40,
    maxPlausible: 350,
  },
  {
    id: "egt1",
    name: "EGT 1",
    sub: "CYL 1 EXHAUST · TYPE K T/C",
    rawReading: 682,
    expectedReading: 680,
    unit: "°C",
    status: "nominal",
    isVirtualOverride: false,
    driftThreshold: 20,
    criticalThreshold: 60,
    minPlausible: 0,
    maxPlausible: 1100,
  },
  {
    id: "map",
    name: "MAP",
    sub: "MANIFOLD ABS · TURBOCHARGED",
    rawReading: 93,
    expectedReading: 93,
    unit: "kPa",
    status: "nominal",
    isVirtualOverride: false,
    driftThreshold: 4,
    criticalThreshold: 10,
    minPlausible: 10,
    maxPlausible: 240,
  },
  {
    id: "oil",
    name: "OIL PRESS",
    sub: "ENGINE LUBE · 0–10 BAR XDCR",
    rawReading: 5.2,
    expectedReading: 5.1,
    unit: "bar",
    status: "nominal",
    isVirtualOverride: false,
    driftThreshold: 0.6,
    criticalThreshold: 1.5,
    minPlausible: 0.3,
    maxPlausible: 12,
  },
];

/** Pure classifier: plausibility check first, then residual bands. */
function classify(sensor: SensorState, rawReading: number): SensorStatus {
  const residual = Math.abs(rawReading - sensor.expectedReading);
  const physicallyImpossible =
    rawReading < sensor.minPlausible || rawReading > sensor.maxPlausible;
  if (physicallyImpossible || residual > sensor.criticalThreshold) return "dead";
  if (residual > sensor.driftThreshold) return "drifting";
  return "nominal";
}

function applyReading(sensor: SensorState, rawReading: number): SensorState {
  const status = classify(sensor, rawReading);
  return {
    ...sensor,
    rawReading,
    status,
    isVirtualOverride: status === "dead",
  };
}

const STATUS_META: Record<
  SensorStatus,
  { label: string; text: string; ring: string; bg: string; dot: string }
> = {
  nominal: {
    label: "NOMINAL",
    text: "text-[#22c55e]",
    ring: "border-[#22c55e]/40",
    bg: "bg-[#22c55e]/10",
    dot: "bg-[#22c55e]",
  },
  drifting: {
    label: "DRIFTING",
    text: "text-[#f59e0b]",
    ring: "border-[#f59e0b]/40",
    bg: "bg-[#f59e0b]/10",
    dot: "bg-[#f59e0b]",
  },
  dead: {
    label: "DEAD",
    text: "text-[#ef4444]",
    ring: "border-[#ef4444]/50",
    bg: "bg-[#ef4444]/10",
    dot: "bg-[#ef4444]",
  },
};

const OVERRIDE = "text-[#0ea5e9]";
const OVERRIDE_BORDER = "border-[#0ea5e9]/50";
const OVERRIDE_BG = "bg-[#0ea5e9]/10";

function SensorIcon({ kind }: { kind: "temp" | "pressure" }) {
  const Icon = kind === "temp" ? Thermometer : Gauge;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-[#0ea5e9]" />;
}

export function SensorHealthMatrix() {
  const [sensors, setSensors] = useState<SensorState[]>(INITIAL_SENSORS);
  const [driftActive, setDriftActive] = useState(false);

  // EGT 1 thermal drift: +5 °C every second once injected.
  useEffect(() => {
    if (!driftActive) return;
    const timer = window.setInterval(() => {
      setSensors((prev) =>
        prev.map((s) => (s.id === "egt1" ? applyReading(s, s.rawReading + 5) : s)),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [driftActive]);

  const counts = useMemo(() => {
    const c = { nominal: 0, drifting: 0, dead: 0, overrides: 0 };
    for (const s of sensors) {
      c[s.status] += 1;
      if (s.isVirtualOverride) c.overrides += 1;
    }
    return c;
  }, [sensors]);

  const inject = (id: string, raw: number) => {
    setSensors((prev) => prev.map((s) => (s.id === id ? applyReading(s, raw) : s)));
  };

  const resetSystems = () => {
    setDriftActive(false);
    setSensors((prev) => prev.map((s) => applyReading(s, s.expectedReading)));
  };

  return (
    <div className="border border-gray-800 bg-[#0f1015]">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-[#0ea5e9]" />
          <div>
            <h2 className="font-display text-sm tracking-[0.25em] text-white">
              ANALYTICAL SENSOR REDUNDANCY <span className="text-[#0ea5e9]">& HEALTH MATRIX</span>
            </h2>
            <p className="mt-0.5 text-[10px] font-mono tracking-wider text-gray-500">
              PHYSICAL SENSOR LOST? THE 0D TWIN RECONSTRUCTS THE CHANNEL — MISSION CONTINUES.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-widest">
          <span className="border border-[#22c55e]/40 bg-[#22c55e]/10 px-2 py-1 text-[#22c55e]">
            {counts.nominal} NOMINAL
          </span>
          <span className="border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2 py-1 text-[#f59e0b]">
            {counts.drifting} DRIFT
          </span>
          <span className="border border-[#ef4444]/40 bg-[#ef4444]/10 px-2 py-1 text-[#ef4444]">
            {counts.dead} DEAD
          </span>
          <span
            className={`border px-2 py-1 ${OVERRIDE_BORDER} ${OVERRIDE_BG} ${OVERRIDE}`}
            style={counts.overrides > 0 ? { animation: "aeris-override-halo 1.6s ease-in-out infinite" } : undefined}
          >
            {counts.overrides} VIRTUAL OVERRIDE{counts.overrides === 1 ? "" : "S"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_320px]">
        {/* Component 1 — Sensor Health Matrix */}
        <div className="overflow-hidden border border-gray-800 bg-[#181922]">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <span className="font-mono text-[9px] tracking-[0.2em] text-gray-400">
              MISSION-CRITICAL SENSOR SUITE · CAN-BUS
            </span>
            <span className="font-mono text-[9px] tracking-widest text-[#0ea5e9]">
              TWIN EXPECTED = 0D PHYSICS MODEL OUTPUT
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* column headers */}
              <div className="grid grid-cols-[1.15fr_1fr_1fr_0.8fr_0.9fr_1.15fr] gap-px border-b border-gray-800 bg-gray-800/40 font-mono text-[9px] tracking-[0.18em] text-gray-500">
                <div className="px-3 py-2">SENSOR</div>
                <div className="px-3 py-2 text-right">RAW PHYSICAL</div>
                <div className="px-3 py-2 text-right">TWIN EXPECTED</div>
                <div className="px-3 py-2 text-right">RESIDUAL Δ</div>
                <div className="px-3 py-2 text-center">STATUS</div>
                <div className="px-3 py-2 text-right">ACTIVE OUTPUT</div>
              </div>

              {sensors.map((s) => {
                const residual = Math.abs(s.rawReading - s.expectedReading);
                const display = s.isVirtualOverride ? s.expectedReading : s.rawReading;
                const meta = STATUS_META[s.status];
                const rawColor =
                  s.status === "dead"
                    ? "text-[#ef4444]"
                    : s.status === "drifting"
                      ? "text-[#f59e0b]"
                      : "text-gray-200";
                const residualColor =
                  s.status === "dead"
                    ? "text-[#ef4444]"
                    : s.status === "drifting"
                      ? "text-[#f59e0b]"
                      : "text-gray-400";

                return (
                  <motion.div
                    key={s.id}
                    layout
                    animate={{
                      backgroundColor:
                        s.status === "dead"
                          ? "rgba(239,68,68,0.07)"
                          : s.status === "drifting"
                            ? "rgba(245,158,11,0.05)"
                            : "rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.4 }}
                    className="grid grid-cols-[1.15fr_1fr_1fr_0.8fr_0.9fr_1.15fr] gap-px border-b border-gray-800/60 last:border-b-0"
                  >
                    {/* sensor */}
                    <div className="flex items-center gap-2.5 px-3 py-3">
                      <SensorIcon kind={s.id === "map" || s.id === "oil" ? "pressure" : "temp"} />
                      <div>
                        <div className="font-display text-[13px] font-medium tracking-wide text-white">
                          {s.name}
                        </div>
                        <div className="font-mono text-[8px] tracking-widest text-gray-500">{s.sub}</div>
                      </div>
                    </div>

                    {/* raw physical */}
                    <div className={`readout flex items-center justify-end px-3 py-3 text-sm ${rawColor}`}>
                      {s.rawReading.toFixed(s.unit === "bar" ? 1 : 0)}
                      <span className="ml-1 text-[9px] text-gray-500">{s.unit}</span>
                    </div>

                    {/* twin expected */}
                    <div className="readout flex items-center justify-end px-3 py-3 text-sm text-[#0ea5e9]">
                      {s.expectedReading.toFixed(s.unit === "bar" ? 1 : 0)}
                      <span className="ml-1 text-[9px] text-gray-500">{s.unit}</span>
                    </div>

                    {/* residual */}
                    <div className={`readout flex items-center justify-end px-3 py-3 text-sm ${residualColor}`}>
                      {residual.toFixed(s.unit === "bar" ? 1 : 0)}
                    </div>

                    {/* status */}
                    <div className="flex items-center justify-center px-3 py-3">
                      <span
                        className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] tracking-[0.18em] ${meta.ring} ${meta.bg} ${meta.text}`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: "currentColor",
                            animation: s.status === "dead" ? "aeris-pulse 1s ease-in-out infinite" : undefined,
                          }}
                        />
                        {meta.label}
                      </span>
                    </div>

                    {/* active output */}
                    <div className="flex flex-col items-end justify-center gap-1 px-3 py-3">
                      <div className={`readout flex items-baseline text-sm ${s.isVirtualOverride ? OVERRIDE : "text-gray-100"}`}>
                        {display.toFixed(s.unit === "bar" ? 1 : 0)}
                        <span className="ml-1 text-[9px] text-gray-500">{s.unit}</span>
                      </div>
                      <AnimatePresence>
                        {s.isVirtualOverride && (
                          <motion.span
                            initial={{ opacity: 0, y: 4, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.25 }}
                            className={`flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.18em] ${OVERRIDE_BORDER} ${OVERRIDE_BG} ${OVERRIDE}`}
                            style={{ animation: "aeris-override-halo 1.6s ease-in-out infinite" }}
                            role="status"
                          >
                            <span
                              className="h-1 w-1 rounded-full"
                              style={{ background: "#0ea5e9", animation: "aeris-pulse 1.2s ease-in-out infinite" }}
                            />
                            VIRTUAL OVERRIDE
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* legend / method strip */}
          <div className="grid gap-px border-t border-gray-800 bg-gray-800/40 sm:grid-cols-3">
            {[
              { t: "01 · PLAUSIBILITY CHECK", d: "−273 °C in 50 ms? 0 kPa MAP? Physically impossible → channel dead, not engine failure." },
              { t: "02 · DRIFT DETECTION", d: "Raw diverges from twin physics while siblings stay true → flagged for post-flight recalibration." },
              { t: "03 · VIRTUAL OVERRIDE", d: "Dead channel is isolated; the 0D twin's estimate feeds the flight computer. Mission continues." },
            ].map((step) => (
              <div key={step.t} className="bg-[#181922] px-3 py-2.5">
                <div className="font-mono text-[9px] tracking-[0.18em] text-[#0ea5e9]">{step.t}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-gray-400">{step.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Component 2 — Fault Sandbox */}
        <div className="flex flex-col border border-gray-800 bg-[#181922]">
          <div className="border-b border-gray-800 px-3 py-2">
            <span className="font-mono text-[9px] tracking-[0.2em] text-gray-400">FAULT SANDBOX · LIVE INJECTION</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <button
              type="button"
              onClick={() => inject("cht2", -273)}
              className="group flex min-h-11 items-center gap-3 border border-[#ef4444]/40 bg-[#ef4444]/5 px-3 text-left transition-colors hover:bg-[#ef4444]/15"
            >
              <Unplug className="h-4 w-4 shrink-0 text-[#ef4444]" />
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#ef4444]">
                SIMULATE WIRE SNAP · CHT 2
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDriftActive((v) => !v)}
              aria-pressed={driftActive}
              className={`flex min-h-11 items-center gap-3 border px-3 text-left transition-colors ${
                driftActive
                  ? "border-[#f59e0b] bg-[#f59e0b]/15"
                  : "border-[#f59e0b]/40 bg-[#f59e0b]/5 hover:bg-[#f59e0b]/15"
              }`}
            >
              <Flame className={`h-4 w-4 shrink-0 text-[#f59e0b] ${driftActive ? "animate-pulse" : ""}`} />
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#f59e0b]">
                {driftActive ? "HEAT DRIFT RUNNING · +5 °C/S" : "SIMULATE HEAT DRIFT · EGT 1"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => inject("map", 0)}
              className="flex min-h-11 items-center gap-3 border border-[#0ea5e9]/40 bg-[#0ea5e9]/5 px-3 text-left transition-colors hover:bg-[#0ea5e9]/15"
            >
              <Snowflake className="h-4 w-4 shrink-0 text-[#0ea5e9]" />
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#0ea5e9]">
                SIMULATE MAP SENSOR ICING
              </span>
            </button>
            <button
              type="button"
              onClick={resetSystems}
              className="mt-auto flex min-h-11 items-center gap-3 border border-gray-700 bg-gray-800/40 px-3 text-left transition-colors hover:border-gray-500 hover:bg-gray-700/40"
            >
              <RotateCcw className="h-4 w-4 shrink-0 text-gray-300" />
              <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-gray-200">
                RESET SYSTEMS · RESTORE NOMINAL
              </span>
            </button>
          </div>
          <div className="border-t border-gray-800 px-3 py-2.5">
            <p className="flex items-start gap-2 text-[10px] leading-relaxed text-gray-500">
              <Activity className="mt-0.5 h-3 w-3 shrink-0 text-gray-500" />
              No triple physical redundancy on a weight-restricted airframe — analytical
              redundancy via the digital twin keeps the engine flying with a dead sensor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}