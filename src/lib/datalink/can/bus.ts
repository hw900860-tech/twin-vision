/**
 * CAN bus transports. `SimulatedCanBus` is the always-available demo path:
 * it encodes the live flight-store state into frames every 20 ms (50 Hz ECU
 * broadcast) and streams them through the same callback a real socketCAN
 * socket would use.
 *
 * ┌─────────────────────────── REAL-HARDWARE SWAP POINT ───────────────────────────┐
 * │ To consume a physical engine:                                                 │
 * │                                                                               │
 * │   1. Linux board with a CAN controller (e.g. the UAV flight computer):        │
 * │        sudo ip link set can0 type can bitrate 500000                          │
 * │        sudo ip link set can0 up                                               │
 * │                                                                               │
 * │   2. Install the adapter (bun/npm):                                           │
 * │        bun add socketcan                                                     │
 * │                                                                               │
 * │   3. Uncomment RealSocketCanBus below — it implements CanBusTransport with    │
 * │      the exact same start/stop contract. The gateway, decoder, datalink and   │
 * │      GCS consume whatever this bus emits; nothing else changes.               │
 * └────────────────────────────────────────────────────────────────────────────────┘
 */

import { useFlightStore } from "@/features/flight-sim/flightStore";
import { encodeEngineToCan } from "./encoder";
import type { CanBusTransport, CanEngineSource, CanFrame } from "./types";

const BUS_TICK_MS = 20; // 50 Hz ECU broadcast (real ECUs run 20–100 Hz)

/** Pull the current store state into the exact shape an ECU would publish. */
export function storeToCanSource(): CanEngineSource {
  const s = useFlightStore.getState();
  const egt = s.egt;
  const injectorActive = s.faultSmooth.injectorClog > 0.3;
  return {
    rpm: s.rpm,
    throttle: s.throttle,
    injectionTiming: s.injectionTiming,
    cht: [s.cht[0] ?? 0, s.cht[1] ?? 0, s.cht[2] ?? 0, s.cht[3] ?? 0],
    egt: [
      egt,
      egt,
      egt + (injectorActive ? 68 : 0) - (s.faultSmooth.misfire3 > 0.3 ? 55 : 0),
      egt,
    ],
    map: s.map,
    oilPressure: s.oilPressure,
    oilTemp: s.oilTemp,
    vibrationRMS: s.vibrationRMS,
    healthIndex: s.healthIndex * 100,
    anomalyScore: s.anomalyScore * 100,
    rul: s.rul,
    ambientTemp: s.ambientTemp,
    faults: {
      c2Overheat: s.faultSmooth.c2Overheat > 0.3,
      turboFail: s.faultSmooth.turboFail > 0.3,
      bearingFail: s.faultSmooth.bearingFail > 0.3,
      injectorClog: s.faultSmooth.injectorClog > 0.3,
      misfire3: s.faultSmooth.misfire3 > 0.3,
    },
    altitude: s.altitude,
    speed: s.speed,
    heading: s.heading,
    pitch: s.pitchAngle * 57.3,
    roll: s.bankAngle,
    verticalSpeed: s.pitchAngle * 1000,
    lat: s.crashCoordinates?.lat ?? 28.6139 + s.x * 0.00001,
    lon: s.crashCoordinates?.lon ?? 77.209 + s.z * 0.00001,
  };
}

/**
 * Simulated ECU on a virtual CAN bus. Encodes the live simulation into
 * 13 CANaerospace-style frames at 50 Hz and delivers them one frame at a
 * time through the transport callback — byte-identical to what a real ECU
 * would put on the wire.
 */
export class SimulatedCanBus implements CanBusTransport {
  readonly name = "SIM-CAN0 · 500 kbit/s (virtual)";
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFrame: ((f: CanFrame) => void) | null = null;
  private tick = 0;

  start(onFrame: (frame: CanFrame) => void): void {
    this.onFrame = onFrame;
    if (this.timer) return;
    this.timer = setInterval(() => {
      const ts = Date.now();
      const frames = encodeEngineToCan(storeToCanSource(), ts);
      for (const f of frames) this.onFrame?.(f);
      this.tick += frames.length;
    }, BUS_TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onFrame = null;
  }

  get framesSent(): number {
    return this.tick;
  }
}

/**
 * Real socketCAN adapter — the drop-in replacement for production hardware.
 *
 * Uncomment + install `socketcan` (or use `can-utils` + a child process
 * parsing `candump` lines) and this class becomes the transport. The frame
 * contract (11-bit ID + 8 bytes) is identical to SimulatedCanBus, so the
 * decoder and the entire downstream pipeline are reused unchanged.
 */
export class RealSocketCanBus implements CanBusTransport {
  readonly name: string;
  constructor(interfaceName = "can0", bitrate = 500000) {
    this.name = `SOCKETCAN ${interfaceName} @ ${bitrate} bit/s`;
  }

  start(_onFrame: (frame: CanFrame) => void): void {
    // REAL-HARDWARE WIRING (uncomment after `bun add socketcan`):
    //   import can from "socketcan";
    //   const channel = can.createRawChannel("can0");
    //   channel.addListener("onMessage", (msg: { id: number; data: Buffer }) => {
    //     onFrame({ id: msg.id, data: new Uint8Array(msg.data.buffer, msg.data.byteOffset, 8), ts: Date.now() });
    //   });
    //   channel.start();
    throw new Error(
      "RealSocketCanBus is the documented hardware swap point — wire it to a socketCAN channel (see bus.ts header) before use.",
    );
  }

  stop(): void {
    // channel.stop(); channel.removeAllListeners();
  }
}
