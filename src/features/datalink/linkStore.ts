import { create } from "zustand";
import { DEFAULT_RELAY_URL } from "@/lib/datalink/protocol";
import type { LinkMode, LinkRole, WsStatus } from "@/lib/datalink/types";

export type CmdUiStatus = "idle" | "sent" | "retrying" | "acked" | "noack";

export interface LinkStatsState {
  /** Which end of the link this browser window represents. */
  role: LinkRole;
  /** Simulated datalink profile chosen on the AIRBORNE side. */
  mode: LinkMode;
  wsStatus: WsStatus;
  /** True when the gateway relay reports an airborne session connected. */
  airborneOnline: boolean;
  relayUrl: string;

  // transmit side (airborne)
  txFrames: number;
  txBytes: number;
  txDropped: number;
  txRateHz: number;
  txBps: number;
  /** Airborne store-and-forward ring depth (frames buffered for replay). */
  txBuffer: number;
  /** Frames replayed to the ground after a GAP_REQ. */
  replaysSent: number;

  // receive side (ground)
  rxFrames: number;
  rxBytes: number;
  rxBadCrc: number;
  rxGaps: number;
  rxRateHz: number;
  lastRxTxMs: number; // txMs of the most recently applied frame
  /** Outstanding missing sequence frames waiting on store-and-forward replay. */
  gapPending: number;
  /** Missing frames recovered via gap replay since link start. */
  gapRecovered: number;
  /** Missing frames abandoned as unrecoverable (ring under-run / request lost). */
  gapLost: number;
  /** GAP_REQ messages sent since link start. */
  gapRequests: number;

  // link quality
  latencyMs: number; // EMA one-way frame latency (ground, same-machine clock)
  rttMs: number; // gateway round-trip (ground ↔ relay)
  lossPct: number; // sequence-gap based loss estimate (ground)
  lastFrameAgeMs: number; // now - lastRxTxMs (ground)

  // command downlink (ground → airborne)
  cmdStatus: CmdUiStatus;
  cmdRttMs: number;
  cmdName: string;
  cmdAttempts: number;

  setRole: (r: LinkRole) => void;
  setMode: (m: LinkMode) => void;
  setWsStatus: (s: WsStatus) => void;
  setAirborneOnline: (v: boolean) => void;
  patch: (p: Partial<LinkStatsState>) => void;
  resetRx: () => void;
  resetTx: () => void;
}

export const useLinkStore = create<LinkStatsState>((set) => ({
  role: "offline",
  mode: "LOS",
  wsStatus: "offline",
  airborneOnline: false,
  relayUrl: (import.meta.env["VITE_RELAY_URL"] as string | undefined) || DEFAULT_RELAY_URL,

  txFrames: 0,
  txBytes: 0,
  txDropped: 0,
  txRateHz: 0,
  txBps: 0,
  txBuffer: 0,
  replaysSent: 0,

  rxFrames: 0,
  rxBytes: 0,
  rxBadCrc: 0,
  rxGaps: 0,
  rxRateHz: 0,
  lastRxTxMs: 0,
  gapPending: 0,
  gapRecovered: 0,
  gapLost: 0,
  gapRequests: 0,

  latencyMs: 0,
  rttMs: 0,
  lossPct: 0,
  lastFrameAgeMs: 0,

  cmdStatus: "idle",
  cmdRttMs: 0,
  cmdName: "",
  cmdAttempts: 0,

  setRole: (role) => set({ role }),
  setMode: (mode) => set({ mode }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setAirborneOnline: (airborneOnline) => set({ airborneOnline }),
  patch: (p) => set(p),
  resetRx: () =>
    set({
      rxFrames: 0,
      rxBytes: 0,
      rxBadCrc: 0,
      rxGaps: 0,
      rxRateHz: 0,
      latencyMs: 0,
      lossPct: 0,
      lastFrameAgeMs: 0,
      lastRxTxMs: 0,
      gapPending: 0,
      gapRecovered: 0,
      gapLost: 0,
      gapRequests: 0,
    }),
  resetTx: () =>
    set({
      txFrames: 0,
      txBytes: 0,
      txDropped: 0,
      txRateHz: 0,
      txBps: 0,
      txBuffer: 0,
      replaysSent: 0,
    }),
}));
