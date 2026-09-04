/**
 * CAN encoder — packs live engine/aircraft state into CANaerospace-style
 * frames. This is the "ECU transmit" half of the pipeline: every value leaves
 * as a scaled integer in an 8-byte payload, exactly as a real engine ECU
 * (Rotax 914 ECU / AE-P4 FADEC) would publish it.
 *
 * ID MAP (11-bit standard):
 *   0x0C0 ENGINE 1   rpm (0.25 rpm/LSB) · throttle (0.5 %/LSB) · injection timing (0.1°/LSB)
 *   0x0C1 CHT 1-2    0.1 °C/LSB        0x0C2 CHT 3-4
 *   0x0C3 EGT 1-2    0.1 °C/LSB        0x0C4 EGT 3-4
 *   0x0C5 MAP + OIL PRESS   0.1 kPa/LSB · 0.01 bar/LSB
 *   0x0C6 OIL TEMP + VIB    0.1 °C/LSB · 0.001 m/s²/LSB
 *   0x0C7 HEALTH      healthIndex (1 %/LSB) · anomalyScore (1 %/LSB) · RUL (0.1 h/LSB)
 *   0x0C8 AMBIENT     ambientTemp (0.1 °C/LSB, signed)
 *   0x0C9 FAULTS      fault bitmap bit0..4
 *   0x0D0 FLIGHT      altitude (1 ft/LSB) · speed (0.5 kt/LSB) · heading (0.1°/LSB)
 *   0x0D1 ATTITUDE    pitch (0.01°/LSB) · roll (0.01°/LSB) · verticalSpeed (1 ft/min/LSB)
 *   0x0D2 POSITION    lat/lon (1e-7 °/LSB, GPS-style, signed 32-bit)
 */

import type { CanEngineSource, CanFrame, CanFrameDef } from "./types";

/** Frame definitions shared by encoder and decoder. */
export const CAN_FRAME_DEFS: CanFrameDef[] = [
  {
    id: 0x0c0,
    label: "ENGINE 1",
    signals: [
      { name: "rpm", byteOffset: 0, bitLength: 16, signed: false, scale: 0.25, offset: 0, unit: "rpm", min: 0, max: 8000 },
      { name: "throttle", byteOffset: 2, bitLength: 8, signed: false, scale: 0.5, offset: 0, unit: "%", min: 0, max: 100 },
      { name: "injectionTiming", byteOffset: 3, bitLength: 16, signed: false, scale: 0.1, offset: -10, unit: "°BTDC", min: -10, max: 60 },
    ],
  },
  {
    id: 0x0c1,
    label: "CHT 1-2",
    signals: [
      { name: "cht0", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: -40, max: 300 },
      { name: "cht1", byteOffset: 2, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: -40, max: 300 },
    ],
  },
  {
    id: 0x0c2,
    label: "CHT 3-4",
    signals: [
      { name: "cht2", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: -40, max: 300 },
      { name: "cht3", byteOffset: 2, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: -40, max: 300 },
    ],
  },
  {
    id: 0x0c3,
    label: "EGT 1-2",
    signals: [
      { name: "egt0", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: 0, max: 1000 },
      { name: "egt1", byteOffset: 2, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: 0, max: 1000 },
    ],
  },
  {
    id: 0x0c4,
    label: "EGT 3-4",
    signals: [
      { name: "egt2", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: 0, max: 1000 },
      { name: "egt3", byteOffset: 2, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: 0, max: 1000 },
    ],
  },
  {
    id: 0x0c5,
    label: "MAP + OIL PRESS",
    signals: [
      { name: "map", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "kPa", min: 0, max: 120 },
      { name: "oilPressure", byteOffset: 2, bitLength: 16, signed: false, scale: 0.01, offset: 0, unit: "bar", min: 0, max: 10 },
    ],
  },
  {
    id: 0x0c6,
    label: "OIL TEMP + VIB",
    signals: [
      { name: "oilTemp", byteOffset: 0, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°C", min: -40, max: 200 },
      { name: "vibrationRMS", byteOffset: 2, bitLength: 16, signed: false, scale: 0.001, offset: 0, unit: "m/s²", min: 0, max: 30 },
    ],
  },
  {
    id: 0x0c7,
    label: "HEALTH",
    signals: [
      { name: "healthIndex", byteOffset: 0, bitLength: 8, signed: false, scale: 1, offset: 0, unit: "%", min: 0, max: 100 },
      { name: "anomalyScore", byteOffset: 1, bitLength: 8, signed: false, scale: 1, offset: 0, unit: "%", min: 0, max: 100 },
      { name: "rul", byteOffset: 2, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "h", min: 0, max: 6000 },
    ],
  },
  {
    id: 0x0c8,
    label: "AMBIENT",
    signals: [
      { name: "ambientTemp", byteOffset: 0, bitLength: 16, signed: true, scale: 0.1, offset: 0, unit: "°C", min: -70, max: 60 },
    ],
  },
  {
    id: 0x0c9,
    label: "FAULTS",
    signals: [
      { name: "faultBitmap", byteOffset: 0, bitLength: 8, signed: false, scale: 1, offset: 0, unit: "bitmap", min: 0, max: 31 },
    ],
  },
  {
    id: 0x0d0,
    label: "FLIGHT",
    signals: [
      { name: "altitude", byteOffset: 0, bitLength: 16, signed: false, scale: 1, offset: 0, unit: "ft", min: 0, max: 65000 },
      { name: "speed", byteOffset: 2, bitLength: 16, signed: false, scale: 0.5, offset: 0, unit: "kt", min: 0, max: 500 },
      { name: "heading", byteOffset: 4, bitLength: 16, signed: false, scale: 0.1, offset: 0, unit: "°", min: 0, max: 360 },
    ],
  },
  {
    id: 0x0d1,
    label: "ATTITUDE",
    signals: [
      { name: "pitch", byteOffset: 0, bitLength: 16, signed: true, scale: 0.01, offset: 0, unit: "°", min: -90, max: 90 },
      { name: "roll", byteOffset: 2, bitLength: 16, signed: true, scale: 0.01, offset: 0, unit: "°", min: -180, max: 180 },
      { name: "verticalSpeed", byteOffset: 4, bitLength: 16, signed: true, scale: 1, offset: 0, unit: "ft/min", min: -20000, max: 20000 },
    ],
  },
  {
    id: 0x0d2,
    label: "POSITION",
    signals: [
      { name: "lat", byteOffset: 0, bitLength: 32, signed: true, scale: 1e-7, offset: 0, unit: "°", min: -90, max: 90 },
      { name: "lon", byteOffset: 4, bitLength: 32, signed: true, scale: 1e-7, offset: 0, unit: "°", min: -180, max: 180 },
    ],
  },
];

export const CAN_ID_DEF: Record<number, CanFrameDef> = Object.fromEntries(
  CAN_FRAME_DEFS.map((d) => [d.id, d]),
);

/** Clamp + round to the signal's raw integer grid (ECU-style quantization). */
function quantize(value: number, def: CanFrameDef["signals"][number]): number {
  const raw = Math.round((value - def.offset) / def.scale);
  if (def.signed) {
    const half = def.bitLength === 32 ? 0x80000000 : def.bitLength === 16 ? 0x8000 : 0x80;
    return Math.max(-half, Math.min(half - 1, raw));
  }
  const maxRaw = def.bitLength === 32 ? 0xffffffff : def.bitLength === 16 ? 0xffff : 0xff;
  return Math.max(0, Math.min(maxRaw, raw));
}

function setSignal(view: DataView, sig: CanFrameDef["signals"][number], raw: number): void {
  if (sig.bitLength === 32) {
    if (sig.signed) view.setInt32(sig.byteOffset, raw, true);
    else view.setUint32(sig.byteOffset, raw, true);
  } else if (sig.bitLength === 16) {
    if (sig.signed) view.setInt16(sig.byteOffset, raw, true);
    else view.setUint16(sig.byteOffset, raw, true);
  } else if (sig.signed) {
    view.setInt8(sig.byteOffset, raw);
  } else {
    view.setUint8(sig.byteOffset, raw);
  }
}

const FAULT_BITS: (keyof CanEngineSource["faults"])[] = [
  "c2Overheat",
  "turboFail",
  "bearingFail",
  "injectorClog",
  "misfire3",
];

/** Pack one engine/aircraft snapshot into the full 12-frame CAN telegram. */
export function encodeEngineToCan(src: CanEngineSource, ts: number): CanFrame[] {
  const frames: CanFrame[] = [];

  for (const def of CAN_FRAME_DEFS) {
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);

    for (const sig of def.signals) {
      let value: number;
      switch (sig.name) {
        case "rpm": value = src.rpm; break;
        case "throttle": value = src.throttle; break;
        case "injectionTiming": value = src.injectionTiming; break;
        case "cht0": value = src.cht[0]; break;
        case "cht1": value = src.cht[1]; break;
        case "cht2": value = src.cht[2]; break;
        case "cht3": value = src.cht[3]; break;
        case "egt0": value = src.egt[0]; break;
        case "egt1": value = src.egt[1]; break;
        case "egt2": value = src.egt[2]; break;
        case "egt3": value = src.egt[3]; break;
        case "map": value = src.map; break;
        case "oilPressure": value = src.oilPressure; break;
        case "oilTemp": value = src.oilTemp; break;
        case "vibrationRMS": value = src.vibrationRMS; break;
        case "healthIndex": value = src.healthIndex; break;
        case "anomalyScore": value = src.anomalyScore; break;
        case "rul": value = src.rul; break;
        case "ambientTemp": value = src.ambientTemp; break;
        case "faultBitmap":
          value = FAULT_BITS.reduce((acc, key, i) => acc + (src.faults[key] ? 1 << i : 0), 0);
          break;
        case "altitude": value = src.altitude; break;
        case "speed": value = src.speed; break;
        case "heading": value = src.heading; break;
        case "pitch": value = src.pitch; break;
        case "roll": value = src.roll; break;
        case "verticalSpeed": value = src.verticalSpeed; break;
        case "lat": value = src.lat; break;
        case "lon": value = src.lon; break;
        default: continue;
      }
      setSignal(view, sig, quantize(value, sig));
    }

    frames.push({ id: def.id, data, ts });
  }

  return frames;
}
