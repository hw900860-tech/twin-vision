import { useMemo } from "react";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Bar, Panel, Readout } from "@/components/hud/primitives";
import { BASELINE_CONDITIONS, simulate, type Conditions } from "@/lib/domain/engine/model";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { chtRedlineShiftC, oilRedlineShiftC, sampleAtmosphere } from "@/lib/domain/engine/environment";

const CRITICAL_HEX = "#e2523f";

type Channel = {
  key: string;
  label: string;
  unit: string;
  get: (s: ReturnType<typeof simulate>) => number;
  digits: number;
  tone?: "cyan" | "amber" | "critical" | "nominal";
};

const CHANNELS: Channel[] = [
  { key: "rpm", label: "RPM", unit: "", get: (s) => s.rpm, digits: 0 },
  { key: "cht", label: "CHT", unit: "°C", get: (s) => s.cht, digits: 0, tone: "amber" },
  { key: "egt", label: "EGT", unit: "°C", get: (s) => s.egt, digits: 0, tone: "amber" },
  { key: "oilp", label: "OIL PRESSURE", unit: "BAR", get: (s) => s.oilPressure, digits: 2 },
  { key: "oilt", label: "OIL TEMP", unit: "°C", get: (s) => s.oilTemperature, digits: 0 },
  { key: "ff", label: "FUEL FLOW", unit: "L/h", get: (s) => s.fuelFlow, digits: 1 },
  { key: "vib", label: "VIBRATION", unit: "G", get: (s) => s.vibrationRms, digits: 2, tone: "amber" },
  { key: "batt", label: "BUS VOLTAGE", unit: "V", get: (s) => s.alternatorVoltage, digits: 1 },
  { key: "alt", label: "ALTERNATOR", unit: "%", get: (s) => s.electricalHealth * 100, digits: 0, tone: "nominal" },
  { key: "inj", label: "INJECTION EFF.", unit: "%", get: (s) => s.injectorEfficiency * 100, digits: 0 },
];

function Sparkline({ data, tone }: { data: { v: number }[]; tone: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="v" stroke={tone} strokeWidth={1.2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const TONE_HEX: Record<string, string> = {
  cyan: "#6fd8e8",
  amber: "#f0a63c",
  critical: "#e2523f",
  nominal: "#4fd6a6",
};

export function TelemetryDashboard({
  conditions = BASELINE_CONDITIONS,
  fault = 0.18,
  compact = false,
}: {
  conditions?: Conditions;
  fault?: number;
  compact?: boolean;
}) {
  // Explicit selectors force React components to re-render on every state tick!
  const liveRpm = useFlightStore((s) => s.rpm) ?? 2400;
  const cht = useFlightStore((s) => s.cht) || [140, 140, 140, 140];
  const maxCht = Math.max(...cht);
  const liveEgt = useFlightStore((s) => s.egt) ?? 680;
  const liveOilP = useFlightStore((s) => s.oilPressure) ?? 5.2;
  const liveOilT = useFlightStore((s) => s.oilTemp) ?? 95;
  const liveVib = useFlightStore((s) => s.vibrationRMS) ?? 0.8;
  const throttle = useFlightStore((s) => s.throttle) ?? 65;
  const healthIndex = useFlightStore((s) => s.healthIndex) ?? 0.96;
  const faults = useFlightStore((s) => s.faults) || { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false };
  const history = useFlightStore((s) => s.historyBuffer) || [];
  const weather = useFlightStore((s) => s.weather);
  const altitude = useFlightStore((s) => s.altitude) ?? 6000;

  // Environment-normalized thermal redline shifts (0 when sim-only)
  const envShifts = useMemo(() => {
    if (!weather) return { chtShiftC: 0, oilShiftC: 0 };
    try {
      const delta = sampleAtmosphere(altitude, weather).ambientDeltaC;
      return { chtShiftC: chtRedlineShiftC(delta), oilShiftC: oilRedlineShiftC(delta) };
    } catch {
      return { chtShiftC: 0, oilShiftC: 0 };
    }
  }, [weather, altitude]);

  const liveFuelFlow = 8.5 + (throttle / 100) * 14.2;
  const liveBatt = 28.1 + (liveRpm > 2000 ? 0.4 : -1.2);
  const liveAltHealth = liveRpm > 2000 ? 98 : 45;
  const liveInjEff = faults?.injectorClog ? 52 : 94;

  const currentValues: Record<string, number> = {
    rpm: liveRpm,
    cht: maxCht,
    egt: liveEgt,
    oilp: liveOilP,
    oilt: liveOilT,
    ff: liveFuelFlow,
    vib: liveVib,
    batt: liveBatt,
    alt: liveAltHealth,
    inj: liveInjEff,
  };

  /**
   * Sparkline data series mapped 1:1 from the flightStore history buffer.
   * CHT / EGT / OIL PRESSURE / OIL TEMP / VIBRATION come straight from the
   * recorded 20 Hz stream so the traces stay synchronized with the telemetry
   * and the MAYDAY gate (Feature A).
   */
  const series = useMemo(() => {
    const out: Record<string, { v: number }[]> = {};
    CHANNELS.forEach((c) => (out[c.key] = []));

    if (history.length > 0) {
      history.forEach((pt) => {

        CHANNELS.forEach((c) => {
          const arr = out[c.key];
          if (!arr) return;
          switch (c.key) {
            case "rpm": arr.push({ v: liveRpm }); break;
            case "cht": arr.push({ v: pt.chtMax }); break;
            case "egt": arr.push({ v: pt.egt }); break;
            case "oilp": arr.push({ v: pt.oilPressure }); break;
            case "oilt": arr.push({ v: pt.oilTemp }); break;
            case "vib": arr.push({ v: pt.vibrationRMS }); break;
            default: arr.push({ v: currentValues[c.key] ?? 0 }); break;
          }
        });
      });
    } else {
      CHANNELS.forEach((c) => {
        out[c.key] = Array.from({ length: 20 }, () => ({ v: currentValues[c.key] ?? 0 }));
      });
    }
    return out;
  }, [history, liveRpm, liveFuelFlow, liveBatt, liveAltHealth, liveInjEff, currentValues]);

  const subsystems = [
    { k: "COMBUSTION", v: faults?.injectorClog ? 0.52 : 0.94 },
    { k: "THERMAL", v: Math.max(0.2, 1.0 - (maxCht - 140) / 100) },
    { k: "LUBRICATION", v: Math.max(0.2, 1.0 - (liveOilT - 90) / 60) },
    { k: "VIBRATION", v: Math.max(0.1, 1.0 - (liveVib - 0.4) / 2.0) },
    { k: "ELECTRICAL", v: liveAltHealth / 100 },
  ];

  /** True when a channel is inside its red band (environment-normalized). */
  function channelCritical(channelKey: string, val: number): boolean {
    switch (channelKey) {
      case "cht": return val > 210 + envShifts.chtShiftC;
      case "egt": return val > 770;
      case "oilt": return val > 120 + envShifts.oilShiftC;
      case "oilp": return val < 2.0;
      case "vib": return val > 1.6;
      default: return false;
    }
  }

  const channels = compact ? CHANNELS.slice(0, 6) : CHANNELS;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-3 py-2 bg-panel/90 border border-cyan/30 rounded backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
            <span className="label-xs text-cyan font-bold">20Hz REAL-TIME ENGINE SENSOR BUS</span>
          </div>
          <button
            onClick={() => useFlightStore.getState().exportCSV()}
            className="px-2.5 py-1 bg-cyan/20 border border-cyan/50 text-cyan text-[10px] font-mono font-bold hover:bg-cyan/30 transition-all rounded"
          >
            EXPORT TELEMETRY CSV
          </button>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {channels.map((c) => {
          const val = currentValues[c.key] ?? 0;
          const over = channelCritical(c.key, val);
          const tone = over ? CRITICAL_HEX : (TONE_HEX[c.tone ?? "cyan"] ?? CRITICAL_HEX);
          const data = series[c.key] || [];
          return (
            <div key={c.key} className={`min-w-0 p-3 ${over ? "bg-[#2b0d0a]/80 border-t-2 border-t-[#e2523f]" : "bg-panel/80 border-t-2 border-t-transparent"}`}>
              <div className="flex items-baseline justify-between">
                <span className={`label-xs truncate ${over ? "text-[#e2523f] font-bold" : ""}`}>{c.label}</span>
                <span className="label-xs text-[9px] opacity-60">{c.unit}</span>
              </div>
              <div className={`readout mt-1 flex items-baseline gap-2 truncate text-lg ${over ? "animate-pulse" : ""}`} style={{ color: tone }}>
                {val.toFixed(c.digits)}
                {over && <span className="label-xs text-[7px] font-bold text-[#e2523f]">REDLINE</span>}
              </div>
              <Sparkline data={data} tone={tone} />
            </div>
          );
        })}
      </div>
    </div>

      <Panel label="ENGINE HEALTH" corner="AE-P4">
        <div className="p-4">
          <div className="flex items-end gap-3">
            <span className="readout text-4xl text-cyan">{(healthIndex * 100).toFixed(1)}</span>
            <span className="label-xs pb-2">% COMPOSITE</span>
          </div>
          <div className="mt-5 space-y-3">
            {subsystems.map((s) => (
              <div key={s.k}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="label-xs">{s.k}</span>
                  <span className="readout text-xs">{(s.v * 100).toFixed(0)}%</span>
                </div>
                <Bar value={s.v * 100} tone={s.v > 0.85 ? "nominal" : s.v > 0.65 ? "cyan" : "amber"} />
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border/60 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="label-xs">ANOMALY SCORE</span>
              <span className="readout text-sm text-amber">{((1.0 - healthIndex) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function ResidualChart({ progress }: { progress: number }) {
  const data = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= 60; i++) {
      const x = i / 60;
      const expected = 720 + Math.sin(x * 9) * 5;
      const div = Math.max(0, x - (1 - progress)) * progress * 190;
      arr.push({ x: i, expected, observed: expected + div + Math.sin(x * 21) * (1 + div * 0.04) });
    }
    return arr;
  }, [progress]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="obs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0a63c" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#f0a63c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[690, 960]} />
        <Area type="monotone" dataKey="observed" stroke="#f0a63c" strokeWidth={1.6} fill="url(#obs)" isAnimationActive={false} />
        <Line type="monotone" dataKey="expected" stroke="#6fd8e8" strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HeroReadouts({ state }: { state: ReturnType<typeof simulate> }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Readout label="RPM" value={state.rpm.toFixed(0)} />
      <Readout label="CHT" value={state.cht.toFixed(0)} unit="°C" tone="amber" />
      <Readout label="EGT" value={state.egt.toFixed(0)} unit="°C" tone="amber" />
      <Readout label="VIB" value={state.vibrationRms.toFixed(2)} unit="G" />
    </div>
  );
}
