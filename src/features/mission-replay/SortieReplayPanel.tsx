/**
 * SORTIE REPLAY PANEL (GCS) — animated route replay of real flown missions.
 *
 * The aircraft's mission recorder captures every sortie (route snapshot,
 * waypoint capture times, ~1 Hz position/engine samples) and streams it over
 * the datalink as a MISSION_RECORD frame when the sortie ends. This panel:
 *   - lists received sorties (preset, biome, outcome, duration),
 *   - replays the selected sortie as an animated top-down flight: the planned
 *     route (dashed) vs the actual flown path (emerald trail that grows with
 *     the playhead), the UAV arrow tracking heading, ✓ waypoint captures
 *     flipping in as their recorded times pass,
 *   - offers play/pause, 1×/4×/8× speed and a scrubber, with live readouts of
 *     the aircraft state (alt/heading/speed/RPM/EGT/MAP) at the playhead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Panel } from "@/components/hud/primitives";
import { useLinkStore } from "@/features/datalink/linkStore";
import { REGIONS_BY_BIOME } from "@/features/flight-sim/regions";
import { fmtDuration, type SortieRecord, type SortieSample } from "@/lib/datalink/sortie";

const VIEW_W = 900;
const VIEW_H = 560;

const SEV: Record<string, string> = { info: "#3b82f6", caution: "#f0a63c", critical: "#e2523f" };
const END_COLOR: Record<string, string> = {
  COMPLETE: "#34d399",
  CRASHED: "#e2523f",
  "FORCED LANDING": "#f0a63c",
  RECOVERED: "#22d3ee",
  ABORTED: "#94a3b8",
};

interface LiveState {
  x: number;
  z: number;
  alt: number;
  hdg: number;
  spd: number;
  rpm: number;
  egt: number;
  map: number;
}

/** Interpolated aircraft state at mission-clock time t (linear over samples). */
function stateAt(rec: SortieRecord, t: number): LiveState {
  const sm = rec.samples;
  if (sm.length === 0) {
    const w = rec.waypoints[0];
    return { x: w?.x ?? 0, z: w?.z ?? 0, alt: 0, hdg: 0, spd: 0, rpm: 0, egt: 0, map: 0 };
  }
  let i = sm.length - 1;
  for (let k = 0; k < sm.length - 1; k++) {
    if (t <= (sm[k + 1]?.t ?? t)) {
      i = k;
      break;
    }
  }
  const a = sm[i]!;
  const b = sm[Math.min(i + 1, sm.length - 1)]!;
  const span = b.t - a.t;
  const f = span > 0.0001 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 0;
  const hdgDiff = ((b.hdg - a.hdg + 540) % 360) - 180;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return {
    x: lerp(a.x, b.x),
    z: lerp(a.z, b.z),
    alt: lerp(a.alt, b.alt),
    hdg: (a.hdg + hdgDiff * f + 360) % 360,
    spd: lerp(a.spd, b.spd),
    rpm: lerp(a.rpm, b.rpm),
    egt: lerp(a.egt, b.egt),
    map: lerp(a.map, b.map),
  };
}

function buildFrame(rec: SortieRecord, live: LiveState) {
  const xs: number[] = [];
  const zs: number[] = [];
  rec.waypoints.forEach((w) => { xs.push(w.x); zs.push(w.z); });
  const regs = REGIONS_BY_BIOME[rec.biome as keyof typeof REGIONS_BY_BIOME] ?? [];
  regs.forEach((r) => {
    xs.push(r.cx - r.radius, r.cx + r.radius);
    zs.push(r.cz - r.radius, r.cz + r.radius);
  });
  rec.samples.forEach((s) => { xs.push(s.x); zs.push(s.z); });
  xs.push(live.x);
  zs.push(live.z);
  const pad = 40;
  let minX = Math.min(...xs) - pad;
  let maxX = Math.max(...xs) + pad;
  let minZ = Math.min(...zs) - pad;
  let maxZ = Math.max(...zs) + pad;
  let bw = Math.max(maxX - minX, 240);
  let bh = Math.max(maxZ - minZ, 170);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  minX = cx - bw / 2;
  maxX = cx + bw / 2;
  minZ = cz - bh / 2;
  maxZ = cz + bh / 2;
  const scale = Math.min(VIEW_W / (maxX - minX), VIEW_H / (maxZ - minZ));
  const toX = (wx: number) => (wx - cx) * scale + VIEW_W / 2;
  const toZ = (wz: number) => (wz - cz) * scale + VIEW_H / 2;
  return { toX, toZ };
}

function ReplayView({ rec }: { rec: SortieRecord }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const raf = useRef(0);

  const duration = Math.max(rec.duration, rec.samples[rec.samples.length - 1]?.t ?? 0, 0.1);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((p) => {
        const n = p + dt * speed;
        if (n >= duration) {
          setPlaying(false);
          return duration;
        }
        return n;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, duration]);

  const live = useMemo(() => stateAt(rec, Math.min(t, duration)), [rec, t, duration]);
  const { toX, toZ } = useMemo(() => buildFrame(rec, live), [rec, live]);
  const regs = REGIONS_BY_BIOME[rec.biome as keyof typeof REGIONS_BY_BIOME] ?? [];
  const P = (x: number, z: number) => `${toX(x).toFixed(1)},${toZ(z).toFixed(1)}`;

  // Waypoint states at the playhead: captures happen strictly in order, so
  // waypoints whose capture time has passed are ✓; the next one is "current".
  const passedCount = rec.captures.filter((c) => c.t <= t).length;
  const wpState = (i: number): "passed" | "current" | "future" => {
    if (i < passedCount) return "passed";
    if (i === passedCount && i < rec.waypoints.length) return "current";
    return "future";
  };

  const readouts = [
    { k: "TIME", v: fmtDuration(Math.min(t, duration)) },
    { k: "ALT", v: `${live.alt.toFixed(0)} ft` },
    { k: "HDG", v: `${live.hdg.toFixed(0)}°` },
    { k: "SPD", v: `${live.spd.toFixed(0)} kts` },
    { k: "RPM", v: live.rpm.toFixed(0) },
    { k: "EGT", v: `${live.egt.toFixed(0)}°C` },
    { k: "MAP", v: `${live.map.toFixed(1)} kPa` },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* readouts + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-7 gap-px bg-border">
          {readouts.map((r) => (
            <div key={r.k} className="bg-panel-2/90 px-2 py-1">
              <div className="label-xs text-[7.5px]">{r.k}</div>
              <div className="font-mono text-[11px] font-bold text-cyan">{r.v}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setPlaying((p) => !p); }}
            className="flex h-7 items-center gap-1 border border-cyan/60 bg-cyan/10 px-2.5 text-[10px] font-mono font-bold text-cyan transition-colors hover:bg-cyan/20"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? "PAUSE" : "PLAY"}
          </button>
          <button
            onClick={() => { setT(0); setPlaying(false); }}
            className="flex h-7 items-center gap-1 border border-border bg-panel-2 px-2 text-[10px] font-mono text-muted-foreground hover:text-cyan"
          >
            <RotateCcw className="h-3 w-3" /> RESET
          </button>
          {[1, 4, 8].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`h-7 border px-1.5 text-[9px] font-mono font-bold ${speed === s ? "border-cyan bg-cyan/20 text-cyan" : "border-border bg-panel-2 text-muted-foreground"}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <span
          className="border px-2 py-1 font-mono text-[9px] font-bold"
          style={{ borderColor: END_COLOR[rec.endReason] ?? "#94a3b8", color: END_COLOR[rec.endReason] ?? "#94a3b8", background: `${END_COLOR[rec.endReason] ?? "#94a3b8"}18` }}
        >
          {rec.endReason}
        </span>
      </div>

      {/* map */}
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block h-auto w-full rounded border border-border/60 bg-[#02060a]">
        <g stroke="rgba(148,163,184,0.07)">
          {[150, 300, 450, 600, 750].map((gx) => <line key={`x${gx}`} x1={gx} y1={0} x2={gx} y2={VIEW_H} />)}
          {[112, 224, 336, 448].map((gy) => <line key={`y${gy}`} x1={0} y1={gy} x2={VIEW_W} y2={gy} />)}
        </g>

        {/* region rings (static registry for the sortie's biome) */}
        {regs.map((r) => {
          const col = SEV[r.severity] ?? "#3b82f6";
          const cx = toX(r.cx);
          const cy = toZ(r.cz);
          return (
            <g key={r.id} opacity={0.85}>
              <circle cx={cx} cy={cy} r={Math.max(3, Math.abs(toX(r.cx + r.radius) - cx))} fill={col} opacity={0.07} />
              <circle cx={cx} cy={cy} r={Math.max(3, Math.abs(toX(r.cx + r.radius) - cx))} fill="none" stroke={col} strokeWidth={1.6} strokeDasharray="7 6" />
              <text x={cx} y={cy + 3} textAnchor="middle" fontSize={13} fill={col} opacity={0.85}>◇</text>
            </g>
          );
        })}

        {/* planned route (dashed) */}
        <polyline
          points={rec.waypoints.map((w) => P(w.x, w.z)).join(" ")}
          fill="none"
          stroke="#64748b"
          strokeWidth={1.6}
          strokeDasharray="2 7"
          opacity={0.6}
        />

        {/* full actual flight path (faint) + flown portion to playhead (emerald) */}
        {rec.samples.length > 1 && (
          <polyline
            points={rec.samples.map((s) => P(s.x, s.z)).join(" ")}
            fill="none"
            stroke="#475569"
            strokeWidth={1.4}
            opacity={0.5}
          />
        )}
        {(() => {
          const upto = rec.samples.filter((s) => s.t <= t);
          const pts = upto.length > 1 ? upto.map((s) => P(s.x, s.z)).join(" ") : upto.length === 1 ? `${P(upto[0]!.x, upto[0]!.z)} ${P(live.x, live.z)}` : "";
          if (!pts) return null;
          return <polyline points={pts} fill="none" stroke="#34d399" strokeWidth={3} strokeLinejoin="round" opacity={0.95} />;
        })()}

        {/* waypoint markers with ✓ captures */}
        {rec.waypoints.map((w, i) => {
          const isBase = i === 0 || i === rec.waypoints.length - 1;
          const st = wpState(i);
          const col = st === "passed" ? "#3f4a55" : st === "current" ? "#ffffff" : isBase ? "#22c55e" : "#22d3ee";
          const cx = toX(w.x);
          const cy = toZ(w.z);
          const cap = rec.captures.find((c) => c.wp === i);
          return (
            <g key={i}>
              {st === "current" && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#f8fafc" strokeWidth={1.6} opacity={0.85} />}
              <circle cx={cx} cy={cy} r={st === "current" ? 9 : isBase ? 8 : 6} fill={col} opacity={0.92} />
              {st === "passed" && cap && (
                <text x={cx + 9} y={cy - 5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#34d399" opacity={0.95}>✓</text>
              )}
            </g>
          );
        })}

        {/* UAV arrow at playhead */}
        <g transform={`translate(${toX(live.x).toFixed(1)},${toZ(live.z).toFixed(1)}) rotate(${live.hdg.toFixed(1)})`}>
          <circle r={16} fill="rgba(248,250,252,0.12)" />
          <path d="M 0 -13 L 5.5 9 L 0 5 L -5.5 9 Z" fill="#f8fafc" stroke="#0891b2" strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      </svg>

      {/* capture timeline chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="label-xs text-[7.5px] text-muted-foreground">CAPTURES</span>
        {rec.captures.map((c, i) => (
          <span
            key={i}
            className={`border px-1.5 py-0.5 font-mono text-[8px] ${c.t <= t ? "border-[#34d399]/60 text-[#34d399]" : "border-border text-muted-foreground"}`}
          >
            {rec.waypoints[c.wp]?.label ?? `WP-${c.wp}`} @ {fmtDuration(c.t)}
          </span>
        ))}
      </div>

      {/* scrubber */}
      <input
        type="range"
        min={0}
        max={duration}
        step={0.05}
        value={Math.min(t, duration)}
        onChange={(e) => { setT(Number(e.target.value)); setPlaying(false); }}
        className="h-1.5 w-full cursor-pointer accent-cyan"
        aria-label="Replay scrubber"
      />
    </div>
  );
}

export function SortieReplayPanel() {
  const sorties = useLinkStore((s) => s.sorties);
  const clearSorties = useLinkStore((s) => s.clearSorties);
  const [selId, setSelId] = useState<string | null>(null);
  const selected = sorties.find((s) => s.id === selId) ?? sorties[0] ?? null;

  useEffect(() => {
    if (selId && !sorties.some((s) => s.id === selId)) setSelId(null);
  }, [sorties, selId]);

  return (
    <Panel label="SORTIE REPLAY" corner={sorties.length > 0 ? `MISSION RECORDER · ${sorties.length} SORTIE${sorties.length > 1 ? "S" : ""} ON LINK` : "MISSION RECORDER"}>
      <div className="grid gap-3 p-3 lg:grid-cols-[240px_1fr]">
        {/* sortie list */}
        <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto pr-1">
          {sorties.length === 0 && (
            <div className="rounded border border-border/60 bg-panel-2/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
              <div className="mb-1 font-bold text-cyan">NO SORTIES RECEIVED</div>
              The mission recorder captures every preset flight on <span className="text-cyan">/sim</span> — route snapshot,
              waypoint capture times and a live position/engine trace — and streams it to this console the moment the
              sortie ends (complete, crash, forced landing, abort or recovery). Fly and finish a mission to see it here.
            </div>
          )}
          {sorties.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelId(s.id)}
              className={`border p-2 text-left transition-colors ${selected?.id === s.id ? "border-cyan bg-cyan/10" : "border-border bg-panel-2/70 hover:border-cyan/50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-bold text-foreground">{s.presetLabel}</span>
                <span className="shrink-0 font-mono text-[8px]" style={{ color: END_COLOR[s.endReason] ?? "#94a3b8" }}>{s.endReason}</span>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[8px] text-muted-foreground">
                <span>{s.biome.toUpperCase()} · {fmtDuration(s.duration)}</span>
                <span>{s.captures.length}/{s.waypoints.length} WP</span>
              </div>
            </button>
          ))}
          {sorties.length > 0 && (
            <button onClick={clearSorties} className="mt-1 border border-border bg-panel-2 py-1 text-[8px] font-mono text-muted-foreground hover:text-critical">
              CLEAR SORTIES
            </button>
          )}
        </div>

        {/* replay stage */}
        <div className="min-w-0">
          {selected ? (
            <ReplayView key={selected.id} rec={selected} />
          ) : (
            <div className="flex h-72 items-center justify-center rounded border border-dashed border-border/60 font-mono text-[10px] text-muted-foreground">
              SELECT A SORTIE TO REPLAY
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default SortieReplayPanel;
