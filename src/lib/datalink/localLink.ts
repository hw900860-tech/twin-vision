/**
 * AERIS-TWIN local datalink transport.
 *
 * The WebSocket relay (server/relay.ts) is a long-lived Node process, so a
 * static host such as Vercel cannot run it — the live site's link can never
 * come up and the GCS shows LINK DOWN forever. This module adds a fallback
 * that needs no server at all: when the relay is unreachable, the sim tab and
 * the GCS tab talk directly to each other inside the same browser over a
 * BroadcastChannel, carrying the exact same binary frames, codec, ordering
 * and gap-recovery as the relay path.
 *
 * Two tabs are still required (one /sim, one /gcs), exactly as with the
 * relay. A relay server is still needed for two different devices.
 *
 * Transport selection is startup-only: try the relay first; if it has not
 * connected within FALLBACK_MS, switch to the local channel and stop
 * retrying the relay. Once a transport is chosen it stays for the session —
 * no mid-session switching, so sequence state never straddles transports.
 */

import { LinkSocket, type LinkCallbacks } from "./client";

/** The two roles that can hold a link socket. */
export type SocketRole = "airborne" | "ground";

export type LinkTransportKind = "relay" | "local";

/**
 * The socket interface airborne.ts / ground.ts program against. Both the
 * relay socket and the local socket (and the hybrid below) implement it.
 */
export interface LinkSocketLike {
  connect(): void;
  close(): void;
  sendBinary(buf: ArrayBuffer): boolean;
  sendControl(obj: Record<string, unknown>): boolean;
  readonly connected: boolean;
  readonly transport: LinkTransportKind;
}

/** How long to give the relay before falling back to the local channel. */
const FALLBACK_MS = 3000;

/** BroadcastChannel name for the local link (distinct from the sortie bridge). */
const LOCAL_LINK_CHANNEL = "aeris-twin-link";

/** Heartbeat interval; a peer is forgotten after PEER_TTL_MS of silence. */
const BEAT_MS = 1000;
const PEER_TTL_MS = 2500;

type Envelope =
  | { k: "hello" | "bye" | "beat"; role: SocketRole; peer: string }
  | { k: "ping" | "pong"; role: SocketRole; peer: string; ts: number }
  | { k: "bin"; role: SocketRole; peer: string; dir: "air" | "gnd"; buf: ArrayBuffer }
  | { k: "ctl"; role: SocketRole; peer: string; msg: Record<string, unknown> };

function isEnvelope(v: unknown): v is Envelope {
  if (typeof v !== "object" || v === null) return false;
  const k = (v as { k?: unknown }).k;
  return k === "hello" || k === "bye" || k === "beat" || k === "ping" || k === "pong" || k === "bin" || k === "ctl";
}

/**
 * A LinkSocketLike that routes frames over a BroadcastChannel instead of a
 * WebSocket. It mirrors the relay's observable behaviour for the two app
 * sides:
 *   - airborne frames (dir "air") are delivered only to ground sockets;
 *     ground frames (dir "gnd") only to airborne sockets.
 *   - peer presence is tracked by heartbeat and reported as the same
 *     `{type:"link", airborne, grounds}` control message the relay emits.
 *   - a ground send with no airborne peer fires `{type:"no-airborne"}`,
 *     exactly as the relay does.
 *   - ping is answered with a pong carrying the same timestamp.
 */
export class LocalLinkSocket implements LinkSocketLike {
  readonly transport: LinkTransportKind = "local";

  private readonly cb: LinkCallbacks;
  private readonly role: SocketRole;
  private readonly peerId: string;
  private ch: BroadcastChannel | null = null;
  private peers = new Map<string, { role: SocketRole; lastSeen: number }>();
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private lastAirborne = false;
  private lastGrounds = 0;

  constructor(cb: LinkCallbacks, role: SocketRole) {
    this.cb = cb;
    this.role = role;
    this.peerId = `${role}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  get connected(): boolean {
    return this.ch !== null && !this.closed;
  }

  connect(): void {
    if (this.closed || this.ch) return;
    if (typeof BroadcastChannel === "undefined") {
      // No local channel available (very old browser): report the link down
      // the same way a failed relay would.
      queueMicrotask(() => this.cb.onClose?.());
      return;
    }
    this.ch = new BroadcastChannel(LOCAL_LINK_CHANNEL);
    this.ch.addEventListener("message", this.onMessage);
    this.post({ k: "hello", role: this.role, peer: this.peerId });
    this.beatTimer = setInterval(() => {
      this.post({ k: "beat", role: this.role, peer: this.peerId });
    }, BEAT_MS);
    this.sweepTimer = setInterval(() => this.sweepPeers(), 500);
    // Match the relay socket's async open semantics.
    queueMicrotask(() => {
      if (!this.closed) this.cb.onOpen?.();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.beatTimer) clearInterval(this.beatTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.beatTimer = null;
    this.sweepTimer = null;
    try {
      this.post({ k: "bye", role: this.role, peer: this.peerId });
    } catch {
      /* channel already gone */
    }
    if (this.ch) {
      this.ch.removeEventListener("message", this.onMessage);
      this.ch.close();
      this.ch = null;
    }
    this.peers.clear();
    this.cb.onClose?.();
  }

  sendBinary(buf: ArrayBuffer): boolean {
    if (!this.connected || !this.ch) return false;
    if (this.role === "ground" && !this.hasAirbornePeer()) {
      // Mirror the relay: a ground send with no airborne connected.
      this.cb.onControl?.({ type: "no-airborne", ts: Date.now() });
      return false;
    }
    this.post({
      k: "bin",
      role: this.role,
      peer: this.peerId,
      dir: this.role === "airborne" ? "air" : "gnd",
      buf,
    });
    return true;
  }

  sendControl(obj: Record<string, unknown>): boolean {
    if (!this.connected || !this.ch) return false;
    if (obj["type"] === "hello") {
      // Role is already known from the constructor; re-announce presence.
      this.post({ k: "hello", role: this.role, peer: this.peerId });
      return true;
    }
    if (obj["type"] === "ping") {
      this.post({ k: "ping", role: this.role, peer: this.peerId, ts: typeof obj["ts"] === "number" ? obj["ts"] : Date.now() });
      return true;
    }
    this.post({ k: "ctl", role: this.role, peer: this.peerId, msg: obj });
    return true;
  }

  private post(env: Envelope): void {
    try {
      this.ch?.postMessage(env);
    } catch {
      /* channel closed mid-flight; the next send reports it */
    }
  }

  private hasAirbornePeer(): boolean {
    for (const p of this.peers.values()) if (p.role === "airborne") return true;
    return false;
  }

  private groundPeerCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.role === "ground") n++;
    return n;
  }

  /** Emit a relay-shaped link-state message when presence changes. */
  private emitLinkState(): void {
    const airborne = this.hasAirbornePeer();
    const grounds = this.groundPeerCount();
    if (airborne === this.lastAirborne && grounds === this.lastGrounds) return;
    this.lastAirborne = airborne;
    this.lastGrounds = grounds;
    this.cb.onControl?.({
      type: "link",
      ts: Date.now(),
      airborne,
      airborneSeq: 0,
      grounds,
      airframes: 0,
    });
  }

  private sweepPeers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > PEER_TTL_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitLinkState();
  }

  private onMessage = (ev: MessageEvent): void => {
    const env = ev.data as unknown;
    if (!isEnvelope(env)) return;
    if (env.peer === this.peerId) return; // BroadcastChannel never echoes, but be safe.
    if (env.k === "bye") {
      this.peers.delete(env.peer);
      this.emitLinkState();
      return;
    }
    // Any message proves the peer is alive. A hello from a peer we have not
    // seen yet gets a hello back: the first peer's hello is lost on a
    // joiner that was not listening yet, so without the reply discovery
    // would wait up to a full heartbeat. Replying only to *new* peers
    // keeps the exchange to one round trip instead of a hello storm.
    const isNewPeer = !this.peers.has(env.peer);
    this.peers.set(env.peer, { role: env.role, lastSeen: Date.now() });
    switch (env.k) {
      case "hello":
        if (isNewPeer) this.post({ k: "hello", role: this.role, peer: this.peerId });
        this.emitLinkState();
        break;
      case "beat":
        this.emitLinkState();
        break;
      case "bin": {
        const forGround = this.role === "ground" && env.dir === "air";
        const forAirborne = this.role === "airborne" && env.dir === "gnd";
        if (forGround || forAirborne) this.cb.onBinary?.(env.buf);
        this.emitLinkState();
        break;
      }
      case "ping":
        this.post({ k: "pong", role: this.role, peer: this.peerId, ts: env.ts });
        this.emitLinkState();
        break;
      case "pong":
        this.cb.onControl?.({ type: "pong", ts: env.ts });
        this.emitLinkState();
        break;
      case "ctl":
        this.cb.onControl?.(env.msg);
        this.emitLinkState();
        break;
    }
  };
}

/**
 * Relay-first, local-fallback socket. The app sees one LinkSocketLike; the
 * hybrid picks the transport once, at startup, and never switches after.
 */
export class HybridLinkSocket implements LinkSocketLike {
  private readonly url: string;
  private readonly cb: LinkCallbacks;
  private readonly role: SocketRole;
  private ws: LinkSocket | null = null;
  private local: LocalLinkSocket | null = null;
  private useLocal = false;
  private closed = false;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, cb: LinkCallbacks, role: SocketRole) {
    this.url = url;
    this.cb = cb;
    this.role = role;
  }

  get connected(): boolean {
    if (this.useLocal) return this.local?.connected ?? false;
    return this.ws?.connected ?? false;
  }

  get transport(): LinkTransportKind {
    return this.useLocal ? "local" : "relay";
  }

  connect(): void {
    if (this.closed) return;
    this.ws = new LinkSocket(this.url, {
      onOpen: () => {
        if (this.closed || this.useLocal) return; // stale: local already won
        this.clearFallbackTimer();
        this.cb.onOpen?.();
      },
      onClose: () => {
        if (this.closed || this.useLocal) return;
        this.cb.onClose?.();
      },
      onBinary: (buf) => {
        if (this.closed || this.useLocal) return;
        this.cb.onBinary?.(buf);
      },
      onControl: (msg) => {
        if (this.closed || this.useLocal) return;
        this.cb.onControl?.(msg);
      },
    });
    this.ws.connect();
    this.fallbackTimer = setTimeout(() => this.fallbackToLocal(), FALLBACK_MS);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearFallbackTimer();
    this.ws?.close();
    this.ws = null;
    this.local?.close();
    this.local = null;
  }

  sendBinary(buf: ArrayBuffer): boolean {
    if (this.closed) return false;
    if (this.useLocal) return this.local?.sendBinary(buf) ?? false;
    return this.ws?.sendBinary(buf) ?? false;
  }

  sendControl(obj: Record<string, unknown>): boolean {
    if (this.closed) return false;
    if (this.useLocal) return this.local?.sendControl(obj) ?? false;
    return this.ws?.sendControl(obj) ?? false;
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private fallbackToLocal(): void {
    if (this.closed || this.useLocal) return;
    if (this.ws?.connected) return; // relay won the race
    this.useLocal = true;
    // Stop the relay socket's reconnect loop before switching.
    this.ws?.close();
    this.ws = null;
    this.local = new LocalLinkSocket(this.cb, this.role);
    this.local.connect();
  }
}

/** Create the datalink socket for a side: relay first, local channel fallback. */
export function createLinkSocket(url: string, cb: LinkCallbacks, role: SocketRole): LinkSocketLike {
  return new HybridLinkSocket(url, cb, role);
}
