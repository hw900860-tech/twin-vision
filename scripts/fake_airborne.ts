/**
 * Headless airborne session for testing the relay + ground path without a
 * browser. Streams synthetic telemetry at 20 Hz and acknowledges commands.
 *   bun scripts/fake_airborne.ts
 */
import WebSocket from "ws";
import {
  encodeTelemetryFrame,
  decodeCmdFrame,
  encodeAckFrame,
  emergencyCodeOf,
  type TelemetrySnapshot,
} from "../src/lib/datalink/codec";
import { CMD_THROTTLE, CMD_ALTITUDE } from "../src/lib/datalink/protocol";

const URL = process.env.RELAY_URL ?? "ws://localhost:3010";
const ws = new WebSocket(URL);
ws.binaryType = "arraybuffer";

function toAB(d: unknown): ArrayBuffer {
  if (d instanceof ArrayBuffer) return d;
  if (ArrayBuffer.isView(d)) {
    const v = d as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  throw new Error("unexpected message payload");
}



let seq = 0;
let throttle = 65;
let altitude = 6000;
let rpm = 2400;
let connected = false;
let tx = 0;

function frame(): void {
  const snap: TelemetrySnapshot = {
    altitude,
    speed: 145,
    verticalSpeed: 0,
    pitch: 0,
    roll: 0,
    heading: 180,
    throttle,
    rpm,
    map: 90,
    cht: [140, 141, 139, 142],
    egt: [680, 682, 685, 681],
    oilTemp: 92,
    oilPressure: 5.3,
    vibrationRMS: 0.9,
    health: 96,
    anomalyScore: 4,
    ambientTemp: -5,
    rul: 470,
    lat: 28.6149,
    lon: 77.209,
    faults: { c2Overheat: false, turboFail: false, bearingFail: false, injectorClog: false },
    emergency: emergencyCodeOf("nominal"),
    missionActive: true,
  };
  const ab = encodeTelemetryFrame(snap, seq, Date.now());
  seq = (seq + 1) & 0xffff;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(Buffer.from(ab));
    tx++;
  }
}

ws.on("open", () => {
  console.log("[fake-airborne] connected, registering as AIRBORNE");
  ws.send("aeris:" + JSON.stringify({ type: "hello", role: "airborne" }));
  connected = true;
  setInterval(frame, 50);
  setInterval(() => {
    console.log(`[fake-airborne] tx=${tx} fps=${tx} throttle=${throttle} rpm=${rpm.toFixed(0)}`);
    tx = 0;
  }, 5000);
});

ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
  if (!isBinary) return;
  const ab = toAB(data);
  const cmd = decodeCmdFrame(ab);
  if (!cmd || !cmd.crcOk) return;
  if (cmd.cmdId === CMD_THROTTLE) throttle = cmd.value;
  if (cmd.cmdId === CMD_ALTITUDE) altitude = cmd.value;
  rpm = 2400 + throttle * 32;
  console.log(`[fake-airborne] applied cmd ${cmd.cmdId} value=${cmd.value} -> throttle=${throttle} rpm=${rpm.toFixed(0)}`);
  const ack = encodeAckFrame(cmd.seq, cmd.txMs, 0, Date.now());
  if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(ack));
});

setTimeout(() => {
  console.log("[fake-airborne] 60s timeout — exiting");
  process.exit(0);
}, 60000);
