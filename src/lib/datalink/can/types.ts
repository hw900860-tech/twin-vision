/**
 * CAN ingestion layer — simulated socketCAN for the AE-P4 digital twin.
 *
 * WHY THIS EXISTS
 * ---------------
 * A real MALE UAV carries its engine sensors on a CAN bus (CANaerospace-style
 * 11-bit frames, 8-byte payloads, 500 kbit/s–1 Mbit/s). The ECU publishes
 * RPM, CHT, EGT, MAP, oil and vibration as scaled integers; the mission
 * computer decodes them and relays them to the ground. This module reproduces
 * that exact pipeline in simulation so the digital twin consumes the same
 * shaped data a real aircraft would emit — quantization, frame layout and
 * decode logic included.
 *
 * THE SWAP POINT (real hardware)
 * ------------------------------
 * Everything below `CanBusTransport` is the seam. The simulator and the
 * digital twin only ever talk through this interface:
 *
 *     const bus: CanBusTransport = realHardware
 *         ? new RealSocketCanBus("can0", 500000)   // see bus.ts
 *         : new SimulatedCanBus();                 // default demo path
 *
 * Swap in `RealSocketCanBus` and NOTHING ELSE changes: the encoder, decoder,
 * gateway, datalink and GCS all keep working.
 */

/** One raw CAN frame exactly as it would appear on the wire. */
export interface CanFrame {
  /** 11-bit standard arbitration ID (0x000–0x7FF). */
  id: number;
  /** Exactly 8 payload bytes (CAN classic DLC). */
  data: Uint8Array;
  /** Monotonic bus timestamp (ms, engine clock). */
  ts: number;
}

/** How a signal is packed inside a frame. */
export interface CanSignalDef {
  name: string;
  /** Byte offset into the 8-byte payload. */
  byteOffset: number;
  /** 8, 16 or 32 bit little-endian. */
  bitLength: 8 | 16 | 32;
  signed: boolean;
  /** Raw units per physical unit: physical = raw * scale + offset. */
  scale: number;
  offset: number;
  unit: string;
  /** Physical clamp applied on decode (sensor range). */
  min: number;
  max: number;
}

export interface CanFrameDef {
  id: number;
  label: string;
  signals: CanSignalDef[];
}

/** Engine/aircraft values a real ECU would publish. Mirrors TelemetrySnapshot. */
export interface CanEngineSource {
  rpm: number;
  throttle: number;
  injectionTiming: number; // ° BTDC
  cht: [number, number, number, number];
  egt: [number, number, number, number];
  map: number; // kPa
  oilPressure: number; // bar
  oilTemp: number; // °C
  vibrationRMS: number; // m/s²
  healthIndex: number; // 0-100
  anomalyScore: number; // 0-100
  rul: number; // hours
  ambientTemp: number; // °C
  faults: { c2Overheat: boolean; turboFail: boolean; bearingFail: boolean; injectorClog: boolean; misfire3: boolean };
  altitude: number; // ft
  speed: number; // kt
  heading: number; // °
  pitch: number; // °
  roll: number; // °
  verticalSpeed: number; // ft/min
  lat: number;
  lon: number;
}

/** Decoded output of one bus tick (all frames merged). */
export interface CanDecoded {
  rpm?: number;
  throttle?: number;
  injectionTiming?: number;
  cht?: [number, number, number, number];
  egt?: [number, number, number, number];
  map?: number;
  oilPressure?: number;
  oilTemp?: number;
  vibrationRMS?: number;
  healthIndex?: number;
  anomalyScore?: number;
  rul?: number;
  ambientTemp?: number;
  faults?: CanEngineSource["faults"];
  altitude?: number;
  speed?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  verticalSpeed?: number;
  lat?: number;
  lon?: number;
}

/**
 * THE SWAP POINT.
 * Both the simulated bus and the real socketCAN adapter implement this.
 */
export interface CanBusTransport {
  readonly name: string;
  start(onFrame: (frame: CanFrame) => void): void;
  stop(): void;
}
