import { useMemo } from "react";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Bar, Panel, Readout } from "@/components/hud/primitives";
import { BASELINE_CONDITIONS, simulate, type Conditions } from "@/lib/domain/engine/model";
import { useFlightStore } from "@/features/flight-sim/flightStore";

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

  // Sparkline data series mapping from flightStore historyBuffer
  const series = useMemo(() => {
    const out: Record<string, { v: number }[]> = {};
    CHANNELS.forEach((c) => (out[c.key] = []));

    if (history.length > 0) {
      history.forEach((pt) => {
        out.rpm.push({ v: pt.map ? liveRpm * (0.9 + (pt.map / 30) * 0.1) : liveRpm });
        out.cht.push({ v: pt.chtMax });
        out.egt.push({ v: pt.egt });
        out.oilp.push({ v: pt.oilPressure });
        out.oilt.push({ v: pt.oilTemp });
        out.ff.push({ v: liveFuelFlow });
        out.vib.push({ v: pt.vibrationRMS });
        out.batt.push({ v: liveBatt });
        out.alt.push({ v: liveAltHealth });
        out.inj.push({ v: liveInjEff });
      });
    } else {
      CHANNELS.forEach((c) => {
        out[c.key] = Array.from({ length: 20 }, () => ({ v: currentValues[c.key] || 0 }));
      });
    }
    return out;
  }, [history, liveRpm, maxCht, liveEgt, liveOilP, liveOilT, liveVib, throttle, liveFuelFlow, liveBatt, liveAltHealth, liveInjEff]);

  const subsystems = [
    { k: "COMBUSTION", v: faults?.injectorClog ? 0.52 : 0.94 },
    { k: "THERMAL", v: Math.max(0.2, 1.0 - (maxCht - 140) / 100) },
    { k: "LUBRICATION", v: Math.max(0.2, 1.0 - (liveOilT - 90) / 60) },
    { k: "VIBRATION", v: Math.max(0.1, 1.0 - (liveVib - 0.4) / 2.0) },
    { k: "ELECTRICAL", v: liveAltHealth / 100 },
  ];

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
          const tone = TONE_HEX[c.tone ?? "cyan"]!;
          const val = currentValues[c.key] ?? 0;
          return (
            <div key={c.key} className="min-w-0 bg-panel/80 p-3">
              <div className="flex items-baseline justify-between">
                <span className="label-xs truncate">{c.label}</span>
                <span className="label-xs text-[9px] opacity-60">{c.unit}</span>
              </div>
              <div className="readout mt-1 truncate text-lg" style={{ color: tone }}>
                {val.toFixed(c.digits)}
              </div>
              <Sparkline data={series[c.key] || []} tone={tone} />
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
