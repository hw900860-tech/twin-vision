/**
 * Ordered store-and-forward receiver (the ground link layer).
 *
 * Telemetry arrives over a lossy channel (radio outage, SATCOM drop, gateway
 * reconnect) with sequence numbers but no guaranteed delivery. This receiver
 * reassembles the stream in strict sequence order — exactly how a real
 * store-and-forward GCS data-link layer behaves:
 *
 *   • frames that arrive in order are delivered immediately (`onApply`);
 *   • a frame that jumps ahead reveals a hole → the hole's seqs are tracked as
 *     PENDING and the ground triggers `onGap` (send a GAP_REQ upstream so the
 *     airborne session bursts the buffered window back down);
 *   • out-of-order arrivals are HELD (not applied) so the display never moves
 *     backwards or skips — recovery fills the hole and the held tail drains in
 *     order;
 *   • if a hole can never be filled (outage longer than the airborne ring, or
 *     the request itself lost), `fastForward()` drops the hole, counts it LOST
 *     and resumes from the lowest held frame — the stream never freezes.
 *
 * Applied frames are guaranteed unique and strictly increasing in seq, so the
 * ground display and its history buffer need no deduplication or reordering
 * logic of their own.
 */
import type { DecodedTelemetry } from "./codec";

export interface OrderedReceiverCallbacks {
  /** A frame was applied in strict seq order. `recovered` = it filled a hole. */
  onApply: (f: DecodedTelemetry, recovered: boolean) => void;
  /** A new hole (missing seqs) was detected — the link layer should request replay. */
  onGap: (pending: number) => void;
}

export interface OrderedReceiverState {
  /** Seq of the next frame we need; all seqs below it (mod 2^16) are applied. */
  nextSeq: number;
  /** Frames held out-of-order waiting for their hole to close. */
  holdDepth: number;
  /** Missing seqs currently pending replay. */
  pending: number;
  /** Cumulative holes filled by store-and-forward recovery. */
  recovered: number;
  /** Cumulative hole seqs abandoned as unrecoverable. */
  lost: number;
  /** Cumulative hole seqs discovered (recovered + lost + outstanding). */
  holes: number;
}

const HOLD_MAX = 6000; // far beyond the airborne 1200-frame ring; safety valve
const MISSING_CAP = 4000;

export class OrderedReceiver {
  private nextSeq = -1;
  private hold = new Map<number, DecodedTelemetry>();
  private missing = new Set<number>();
  private holes = 0;
  private recovered = 0;
  private lost = 0;
  private cb: OrderedReceiverCallbacks;
  private lastProgress = Date.now();

  constructor(cb: OrderedReceiverCallbacks) {
    this.cb = cb;
  }

  get state(): OrderedReceiverState {
    return {
      nextSeq: this.nextSeq,
      holdDepth: this.hold.size,
      pending: this.missing.size,
      recovered: this.recovered,
      lost: this.lost,
      holes: this.holes,
    };
  }

  get started(): boolean {
    return this.nextSeq >= 0;
  }

  /** Age of the last in-order delivery (ms) — drives the stall detector. */
  get stallAgeMs(): number {
    return Date.now() - this.lastProgress;
  }

  get highestApplied(): number {
    return this.nextSeq < 0 ? -1 : (this.nextSeq - 1) & 0xffff;
  }

  /**
   * Feed one integrity-verified frame. Returns what happened so the caller can
   * update counters. Frame is never applied out of order.
   */
  push(f: DecodedTelemetry): "bad" | "applied" | "held" | "duplicate" {
    if (this.nextSeq < 0) {
      // First frame of the session: the stream starts wherever it is.
      this.nextSeq = f.seq;
      this.applyInOrder(f);
      return "applied";
    }
    const dist = (f.seq - this.nextSeq + 65536) % 65536;
    if (dist === 0) {
      this.applyInOrder(f);
      return "applied";
    }
    if (dist < 32768) {
      // Future frame → [nextSeq, f.seq) is a hole. Track the truly-absent seqs
      // (any already HELD inside the window arrived out of order — not missing).
      for (let s = this.nextSeq; s !== f.seq; s = (s + 1) & 0xffff) {
        if (this.hold.has(s) || this.missing.has(s)) continue;
        if (this.missing.size >= MISSING_CAP) {
          this.lost++;
        } else {
          this.missing.add(s);
        }
        this.holes++;
      }
      this.hold.set(f.seq, f);
      this.trimHold();
      if (this.missing.size > 0) this.cb.onGap(this.missing.size);
      return "held";
    }
    return "duplicate"; // already applied (mod-wrapped or replayed)
  }

  /** Drop an unfillable hole and resume the stream from the lowest held frame. */
  fastForward(): number {
    if (this.missing.size === 0 || this.hold.size === 0) {
      if (this.missing.size > 0) {
        const n = this.missing.size;
        this.missing.clear();
        this.lost += n;
        return n;
      }
      return 0;
    }
    // lowest held frame strictly ahead of nextSeq
    let best: DecodedTelemetry | null = null;
    let bestDist = Infinity;
    for (const f of this.hold.values()) {
      const d = (f.seq - this.nextSeq + 65536) % 65536;
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    const n = this.missing.size;
    this.missing.clear();
    this.lost += n;
    if (best) {
      this.nextSeq = best.seq;
      this.drainHeld();
    }
    return n;
  }

  private applyInOrder(f: DecodedTelemetry): void {
    const recovered = this.missing.delete(f.seq);
    if (recovered) this.recovered++;
    this.nextSeq = (this.nextSeq + 1) & 0xffff;
    this.lastProgress = Date.now();
    this.cb.onApply(f, recovered);
    this.drainHeld();
  }

  /** Apply any held frames that became contiguous as the base advanced. */
  private drainHeld(): void {
    for (;;) {
      if (this.missing.has(this.nextSeq)) break; // hole still open
      const held = this.hold.get(this.nextSeq);
      if (!held) break;
      this.hold.delete(this.nextSeq);
      this.applyInOrder(held);
    }
  }

  private trimHold(): void {
    if (this.hold.size <= HOLD_MAX) return;
    // Drop the oldest held frame (largest backward distance from nextSeq).
    let victim: number | null = null;
    let worst = -1;
    for (const [seq] of this.hold) {
      const d = (seq - this.nextSeq + 65536) % 65536;
      if (d > worst) {
        worst = d;
        victim = seq;
      }
    }
    if (victim !== null) this.hold.delete(victim);
  }
}
