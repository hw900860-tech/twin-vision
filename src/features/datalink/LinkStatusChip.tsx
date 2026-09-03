import { useLinkStore } from "./linkStore";

/** Compact status chip shown in page headers. Re-renders with the link stats. */
export function LinkStatusChip({ detailed = false }: { detailed?: boolean }) {
  const role = useLinkStore((s) => s.role);
  const mode = useLinkStore((s) => s.mode);
  const wsStatus = useLinkStore((s) => s.wsStatus);
  const airborneOnline = useLinkStore((s) => s.airborneOnline);
  const latencyMs = useLinkStore((s) => s.latencyMs);
  const rttMs = useLinkStore((s) => s.rttMs);
  const lossPct = useLinkStore((s) => s.lossPct);
  const txRateHz = useLinkStore((s) => s.txRateHz);
  const rxRateHz = useLinkStore((s) => s.rxRateHz);
  const lastFrameAgeMs = useLinkStore((s) => s.lastFrameAgeMs);

  const isGround = role === "ground";
  const stale = isGround && (lastFrameAgeMs > 1200 || !airborneOnline);
  const down = wsStatus === "offline";
  const color = down || stale ? "#ef4444" : wsStatus === "connecting" ? "#eab308" : "#10b981";
  const label = down
    ? "LINK DOWN"
    : stale
      ? "NO LINK"
      : wsStatus === "connecting"
        ? "CONNECTING…"
        : isGround
          ? `LINK ${mode}`
          : `DATALINK ${mode}`;

  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[8.5px] tracking-wider whitespace-nowrap"
      style={{ borderColor: color + "88", background: color + "1a", color }}
      title={`Relay: ${useLinkStore.getState().relayUrl}`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
      {detailed && !down && (
        <>
          {isGround ? (
            <span className="opacity-80">
              {latencyMs.toFixed(0)}ms · RTT {rttMs.toFixed(0)}ms · LOSS {lossPct.toFixed(1)}% · {rxRateHz}Hz
            </span>
          ) : (
            <span className="opacity-80">
              TX {txRateHz}Hz · {airborneOnline ? "ONLINE" : "NO PEER"}
            </span>
          )}
        </>
      )}
    </span>
  );
}
