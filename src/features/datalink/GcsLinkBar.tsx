import { useLinkStore } from "./linkStore";
import { stopGroundLink } from "./ground";

function fmtMs(v: number): string {
  return `${Math.round(v)} ms`;
}

/**
 * Ground-station datalink telemetry bar. Everything shown here is measured on
 * real frames that crossed the network (plus the simulated RF channel model).
 */
export function GcsLinkBar() {
  const wsStatus = useLinkStore((s) => s.wsStatus);
  const airborneOnline = useLinkStore((s) => s.airborneOnline);
  const mode = useLinkStore((s) => s.mode);
  const latencyMs = useLinkStore((s) => s.latencyMs);
  const rttMs = useLinkStore((s) => s.rttMs);
  const lossPct = useLinkStore((s) => s.lossPct);
  const rxRateHz = useLinkStore((s) => s.rxRateHz);
  const rxFrames = useLinkStore((s) => s.rxFrames);
  const rxBadCrc = useLinkStore((s) => s.rxBadCrc);
  const rxGaps = useLinkStore((s) => s.rxGaps);
  const lastFrameAgeMs = useLinkStore((s) => s.lastFrameAgeMs);
  const cmdStatus = useLinkStore((s) => s.cmdStatus);
  const cmdRttMs = useLinkStore((s) => s.cmdRttMs);
  const cmdName = useLinkStore((s) => s.cmdName);
  const cmdAttempts = useLinkStore((s) => s.cmdAttempts);

  const connected = wsStatus === "online";
  const streaming = airborneOnline && rxFrames > 0 && lastFrameAgeMs < 1500;
  const ageCritical = lastFrameAgeMs > 3000;

  const cmdColor =
    cmdStatus === "acked"
      ? "#10b981"
      : cmdStatus === "noack"
        ? "#ef4444"
        : cmdStatus === "retrying"
          ? "#f97316"
          : cmdStatus === "sent"
            ? "#eab308"
            : "#94a3b8";
  const cmdLabel =
    cmdStatus === "idle" ? "CMD IDLE" : cmdStatus === "acked" ? `${cmdName} ACK ${fmtMs(cmdRttMs)}` : cmdStatus === "noack" ? `${cmdName} NO ACK` : cmdStatus === "retrying" ? `${cmdName} RETRY ${cmdAttempts}/3` : `${cmdName} SENT…`;

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-panel/70 px-4 py-1.5 font-mono text-[9.5px]"
      role="status"
    >
      <span className="flex items-center gap-1.5 font-bold tracking-wider">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: streaming ? "#10b981" : connected && !airborneOnline ? "#eab308" : "#ef4444",
            boxShadow: `0 0 6px ${streaming ? "#10b981" : connected && !airborneOnline ? "#eab308" : "#ef4444"}`,
          }}
        />
        <span style={{ color: streaming ? "#10b981" : connected && !airborneOnline ? "#eab308" : "#ef4444" }}>
          {streaming ? `LINK ${mode} — LIVE` : connected && !airborneOnline ? "LINK UP — AWAITING AIRBORNE" : "LINK DOWN"}
        </span>
      </span>

      <span className="text-muted-foreground">
        ONE-WAY <b style={{ color: ageCritical ? "#ef4444" : "#6fd8e8" }}>{fmtMs(latencyMs)}</b>
      </span>
      <span className="text-muted-foreground">
        RTT <b className="text-cyan">{fmtMs(rttMs)}</b>
      </span>
      <span className="text-muted-foreground">
        LOSS <b className="text-cyan">{lossPct.toFixed(2)}%</b>
      </span>
      <span className="text-muted-foreground">
        RX <b className="text-cyan">{rxRateHz} Hz</b>
      </span>
      <span className="text-muted-foreground">
        FRAMES <b className="text-cyan">{rxFrames}</b> · CRC <b className="text-nominal">{rxBadCrc === 0 ? "OK" : `${rxBadCrc} BAD`}</b>
      </span>
      <span className="text-muted-foreground">
        GAPS <b className="text-amber">{rxGaps}</b>
      </span>
      <span className="text-muted-foreground">
        AGE <b style={{ color: ageCritical ? "#ef4444" : "#6fd8e8" }}>{fmtMs(lastFrameAgeMs)}</b>
      </span>
      <span className="text-muted-foreground">
        CMD <b style={{ color: cmdColor }}>{cmdLabel}</b>
      </span>
      {!airborneOnline && (
        <button
          onClick={() => {
            stopGroundLink();
          }}
          className="ml-auto border border-border px-2 py-0.5 text-[9px] text-muted-foreground transition-colors hover:border-amber/60 hover:text-amber cursor-pointer"
          title="Stop waiting for an airborne session and let this page run its own local simulation"
        >
          RUN LOCAL DEMO
        </button>
      )}
    </div>
  );
}
