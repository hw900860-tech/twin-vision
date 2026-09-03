/* ------------------------------------------------------------------ */
/* Flight-sim-only audio for AERIS-TWIN.                               */
/*                                                                    */
/* Exactly four sound states, all driven by existing sim state, no    */
/* extra buttons or standalone page:                                  */
/*   FLYING     — continuous engine/airflow voice following live RPM, */
/*                airspeed and a strain goal (smoothed, never stepped)*/
/*   STRESS     — on HIGH ALT/HIGH TEMP, a gritty low band swells as   */
/*                the engine labours (RPM already sags in the store)   */
/*   FAILURE    — the moment health collapses (forcedLanding entry),   */
/*                a one-shot mechanical failure: deep strain groan →   */
/*                metallic vibration → pneumatic release → rapid RPM   */
/*                drop → rupture, then the engine cuts and only        */
/*                airflow/wind ambience remains during the descent.    */
/*   CRASH      — realistic impact + structure settling + shutdown.    */
/*                                                                    */
/* The engine voice parks itself muted when goals reach zero, so a    */
/* simulator restart simply re-follows the telemetry and the engine   */
/* audibly spools back up. Audio starts suspended (browser policy)    */
/* and unlocks on the first user gesture on the sim page.             */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let amb: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.55; // subtle — ambience for a demonstration, not a cinema
    master.connect(comp);
    amb = ctx.createGain();
    amb.gain.value = 1;
    amb.connect(master);
  }
  return ctx;
}

function noiseSrc(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.995 + w * 0.02;
      d[i] = w * 0.7 + last * 6;
    }
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** One-shot filtered-noise burst (crash impact / debris / rattle). */
function hit(dur: number, gain: number, from: number, to: number, delay: number): void {
  const c = ensureCtx();
  if (!c || !master || c.state === "suspended") return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const seg = c.createBufferSource();
  seg.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(Math.max(20, from), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
  seg.connect(f);
  f.connect(g);
  g.connect(master);
  seg.start(t0);
  seg.stop(t0 + dur + 0.05);
  seg.onended = () => {
    seg.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/** Generic tonal element with a frequency fall — mechanical whine, groan, thud. */
function tone(
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  gain: number,
  delay = 0,
): void {
  const c = ensureCtx();
  if (!c || !master || c.state === "suspended") return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, from), t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/** Filtered-noise one-shot with a frequency sweep — hiss, rupture, rattle, growl. */
function sweep(
  dur: number,
  gain: number,
  type: BiquadFilterType,
  from: number,
  to: number,
  delay: number,
  q = 0.9,
): void {
  const c = ensureCtx();
  if (!c || !master || c.state === "suspended") return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const seg = c.createBufferSource();
  seg.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, from), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.75);
  seg.connect(f);
  f.connect(g);
  g.connect(master);
  seg.start(t0);
  seg.stop(t0 + dur + 0.05);
  seg.onended = () => {
    seg.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/* ---------------- continuous engine voice ---------------- */

class EngineVoice {
  private c: AudioContext;
  private out: GainNode;
  private bodyGain: GainNode;
  private bodyFreq: BiquadFilterNode;
  private hissGain: GainNode;
  private hissFreq: BiquadFilterNode;
  private windGain: GainNode;
  private windFreq: BiquadFilterNode;
  private sub: OscillatorNode;
  private subGain: GainNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private running = false;
  private cur = 0;
  private windCur = 0;
  private strainCur = 0;
  private goal = 0;
  private windGoal = 0;
  private strainGoal = 0;
  private pace = 0.5;
  private timer: ReturnType<typeof setInterval> | null = null;
  private growlGain: GainNode;
  private growlFreq: BiquadFilterNode;

  constructor() {
    const c = ensureCtx();
    if (!c || !amb) throw new Error("no audio context");
    this.c = c;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.connect(amb);

    const layer = (): { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode } => {
      const src = noiseSrc(c);
      src.start();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.out);
      return { src, g, f };
    };

    const body = layer();
    body.f.type = "lowpass";
    body.f.frequency.value = 130;
    body.f.Q.value = 0.8;
    this.bodyGain = body.g;
    this.bodyFreq = body.f;

    // airflow hiss: highpass (brightens with RPM) then tame lowpass
    const hiss = layer();
    hiss.f.type = "highpass";
    hiss.f.frequency.value = 500;
    hiss.f.Q.value = 0.6;
    const tame = c.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = 5200;
    hiss.src.disconnect(hiss.f);
    hiss.f.disconnect(hiss.g);
    hiss.src.connect(hiss.f);
    hiss.f.connect(tame);
    tame.connect(hiss.g);
    this.hissGain = hiss.g;
    this.hissFreq = hiss.f;

    const wind = layer();
    wind.f.type = "lowpass";
    wind.f.frequency.value = 300;
    wind.f.Q.value = 0.5;
    this.windGain = wind.g;
    this.windFreq = wind.f;

    // strain growl: gritty band that swells while the engine labours
    // (high-altitude / high-temperature stall) and dies on failure
    const growl = layer();
    growl.f.type = "bandpass";
    growl.f.frequency.value = 150;
    growl.f.Q.value = 2.4;
    this.growlGain = growl.g;
    this.growlFreq = growl.f;

    this.sub = c.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 30;
    this.sub.start();
    this.subGain = c.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.out);

    // slow prop-beat wobble on the body — rises with RPM
    this.lfo = c.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 10;
    this.lfo.start();
    this.lfoGain = c.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.bodyGain.gain);
  }

  setGoals(r: number, w: number, paceSec: number, strain = 0): void {
    if (!this.running) this.start();
    this.goal = clamp(r, 0, 1);
    this.windGoal = clamp(w, 0, 1);
    this.strainGoal = clamp(strain, 0, 1);
    this.pace = clamp(paceSec, 0.1, 4);
  }

  fadeOut(sec: number): void {
    this.goal = 0;
    this.windGoal = 0;
    this.strainGoal = 0;
    this.pace = clamp(sec * 0.4, 0.12, 2);
    if (!this.running) this.start();
  }

  /** Stop instantly and park the graph (used when leaving the page). */
  park(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.c.currentTime;
    this.cur = 0;
    this.windCur = 0;
    this.strainCur = 0;
    this.goal = 0;
    this.windGoal = 0;
    this.strainGoal = 0;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.bodyGain.gain.setValueAtTime(0, t);
    this.hissGain.gain.setValueAtTime(0, t);
    this.windGain.gain.setValueAtTime(0, t);
    this.growlGain.gain.setValueAtTime(0, t);
    this.subGain.gain.setValueAtTime(0, t);
    this.lfoGain.gain.setValueAtTime(0, t);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const now = this.c.currentTime;
      const dt = 1 / 20;
      const k = 1 - Math.exp(-dt / Math.max(0.06, this.pace));
      this.cur += (this.goal - this.cur) * k;
      this.windCur += (this.windGoal - this.windCur) * k;
      this.strainCur += (this.strainGoal - this.strainCur) * k;
      const r = clamp(this.cur, 0, 1);
      const w = clamp(this.windCur, 0, 1);
      const sg = clamp(this.strainCur, 0, 1);
      const tc = 0.05;
      // strained engine: duller body, lower/lugging sub, gritty growl,
      // ragged prop lope, less top-end sheen — fades as it fails
      this.bodyGain.gain.setTargetAtTime((0.012 + r * 0.2) * (1 + 0.12 * sg), now, tc);
      this.bodyFreq.frequency.setTargetAtTime((90 + r * 520) * (1 - 0.28 * sg), now, tc);
      this.sub.frequency.setTargetAtTime((27 + r * 88) * (1 - 0.14 * sg), now, tc);
      this.subGain.gain.setTargetAtTime(r > 0.002 ? 0.02 + r * 0.11 : 0, now, tc);
      this.hissGain.gain.setTargetAtTime((0.003 + r * r * 0.06) * (1 - 0.35 * sg), now, tc);
      this.hissFreq.frequency.setTargetAtTime(450 + r * 2100, now, tc);
      this.growlGain.gain.setTargetAtTime(r > 0.003 ? 0.018 + sg * 0.17 : 0, now, tc);
      this.growlFreq.frequency.setTargetAtTime(120 + sg * 210 + r * 30, now, tc);
      this.windGain.gain.setTargetAtTime(0.008 + w * 0.07, now, tc);
      this.windFreq.frequency.setTargetAtTime(220 + w * 800 + r * 280, now, tc);
      this.lfo.frequency.setTargetAtTime((8 + r * 14 + w * 4) * (1 - 0.32 * sg), now, tc);
      this.lfoGain.gain.setTargetAtTime((0.04 + r * 0.08) * (1 + 2.3 * sg), now, tc);
      const vol = r > 0.002 || w > 0.002 ? 1 : 0;
      this.out.gain.setTargetAtTime(vol, now, 0.22);
      if (this.cur < 0.002 && this.windCur < 0.002 && this.goal < 0.001) {
        // parked — graph stays connected, muted; restart re-spools instantly
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        return;
      }
    };
    tick();
    this.timer = setInterval(tick, 50);
  }
}

let voice: EngineVoice | null = null;

function getVoice(): EngineVoice | null {
  if (!ctx || !amb) return null;
  if (!voice) voice = new EngineVoice();
  return voice;
}

export const flightAudio = {
  get enabled(): boolean {
    return !!ctx && ctx.state === "running";
  },

  /** Call from a user gesture (first click/tap/key on the sim page). */
  async unlock(): Promise<void> {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") {
      try {
        await c.resume();
      } catch {
        /* some browsers need a second gesture */
      }
    }
  },

  /** FLYING state — continuous engine/airflow, follows live telemetry. */
  fly(rpmNorm: number, windNorm: number, strain = 0): void {
    if (!this.enabled) return;
    getVoice()?.setGoals(rpmNorm, windNorm, 0.55, strain);
  },

  /** CRASH state — realistic impact + structure settling, then shutdown. */
  crash(): void {
    if (!this.enabled) return;
    // heavy but believable ground impact (low-frequency body thump — no blast)
    hit(0.6, 0.42, 520, 40, 0);
    tone("sine", 78, 22, 0.7, 0.3, 0);
    // airframe flex / secondary thud as the structure settles
    tone("sine", 46, 23, 0.9, 0.17, 0.12);
    // metallic rattle — landing-gear / cowling chatter after impact
    for (let i = 0; i < 4; i++) {
      sweep(0.07, 0.07, "bandpass", 2600 - i * 300, 800, 0.15 + i * 0.09, 7);
    }
    // engine spools down and shuts off
    getVoice()?.fadeOut(1.7);
    // settling debris / wind ambience, quiet
    hit(2.4, 0.035, 320, 110, 0.55);
  },

  /**
   * HIGH-ALT / HIGH-TEMP engine failure — plays once, the instant the store
   * crosses into forcedLanding (health 0%). Deep mechanical strain → rapid
   * RPM drop → pneumatic release → brief rupture, then the engine cuts and
   * only airflow/wind ambience remains during the descent.
   */
  engineFail(): void {
    if (!this.enabled) return;
    // 1) deep mechanical strain groan — engine labouring under load
    tone("sine", 52, 25, 1.35, 0.3, 0);
    sweep(1.05, 0.17, "lowpass", 430, 110, 0.04, 1.1);
    // 2) metallic vibration — rough chatter as the RPM wavers
    for (let i = 0; i < 6; i++) {
      sweep(0.085, 0.05, "bandpass", 2200 - i * 160, 650, 0.24 + i * 0.06, 6);
    }
    // 3) pneumatic / pressure release
    sweep(0.6, 0.14, "bandpass", 2100, 300, 0.46, 1.1);
    // 4) rapid RPM drop — winding down under strain
    tone("triangle", 330, 50, 0.9, 0.12, 0.52);
    sweep(0.9, 0.1, "lowpass", 950, 70, 0.52);
    // 5) brief mechanical rupture (structure yielding — not a blast)
    tone("sine", 66, 25, 0.55, 0.3, 0.85);
    sweep(0.5, 0.21, "lowpass", 540, 55, 0.85, 1.6);
    // 6) metal ring-down as the rotors coast
    for (let i = 0; i < 3; i++) {
      sweep(0.13, 0.04, "bandpass", 1600, 850, 1.22 + i * 0.1, 8);
    }
    // engine voice shuts down fast — wind/airflow ambience takes over
    getVoice()?.fadeOut(0.5);
  },

  /** Leave the sim page — stop everything. */
  shutdown(): void {
    voice?.park();
    if (ctx && ctx.state === "running") void ctx.suspend();
  },
};
