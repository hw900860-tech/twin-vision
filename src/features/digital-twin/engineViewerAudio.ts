/* ------------------------------------------------------------------ */
/* Engine-viewer EXPLODE / ASSEMBLE sounds.                            */
/*                                                                    */
/* Cinematic, deep, bass-heavy transformation audio for the engine     */
/* exploded-view / exploded-view controls — NOT an explosion. The      */
/* EXPLODE button runs the exploded-view/disassembly, so the sound     */
/* communicates heavy aerospace components mechanically separating     */
/* (power-down rumble → hydraulic release → deep servos → heavy metal  */
/* shifts → resonant settle). ASSEMBLE is the reverse feel (deep       */
/* activation → powerful servos → components sliding in → synchronized */
/* locks → strong final CLUNK + subtle futuristic confirmation).       */
/*                                                                    */
/* Design notes:                                                       */
/*  - Sub-bass oscillator beds (34–62 Hz) carry the weight; everything */
/*    else sits on top of them.                                        */
/*  - Resonant bandpass noise sweeps make the servos/hydraulics sound  */
/*    like big electromechanical actuators, not small clicks.          */
/*  - Heavy "thunks" (sine thud + resonant metal ring) read as large   */
/*    components shifting, never as a blast.                           */
/*  - Sequence length ≈1.4–1.7 s, timed to the EngineModel explode     */
/*    easing (split/close completes ≈0.5–0.6 s) so the sound rides the */
/*    parts moving, with the heavy settle landing as they finish.      */
/*                                                                    */
/* BROWSER-AUDIO HARDENING (why this file looks the way it does):     */
/* Chromium creates every AudioContext in the "suspended" state until */
/* a user gesture resumes it. Scheduling events into a suspended       */
/* context is unreliable, and ctx.resume() is async — so every sound   */
/* path awaits a single ensureRunning() promise and only schedules     */
/* once ctx.state === "running". The resume fires synchronously from   */
/* the explode()/assemble() click handlers (the gesture browsers       */
/* want), and document-level gesture listeners prime the bus on the    */
/* first interaction anywhere. Only one resume() may be in flight —    */
/* a second concurrent resume() is rejected by Chromium.               */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let brownBuf: AudioBuffer | null = null;
let runPromise: Promise<boolean> | null = null;

/** Create the graph. Resume is NOT fired here — see ensureRunning(). */
function buildGraph(): boolean {
  if (typeof window === "undefined") return false;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    // Gentle safety limiter so the bass-heavy layers can't clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    return true;
  } catch {
    ctx = null;
    master = null;
    return false;
  }
}

/**
 * Returns a promise that resolves true once the context is RUNNING, creating
 * the graph on first call. explode()/assemble() invoke this synchronously
 * inside their click handlers, so the single resume() fires within the user
 * gesture the browser requires.
 */
function ensureRunning(): Promise<boolean> {
  if (!ctx && !buildGraph()) return Promise.resolve(false);
  if (!ctx) return Promise.resolve(false);

  if (ctx.state === "running") return Promise.resolve(true);

  if (!runPromise) {
    runPromise = ctx
      .resume()
      .then(() => {
        runPromise = null;
        return ctx?.state === "running";
      })
      .catch(() => {
        runPromise = null; // allow a retry on the next gesture
        return false;
      });
  }
  return runPromise;
}

/** One document-level gesture anywhere primes + resumes the audio bus. */
function primeOnFirstGesture(): void {
  if (typeof window === "undefined" || ctx) return;
  const attempt = () => {
    void ensureRunning();
  };
  window.addEventListener("pointerdown", attempt, { once: true });
  window.addEventListener("keydown", attempt, { once: true });
  window.addEventListener("touchstart", attempt, { once: true });
}

/* ------------------------------------------------------------------ */
/* Synthesis vocabulary — every helper schedules into the real context */
/* (guaranteed running) and cleans up after itself.                    */
/* ------------------------------------------------------------------ */

function brownNoise(c: AudioContext): AudioBuffer {
  if (!brownBuf) {
    const len = Math.floor(c.sampleRate * 3);
    brownBuf = c.createBuffer(1, len, c.sampleRate);
    const d = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return brownBuf;
}

/** Filtered-noise bed with a frequency sweep — rumble, air, hydraulic body. */
function bed(
  c: AudioContext,
  gain: number,
  type: BiquadFilterType,
  from: number,
  to: number,
  dur: number,
  delay: number,
  q = 0.6,
  attack = 0.06,
): void {
  if (!master) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = brownNoise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, from), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, gain), t0 + dur * 0.72);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/**
 * Deep low-frequency oscillator bed — the "weight" layer. Two detuned sines
 * (a few cents apart) beat subtly against each other so the sub sounds
 * alive and massive rather than like a pure test tone. Sweeps downward for
 * power-down (explode) or upward for activation (assemble).
 */
function subBed(
  c: AudioContext,
  freq: number,
  to: number,
  gain: number,
  dur: number,
  delay: number,
  attack = 0.08,
  release = 0.25,
): void {
  if (!master) return;
  const out = master; // capture — TS can't keep the null-narrowing inside the closure
  const t0 = c.currentTime + delay;
  const make = (detuneCents: number, gScale: number) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.detune.value = detuneCents;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur * 0.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * gScale), t0 + attack);
    g.gain.setValueAtTime(Math.max(0.0002, gain * gScale), t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + release + 0.05);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  };
  make(-7, 0.6); // one voice slightly under
  make(+9, 0.6); // one voice slightly over
  // A third low voice an octave-and-a-bit below adds pressure without pitch.
  const sub = c.createOscillator();
  sub.type = "sine";
  const subF = Math.max(20, freq * 0.52);
  sub.frequency.setValueAtTime(subF, t0);
  sub.frequency.exponentialRampToValueAtTime(Math.max(18, subF * 0.85), t0 + dur * 0.85);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.5), t0 + attack * 1.4);
  sg.gain.setValueAtTime(Math.max(0.0002, gain * 0.5), t0 + dur * 0.7);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release + 0.1);
  sub.connect(sg);
  sg.connect(out);
  sub.start(t0);
  sub.stop(t0 + dur + release + 0.15);
  sub.onended = () => {
    sub.disconnect();
    sg.disconnect();
  };
}

/**
 * Resonant sweep — big electromechanical actuator (servo/hydraulic motor).
 * A bandpass on the brown noise with a rising center frequency reads as a
 * powerful motor spooling under load.
 */
function servo(
  c: AudioContext,
  gain: number,
  from: number,
  to: number,
  dur: number,
  delay: number,
  q = 3.2,
): void {
  if (!master) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = brownNoise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, from), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + dur * 0.22);
  g.gain.setValueAtTime(Math.max(0.0002, gain), t0 + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.15);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/**
 * Heavy metallic shift — a thud (sine drop) plus a resonant metal ring.
 * This is the "large component moved" sound: weight first, metal on top.
 */
function thunk(
  c: AudioContext,
  delay: number,
  scale = 1,
): void {
  if (!master) return;
  const t0 = c.currentTime + delay;

  // Low sine thud — the mass.
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(92 * scale, t0);
  o.frequency.exponentialRampToValueAtTime(42 * scale, t0 + 0.3);
  const og = c.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.4 * scale, t0 + 0.008);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
  o.connect(og);
  og.connect(master);
  o.start(t0);
  o.stop(t0 + 0.5);
  o.onended = () => {
    o.disconnect();
    og.disconnect();
  };

  // Resonant metal body — bandpass noise thump.
  const src = c.createBufferSource();
  src.buffer = brownNoise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.8;
  f.frequency.setValueAtTime(240 * scale, t0);
  f.frequency.exponentialRampToValueAtTime(90 * scale, t0 + 0.28);
  const fg = c.createGain();
  fg.gain.setValueAtTime(0.0001, t0);
  fg.gain.exponentialRampToValueAtTime(0.24 * scale, t0 + 0.01);
  fg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  src.connect(f);
  f.connect(fg);
  fg.connect(master);
  src.start(t0);
  src.stop(t0 + 0.45);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    fg.disconnect();
  };

  // Metallic ring — short inharmonic ping, damped.
  const ring = c.createOscillator();
  ring.type = "triangle";
  ring.frequency.setValueAtTime(1180 * scale, t0);
  ring.frequency.exponentialRampToValueAtTime(640 * scale, t0 + 0.16);
  const rg = c.createGain();
  rg.gain.setValueAtTime(0.0001, t0);
  rg.gain.exponentialRampToValueAtTime(0.09 * scale, t0 + 0.005);
  rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  ring.connect(rg);
  rg.connect(master);
  ring.start(t0);
  ring.stop(t0 + 0.36);
  ring.onended = () => {
    ring.disconnect();
    rg.disconnect();
  };
}

/**
 * Final resonant settle — the machinery seating home. A deep tone that
 * bends down into the sub range with a low swell underneath.
 */
function settle(
  c: AudioContext,
  delay: number,
  big = false,
): void {
  if (!master) return;
  const t0 = c.currentTime + delay;
  const s = big ? 1.25 : 1;

  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(120 * s, t0);
  o.frequency.exponentialRampToValueAtTime(44 * s, t0 + 0.5);
  const og = c.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.34 * s, t0 + 0.03);
  og.gain.setValueAtTime(0.3 * s, t0 + 0.3);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
  o.connect(og);
  og.connect(master);
  o.start(t0);
  o.stop(t0 + 0.95);
  o.onended = () => {
    o.disconnect();
    og.disconnect();
  };

  // Low swell under the settle — the room breathing.
  bed(c, 0.16 * s, "lowpass", 220 * s, 70 * s, 0.8, delay, 0.8, 0.05);
}

/** Subtle futuristic confirmation — clean, short, hi sheen. */
function ping(c: AudioContext, delay: number, gain = 0.07): void {
  if (!master) return;
  const t0 = c.currentTime + delay;
  const partials = [1318, 1975, 2637];
  for (let i = 0; i < partials.length; i++) {
    const o = c.createOscillator();
    o.type = "sine";
    const f = partials[i] as number;
    o.frequency.setValueAtTime(f, t0);
    const g = c.createGain();
    const p = Math.max(0.0002, gain * (1 - i * 0.28));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4 - i * 0.06);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.5);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}

/* ------------------------------------------------------------------ */
/* The two sequences.                                                  */
/* ------------------------------------------------------------------ */

export const engineViewerAudio = {
  /**
   * EXPLODE — exploded-view disassembly: the engine powers down and its
   * heavy internals separate.
   *
   *   0.00  deep power-down rumble (58→34 Hz sub bed + low air)
   *   0.16  hydraulic / pneumatic pressure release (downward sweep)
   *   0.24  deep servo motors engaging under load (two spooling sweeps)
   *   0.50  3 heavy metallic shifts (thud + resonant ring)
   *   1.15  final resonant mechanical settle
   */
  explode(): void {
    void ensureRunning();
    primeOnFirstGesture();

    void ensureRunning().then((ok) => {
      const c = ctx;
      if (!ok || !c) return;

      // 1 · Deep power-down rumble — the weight.
      subBed(c, 58, 33, 0.55, 1.35, 0, 0.05, 0.3);
      bed(c, 0.24, "lowpass", 300, 85, 1.3, 0, 0.6, 0.07);

      // 2 · Hydraulic / pneumatic pressure release.
      bed(c, 0.2, "bandpass", 900, 280, 0.5, 0.16, 1.1, 0.05);
      bed(c, 0.12, "bandpass", 1500, 500, 0.34, 0.24, 1.4, 0.03);

      // 3 · Deep servo motors engaging under load.
      servo(c, 0.2, 130, 520, 0.6, 0.28, 3.4);
      servo(c, 0.13, 95, 330, 0.55, 0.34, 3.0);
      servo(c, 0.08, 340, 780, 0.5, 0.44, 4.0);

      // 4 · Heavy metallic shifts — the internals separating.
      thunk(c, 0.5, 1.0);
      thunk(c, 0.66, 0.85);
      thunk(c, 0.84, 0.72);

      // 5 · Final resonant mechanical settle.
      settle(c, 1.18, true);
    });
  },

  /**
   * ASSEMBLE — reverse feel: activation, components sliding in, locks.
   *
   *   0.00  deep mechanical activation (46→58 Hz sub swell + low air)
   *   0.14  powerful servo movement (two spooling sweeps)
   *   0.36  heavy components sliding into position (downward whoosh)
   *   0.60  synchronized metallic locks (3 heavy thunks)
   *   1.04  strong final CLUNK + resonant settle + subtle confirmation ping
   */
  assemble(): void {
    void ensureRunning();
    primeOnFirstGesture();

    void ensureRunning().then((ok) => {
      const c = ctx;
      if (!ok || !c) return;

      // 1 · Deep mechanical activation — machinery waking up.
      subBed(c, 46, 60, 0.5, 1.2, 0, 0.04, 0.28);
      bed(c, 0.2, "lowpass", 120, 260, 0.9, 0, 0.7, 0.06);

      // 2 · Powerful servo movement.
      servo(c, 0.18, 150, 560, 0.55, 0.14, 3.2);
      servo(c, 0.12, 105, 360, 0.5, 0.2, 3.0);

      // 3 · Heavy components sliding into position.
      bed(c, 0.24, "bandpass", 700, 180, 0.42, 0.36, 1.0, 0.06);
      servo(c, 0.1, 320, 90, 0.4, 0.44, 2.6);

      // 4 · Synchronized metallic locks seating home.
      thunk(c, 0.6, 0.9);
      thunk(c, 0.75, 0.95);
      thunk(c, 0.9, 1.0);

      // 5 · Strong final CLUNK + resonant settle + confirmation.
      settle(c, 1.06, true);
      thunk(c, 1.06, 1.25);
      ping(c, 1.12, 0.075);
    });
  },
};