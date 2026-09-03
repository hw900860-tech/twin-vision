import type { LinkMode } from "./types";

/**
 * Simulated datalink channel model, applied on the AIRBORNE side before frames
 * reach the real WebSocket transport. This represents the RF link (C-band LOS
 * datalink or SATCOM) which a browser cannot physically instantiate; the
 * network hop from this browser to the relay and on to the ground console is
 * real, so everything the ground station measures below this model is genuine.
 *
 * LOS:     datalink round about 0 ms added latency, lossless
 * SATCOM:  ~250 ms one-way (Iridium-class), jittered, ~4% packet loss
 * OUTAGE:  radio link down — every frame dropped at the modem
 */
export interface ChannelConfig {
  label: string;
  oneWayMs: number;
  jitterMs: number;
  lossRate: number; // 0..1
  dropAll?: boolean;
}

export const CHANNEL_CONFIGS: Record<LinkMode, ChannelConfig> = {
  LOS: { label: "LINE OF SIGHT", oneWayMs: 0, jitterMs: 0, lossRate: 0 },
  SATCOM: { label: "SATCOM / IRIDIUM-CLASS", oneWayMs: 250, jitterMs: 45, lossRate: 0.04 },
  OUTAGE: { label: "RADIO OUTAGE", oneWayMs: 0, jitterMs: 0, lossRate: 1, dropAll: true },
};

export class DatalinkChannel {
  private cfg: ChannelConfig = CHANNEL_CONFIGS.LOS;
  sent = 0;
  dropped = 0;

  setMode(m: LinkMode): void {
    this.cfg = CHANNEL_CONFIGS[m];
  }

  get mode(): LinkMode {
    return (Object.keys(CHANNEL_CONFIGS) as LinkMode[]).find((k) => CHANNEL_CONFIGS[k] === this.cfg) ?? "LOS";
  }

  get lossRate(): number {
    return this.cfg.lossRate;
  }

  /** Route one frame through the simulated datalink, delivering it via `deliver`. */
  dispatch(bytes: ArrayBuffer, deliver: (b: ArrayBuffer) => void): void {
    if (this.cfg.dropAll || Math.random() < this.cfg.lossRate) {
      this.dropped++;
      return;
    }
    const delay = Math.max(0, this.cfg.oneWayMs + (Math.random() * 2 - 1) * this.cfg.jitterMs);
    this.sent++;
    if (delay === 0) {
      deliver(bytes);
    } else {
      // Reorder risk exists on a real jittered link too; delivering in arrival
      // order keeps the demo honest about sequence-gap detection on the ground.
      setTimeout(() => deliver(bytes), delay);
    }
  }
}
