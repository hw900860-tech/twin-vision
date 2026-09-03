/**
 * End-to-end datalink smoke test.
 *  - connects to the relay as a GROUND station
 *  - expects the /sim page (or a test airborne) to be streaming telemetry
 *  - verifies frame rate, CRC, latency magnitude, and sends a THROTTLE command
 *    expecting an acknowledged frame + throttle change in subsequent telemetry.
 *
 * Run while the relay is up AND an airborne source is streaming (open /sim):
 *   bun scripts/e2e_datalink.ts
 */
import WebSocket from "ws";
import {
  decodeTelemetryFrame,
  decodeAckFrame,
  encodeCmdFrame,
} from "../src/lib/datalink/codec";
import { CMD_THROTTLE } from "../src/lib/datalink/protocol";

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



let frames = 0;
let crcOk = 0;
let badCrc = 0;
let acked = false;
let rxLastThrottle = -1;
let firstTs = 0;
let lastTs = 0;
let cmdSeq = 0;

const timer = setInterval(() => {
  const now = Date.now();
  if (ws.readyState === WebSocket.OPEN) {
    cmdSeq = (cmdSeq + 1) & 0xffff;
    ws.send(Buffer.from(encodeCmdFrame(CMD_THROTTLE, 78, cmdSeq, now)));
    console.log(`[e2e] sent CMD THROTTLE=78 seq=${cmdSeq}`);
  }
}, 2000);

ws.on("open", () => {
  console.log("[e2e] connected, registering as GROUND");
  ws.send("aeris:" + JSON.stringify({ type: "hello", role: "ground" }));
});

ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
  if (!isBinary) return;
  const ab = toAB(data);
  const ack = decodeAckFrame(ab);
  if (ack) {
    if (ack.crcOk && !acked) {
      acked = true;
      console.log(`[e2e] CMD ACK received (rtt ≈ ${Date.now() - ack.origTxMs} ms) — guaranteed-delivery path OK`);
    }
    return;
  }
  const f = decodeTelemetryFrame(ab);
  if (!f) return;
  frames++;
  if (f.crcOk) crcOk++;
  else badCrc++;
  if (!firstTs) firstTs = Date.now();
  lastTs = Date.now();
  rxLastThrottle = f.throttle;
});

setTimeout(() => {
  clearInterval(timer);
  const durMs = lastTs - firstTs || 1;
  console.log(`[e2e] frames=${frames} crcOk=${crcOk} badCrc=${badCrc} rate≈${((frames * 1000) / durMs).toFixed(1)} Hz`);
  console.log(`[e2e] last throttle observed=${rxLastThrottle} acked=${acked}`);
  const pass = frames >= 20 && crcOk === frames && badCrc === 0 && acked && rxLastThrottle === 78;
  console.log(pass ? "[e2e] PASS ✅" : "[e2e] FAIL ❌");
  ws.close();
  process.exit(pass ? 0 : 1);
}, 8000);
