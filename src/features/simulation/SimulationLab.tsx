import { useState } from "react";
import { Bar, Panel, Readout } from "@/components/hud/primitives";
import { BASELINE_CONDITIONS, estimateRul, missionRisk, simulate, type Conditions } from "@/lib/domain/engine/model";

const CONTROLS: {
  key: keyof Conditions;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: "altitudeFt", label: "ALTITUDE", min: 10000, max: 25000, step: 500, unit: "FT" },
  { key: "ambientC", label: "AMBIENT TEMP", min: 20, max: 50, step: 1, unit: "°C" },
  { key: "throttlePct", label: "THROTTLE", min: 20, max: 100, step: 1, unit: "%" },
  { key: "wearPct", label: "ENGINE WEAR", min: 0, max: 100, step: 1, unit: "%" },
  { key: "durationH", label: "MISSION DURATION", min: 1, max: 12, step: 0.5, unit: "H" },
];

function outcome(c: Conditions) {
  const fault = (c.wearPct / 100) * 0.55;
  const s = simulate(12, c, fault);
  const rul = estimateRul(s, c, fault);
  const risk = missionRisk(s, c, rul.point);
  return { s, rul, risk };
}

export function SimulationLab({ embedded = false }: { embedded?: boolean }) {
  const [c, setC] = useState<Conditions>({ ...BASELINE_CONDITIONS, altitudeFt: 14000, ambientC: 28, throttlePct: 62, wearPct: 18, durationH: 6 });
  const baseline = outcome({ ...BASELINE_CONDITIONS, altitudeFt: 14000, ambientC: 28, throttlePct: 62, wearPct: 18, durationH: 6 });
  const sim = outcome(c);

  const riskTone = sim.risk.risk === "LOW" ? "nominal" : sim.risk.risk === "MEDIUM" ? "amber" : "critical";

  return (
    <div className={`grid gap-4 ${embedded ? "" : "lg:grid-cols-[380px_1fr]"}`}>
      <Panel label="SCENARIO CONTROLS" corner="WHAT-IF">
        <div className="space-y-5 p-4">
          {CONTROLS.map((ctl) => (
            <div key={ctl.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label-xs">{ctl.label}</span>
                <span className="readout text-xs text-cyan">
                  {c[ctl.key]}
                  <span className="ml-1 text-[10px] text-muted-foreground">{ctl.unit}</span>
                </span>
              </div>
              <input
                type="range"
                min={ctl.min}
                max={ctl.max}
                step={ctl.step}
                value={c[ctl.key]}
                onChange={(e) => setC((p) => ({ ...p, [ctl.key]: Number(e.target.value) }))}
                className="h-1 w-full cursor-pointer appearance-none bg-panel-2 accent-[var(--cyan)]"
              />
              <div className="mt-1 flex justify-between label-xs text-[9px] opacity-60">
                <span>{ctl.min}</span>
                <span>{ctl.max}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4">
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {[
            { k: "CHT", v: `${sim.s.cht.toFixed(0)}°C` },
            { k: "EGT", v: `${sim.s.egt.toFixed(0)}°C` },
            { k: "OIL PRESSURE", v: `${sim.s.oilPressure.toFixed(2)} BAR` },
            { k: "FUEL FLOW", v: `${sim.s.fuelFlow.toFixed(1)} L/h` },
            { k: "VIBRATION", v: `${sim.s.vibrationRms.toFixed(2)} G` },
            { k: "HEALTH", v: `${(sim.s.health * 100).toFixed(1)}%` },
          ].map((r) => (
            <div key={r.k} className="bg-panel/80 p-3">
              <div className="label-xs">{r.k}</div>
              <div className="readout mt-1 text-lg transition-colors">{r.v}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel label="BASELINE" corner="REFERENCE">
            <div className="flex gap-8 p-4">
              <Readout label="RUL" value={baseline.rul.point.toFixed(1)} unit="H" />
              <Readout label="RISK" value={baseline.risk.risk} tone={baseline.risk.risk === "LOW" ? "nominal" : "amber"} />
            </div>
          </Panel>
          <Panel label="SIMULATED SCENARIO" corner="WHAT-IF">
            <div className="flex gap-8 p-4">
              <Readout label="RUL" value={sim.rul.point.toFixed(1)} unit="H" tone={riskTone === "critical" ? "critical" : "cyan"} />
              <Readout label="RISK" value={sim.risk.risk} tone={riskTone} />
            </div>
          </Panel>
        </div>

        <Panel label="MISSION READINESS">
          <div className="p-4">
            <div className="flex items-end justify-between">
              <span className="readout text-3xl" style={{ color: `var(--${riskTone === "nominal" ? "nominal" : riskTone === "amber" ? "amber" : "critical"})` }}>
                {sim.risk.readiness.toFixed(0)}%
              </span>
              <span className="label-xs">{sim.risk.risk} RISK</span>
            </div>
            <Bar className="mt-3" value={sim.risk.readiness} tone={riskTone} />
            <ul className="mt-4 space-y-1">
              {sim.risk.reasons.map((r) => (
                <li key={r} className="label-xs flex items-center gap-2">
                  <span className="h-px w-3 bg-amber" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
