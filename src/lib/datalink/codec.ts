/**
 * AERIS-TWIN binary datalink codec.
 * Hand-rolled fixed-layout frames via DataView (zero deps, fully deterministic
 * decode). In production this slot would be a generated MAVLink 2 / Protobuf
 * schema; the interface below is what the rest of the app consumes.
 */
import {
  CMD_FRAME_BYTES,
  DL_CRC_BYTES,
  DL_HEADER_BYTES,
  DL_MAGIC,
  DL_MSG_ACK,
  DL_MSG_CMD,
  DL_MSG_TELEMETRY,
  DL_VERSION,
  EMERGENCY_CRASHED,
  EMERGENCY_FORCED_LANDING,
  EMERGENCY_NOMINAL,
  EMERGENCY_RECOVERY,
  PAYLOAD_FIELDS,
  TELEMETRY_FRAME_BYTES,
} from "./protocol";
import type { EmergencyCode } from "./types";

export interface TelemetrySnapshot {
  altitude: number;
  speed: number;
  verticalSpeed: number;
  pitch: number;
  roll: number;
  heading: number;
  throttle: number;
  rpm: number;
  map: number;
  cht: [number, number, number, number];
  egt: [number, number, number, number];
  oilTemp: number;
  oilPressure: number;
  vibrationRMS: number;
  health: number; // 0-100
  anomalyScore: number; // 0-100
  ambientTemp: number;
  rul: number; // flight hours remaining
  lat: number;
  lon: number;
  faults: { c2Overheat: boolean; turboFail: boolean; bearingFail: boolean; injectorClog: boolean };
  emergency: EmergencyCode;
  missionActive: boolean;
}

export interface DecodedTelemetry extends TelemetrySnapshot {
  seq: number;
  txMs: number;
  crcOk: boolean;
}

const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xa001 ^ (c >> 1) : c >> 1;
    t[n] = c;
  }
  return t;
})();

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >> 8) ^ CRC_TABLE[(crc ^ bytes[i]!)! & 0xff]!;
  }
  return crc ^ 0xffff;
}

function putHeader(dv: DataView, type: number, seq: number, txMs: number): void {
  dv.setUint16(0, DL_MAGIC);
  dv.setUint8(2, DL_VERSION);
  dv.setUint8(3, type);
  dv.setUint16(4, seq & 0xffff);
  dv.setFloat64(6, txMs / 1000, false); // epoch seconds f64 — no 32-bit wraparound
}

/** Reads one snapshot field by its payload key — keeps encode/decode in lockstep. */
function snapshotValue(snap: TelemetrySnapshot, field: string): number {
  switch (field) {
    case "cht1": return snap.cht[0] ?? 0;
    case "cht2": return snap.cht[1] ?? 0;
    case "cht3": return snap.cht[2] ?? 0;
    case "cht4": return snap.cht[3] ?? 0;
    case "egt1": return snap.egt[0] ?? 0;
    case "egt2": return snap.egt[1] ?? 0;
    case "egt3": return snap.egt[2] ?? 0;
    case "egt4": return snap.egt[3] ?? 0;
    default:
      return (snap as unknown as Record<string, number>)[field] ?? 0;
  }
}

export function encodeTelemetryFrame(snap: TelemetrySnapshot, seq: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(TELEMETRY_FRAME_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_TELEMETRY, seq, txMs);
  let o = DL_HEADER_BYTES;
  for (let i = 0; i < PAYLOAD_FIELDS.length; i++) {
    dv.setFloat32(o + i * 4, snapshotValue(snap, PAYLOAD_FIELDS[i]!), false);
  }
  const flagsOff = o + PAYLOAD_FIELDS.length * 4;
  let f0 = 0;
  if (snap.faults.c2Overheat) f0 |= 1;
  if (snap.faults.turboFail) f0 |= 2;
  if (snap.faults.bearingFail) f0 |= 4;
  if (snap.faults.injectorClog) f0 |= 8;
  if (snap.missionActive) f0 |= 16;
  dv.setUint8(flagsOff, f0);
  dv.setUint8(flagsOff + 1, snap.emergency);
  const bodyLen = TELEMETRY_FRAME_BYTES - DL_CRC_BYTES;
  dv.setUint16(bodyLen, crc16(new Uint8Array(buf, 0, bodyLen)));
  return buf;
}

export function decodeTelemetryFrame(buf: ArrayBuffer): DecodedTelemetry | null {
  if (buf.byteLength < TELEMETRY_FRAME_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC) return null;
  if (dv.getUint8(2) !== DL_VERSION) return null;
  if (dv.getUint8(3) !== DL_MSG_TELEMETRY) return null;
  const bodyLen = TELEMETRY_FRAME_BYTES - DL_CRC_BYTES;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);

  const o = DL_HEADER_BYTES;
  const raw = new Map<string, number>();
  for (let i = 0; i < PAYLOAD_FIELDS.length; i++) raw.set(PAYLOAD_FIELDS[i]!, dv.getFloat32(o + i * 4, false));
  const g = (k: string): number => raw.get(k) ?? 0;
  const f0 = dv.getUint8(o + PAYLOAD_FIELDS.length * 4);
  const f1 = dv.getUint8(o + PAYLOAD_FIELDS.length * 4 + 1);
  const toEmergency = (v: number): EmergencyCode =>
    v === EMERGENCY_FORCED_LANDING || v === EMERGENCY_CRASHED || v === EMERGENCY_RECOVERY
      ? (v as EmergencyCode)
      : EMERGENCY_NOMINAL;
  return {
    seq: dv.getUint16(4),
    txMs: Math.round(dv.getFloat64(6, false) * 1000),
    crcOk,
    altitude: g("altitude"),
    speed: g("speed"),
    verticalSpeed: g("verticalSpeed"),
    pitch: g("pitch"),
    roll: g("roll"),
    heading: g("heading"),
    throttle: g("throttle"),
    rpm: g("rpm"),
    map: g("map"),
    cht: [g("cht1"), g("cht2"), g("cht3"), g("cht4")] as [number, number, number, number],
    egt: [g("egt1"), g("egt2"), g("egt3"), g("egt4")] as [number, number, number, number],
    oilTemp: g("oilTemp"),
    oilPressure: g("oilPressure"),
    vibrationRMS: g("vibrationRMS"),
    health: g("health"),
    anomalyScore: g("anomalyScore"),
    ambientTemp: g("ambientTemp"),
    rul: g("rul"),
    lat: g("lat"),
    lon: g("lon"),
    faults: {
      c2Overheat: (f0 & 1) !== 0,
      turboFail: (f0 & 2) !== 0,
      bearingFail: (f0 & 4) !== 0,
      injectorClog: (f0 & 8) !== 0,
    },
    emergency: toEmergency(f1),
    missionActive: (f0 & 16) !== 0,
  };
}

export function encodeCmdFrame(cmdId: number, value: number, seq: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(CMD_FRAME_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_CMD, seq, txMs);
  dv.setUint8(DL_HEADER_BYTES, cmdId);
  dv.setFloat32(DL_HEADER_BYTES + 1, value, false);
  const bodyLen = CMD_FRAME_BYTES - DL_CRC_BYTES;
  dv.setUint16(bodyLen, crc16(new Uint8Array(buf, 0, bodyLen)));
  return buf;
}

export interface DecodedCmd {
  cmdId: number;
  value: number;
  seq: number;
  txMs: number;
  crcOk: boolean;
}

export function decodeCmdFrame(buf: ArrayBuffer): DecodedCmd | null {
  if (buf.byteLength < CMD_FRAME_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_CMD) return null;
  const bodyLen = CMD_FRAME_BYTES - DL_CRC_BYTES;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);
  return {
    cmdId: dv.getUint8(DL_HEADER_BYTES),
    value: dv.getFloat32(DL_HEADER_BYTES + 1, false),
    seq: dv.getUint16(4),
    txMs: Math.round(dv.getFloat64(6, false) * 1000),
    crcOk,
  };
}

/** ACK echoes the originating command seq + txMs so the ground side can measure command RTT. */
export function encodeAckFrame(cmdSeq: number, origTxMs: number, status: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(DL_HEADER_BYTES + 1 + DL_CRC_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_ACK, cmdSeq, origTxMs);
  dv.setUint8(DL_HEADER_BYTES, status);
  dv.setUint16(DL_HEADER_BYTES + 1, crc16(new Uint8Array(buf, 0, DL_HEADER_BYTES + 1)));
  return buf;
}

export interface DecodedAck {
  cmdSeq: number;
  origTxMs: number;
  status: number;
  crcOk: boolean;
}

export function decodeAckFrame(buf: ArrayBuffer): DecodedAck | null {
  if (buf.byteLength < DL_HEADER_BYTES + 1 + DL_CRC_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_ACK) return null;
  const bodyLen = DL_HEADER_BYTES + 1;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);
  return {
    cmdSeq: dv.getUint16(4),
    origTxMs: Math.round(dv.getFloat64(6, false) * 1000),
    status: dv.getUint8(DL_HEADER_BYTES),
    crcOk,
  };
}

/** Map a flightStore emergency state string to its numeric frame code. */
export function emergencyCodeOf(emergency: string): EmergencyCode {
  switch (emergency) {
    case "forcedLanding":
      return EMERGENCY_FORCED_LANDING;
    case "crashed":
      return EMERGENCY_CRASHED;
    case "recovery":
      return EMERGENCY_RECOVERY;
    default:
      return EMERGENCY_NOMINAL;
  }
}

/** Map a numeric frame code back to the flightStore emergency state string. */
export function emergencyNameOf(code: EmergencyCode): "nominal" | "forcedLanding" | "crashed" | "recovery" {
  switch (code) {
    case EMERGENCY_FORCED_LANDING:
      return "forcedLanding";
    case EMERGENCY_CRASHED:
      return "crashed";
    case EMERGENCY_RECOVERY:
      return "recovery";
    default:
      return "nominal";
  }
}
