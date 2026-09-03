/**
 * AERIS-TWIN MAYDAY alarm core.
 *
 * (A1) `evaluateMayday` is a pure, deterministic gate over the live telemetry
 *      stream. It trips only on genuine propulsion emergencies:
 *        - composite health index < 30% (the directive threshold)
 *        - an operator-injected fault flag is engaged
 *        - a red physical threshold is breached (the same CRITICAL set the
 *          engine alert engine already reports)
 *      Thermal redlines are environment-normalized (see EngineAlerts), so a
 *      hot climate can never trigger MAYDAY by itself.
 *
 * (A2) `maydayAudio` is a module singleton that synthesizes an urgent,
 *      wailing two-oscillator siren with the browser Web Audio API — no audio
 *      assets shipped. Browsers require a user gesture before audio can play,
 *      so `unlock()` must be called from a pointer/keydown handler; until the
 *      context is unlocked the visual alarm keeps working and `sound()` is a
 *      safe no-op.
 */

import { generateAlerts } from "@/features/digital-twin/EngineAlerts";
import type { FaultFlags } from "@/features/flight-sim/flightStore";

export interface MaydaySample {
  /** Composite health index, 0..1 */
  health: number;
  cht: number[];
  egt: number;
  map: number;
  oilPressure: number;
  oilTemp: number;
  vibrationRMS: number;
  rpm: number;
  faults: FaultFlags;
  /** OAT − ISA at flight altitude, °C — pass 0 when no live weather is bound */
  envDeltaC?: number;
}

export interface MaydayCause {
  id: string;
  label: string;
  detail: string;
}

/** Pure gate: returns the MAYDAY cause set, or [] when nominal. */
export function evaluateMayday(sample: MaydaySample): MaydayCause[] {
  const causes: MaydayCause[] = [];

  const healthPct = sample.health * 100;

  // Red physical thresholds (CRITICAL set from the shared engine alert logic)
  const redAlerts = generateAlerts({
    cht: sample.cht,
    egt: sample.egt,
    map: sample.map,
    oilPressure: sample.oilPressure,
    oilTemp: sample.oilTemp,
    vibrationRMS: sample.vibrationRMS,
    rpm: sample.rpm,
    health: sample.health,
    ...(sample.envDeltaC !== undefined && sample.envDeltaC !== 0 ? { envDeltaC: sample.envDeltaC } : {}),
  }).filter((a) => a.severity === "CRITICAL");

  for (const alert of redAlerts) {
    if (!causes.some((c) => c.id === alert.id)) {
      causes.push({ id: alert.id, label: alert.title, detail: alert.evidence ?? alert.message });
    }
  }

  // Directive threshold — global health collapse
  if (healthPct < 30) {
    causes.push({
      id: "health-under-30",
      label: `COMPOSITE HEALTH ${healthPct.toFixed(0)}%`,
      detail: "Global engine health index below 30% — predictive mission abort required.",
    });
  }

  // Active fault status flags (operator-injected or mission scenario faults)
  const FLAG_CAUSES: Record<keyof FaultFlags, { label: string; detail: string }> = {
    c2Overheat: { label: "CYL 2 OVERHEAT FAULT ACTIVE", detail: "Cylinder-2 thermal runaway flag latched — CHT climbing past head redline." },
    turboFail: { label: "TURBOCHARGER FAILURE ACTIVE", detail: "Turbo/wastegate fault latched — boost compensation lost at altitude." },
    bearingFail: { label: "BEARING SPALL FAULT ACTIVE", detail: "Drivetrain bearing fault latched — BPFO vibration signature present." },
    injectorClog: { label: "INJECTOR CLOG FAULT ACTIVE", detail: "Fuel-injector restriction latched — EGT runner imbalance present." },
  };

  (Object.entries(sample.faults ?? {}) as [keyof FaultFlags, boolean][]).forEach(([key, engaged]) => {
    if (engaged) {
      const meta = FLAG_CAUSES[key];
      if (meta && !causes.some((c) => c.id === `fault-${key}`)) {
        causes.push({ id: `fault-${key}`, label: meta.label, detail: meta.detail });
      }
    }
  });

  return causes;
}

/* ------------------------------------------------------------------ */
/* Web Audio siren                                                     */
/* ------------------------------------------------------------------ */

interface SirenNodes {
  ctx: AudioContext;
  master: GainNode;
  oscLow: OscillatorNode;
  oscHigh: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
}

export class MaydayAudio {
  private ctx: AudioContext | null = null;
  private nodes: SirenNodes | null = null;
  private enabled = true;
  private sounding = false;

  /** Enable/disable alarm audio entirely (operator preference). */
  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.silence();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture;
   * idempotent and safe to call repeatedly. Resolves once audio is runnable.
   */
  async unlock(): Promise<void> {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* keep visual alarm working; audio stays muted */
      }
    }
  }

  private buildNodes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const master = ctx.createGain();
    master.gain.value = 0;

    // Band-pass keeps the siren piercing without harsh digital clipping.
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 1.1;

    // Wailing frequency sweep: 660 Hz ↔ 1 060 Hz at ~0.9 Hz
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;

    const oscLow = ctx.createOscillator();
    oscLow.type = "sawtooth";
    oscLow.frequency.value = 860;
    const oscHigh = ctx.createOscillator();
    oscHigh.type = "square";
    oscHigh.frequency.value = 1720;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.28;

    lfo.connect(lfoGain);
    lfoGain.connect(oscLow.frequency);
    lfoGain.connect(oscHigh.frequency);

    oscLow.connect(filter);
    oscHigh.connect(highGain);
    highGain.connect(filter);
    filter.connect(master);
    master.connect(ctx.destination);

    oscLow.start();
    oscHigh.start();
    lfo.start();
    this.nodes = { ctx, master, oscLow, oscHigh, lfo, lfoGain, filter };
  }

  /** Start the siren (no-op until unlocked and enabled). */
  sound(): void {
    if (!this.enabled || this.sounding) return;
    if (!this.ctx) return;
    if (this.ctx.state !== "running") return;

    if (!this.nodes) this.buildNodes();
    if (!this.nodes) return;

    const { ctx, master } = this.nodes;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
    this.sounding = true;
  }

  /** Fade the siren out and mark it stopped. */
  silence(): void {
    if (!this.sounding) return;
    const nodes = this.nodes;
    if (nodes) {
      const now = nodes.ctx.currentTime;
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setValueAtTime(nodes.master.gain.value, now);
      nodes.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    }
    this.sounding = false;
  }

  /** Full teardown (used on page unload / unmount of the alarm host). */
  dispose(): void {
    this.silence();
    if (this.nodes) {
      try {
        this.nodes.oscLow.stop();
        this.nodes.oscHigh.stop();
        this.nodes.lfo.stop();
        void this.nodes.ctx.close();
      } catch {
        /* already closed */
      }
      this.nodes = null;
      this.ctx = null;
    }
  }
}

/** Single shared alarm channel for the whole GCS session. */
export const maydayAudio = new MaydayAudio();
