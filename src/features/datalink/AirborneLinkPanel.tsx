import { setAirborneMode } from "./airborne";
import { useLinkStore } from "./linkStore";

/** Airborne-side (flight sim) datalink control: profile switch + TX telemetry. */
export function AirborneLinkPanel() {
  const mode = useLinkStore((s) => s.mode);
  const wsStatus = useLinkStore((s) => s.wsStatus);
  const txRateHz = useLinkStore((s) => s.txRateHz);
  const txBps = useLinkStore((s) => s.txBps);
  const txFrames = useLinkStore((s) => s.txFrames);
  const txDropped = useLinkStore((s) => s.txDropped);
  const txBuffer = useLinkStore((s) => s.txBuffer);
  const replaysSent = useLinkStore((s) => s.replaysSent);
  const airborneOnline = useLinkStore((s) => s.airborneOnline);

  const modes: { key: "LOS" | "SATCOM" | "OUTAGE"; label: string }[] = [
    { key: "LOS", label: "LOS" },
    { key: "SATCOM", label: "SATCOM" },
    { key: "OUTAGE", label: "OUTAGE" },
  ];

  return (
    <div className="pointer-events-auto rounded border border-cyan/30 bg-panel/90 p-2 font-mono text-[8.5px] backdrop-blur-md shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-bold tracking-wider text-cyan">DATALINK MODEM</span>
        <span
          className="px-1.5 py-0.5 text-[8px] font-bold"
          style={{
            color: wsStatus === "online" ? "#10b981" : wsStatus === "connecting" ? "#eab308" : "#ef4444",
            background: (wsStatus === "online" ? "#10b981" : wsStatus === "connecting" ? "#eab308" : "#ef4444") + "1a",
          }}
        >
          {wsStatus === "online" ? "● ONLINE" : wsStatus === "connecting" ? "● CONNECTING" : "● OFFLINE"}
        </span>
      </div>

      <div className="mb-1.5 flex gap-1">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setAirborneMode(m.key)}
            className={`flex-1 border px-1 py-1 text-[8px] font-bold tracking-wider transition-all cursor-pointer ${
              mode === m.key
                ? m.key === "OUTAGE"
                  ? "border-critical bg-critical/25 text-critical"
                  : m.key === "SATCOM"
                    ? "border-amber bg-amber/25 text-amber"
                    : "border-nominal bg-nominal/25 text-nominal"
                : "border-border bg-background/60 text-muted-foreground hover:text-cyan"
            }`}
            title={
              m.key === "LOS"
                ? "C-band line-of-sight datalink — ~0 ms added latency, lossless"
                : m.key === "SATCOM"
                  ? "Iridium-class SATCOM — ~250 ms one-way, ~4% loss"
                  : "Simulated radio outage — every frame dropped"
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] text-muted-foreground">
        <span>TX RATE</span>
        <span className="text-right text-cyan">{txRateHz} Hz</span>
        <span>FRAME</span>
        <span className="text-right text-cyan">112 B · CRC-16</span>
        <span>BANDWIDTH</span>
        <span className="text-right text-cyan">{txBps >= 1000 ? `${(txBps / 1000).toFixed(1)} kbps` : `${txBps} bps`}</span>
        <span>SENT / DROPPED</span>
        <span className="text-right text-cyan">
          {txFrames} / {txDropped}
        </span>
        <span className="text-cyan" title="Store-and-forward ring: frames buffered on the aircraft for replay (60 s @ 20 Hz)">
          S&F BUFFER
        </span>
        <span className="text-right text-cyan">
          {txBuffer} · REPLAY <b className="text-nominal">{replaysSent}</b>
        </span>
        <span>PEER</span>
        <span className="text-right" style={{ color: airborneOnline ? "#10b981" : "#eab308" }}>
          {airborneOnline ? "GCS ONLINE" : "NO GCS YET"}
        </span>
      </div>
    </div>
  );
}
