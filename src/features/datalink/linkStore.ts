import { create } from "zustand";
import { DEFAULT_RELAY_URL } from "@/lib/datalink/protocol";
import type { LinkMode, LinkRole, WsStatus } from "@/lib/datalink/types";
import type { DecodedRegionAlert } from "@/lib/datalink/codec";
import { regionById, type RegionSeverity } from "@/features/flight-sim/regions";
import type { RegionExcursion } from "./regionExcursions";
import type { SortieRecord } from "@/lib/datalink/sortie";

export interface GroundAlert {
  id: string;
  regionId: string;
  name: string;
  severity: RegionSeverity;
  event: "ENTER" | "EXIT";
  text: string;
  params: { tempDeltaC: number; densityRatio: number; pressureDelta: number; turbulence: number };
  at: number;
}

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

  // tactical region alerts received over the link (airborne → ground)
  alerts: GroundAlert[];
  /** Finalized region excursions: enter/exit events + engine-response series. */
  excursions: RegionExcursion[];
  /** Completed sorties received from the aircraft (mission recorder). */
  sorties: SortieRecord[];

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
  pushAlert: (a: DecodedRegionAlert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  pushExcursion: (e: RegionExcursion) => void;
  clearExcursions: () => void;
  pushSortie: (r: SortieRecord) => void;
  clearSorties: () => void;
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
  alerts: [],
  excursions: [],
  sorties: [],

  setRole: (role) => set({ role }),
  setMode: (mode) => set({ mode }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setAirborneOnline: (airborneOnline) => set({ airborneOnline }),
  patch: (p) => set(p),
  pushAlert: (a) =>
    set((s) => {
      const reg = regionById(a.regionId);
      const ga: GroundAlert = {
        id: `${a.regionId}-${a.txMs}`,
        regionId: a.regionId,
        name: reg?.name ?? a.regionId,
        severity: a.severity,
        event: a.event,
        text:
          a.event === "EXIT"
            ? `UAV LEFT ${reg?.name ?? a.regionId} — CONDITIONS NORMALIZING`
            : (reg?.advisory ?? `UAV ENTERED REGION ${a.regionId}`),
        params: {
          tempDeltaC: a.tempDeltaC,
          densityRatio: a.densityRatio,
          pressureDelta: a.pressureDelta,
          turbulence: a.turbulence,
        },
        at: Date.now(),
      };
      return { alerts: [ga, ...s.alerts].slice(0, 12) };
    }),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),
  pushExcursion: (e) => set((s) => ({ excursions: [e, ...s.excursions].slice(0, 10) })),
  clearExcursions: () => set({ excursions: [] }),
  pushSortie: (r) => set((s) => ({ sorties: [r, ...s.sorties].slice(0, 8) })),
  clearSorties: () => set({ sorties: [] }),
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
