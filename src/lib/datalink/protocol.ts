/**
 * AERIS-TWIN Datalink protocol (v1)
 * ---------------------------------
 * Compact binary frames exchanged between the AIRBORNE UAV session (/sim) and
 * the GROUND control session (/gcs) through the ground-station gateway relay.
 *
 * Why binary and not CSV/JSON on the hot path:
 *  - a fixed layout frame decodes deterministically (<1 ms) with zero text parsing;
 *  - ~120-160 B/frame at 20 Hz ≈ 20-30 kbps, well inside even a narrow SATCOM
 *    channel; CSV text for the same data is ~40-60 kbps of parser work;
 *  - CRC-16 lets the receiver prove integrity per frame.
 *
 * CSV never crosses this link — it is a debrief report the GROUND station
 * generates from the recorded binary stream after flight.
 */

export const DL_MAGIC = 0x415a; // "AZ"
export const DL_VERSION = 1;

export const DL_MSG_TELEMETRY = 0x01; // airborne → ground, unacknowledged stream
export const DL_MSG_CMD = 0x02; // ground → airborne, acknowledged control
export const DL_MSG_ACK = 0x03; // airborne → ground, command acknowledgement
export const DL_MSG_HEARTBEAT = 0x04; // keep-alive / rtt probe (json envelope)
export const DL_MSG_GAP_REQ = 0x05; // ground → airborne: "I have through seq X — replay what you buffered after it" (store-and-forward)

export const DL_HEADER_BYTES = 14; // magic2 + ver1 + type1 + seq2 + txSec8 (f64 epoch seconds)

// Command identifiers (0x02 payload: u8 cmdId + f32 value)
export const CMD_THROTTLE = 1; // value = throttle % (0-100)
export const CMD_FAULT = 2; // value = fault index 0..3 (see FAULT_INDEX)
export const CMD_ALTITUDE = 3; // value = target altitude ft
export const CMD_HEADING = 4; // value = target heading deg
export const CMD_RUDDER = 5; // value = rudder -1..1

export const FAULT_INDEX: Record<string, number> = {
  c2Overheat: 0,
  turboFail: 1,
  bearingFail: 2,
  injectorClog: 3,
};

export const FAULT_KEYS: ["c2Overheat", "turboFail", "bearingFail", "injectorClog"] = [
  "c2Overheat",
  "turboFail",
  "bearingFail",
  "injectorClog",
];

// Emergency state codes transmitted in flag byte 1
export const EMERGENCY_NOMINAL = 0;
export const EMERGENCY_FORCED_LANDING = 1;
export const EMERGENCY_CRASHED = 2;
export const EMERGENCY_RECOVERY = 3;

// Payload field order for telemetry frames (24 × f32 = 96 bytes)
export const PAYLOAD_FIELDS = [
  "altitude", // ft
  "speed", // knots
  "verticalSpeed", // fpm-ish (pitch*1000)
  "pitch", // deg
  "roll", // deg
  "heading", // deg
  "throttle", // %
  "rpm",
  "map", // kPa
  "cht1",
  "cht2",
  "cht3",
  "cht4",
  "egt1",
  "egt2",
  "egt3",
  "egt4",
  "oilTemp",
  "oilPressure",
  "vibrationRMS",
  "health", // 0-100
  "anomalyScore", // 0-100
  "ambientTemp", // °C
  "rul", // hours remaining
  "lat",
  "lon",
] as const;

export const DL_FLAGS_BYTES = 2; // fault bitmap (1) + emergency/state (1)
export const DL_CRC_BYTES = 2;

export const TELEMETRY_FRAME_BYTES =
  DL_HEADER_BYTES + PAYLOAD_FIELDS.length * 4 + DL_FLAGS_BYTES + DL_CRC_BYTES; // 112 B

export const CMD_FRAME_BYTES = DL_HEADER_BYTES + 5 + DL_CRC_BYTES; // 17 B

export const GAP_REQ_FRAME_BYTES = DL_HEADER_BYTES + 4 + DL_CRC_BYTES; // 20 B (payload: u32 groundSeq)

export const DEFAULT_RELAY_URL = "ws://localhost:3010";

// JSON control envelopes (heartbeat / link-state) are text frames prefixed with this tag.
export const CTRL = "aeris:";
