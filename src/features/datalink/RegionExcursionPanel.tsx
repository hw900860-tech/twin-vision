import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { History, MapPin, Eraser, Activity } from "lucide-react";
import { useLinkStore, type GroundAlert } from "./linkStore";
import type { RegionExcursion } from "./regionExcursions";

const SEV: Record<string, { color: string; label: string }> = {
  critical: { color: "#ff7a6b", label: "CRITICAL" },
  caution: { color: "#f0a63c", label: "CAUTION" },
  info: { color: "#7fb0ff", label: "INFO" },
};

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function fmtDur(s: number): string {
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
}

function ExcursionChart({
  title,
  unit,
  color,
  dataKey,
  domain,
  samples,
}: {
  title: string;
  unit: string;
  color: string;
  dataKey: "map" | "egt";
  domain: [number, number];
  samples: { t: number; map: number; egt: number }[];
}) {
  return (
    <div>
      <div className="label-xs mb-1 flex items-center justify-between text-[8.5px]">
        <span style={{ color }}>{title} ({unit})</span>
        <span className="text-muted-foreground">SECONDS IN REGION</span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={samples} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={domain} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExcursionDetail({ exc }: { exc: RegionExcursion }) {
  const sev = SEV[exc.severity] ?? SEV["info"]!;
  const st = exc.stats;
  const samples = exc.samples.map((s) => ({ t: +s.t.toFixed(2), map: +s.map.toFixed(1), egt: +s.egt.toFixed(0) }));

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5" style={{ color: sev.color }} />
        <span className="font-mono text-[11px] font-bold tracking-wider" style={{ color: sev.color }}>
          {exc.name}
        </span>
        <span className="label-xs border px-1 py-0.5 text-[8px]" style={{ borderColor: sev.color, color: sev.color }}>
          {sev.label}
        </span>
        <span className="label-xs ml-auto text-muted-foreground">
          {fmtClock(exc.enteredAt)} → {fmtClock(exc.exitedAt)} · {fmtDur(st.durationS)}
        </span>
      </div>

      {/* engine-response stats strip */}
      <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-6">
        {[
          { k: "DURATION", v: fmtDur(st.durationS) },
          { k: "ΔMAP", v: `${(st.mapMax - st.mapMin).toFixed(1)} kPa`, tone: st.mapMax - st.mapMin > 12 ? "#ff7a6b" : "#6fd8e8" },
          { k: "MAP MEAN", v: `${st.mapMean.toFixed(1)} kPa` },
          { k: "EGT MAX", v: `${st.egtMax.toFixed(0)}°C`, tone: st.egtMax > 750 ? "#ff7a6b" : st.egtMax > 700 ? "#f0a63c" : "#6fd8e8" },
          { k: "CHT MAX", v: `${st.chtMax.toFixed(0)}°C`, tone: st.chtMax > 220 ? "#ff7a6b" : st.chtMax > 180 ? "#f0a63c" : "#6fd8e8" },
          { k: "VIB MAX", v: `${st.vibMax.toFixed(2)} m/s²`, tone: st.vibMax > 1.5 ? "#ff7a6b" : "#6fd8e8" },
        ].map((cell) => (
          <div key={cell.k} className="border border-border/60 bg-panel-2/60 px-2 py-1">
            <div className="label-xs text-[7.5px] text-muted-foreground">{cell.k}</div>
            <div className="font-mono text-[10px] font-bold" style={{ color: cell.tone ?? "#e8edf2" }}>
              {cell.v}
            </div>
          </div>
        ))}
      </div>

      {samples.length >= 2 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ExcursionChart title="EGT" unit="°C" color="#f0a63c" dataKey="egt" domain={[520, 820]} samples={samples} />
          <ExcursionChart title="MAP" unit="kPa" color="#6fd8e8" dataKey="map" domain={[12, 70]} samples={samples} />
        </div>
      ) : (
        <div className="label-xs border border-border/50 bg-panel-2/40 px-3 py-4 text-center text-muted-foreground">
          NO TELEMETRY SAMPLES CAPTURED — EXCURSION SHORTER THAN A FRAME INTERVAL
        </div>
      )}
    </div>
  );
}

/**
 * GCS region-alert history: a timeline of every atmospheric-region excursion
 * with the engine response (EGT / MAP / CHT / VIB) captured over the datalink
 * while the UAV was inside. Data is reconstructed ground-side from the live
 * telemetry stream + REGION_ALERT enter/exit frames — nothing is simulated here.
 */
export function RegionExcursionPanel() {
  const excursions = useLinkStore((s) => s.excursions);
  const clearExcursions = useLinkStore((s) => s.clearExcursions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => excursions.find((e) => e.id === selectedId) ?? excursions[0] ?? null,
    [excursions, selectedId],
  );

  return (
    <div className="grid gap-4 border border-border bg-panel/70 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan" />
          <span className="label-xs font-bold tracking-widest text-cyan">REGION ALERT HISTORY</span>
          <span className="label-xs text-muted-foreground">
            {excursions.length} EXCURSION{excursions.length === 1 ? "" : "S"} · RECONSTRUCTED FROM LINK
          </span>
        </div>
        {excursions.length > 0 && (
          <button
            onClick={clearExcursions}
            className="flex cursor-pointer items-center gap-1 border border-border px-2 py-1 text-[8.5px] text-muted-foreground transition-colors hover:border-amber/60 hover:text-amber"
          >
            <Eraser className="h-2.5 w-2.5" /> CLEAR
          </button>
        )}
      </div>

      {excursions.length === 0 ? (
        <div className="border border-dashed border-border/60 px-4 py-8 text-center">
          <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
          <div className="label-xs text-muted-foreground">
            AWAITING REGION EXCURSION — FLY THE UAV THROUGH AN ATMOSPHERIC REGION AND ITS ENGINE
            RESPONSE WILL BE LOGGED HERE AS SOON AS THE ENTER/EXIT FRAMES CROSS THE LINK
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
          {/* timeline */}
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {excursions.map((e) => {
              const sev = SEV[e.severity] ?? SEV["info"]!;
              const active = selected?.id === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  aria-pressed={active}
                  className={`w-full cursor-pointer border px-2 py-1.5 text-left transition-colors ${
                    active ? "bg-cyan/10" : "border-border/60 hover:border-cyan/40"
                  }`}
                  style={{ borderColor: active ? sev.color : undefined }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sev.color }} />
                    <span className="truncate font-mono text-[9px] font-bold" style={{ color: sev.color }}>
                      {e.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[8px] text-muted-foreground">
                    <span>{fmtClock(e.enteredAt)}</span>
                    <span>{fmtDur(e.stats.durationS)}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[8px] text-muted-foreground">
                    <span>ΔMAP {e.stats.mapMax - e.stats.mapMin >= 0 ? "+" : ""}{(e.stats.mapMax - e.stats.mapMin).toFixed(1)} kPa</span>
                    <span>EGT {e.stats.egtMax.toFixed(0)}°C</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* selected excursion detail */}
          {selected && <ExcursionDetail exc={selected} />}
        </div>
      )}
    </div>
  );
}

// keep GroundAlert import referenced for type stability (ticker shares the store)
export type { GroundAlert };
