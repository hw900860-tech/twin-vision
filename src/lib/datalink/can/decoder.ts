/**
 * CAN decoder — the "mission computer" half of the pipeline. Raw frames from
 * the bus (simulated or real) are decoded back into physical engineering
 * units using the same signal table the ECU used to encode them. This exact
 * function is what consumes real socketCAN frames when the hardware is wired
 * in — it never changes.
 */

import { CAN_ID_DEF } from "./encoder";
import type { CanDecoded, CanFrame } from "./types";

const FAULT_BITS = ["c2Overheat", "turboFail", "bearingFail", "injectorClog", "misfire3"] as const;

function readSignal(view: DataView, sig: (typeof CAN_ID_DEF)[number]["signals"][number]): number {
  let raw: number;
  if (sig.bitLength === 32) {
    raw = sig.signed ? view.getInt32(sig.byteOffset, true) : view.getUint32(sig.byteOffset, true);
  } else if (sig.bitLength === 16) {
    raw = sig.signed ? view.getInt16(sig.byteOffset, true) : view.getUint16(sig.byteOffset, true);
  } else {
    raw = sig.signed ? view.getInt8(sig.byteOffset) : view.getUint8(sig.byteOffset);
  }
  return Math.max(sig.min, Math.min(sig.max, raw * sig.scale + sig.offset));
}

/** Decode one frame into its named physical signals. */
export function decodeCanFrame(frame: CanFrame): Record<string, number> {
  const def = CAN_ID_DEF[frame.id];
  if (!def) return {};
  const view = new DataView(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  const out: Record<string, number> = {};
  for (const sig of def.signals) out[sig.name] = readSignal(view, sig);
  return out;
}

/**
 * Decode a full telegram (all frames of one bus tick) into a merged
 * CanDecoded object. Missing frames simply leave their fields undefined —
 * the gateway keeps the previous tick's value, mirroring real lossy buses.
 */
export function decodeCanTelegram(frames: CanFrame[]): CanDecoded {
  const out: CanDecoded = {};

  for (const frame of frames) {
    const def = CAN_ID_DEF[frame.id];
    if (!def) continue;
    const signals = decodeCanFrame(frame);
    const S = signals as Record<string, number>;

    if (S["rpm"] !== undefined) out.rpm = S["rpm"];
    if (S["throttle"] !== undefined) out.throttle = S["throttle"];
    if (S["injectionTiming"] !== undefined) out.injectionTiming = S["injectionTiming"];
    if (S["cht0"] !== undefined || S["cht2"] !== undefined) {
      const prev = out.cht ?? [0, 0, 0, 0];
      out.cht = [S["cht0"] ?? prev[0], S["cht1"] ?? prev[1], S["cht2"] ?? prev[2], S["cht3"] ?? prev[3]];
    }
    if (S["egt0"] !== undefined || S["egt2"] !== undefined) {
      const prev = out.egt ?? [0, 0, 0, 0];
      out.egt = [S["egt0"] ?? prev[0], S["egt1"] ?? prev[1], S["egt2"] ?? prev[2], S["egt3"] ?? prev[3]];
    }
    if (S["map"] !== undefined) out.map = S["map"];
    if (S["oilPressure"] !== undefined) out.oilPressure = S["oilPressure"];
    if (S["oilTemp"] !== undefined) out.oilTemp = S["oilTemp"];
    if (S["vibrationRMS"] !== undefined) out.vibrationRMS = S["vibrationRMS"];
    if (S["healthIndex"] !== undefined) out.healthIndex = S["healthIndex"];
    if (S["anomalyScore"] !== undefined) out.anomalyScore = S["anomalyScore"];
    if (S["rul"] !== undefined) out.rul = S["rul"];
    if (S["ambientTemp"] !== undefined) out.ambientTemp = S["ambientTemp"];
    if (S["faultBitmap"] !== undefined) {
      const bits = Math.round(S["faultBitmap"]);
      out.faults = {
        c2Overheat: (bits & 1) !== 0,
        turboFail: (bits & 2) !== 0,
        bearingFail: (bits & 4) !== 0,
        injectorClog: (bits & 8) !== 0,
        misfire3: (bits & 16) !== 0,
      };
    }
    if (S["altitude"] !== undefined) out.altitude = S["altitude"];
    if (S["speed"] !== undefined) out.speed = S["speed"];
    if (S["heading"] !== undefined) out.heading = S["heading"];
    if (S["pitch"] !== undefined) out.pitch = S["pitch"];
    if (S["roll"] !== undefined) out.roll = S["roll"];
    if (S["verticalSpeed"] !== undefined) out.verticalSpeed = S["verticalSpeed"];
    if (S["lat"] !== undefined) out.lat = S["lat"];
    if (S["lon"] !== undefined) out.lon = S["lon"];
  }

  return out;
}

/** Human-readable summary of one frame for the bus-inspector UI. */
export function describeFrame(frame: CanFrame): string {
  const def = CAN_ID_DEF[frame.id];
  if (!def) return `0x${frame.id.toString(16).toUpperCase().padStart(3, "0")} (unknown)`;
  const signals = decodeCanFrame(frame);
    const S = signals as Record<string, number>;
  const headline = def.signals
    .filter((s) => signals[s.name] !== undefined)
    .map((s) => `${s.name} ${(signals[s.name] ?? 0).toFixed(s.scale < 0.01 ? 2 : s.scale < 0.1 ? 2 : 1)}${s.unit}`)
    .join(" · ");
  return `0x${frame.id.toString(16).toUpperCase().padStart(3, "0")} ${def.label} — ${headline}`;
}

export { FAULT_BITS };
