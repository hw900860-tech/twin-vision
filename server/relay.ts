/**
 * AERIS-TWIN ground-station gateway relay.
 *
 * The airborne browser session (/sim) and the ground consoles (/gcs) connect
 * here over WebSocket — this process plays the role of the GCS receive chain
 * between the datalink modem and the operator intranet. It forwards:
 *   airborne → ground : telemetry frames (binary, unacknowledged stream)
 *   ground → airborne : command frames (binary, acknowledged by the aircraft)
 * plus JSON control envelopes (role hello, ping/pong RTT, link-state).
 *
 * Run: npm run relay   (default port 3010, override with RELAY_PORT)
 */
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { DL_MAGIC, DL_MSG_TELEMETRY, DL_MSG_CMD, DL_MSG_ACK } from "../src/lib/datalink/protocol.ts";

const PORT = Number(process.env.RELAY_PORT ?? 3010);

const isAlive = new WeakMap<WebSocket, boolean>();
const roleOf = new WeakMap<WebSocket, "airborne" | "ground">();
const seqOf = new WeakMap<WebSocket, number>();

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

    if (senderRole === "airborne" && (msgType === DL_MSG_TELEMETRY || msgType === DL_MSG_ACK)) {
      seqOf.set(ws, buf.readUInt16BE(4));
      const frame = buf.subarray(0, Math.min(buf.length, 512));
      for (const c of wss.clients) {
        if (c !== ws && roleOf.get(c) === "ground" && c.readyState === WebSocket.OPEN) {
          c.send(frame);
          fwdCounter++;
        }
      }
    } else if (senderRole === "ground" && msgType === DL_MSG_CMD) {
      let airborne: WebSocket | null = null;
      for (const c of wss.clients) {
        if (c !== ws && roleOf.get(c) === "airborne" && c.readyState === WebSocket.OPEN) {
          airborne = c;
          break;
        }
      }
      if (airborne) {
        airborne.send(buf.subarray(0, Math.min(buf.length, 64)));
      } else {
        sendControl(ws, { type: "no-airborne", ts: Date.now() });
      }
    }
  });

  ws.on("close", () => broadcastLinkState());
});

let fwdCounter = 0;
let lastLogSeq = 0;
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
  void lastLogSeq;
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

server.listen(PORT, () => {
  console.log(`[relay] AERIS-TWIN datalink gateway listening on ws://localhost:${PORT}`);
});
