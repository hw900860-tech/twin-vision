/**
 * AERIS-TWIN binary datalink codec.
 * Hand-rolled fixed-layout frames via DataView (zero deps, fully deterministic
 * decode). In production this slot would be a generated MAVLink 2 / Protobuf
 * schema; the interface below is what the rest of the app consumes.
 */
import {
  CMD_FRAME_BYTES,
  DL_CRC_BYTES,
  DL_MSG_GAP_REQ,
  DL_HEADER_BYTES,
  DL_MAGIC,
  DL_MSG_ACK,
  DL_MSG_CMD,
  DL_MSG_MISSION_RECORD,
  DL_MSG_REGION_ALERT,
  DL_MSG_TELEMETRY,
  DL_MSG_WEATHER_SYNC,
  DL_VERSION,
  EMERGENCY_CRASHED,
  GAP_REQ_FRAME_BYTES,
  EMERGENCY_FORCED_LANDING,
  EMERGENCY_NOMINAL,
  EMERGENCY_RECOVERY,
  PAYLOAD_FIELDS,
  REGION_ALERT_FRAME_BYTES,
  TELEMETRY_FRAME_BYTES,
  WEATHER_SYNC_FRAME_BYTES,
} from "./protocol";
import type { RegionEvent, RegionSeverity } from "@/features/flight-sim/regions";
import type { SortieRecord } from "./sortie";
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


/** Frame type at byte 3 — lets the relay / receivers route without a full decode. */
export function readFrameType(buf: ArrayBuffer | Uint8Array): number {
  const dv = buf instanceof Uint8Array ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength) : new DataView(buf);
  return dv.getUint8(3);
}

/** Sequence number at bytes 4-5. */
export function readFrameSeq(buf: ArrayBuffer | Uint8Array): number {
  const dv = buf instanceof Uint8Array ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength) : new DataView(buf);
  return dv.getUint16(4);
}

/** GAP_REQ (ground → airborne): "I have received through seq groundSeq". */
export function encodeGapReq(groundSeq: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(GAP_REQ_FRAME_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_GAP_REQ, 0, txMs);
  dv.setUint32(DL_HEADER_BYTES, groundSeq >>> 0, false);
  const bodyLen = GAP_REQ_FRAME_BYTES - DL_CRC_BYTES;
  dv.setUint16(bodyLen, crc16(new Uint8Array(buf, 0, bodyLen)));
  return buf;
}

export interface DecodedGapReq {
  groundSeq: number;
  txMs: number;
  crcOk: boolean;
}

export function decodeGapReq(buf: ArrayBuffer): DecodedGapReq | null {
  if (buf.byteLength < GAP_REQ_FRAME_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_GAP_REQ) return null;
  const bodyLen = GAP_REQ_FRAME_BYTES - DL_CRC_BYTES;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);
  return {
    groundSeq: dv.getUint32(DL_HEADER_BYTES, false) >>> 0,
    txMs: Math.round(dv.getFloat64(6, false) * 1000),
    crcOk,
  };
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

export interface RegionAlertWire {
  regionId: string;
  severity: RegionSeverity;
  event: RegionEvent;
  tempDeltaC: number;
  densityRatio: number;
  pressureDelta: number;
  turbulence: number;
}

export interface DecodedRegionAlert extends RegionAlertWire {
  seq: number;
  txMs: number;
  crcOk: boolean;
}

/** Tactical region alert: UAV crossed into/out of an atmospheric region. */
export function encodeRegionAlert(p: RegionAlertWire, seq: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(REGION_ALERT_FRAME_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_REGION_ALERT, seq, txMs);
  const o = DL_HEADER_BYTES;
  const id = (p.regionId || "").padEnd(8, " ").slice(0, 8);
  for (let i = 0; i < 8; i++) dv.setUint8(o + i, id.charCodeAt(i));
  dv.setUint8(o + 8, p.severity === "caution" ? 2 : p.severity === "critical" ? 3 : 1);
  dv.setUint8(o + 9, p.event === "EXIT" ? 2 : 1);
  dv.setFloat32(o + 10, p.tempDeltaC, false);
  dv.setFloat32(o + 14, p.densityRatio, false);
  dv.setFloat32(o + 18, p.pressureDelta, false);
  dv.setFloat32(o + 22, p.turbulence, false);
  const bodyLen = REGION_ALERT_FRAME_BYTES - DL_CRC_BYTES;
  dv.setUint16(bodyLen, crc16(new Uint8Array(buf, 0, bodyLen)));
  return buf;
}

export function decodeRegionAlert(buf: ArrayBuffer): DecodedRegionAlert | null {
  if (buf.byteLength < REGION_ALERT_FRAME_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_REGION_ALERT) return null;
  const bodyLen = REGION_ALERT_FRAME_BYTES - DL_CRC_BYTES;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);
  const o = DL_HEADER_BYTES;
  let id = "";
  for (let i = 0; i < 8; i++) {
    const c = dv.getUint8(o + i);
    if (c !== 32) id += String.fromCharCode(c);
  }
  const sev = dv.getUint8(o + 8);
  return {
    seq: dv.getUint16(4),
    txMs: Math.round(dv.getFloat64(6, false) * 1000),
    crcOk,
    regionId: id.trim(),
    severity: sev === 2 ? "caution" : sev === 3 ? "critical" : "info",
    event: dv.getUint8(o + 9) === 2 ? "EXIT" : "ENTER",
    tempDeltaC: dv.getFloat32(o + 10, false),
    densityRatio: dv.getFloat32(o + 14, false),
    pressureDelta: dv.getFloat32(o + 18, false),
    turbulence: dv.getFloat32(o + 22, false),
  };
}

/** Weather observation uplink: GCS → airborne, reshapes the region map. */
export interface WeatherSyncWire {
  valid: boolean;
  biome: "himalaya" | "thar" | "coastal";
  code: string;
  elevationFt: number;
  oatC: number;
  qnhHpa: number;
  windSpeedKts: number;
  windDirDeg: number;
  relativeHumidityPct: number;
}

export interface DecodedWeatherSync extends WeatherSyncWire {
  seq: number;
  txMs: number;
  crcOk: boolean;
}

export function encodeWeatherSync(p: WeatherSyncWire, seq: number, txMs: number): ArrayBuffer {
  const buf = new ArrayBuffer(WEATHER_SYNC_FRAME_BYTES);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_WEATHER_SYNC, seq, txMs);
  const o = DL_HEADER_BYTES;
  dv.setUint8(o, p.valid ? 1 : 0);
  dv.setUint8(o + 1, p.biome === "thar" ? 2 : p.biome === "coastal" ? 3 : 1);
  const code = (p.code || "    ").padEnd(4, " ").slice(0, 4);
  for (let i = 0; i < 4; i++) dv.setUint8(o + 2 + i, code.charCodeAt(i));
  dv.setFloat32(o + 6, p.elevationFt, false);
  dv.setFloat32(o + 10, p.oatC, false);
  dv.setFloat32(o + 14, p.qnhHpa, false);
  dv.setFloat32(o + 18, p.windSpeedKts, false);
  dv.setFloat32(o + 22, p.windDirDeg, false);
  dv.setFloat32(o + 26, p.relativeHumidityPct, false);
  const bodyLen = WEATHER_SYNC_FRAME_BYTES - DL_CRC_BYTES;
  dv.setUint16(bodyLen, crc16(new Uint8Array(buf, 0, bodyLen)));
  return buf;
}

export function decodeWeatherSync(buf: ArrayBuffer): DecodedWeatherSync | null {
  if (buf.byteLength < WEATHER_SYNC_FRAME_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_WEATHER_SYNC) return null;
  const bodyLen = WEATHER_SYNC_FRAME_BYTES - DL_CRC_BYTES;
  const crcOk = crc16(new Uint8Array(buf, 0, bodyLen)) === dv.getUint16(bodyLen);
  const o = DL_HEADER_BYTES;
  const b = dv.getUint8(o + 1);
  let code = "";
  for (let i = 0; i < 4; i++) {
    const c = dv.getUint8(o + 2 + i);
    if (c !== 32) code += String.fromCharCode(c);
  }
  return {
    seq: dv.getUint16(4),
    txMs: Math.round(dv.getFloat64(6, false) * 1000),
    crcOk,
    valid: dv.getUint8(o) === 1,
    biome: b === 2 ? "thar" : b === 3 ? "coastal" : "himalaya",
    code: code.trim(),
    elevationFt: dv.getFloat32(o + 6, false),
    oatC: dv.getFloat32(o + 10, false),
    qnhHpa: dv.getFloat32(o + 14, false),
    windSpeedKts: dv.getFloat32(o + 18, false),
    windDirDeg: dv.getFloat32(o + 22, false),
    relativeHumidityPct: dv.getFloat32(o + 26, false),
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


// ---------------------------------------------------------------------------
// MISSION_RECORD (0x08) — completed sortie, airborne → ground.
// Occasional event frame (once per sortie), so the payload is a length-prefixed
// UTF-8 JSON body — still binary-framed, sequenced and CRC-16 protected. The
// 20 Hz hot path stays fixed-layout; this is a debrief-grade event message.
//   [0..13] header | [14..15] u16 payload len | [16..16+L) JSON | crc16
// ---------------------------------------------------------------------------

export const MISSION_RECORD_MAX_PAYLOAD = 60000;

export function encodeMissionRecord(rec: SortieRecord, seq: number, txMs: number): ArrayBuffer {
  const json = JSON.stringify(rec);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MISSION_RECORD_MAX_PAYLOAD) {
    throw new Error(`sortie record too large: ${bytes.length} B`);
  }
  const total = DL_HEADER_BYTES + 2 + bytes.length + DL_CRC_BYTES;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  putHeader(dv, DL_MSG_MISSION_RECORD, seq, txMs);
  dv.setUint16(DL_HEADER_BYTES, bytes.length);
  new Uint8Array(buf, DL_HEADER_BYTES + 2, bytes.length).set(bytes);
  const crc = crc16(new Uint8Array(buf, 0, total - DL_CRC_BYTES));
  dv.setUint16(total - DL_CRC_BYTES, crc);
  return buf;
}

export interface DecodedMissionRecord {
  record: SortieRecord | null;
  seq: number;
  txMs: number;
  crcOk: boolean;
}

export function decodeMissionRecord(buf: ArrayBuffer | Uint8Array): DecodedMissionRecord | null {
  // Accept both browser ArrayBuffers and node/Bun Buffers (relay forwards raw).
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < DL_HEADER_BYTES + 4) return null;
  if (dv.getUint16(0) !== DL_MAGIC || dv.getUint8(2) !== DL_VERSION || dv.getUint8(3) !== DL_MSG_MISSION_RECORD) return null;
  const seq = dv.getUint16(4);
  const txMs = dv.getFloat64(6, false) * 1000;
  const len = dv.getUint16(DL_HEADER_BYTES);
  const bodyEnd = DL_HEADER_BYTES + 2 + len;
  if (u8.byteLength !== bodyEnd + DL_CRC_BYTES) return null;
  const crcOk = crc16(u8.subarray(0, bodyEnd)) === dv.getUint16(bodyEnd);
  if (!crcOk) return { record: null, seq, txMs, crcOk: false };
  try {
    const json = new TextDecoder().decode(u8.subarray(DL_HEADER_BYTES + 2, bodyEnd));
    const record = JSON.parse(json) as SortieRecord;
    return { record, seq, txMs, crcOk: true };
  } catch {
    return { record: null, seq, txMs, crcOk: false };
  }
}
