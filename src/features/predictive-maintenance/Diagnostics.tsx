import { useMemo } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis, ReferenceArea } from "recharts";
import { Bar, DataRow, Panel } from "@/components/hud/primitives";

export const CONTRIBUTORS = [
  { k: "EGT CYLINDER SPREAD", v: 32 },
  { k: "FUEL FLOW INSTABILITY", v: 24 },
  { k: "VIBRATION SIGNATURE", v: 19 },
  { k: "PHYSICS RESIDUAL", v: 11 },
  { k: "RPM-ADJUSTED BASELINE DRIFT", v: 8 },
  { k: "OIL TEMPERATURE TREND", v: 6 },
];

export function ExplainablePanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel label="ACTIVE DIAGNOSIS" corner="AERIS-DIAG-02">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber" />
            <div>
              <div className="font-display text-lg tracking-tight text-amber">INJECTOR DEGRADATION</div>
              <div className="label-xs mt-1">CYLINDER 03 / FUEL SUBSYSTEM</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <div className="label-xs">PROBABILITY</div>
              <div className="readout text-2xl text-amber">87%</div>
            </div>
            <div>
              <div className="label-xs">DETECTION LEAD</div>
              <div className="readout text-2xl text-cyan">47 MIN</div>
            </div>
          </div>
          <div className="mt-5 border-t border-border/60 pt-4">
            <DataRow k="MODEL CONFIDENCE" v="81%" />
            <DataRow k="DATA QUALITY" v="96%" />
            <DataRow k="MODEL" v="AERIS-ANOM-03 / v1.4" />
            <DataRow k="EVIDENCE WINDOW" v="18 MIN" />
          </div>
          <p className="mt-4 text-[10px] leading-relaxed tracking-wide text-muted-foreground uppercase">
            Demonstrator scenario. Lead time is produced by the synthetic simulation and is not validated flight performance.
          </p>
        </div>
      </Panel>

      <Panel label="WHY — CONTRIBUTING FACTORS" corner="EXPLAINABILITY">
        <div className="p-4">
          <div className="space-y-3">
            {CONTRIBUTORS.map((c) => (
              <div key={c.k}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="label-xs">{c.k}</span>
                  <span className="readout text-xs text-cyan">{c.v}%</span>
                </div>
                <Bar value={c.v * 2.6} tone={c.v > 25 ? "amber" : "cyan"} />
              </div>
            ))}
          </div>
          <div className="mt-5 border-l-2 border-cyan/60 bg-panel-2/50 p-3">
            <div className="label-xs mb-2 text-cyan">SYSTEM EXPLANATION</div>
            <p className="text-sm leading-relaxed text-foreground/85">
              Cylinder 3 EGT is increasingly deviating from its RPM-adjusted baseline while fuel-flow variability and vibration
              order peaks are rising. Combined residual growth is consistent with progressive injector spray degradation rather
              than a sensor fault — the CHT channel corroborates the trend independently.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function RulPanel({ severity = 0.45 }: { severity?: number }) {
  const point = 42.3 * (1 - severity * 0.72);
  const spread = point * 0.21;
  const data = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      const decay = 100 * Math.pow(1 - x, 1 + severity * 1.6);
      arr.push({ x: i, hi: decay + 9 * x, lo: Math.max(0, decay - 11 * x), v: decay });
    }
    return arr;
  }, [severity]);

  return (
    <Panel label="REMAINING USEFUL LIFE" corner="AERIS-RUL-01">
      <div className="grid gap-4 p-4 md:grid-cols-[240px_1fr]">
        <div>
          <div className="label-xs">POINT ESTIMATE</div>
          <div className="readout text-4xl text-cyan">{point.toFixed(1)}</div>
          <div className="label-xs mt-1">HOURS</div>
          <div className="mt-5 space-y-0">
            <DataRow k="CONF. INTERVAL" v={`${(point - spread).toFixed(1)} — ${(point + spread * 1.15).toFixed(1)} H`} />
            <DataRow k="CONFIDENCE" v="78%" />
            <DataRow k="DATA QUALITY" v="94%" />
            <DataRow k="FAULT SEVERITY" v={`${(severity * 100).toFixed(0)}%`} tone="text-amber" />
          </div>
        </div>
        <div className="h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rulband" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6fd8e8" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#6fd8e8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 115]} />
              <ReferenceArea y1={0} y2={18} fill="#e2523f" fillOpacity={0.08} />
              <Area type="monotone" dataKey="hi" stroke="none" fill="url(#rulband)" isAnimationActive={false} />
              <Area type="monotone" dataKey="lo" stroke="none" fill="#0b0e11" fillOpacity={0.85} isAnimationActive={false} />
              <Area type="monotone" dataKey="v" stroke="#6fd8e8" strokeWidth={1.8} fill="none" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  );
}

export function MaintenanceAdvisory() {
  const history = [
    { d: "T-118 H", e: "Scheduled 50 h inspection — no findings", tone: "text-muted-foreground" },
    { d: "T-74 H", e: "Oil & filter change, sample within limits", tone: "text-muted-foreground" },
    { d: "T-31 H", e: "Cylinder 3 EGT baseline drift logged", tone: "text-cyan" },
    { d: "T-6 H", e: "Fuel-flow variability advisory raised", tone: "text-amber" },
    { d: "NOW", e: "Injector degradation advisory — inspection recommended", tone: "text-amber" },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Panel label="PREDICTIVE MAINTENANCE ADVISORY" corner="ADVISORY / READ-ONLY">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <Wrench className="mt-1 h-4 w-4 text-cyan" />
            <div className="flex-1">
              <DataRow k="FAULT" v="Injector degradation" />
              <DataRow k="SEVERITY" v="MEDIUM" tone="text-amber" />
              <DataRow k="SUBSYSTEM" v="Fuel / Cylinder 03" />
              <DataRow k="RECOMMENDED ACTION" v="Inspect injector system" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Inspect the injector system during the next maintenance opportunity. No in-flight action required; margins remain
            within advisory limits for the current mission profile.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["EGT IMBALANCE", "FUEL-FLOW INSTABILITY", "CYLINDER IMBALANCE", "VIBRATION TREND"].map((e) => (
              <div key={e} className="border border-border bg-panel-2/40 p-2 label-xs text-[9px]">
                {e}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel label="MAINTENANCE HISTORY" corner="AUDIT LOG">
        <div className="p-4">
          {history.map((h) => (
            <div key={h.d} className="relative flex gap-4 border-l border-border pb-4 pl-4 last:pb-0">
              <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-cyan" />
              <div>
                <div className="label-xs">{h.d}</div>
                <div className={`mt-0.5 text-xs ${h.tone}`}>{h.e}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
