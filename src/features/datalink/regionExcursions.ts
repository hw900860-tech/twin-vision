/**
 * Region-excursion recorder (GROUND side).
 *
 * The GCS receives two streams over the datalink: 20 Hz binary telemetry and
 * REGION_ALERT enter/exit frames when the UAV crosses an atmospheric region.
 * This pure accumulator correlates them — every telemetry frame received while
 * an excursion is OPEN is captured as an engine-response sample, and when the
 * aircraft leaves (or jumps straight into another region) the excursion is
 * finalized with its stats + a decimated chart series. No new wire protocol:
 * the ground rebuilds the region history entirely from what crossed the link.
 */
import type { DecodedTelemetry } from "@/lib/datalink/codec";
import type { RegionSeverity } from "@/features/flight-sim/regions";

export interface RegionSample {
  /** Seconds since region entry (from frame tx timestamps). */
  t: number;
  map: number; // kPa
  egt: number; // °C
  chtMax: number; // °C (hottest cylinder)
  vib: number; // m/s²
  rpm: number;
  throttle: number; // %
}

export interface RegionExcursionStats {
  durationS: number;
  mapMin: number;
  mapMax: number;
  mapMean: number;
  egtMax: number;
  egtMean: number;
  chtMax: number;
  vibMax: number;
  throttleMean: number;
}

export interface RegionExcursion {
  id: string;
  regionId: string;
  name: string;
  severity: RegionSeverity;
  /** Wall-clock ms of the airborne ENTER frame tx timestamp. */
  enteredAt: number;
  exitedAt: number;
  samples: RegionSample[];
  stats: RegionExcursionStats;
}

const MAX_RAW_SAMPLES = 200; // ~10 s @ 20 Hz before rolling
const CHART_POINTS = 72; // decimated series for the panel chart

/** Evenly pick `n` points from a series (first + last always kept). */
export function decimate<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]!);
  return out;
}

export class RegionExcursionRecorder {
  private open: {
    regionId: string;
    name: string;
    severity: RegionSeverity;
    enteredAt: number;
    samples: RegionSample[];
  } | null = null;

  get active(): { regionId: string; name: string; enteredAt: number } | null {
    return this.open
      ? { regionId: this.open.regionId, name: this.open.name, enteredAt: this.open.enteredAt }
      : null;
  }

  /** Feed every in-order telemetry frame received over the link. */
  pushTelemetry(f: DecodedTelemetry): void {
    if (!this.open) return;
    this.open.samples.push({
      t: Math.max(0, (f.txMs - this.open.enteredAt) / 1000),
      map: f.map,
      egt: f.egt[0] ?? 0,
      chtMax: Math.max(...f.cht),
      vib: f.vibrationRMS,
      rpm: f.rpm,
      throttle: f.throttle,
    });
    if (this.open.samples.length > MAX_RAW_SAMPLES) {
      this.open.samples.splice(0, this.open.samples.length - MAX_RAW_SAMPLES);
    }
  }

  /**
   * Enter a region. If another excursion is still open (EXIT lost over the
   * link, or the UAV jumped straight into the next region) the previous one is
   * finalized and returned — the caller pushes it to the store.
   */
  onEnter(regionId: string, name: string, severity: RegionSeverity, at: number): RegionExcursion | null {
    const finalized = this.open ? this.finalize(at) : null;
    this.open = { regionId, name, severity, enteredAt: at, samples: [] };
    return finalized;
  }

  /** Leave the current region; returns the finalized excursion, if any. */
  onExit(regionId: string, at: number): RegionExcursion | null {
    if (!this.open || this.open.regionId !== regionId) return null;
    return this.finalize(at);
  }

  private finalize(exitedAt: number): RegionExcursion {
    const o = this.open!;
    this.open = null;
    const samples = decimate(o.samples, CHART_POINTS);
    const durationS = Math.max(0, (exitedAt - o.enteredAt) / 1000);
    const maps = o.samples.map((s) => s.map);
    const egts = o.samples.map((s) => s.egt);
    const stats: RegionExcursionStats = {
      durationS,
      mapMin: maps.length ? Math.min(...maps) : 0,
      mapMax: maps.length ? Math.max(...maps) : 0,
      mapMean: maps.length ? maps.reduce((a, b) => a + b, 0) / maps.length : 0,
      egtMax: egts.length ? Math.max(...egts) : 0,
      egtMean: egts.length ? egts.reduce((a, b) => a + b, 0) / egts.length : 0,
      chtMax: o.samples.reduce((m, s) => Math.max(m, s.chtMax), 0),
      vibMax: o.samples.reduce((m, s) => Math.max(m, s.vib), 0),
      throttleMean: o.samples.length
        ? o.samples.reduce((a, b) => a + b.throttle, 0) / o.samples.length
        : 0,
    };
    return {
      id: `${o.regionId}-${o.enteredAt}`,
      regionId: o.regionId,
      name: o.name,
      severity: o.severity,
      enteredAt: o.enteredAt,
      exitedAt,
      samples,
      stats,
    };
  }
}
