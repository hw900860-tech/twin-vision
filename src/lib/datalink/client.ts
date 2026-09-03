import { CTRL } from "./protocol";

export interface LinkCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onBinary?: (buf: ArrayBuffer) => void;
  onControl?: (msg: Record<string, unknown>) => void;
}

/**
 * Minimal resilient WebSocket client for the ground-station gateway.
 * Binary frames carry the fixed-layout protocol messages; text frames carry
 * JSON control envelopes (role hello, ping/pong, relay link-state).
 */
export class LinkSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private cb: LinkCallbacks;
  private manualClose = false;
  private reconnectDelay = 400;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, cb: LinkCallbacks) {
    this.url = url;
    this.cb = cb;
  }

  connect(): void {
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        this.reconnectDelay = 400;
        this.cb.onOpen?.();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          if (ev.data.startsWith(CTRL)) {
            try {
              this.cb.onControl?.(JSON.parse(ev.data.slice(CTRL.length)) as Record<string, unknown>);
            } catch {
              /* malformed control envelope — ignore */
            }
          }
          return;
        }
        if (ev.data instanceof ArrayBuffer) {
          this.cb.onBinary?.(ev.data);
        } else if (typeof Blob !== "undefined" && ev.data instanceof Blob) {
          void ev.data.arrayBuffer().then((b) => this.cb.onBinary?.(b));
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.cb.onClose?.();
        if (!this.manualClose) this.scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) this.open();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(4000, this.reconnectDelay * 1.6);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendBinary(buf: ArrayBuffer): boolean {
    if (!this.connected) return false;
    this.ws?.send(buf);
    return true;
  }

  sendControl(obj: Record<string, unknown>): boolean {
    if (!this.connected) return false;
    this.ws?.send(CTRL + JSON.stringify(obj));
    return true;
  }

  close(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
  }
}
