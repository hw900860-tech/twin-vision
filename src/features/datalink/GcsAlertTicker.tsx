import { useLinkStore, type GroundAlert } from "./linkStore";
import { X, MapPin } from "lucide-react";

const SEV_STYLE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  critical: { border: "rgba(226,82,63,0.7)", bg: "rgba(60,14,10,0.85)", text: "#ff7a6b", label: "CRITICAL" },
  caution: { border: "rgba(240,166,60,0.7)", bg: "rgba(46,32,8,0.85)", text: "#f0a63c", label: "CAUTION" },
  info: { border: "rgba(59,130,246,0.7)", bg: "rgba(10,24,44,0.85)", text: "#7fb0ff", label: "INFO" },
};

function fmtAgo(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

/**
 * Live tactical region-alert ticker. Every alert shown here arrived over the
 * real WebSocket datalink from the airborne session — the exact text the
 * aircraft broadcast when it crossed into/out of an atmospheric region.
 */
export function GcsAlertTicker() {
  const alerts = useLinkStore((s) => s.alerts);
  const dismissAlert = useLinkStore((s) => s.dismissAlert);
  if (alerts.length === 0) return null;

  const latest = alerts.slice(0, 3);

  return (
    <div className="flex flex-col gap-1 border-b border-border bg-panel/60 px-4 py-1.5">
      <div className="flex items-center justify-between">
        <span className="label-xs text-[8.5px] font-bold tracking-widest text-cyan/90">
          ◈ TACTICAL REGION ALERTS — VIA DATALINK ({alerts.length})
        </span>
      </div>
      {latest.map((a: GroundAlert) => {
        const st = SEV_STYLE[a.severity] ?? SEV_STYLE['info']!;
        return (
          <div
            key={a.id}
            role="alert"
            className="flex items-center gap-2 border px-2 py-1 font-mono text-[9px]"
            style={{ borderColor: st.border, background: st.bg, color: st.text }}
          >
            <MapPin className="h-3 w-3 shrink-0" style={{ color: st.text }} />
            <span className="shrink-0 font-bold tracking-wider">{st.label}</span>
            <span className="shrink-0 text-muted-foreground">
              {a.event === "ENTER" ? "▸ ENTER" : "◂ EXIT"} {a.name}
            </span>
            <span className="truncate text-foreground/90">{a.text}</span>
            <span className="ml-auto shrink-0 flex items-center gap-2 text-muted-foreground">
              OAT {a.params.tempDeltaC >= 0 ? "+" : ""}{a.params.tempDeltaC.toFixed(0)}°C · MAP ×{a.params.pressureDelta.toFixed(2)} · TURB {a.params.turbulence.toFixed(1)}
              <span>{fmtAgo(a.at)}</span>
              <button
                onClick={() => dismissAlert(a.id)}
                aria-label="Dismiss alert"
                className="cursor-pointer text-muted-foreground transition-colors hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
