import { useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Panel } from "@/components/hud/primitives";
import { BASELINE_CONDITIONS, simulate } from "@/lib/domain/engine/model";

const DURATION = 4 * 3600; // 4 hour mission, seconds

const PHASES = [
  { t: 0, label: "TAKEOFF" },
  { t: 900, label: "CLIMB" },
  { t: 3600, label: "CRUISE" },
  { t: 7200, label: "LOITER" },
  { t: 8251, label: "ANOMALY" },
  { t: 10500, label: "DEGRADATION" },
  { t: 11204, label: "ALERT" },
];

const FIRST_DETECT = 8251; // 02:17:31
const THRESHOLD = 11204; // 03:06:44

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function faultAt(t: number) {
  if (t < FIRST_DETECT) return 0;
  return Math.min(1, (t - FIRST_DETECT) / (DURATION - FIRST_DETECT)) * 0.95;
}

export function ReplayConsole() {
  const [t, setT] = useState(7400);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((p) => {
        const n = p + dt * 420;
        return n >= DURATION ? DURATION : n;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const fault = faultAt(t);
  const state = simulate(t / 60, { ...BASELINE_CONDITIONS, throttlePct: t < 3600 ? 88 : 70 }, fault);

  const trace = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= 120; i++) {
      const tt = (i / 120) * DURATION;
      const s = simulate(tt / 60, { ...BASELINE_CONDITIONS, throttlePct: tt < 3600 ? 88 : 70 }, faultAt(tt));
      arr.push({ t: tt, egt: s.egt, vib: s.vibrationRms * 300, health: s.health * 900 });
    }
    return arr;
  }, []);

  const readouts = [
    { k: "RPM", v: state.rpm.toFixed(0) },
    { k: "EGT", v: `${state.egt.toFixed(0)}°C` },
    { k: "CHT", v: `${state.cht.toFixed(0)}°C` },
    { k: "OIL P.", v: `${state.oilPressure.toFixed(2)} BAR` },
    { k: "FUEL", v: `${state.fuelFlow.toFixed(1)} L/h` },
    { k: "VIB", v: `${state.vibrationRms.toFixed(2)} G` },
    { k: "HEALTH", v: `${(state.health * 100).toFixed(1)}%` },
    { k: "ANOMALY", v: `${(state.anomalyScore * 100).toFixed(0)}%` },
  ];

  return (
    <Panel label="MISSION REPLAY / MSN-2214" corner="DETERMINISTIC">
      <div className="p-4">
        <div className="grid grid-cols-4 gap-px bg-border sm:grid-cols-8">
          {readouts.map((r) => (
            <div key={r.k} className="bg-panel/90 p-2">
              <div className="label-xs text-[9px]">{r.k}</div>
              <div className="readout text-xs sm:text-sm">{r.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trace} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <YAxis hide domain={[100, 1000]} />
              <Line type="monotone" dataKey="egt" stroke="#f0a63c" strokeWidth={1.3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="vib" stroke="#6fd8e8" strokeWidth={1.1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="health" stroke="#4fd6a6" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              <ReferenceLine x={trace.findIndex((d) => d.t >= t)} stroke="#ffffff" strokeOpacity={0.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* timeline */}
        <div className="relative mt-4">
          <input
            type="range"
            min={0}
            max={DURATION}
            step={1}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none bg-panel-2 accent-[var(--cyan)]"
          />
          <div className="relative mt-3 h-10">
            {PHASES.map((p) => (
              <div key={p.label} className="absolute top-0" style={{ left: `${(p.t / DURATION) * 100}%` }}>
                <div className={`h-3 w-px ${p.label === "ANOMALY" || p.label === "ALERT" ? "bg-amber" : "bg-hairline"}`} />
                <div
                  className={`mt-1 origin-left -rotate-0 text-[8px] tracking-[0.14em] whitespace-nowrap ${
                    p.label === "ANOMALY" || p.label === "ALERT" ? "text-amber" : "text-muted-foreground"
                  }`}
                  style={{ transform: "translateX(-50%)" }}
                >
                  {p.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex items-center gap-2 border border-cyan/60 px-3 py-1.5 label-xs text-cyan hover:bg-cyan/10"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? "PAUSE" : "PLAY"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setT(0);
            }}
            className="inline-flex items-center gap-2 border border-border px-3 py-1.5 label-xs hover:border-cyan/50"
          >
            <RotateCcw className="h-3 w-3" /> RESET
          </button>
          <span className="readout text-sm text-cyan">{fmt(t)}</span>
          <span className="label-xs">/ {fmt(DURATION)}</span>
        </div>

        <div className="mt-4 grid gap-px bg-border sm:grid-cols-3">
          <div className="bg-panel/90 p-3">
            <div className="label-xs">FIRST DETECTED</div>
            <div className="readout text-sm text-cyan">02:17:31</div>
          </div>
          <div className="bg-panel/90 p-3">
            <div className="label-xs">THRESHOLD CROSSED</div>
            <div className="readout text-sm text-amber">03:06:44</div>
          </div>
          <div className="bg-panel/90 p-3">
            <div className="label-xs">DETECTION ADVANTAGE</div>
            <div className="readout text-sm text-nominal">49 MIN 13 SEC</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
