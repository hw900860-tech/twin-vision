/**
 * AERIS-TWIN ground-station gateway relay.
 *
 * The airborne browser session (/sim) and the ground consoles (/gcs) connect
 * here over WebSocket — this process plays the role of the GCS receive chain
 * between the datalink modem and the operator intranet. It forwards:
 *   airborne → ground : telemetry frames (binary, unacknowledged stream)
 *                       and command ACKs
 *   ground → airborne : command frames (binary, acknowledged by the aircraft)
 *                       and GAP_REQ store-and-forward requests (replay trigger)
 * plus JSON control envelopes (role hello, ping/pong RTT, link-state).
 *
 * SESSION RECORDER: every binary frame that passes through the gateway is
 * appended to a timestamped capture file in server/recordings (one per relay
 * run, u16-length-prefixed records + direction byte). This is the ground
 * station's raw binary flight record — the same stream the post-flight CSV
 * debrief is generated from. Disable with RELAY_RECORD=0.
 *
 * Run: npm run relay   (default port 3010, override with RELAY_PORT)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { DL_MAGIC, DL_MSG_TELEMETRY, DL_MSG_CMD, DL_MSG_ACK, DL_MSG_GAP_REQ } from "../src/lib/datalink/protocol.ts";

const PORT = Number(process.env.RELAY_PORT ?? 3010);
const RECORDING = process.env.RELAY_RECORD !== "0";

const isAlive = new WeakMap<WebSocket, boolean>();
const roleOf = new WeakMap<WebSocket, "airborne" | "ground">();
const seqOf = new WeakMap<WebSocket, number>();

// ---- binary session recorder (raw flight record) ----
const DIR_AIR2GROUND = 1;
const DIR_GROUND2AIR = 2;

class SessionRecorder {
  private stream: fs.WriteStream | null = null;
  private frames = 0;
  private bytes = 0;

  constructor() {
    if (!RECORDING) return;
    const dir = process.env.RELAY_RECORD_DIR ?? path.join(import.meta.dirname, "recordings");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.file = path.join(dir, `session-${stamp}.bin`);
    this.stream = fs.createWriteStream(this.file, { flags: "a" });
    this.stream.write(Buffer.from("AERIS-DATALINK-SESSION v1\n"));
    console.log(`[relay] session recorder → ${this.file}`);
  }

  record(dir: number, buf: Buffer): void {
    if (!this.stream) return;
    const hdr = Buffer.allocUnsafe(3);
    hdr.writeUInt16BE(buf.length + 1, 0);
    hdr.writeUInt8(dir, 2);
    this.stream.write(hdr);
    this.stream.write(buf);
    this.frames++;
    this.bytes += 3 + buf.length;
  }

  close(): void {
    if (!this.stream) return;
    console.log(`[relay] session closed: ${this.frames} frames, ${(this.bytes / 1024).toFixed(1)} KiB → ${this.file}`);
    this.stream.end();
    this.stream = null;
  }
}
const recorder = new SessionRecorder();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ service: "aeris-twin-datalink-relay", ok: true, port: PORT }));
});

const wss = new WebSocketServer({ server });

function sendControl(ws: WebSocket, obj: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send("aeris:" + JSON.stringify(obj));
}

function broadcastLinkState(): void {
  let airborne: WebSocket | null = null;
  for (const ws of wss.clients) {
    if (roleOf.get(ws) === "airborne") {
      airborne = ws;
      break;
    }
  }
  const state = {
    type: "link",
    ts: Date.now(),
    airborne: airborne !== null,
    airborneSeq: airborne ? seqOf.get(airborne) ?? 0 : 0,
    grounds: [...wss.clients].filter((c) => roleOf.get(c) === "ground").length,
    airframes: 0,
  };
  for (const ws of wss.clients) {
    if (roleOf.get(ws) === "ground") sendControl(ws, state);
  }
}

function findPeer(role: "airborne" | "ground", self: WebSocket): WebSocket | null {
  for (const c of wss.clients) {
    if (c !== self && roleOf.get(c) === role && c.readyState === WebSocket.OPEN) return c;
  }
  return null;
}

wss.on("connection", (ws) => {
  isAlive.set(ws, true);
  ws.on("pong", () => isAlive.set(ws, true));

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      const raw = data.toString();
      if (!raw.startsWith("aeris:")) return;
      try {
        const msg = JSON.parse(raw.slice(6)) as { type?: string; role?: string; ts?: number };
        if (msg.type === "hello" && (msg.role === "airborne" || msg.role === "ground")) {
          roleOf.set(ws, msg.role);
          sendControl(ws, { type: "hello-ok", role: msg.role, ts: Date.now() });
          broadcastLinkState();
        } else if (msg.type === "ping") {
          sendControl(ws, { type: "pong", ts: msg.ts ?? Date.now() });
        }
      } catch {
        /* ignore malformed control envelope */
      }
      return;
    }

    const buf = data as unknown as Buffer;
    if (buf.length < 4) return;
    if (buf.readUInt16BE(0) !== DL_MAGIC) return;
    const msgType = buf.readUInt8(3);
    const senderRole = roleOf.get(ws);
    if (!senderRole) return; // unregistered client

    const isFromAirborne = senderRole === "airborne";
    recorder.record(isFromAirborne ? DIR_AIR2GROUND : DIR_GROUND2AIR, buf);

    if (isFromAirborne) {
      // Telemetry stream → every ground console; command ACKs → their sender.
      if (msgType === DL_MSG_TELEMETRY || msgType === DL_MSG_ACK) {
        seqOf.set(ws, buf.readUInt16BE(4));
        const frame = buf.subarray(0, Math.min(buf.length, 512));
        for (const c of wss.clients) {
          if (c !== ws && roleOf.get(c) === "ground" && c.readyState === WebSocket.OPEN) {
            c.send(frame);
            fwdCounter++;
          }
        }
      }
      return;
    }

    // Ground → airborne: commands (acknowledged) and GAP_REQ replay requests.
    if (msgType === DL_MSG_CMD || msgType === DL_MSG_GAP_REQ) {
      const airborne = findPeer("airborne", ws);
      if (airborne) {
        airborne.send(buf.subarray(0, Math.min(buf.length, msgType === DL_MSG_CMD ? 64 : 32)));
      } else {
        sendControl(ws, { type: "no-airborne", ts: Date.now() });
      }
    }
  });

  ws.on("close", () => broadcastLinkState());
});

let fwdCounter = 0;
let lastLogTime = Date.now();
function logActivity(): void {
  const now = Date.now();
  if (now - lastLogTime < 5000) return;
  lastLogTime = now;
  let airSeq = 0;
  for (const ws of wss.clients) {
    if (roleOf.get(ws) === "airborne") {
      airSeq = seqOf.get(ws) ?? 0;
      break;
    }
  }
  console.log(
    `[relay] grounds=${[...wss.clients].filter((c) => roleOf.get(c) === "ground").length} airSeq=${airSeq} forwarded5s=${fwdCounter}`
  );
  fwdCounter = 0;
}
// Link-state heartbeat to ground consoles
const linkTimer = setInterval(() => {
  broadcastLinkState();
  logActivity();
}, 1000);
linkTimer.unref?.();

// Dead-socket reaper (native protocol-level ping/pong)
const aliveTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (isAlive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    isAlive.set(ws, false);
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, 10000);
aliveTimer.unref?.();

function shutdown(): void {
  recorder.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => {
  console.log(`[relay] AERIS-TWIN datalink gateway listening on ws://localhost:${PORT}`);
});
