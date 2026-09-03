/**
 * Store-and-forward recovery end-to-end test.
 *
 * Two peers through the real relay gateway:
 *   • AIRBORNE streams telemetry at 20 Hz, keeps every frame in a ring buffer,
 *     then deliberately suppresses a 15-frame window (simulated radio/SATCOM
 *     drop — frames never leave the aircraft).
 *   • GROUND uses the REAL OrderedReceiver (src/lib/datalink/orderReceiver.ts):
 *     detects the hole, sends a GAP_REQ, and must recover every suppressed
 *     frame in strict order from the airborne ring — zero duplicates applied,
 *     zero frames lost.
 *
 * Also asserts the relay's binary session recorder file grew during the run.
 *
 * Run (relay must be up: npm run relay):
 *   bun scripts/e2e_gap_recovery.ts
 */
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import {
  decodeGapReq,
  decodeTelemetryFrame,
  encodeGapReq,
  encodeTelemetryFrame,
  emergencyCodeOf,
  type TelemetrySnapshot,
} from "../src/lib/datalink/codec";
import { OrderedReceiver } from "../src/lib/datalink/orderReceiver";

const URL = process.env.RELAY_URL ?? "ws://localhost:3010";
const REC_DIR = path.join(import.meta.dirname, "..", "server", "recordings");

function toAB(d: unknown): ArrayBuffer {
  if (d instanceof ArrayBuffer) return d;
  if (ArrayBuffer.isView(d)) {
    const v = d as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  throw new Error("unexpected payload");
}

const SNAP: TelemetrySnapshot = {
  altitude: 18000,
  speed: 150,
  verticalSpeed: 0,
  pitch: 0,
  roll: 0,
  heading: 180,
  throttle: 70,
  rpm: 3400,
  map: 92,
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

// ============ AIRBORNE (stream + ring + GAP_REQ replay) ============
const air = new WebSocket(URL);
const ring: { seq: number; buf: ArrayBuffer }[] = [];
const RING_CAP = 1200;
let seq = 0;
let dropFrom = -1;
let dropCount = 0;
const dropWindow = { start: 30, len: 15 }; // suppress seqs [30, 45)
let airborneDone = false;

function txTick(): void {
  const inDrop = seq >= dropWindow.start && seq < dropWindow.start + dropWindow.len;
  const frame = encodeTelemetryFrame(SNAP, seq, Date.now());
  ring.push({ seq, buf: frame });
  if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
  if (inDrop) {
    if (dropFrom < 0) dropFrom = seq;
    dropCount++;
  } else if (air.readyState === WebSocket.OPEN) {
    air.send(Buffer.from(frame));
  }
  seq = (seq + 1) & 0xffff;
}

function replaySince(groundSeq: number): number {
  let n = 0;
  for (const f of ring) {
    if (n >= 900) break;
    const dist = (f.seq - groundSeq + 65536) % 65536;
    if (dist > 0 && dist < 60000 && air.readyState === WebSocket.OPEN) {
      air.send(Buffer.from(f.buf));
      n++;
    }
  }
  return n;
}

air.on("open", () => {
  air.send("aeris:" + JSON.stringify({ type: "hello", role: "airborne" }));
});
air.on("message", (data, isBinary) => {
  if (!isBinary) return;
  const gap = decodeGapReq(toAB(data));
  if (gap?.crcOk) replaySince(gap.groundSeq);
});

// ============ GROUND (real OrderedReceiver through the relay) ============
const ground = new WebSocket(URL);
let applied = 0;
let recovered = 0;
let duplicates = 0;
let heldPeak = 0;
let lastAppliedSeq = -1;
let orderOk = true;
let lastHeld = 0;

const receiver = new OrderedReceiver({
  onApply: (f, rec) => {
    applied++;
    if (rec) recovered++;
    if (lastAppliedSeq >= 0) {
      const d = (f.seq - lastAppliedSeq + 65536) % 65536;
      if (d !== 1) {
        orderOk = false;
        console.error(`  ✗ ORDER BREAK: applied ${f.seq} after ${lastAppliedSeq}`);
      }
    }
    lastAppliedSeq = f.seq;
  },
  onGap: (pending) => {
    const base = receiver.highestApplied;
    if (base >= 0 && ground.readyState === WebSocket.OPEN) {
      ground.send(Buffer.from(encodeGapReq(base, Date.now())));
    }
    void pending;
  },
});

ground.on("open", () => {
  ground.send("aeris:" + JSON.stringify({ type: "hello", role: "ground" }));
});
ground.on("message", (data, isBinary) => {
  if (!isBinary) return;
  const f = decodeTelemetryFrame(toAB(data));
  if (!f?.crcOk) return;
  const res = receiver.push(f);
  if (res === "duplicate") duplicates++;
  const st = receiver.state;
  heldPeak = Math.max(heldPeak, st.holdDepth);
  lastHeld = st.pending;
});

// ============ runner ============
function recorderBytes(): number {
  try {
    const files = fs.readdirSync(REC_DIR).filter((f) => f.startsWith("session-") && f.endsWith(".bin"));
    if (files.length === 0) return 0;
    let total = 0;
    for (const f of files) total += fs.statSync(path.join(REC_DIR, f)).size;
    return total;
  } catch {
    return 0;
  }
}

console.log("[gap-e2e] waiting for both peers on the relay…");
setTimeout(() => {
  const rec0 = recorderBytes();
  const tx = setInterval(txTick, 10); // ~20 Hz cadence, fast wall-clock
  let settled = false;
  const deadline = setTimeout(() => {
    if (settled) return;
    console.error("  ✗ TIMEOUT — recovery did not settle");
    finish(rec0);
  }, 15000);

  let finalTicks = 0;
  const watch = setInterval(() => {
    const st = receiver.state;
    if (!airborneDone && seq > dropWindow.start + dropWindow.len + 25) airborneDone = true;
    if (airborneDone && st.pending === 0 && st.holdDepth === 0 && applied >= 60) {
      settled = true;
      finalTicks = seq; // frozen once tx is cleared below
      clearInterval(watch);
      clearInterval(tx);
      clearTimeout(deadline);
      // let in-flight frames drain, then assert
      setTimeout(() => finish(rec0, finalTicks), 300);
    }
  }, 100);

  function finish(recBefore: number, totalTicks: number): void {
    const st = receiver.state;
    const recAfter = recorderBytes();
    console.log("\n========== STORE-AND-FORWARD RECOVERY RESULTS ==========");
    console.log(`  suppressed frames (simulated drop): ${dropCount}   [seqs ${dropFrom}..${dropFrom + dropCount - 1}]`);
    console.log(`  total ticks generated:             ${totalTicks} (${totalTicks - dropCount} live + ${dropCount} suppressed)`);
    console.log(`  applied in order:                  ${applied} (orderOk=${orderOk})`);
    console.log(`  recovered via GAP_REQ replay:      ${recovered}`);
    console.log(`  duplicates (dropped, not applied): ${duplicates}`);
    console.log(`  pending at end:                    ${st.pending}`);
    console.log(`  hold peak / final:                 ${heldPeak} / ${st.holdDepth}`);
    console.log(`  receiver holes/lost:               holes=${st.holes} lost=${st.lost}`);
    console.log(`  session recorder:                  ${recBefore} B → ${recAfter} B`);
    console.log("========================================================\n");

    const ok =
      orderOk &&
      recovered === dropCount &&
      st.lost === 0 &&
      st.pending === 0 &&
      applied === totalTicks && // every generated frame applied exactly once
      recAfter > recBefore;
    console.log(ok ? "✅ GAP RECOVERY E2E PASS" : "❌ GAP RECOVERY E2E FAIL");
    air.close();
    ground.close();
    process.exit(ok ? 0 : 1);
  }
}, 1200); // let both peers register before streaming starts
