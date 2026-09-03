import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Expand,
  Plane,
  RotateCw,
  Shrink,
  Zap,
} from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { TechButton } from "@/components/hud/primitives";
import { simulate, estimateRul, BASELINE_CONDITIONS } from "@/lib/domain/engine/model";
import { ENGINE_SPIN_RATE } from "@/features/digital-twin/EngineModel";
import type { PartHighlights } from "@/features/digital-twin/EngineModel";
import { JARVISPartInspector } from "@/features/digital-twin/JARVISPartInspector";
import { JARVISExplodeStudio } from "@/features/digital-twin/JARVISExplodeStudio";
import { CinematicIntro } from "./CinematicIntro";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));
// Hero drives a rAF clock that re-renders every frame (choreography + live
// telemetry). Memoizing the canvas stops those ticks from re-running the whole
// WebGL reconciliation once the handoff has settled — that was the stutter at
// the video→twin cut.
const HeroEngineCanvas = memo(EngineCanvas);

const ENGINE_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
/** Desktop resting position of the engine: canvas center (50vw) + this shift lands on the right frame centre (≈72.5vw). */
const ENGINE_REST_SHIFT_VW = 22.6;

/**
 * Handoff beat structure (seconds relative to the video cut at ~7.55s, when the
 * clip is showing its final X-RAY engine macro shot):
 *  0.0s  video reaches the cut and the overlay starts its slow crossfade. The
 *        video KEEPS PLAYING (its engine motion continues) while the GLB —
 *        already warmed & held STATIC beneath the clip — emerges in the SAME
 *        X-ray look at the SAME macro framing and orientation. Because the twin
 *        does not rotate during the fade it overlaps the video engine frame
 *        cleanly; the twin literally materialises out of the fading video frame.
 *  1.05s video is nearly gone — the engine starts its CENTRE → RIGHT glide and
 *        eases macro → resting scale while resolving X-ray → physical
 *        (all three finish ~2.2s);
 *  2.2s  engine arrives at its existing resting position, physical again;
 *  ~2.35s the slow showcase idle rotation resumes (static until now);
 *  2.7s  choreography is over — hero is fully live & interactive.
 */
const ENGINE_DRIFT_DELAY_MS = 1050;
const ENGINE_DRIFT_MS = 1150;
/** Seconds the engine holds the video's macro framing before it starts easing down. */
const MACRO_HOLD_S = 1.05;
/** Seconds to ease macro → resting scale (aligned with the CENTRE → RIGHT glide). */
const MACRO_SHRINK_S = 1.15;
/** When the X-ray → physical resolve starts (as the glide begins). */
const XRAY_RESOLVE_START_S = 1.2;
/** How long the resolve takes — it completes as the engine arrives at rest. */
const XRAY_RESOLVE_S = 1.0;
const LIVE_DELAY_MS = 2700;
/** Page chrome starts materializing only once the video has mostly cleared (seconds after the cut). */
const UI_SHIFT_S = 0.6;

/**
 * Engine rotation policy: the twin holds ONE static orientation through the
 * whole cinematic crossfade + centre→right glide — a GLB spinning independently
 * under a rotating video can never overlap it, and the static pose is what
 * makes the handoff read as the same engine. The slow showcase idle rotation
 * only resumes once the engine has fully landed at its resting position.
 */
const ENGINE_IDLE_AFTER_S = 2.35;
/** ms after the cinematic starts to warm the R3F engine stage beneath the opaque video. */
const ENGINE_PREWARM_MS = 7050;
/** ms after the cinematic starts to pull the lazy EngineCanvas module (GLB parse happens early). */
const ENGINE_MODULE_WARM_MS = 600;

/**
 * Macro-matching handoff. Frame-measured against the actual clip's final
 * engine shot (~7.55s of the 10.0s asset): the video engine's silhouette spans
 * ≈10→82% of the viewport width and ≈10→90% of the height — a big, nearly
 * screen-filling macro. The GLB macro scale below is computed (three.js
 * projection of engine.glb at the overview camera) so the twin's on-screen
 * footprint overlaps that same region instead of rendering a third smaller.
 * The macro pose also holds a small LEFT offset (−3.5vw) matching the video
 * silhouette's centre (bbox ≈ 46%w, left-heavy), then eases into the existing
 * resting overview scale/position as it glides right.
 */
const DESKTOP_REST_SCALE = 1.15;
const DESKTOP_MACRO_SCALE = 2.45;
/** Horizontal hold offset (vw) so the macro twin overlaps the video's engine. */
const DESKTOP_MACRO_X_OFFSET_VW = -3.5;
/** Downward hold offset (vh) so the macro twin overlaps the video's engine vertically. */
const DESKTOP_MACRO_Y_OFFSET_VH = 4;
const MOBILE_REST_SCALE = 1.02;
const MOBILE_MACRO_SCALE = 1.3;

/**
 * Handoff colour grade.
 *
 * The twin now renders in the same physical palette as the cinematic engine
 * (red covers, silver alloy, dark exhaust), so only a short, mild warm lift is
 * needed at the exact video cut to match the macro footage — anything stronger
 * blows the red/silver into the orange glow that made it read as a different
 * object. The grade eases back to the site's normal look as the engine glides
 * right.
 */
const HANDOFF_GRADE_BRIGHTNESS = 1.3;
const HANDOFF_GRADE_SATURATE = 1.2;
const HANDOFF_GRADE_CONTRAST = 1.06;

type HeroPhase = "cinematic" | "reveal" | "live";

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** Fade-only variant used for chrome (nav-adjacent HUD, frames) that materializes in place. */
function fadeStyle(now: number, start: number, delayMs: number, durationMs = 700): CSSProperties {
  const p =
    start <= 0
      ? 0
      : easeOutCubic(Math.min(1, Math.max(0, ((now - start) * 1000 - delayMs) / durationMs)));
  return p <= 0.001 ? { opacity: 0, pointerEvents: "none" } : { opacity: p };
}

/** Staggered, non-bouncy entrance driven by the live clock so it can start exactly at the video cut. */
function entranceStyle(
  now: number,
  start: number,
  delayMs: number,
  durationMs = 900,
): CSSProperties {
  const p =
    start <= 0
      ? 0
      : easeOutCubic(Math.min(1, Math.max(0, ((now - start) * 1000 - delayMs) / durationMs)));
  return {
    opacity: p,
    transform: p >= 1 ? "none" : `translateX(${-30 * (1 - p)}px)`,
  };
}

/* ------------------------------------------------------------------ */
/* Compact live-telemetry strip — values come from the same engine     */
/* demonstrator model used across the rest of the product.             */
/* ------------------------------------------------------------------ */

function LiveTelemetry({
  s,
  rul,
  now,
  start,
}: {
  s: ReturnType<typeof simulate>;
  rul: ReturnType<typeof estimateRul>;
  now: number;
  start: number;
}) {
  const health = s.health * 100;
  const healthColor =
    health > 80 ? "var(--cyan)" : health > 60 ? "var(--amber)" : "var(--critical)";
  const cells: { k: string; v: string; u: string; hide?: "md" }[] = [
    { k: "EGT", v: `${s.egt.toFixed(0)}`, u: "°C" },
    { k: "CHT", v: `${s.cht.toFixed(0)}`, u: "°C" },
    { k: "OIL PRESS", v: s.oilPressure.toFixed(1), u: "BAR", hide: "md" },
    { k: "VIB RMS", v: s.vibrationRms.toFixed(2), u: "", hide: "md" },
    { k: "RUL", v: rul.point.toFixed(1), u: "HRS", hide: "md" },
  ];

  return (
    <div
      className="pointer-events-none flex w-full items-center gap-3 overflow-hidden border border-border/70 bg-panel/85 px-3 py-2 backdrop-blur-[2px] sm:gap-4 sm:px-4"
      style={{
        opacity: entranceStyle(now, start, 850, 800).opacity,
        transform: start <= 0 ? "translateY(12px)" : "none",
        transition: `opacity 0.8s ${ENGINE_EASE} 0.15s, transform 0.8s ${ENGINE_EASE} 0.15s`,
      }}
    >
      <div className="flex min-w-[64px] flex-col gap-0.5">
        <span className="flex items-center gap-1.5 label-xs text-[8px] text-muted-foreground">
          ENGINE HEALTH
        </span>
        <span
          className="readout text-lg leading-none font-semibold sm:text-xl"
          style={{ color: healthColor }}
        >
          {health.toFixed(1)}%
        </span>
      </div>

      {cells.map((c) => (
        <div
          key={c.k}
          className={`flex min-w-[58px] flex-col gap-0.5 border-l border-border/50 pl-3 ${c.hide === "md" ? "hidden md:flex" : ""}`}
        >
          <span className="label-xs text-[8px] text-muted-foreground">{c.k}</span>
          <span className="readout text-sm leading-none sm:text-base">
            {c.v}
            {c.u && <span className="ml-0.5 text-[0.55em] text-muted-foreground">{c.u}</span>}
          </span>
        </div>
      ))}

      <div className="ml-auto hidden items-center gap-2 label-xs text-cyan-dim xl:flex">
        <RotateCw className="h-3 w-3 animate-[spin_4s_linear_infinite] text-cyan" />
        <span>HOLD &amp; DRAG TO ROTATE · SCROLL TO ZOOM · CLICK ANY PART</span>
      </div>
      <span className="ml-auto label-xs text-cyan-dim xl:hidden">DRAG TO ROTATE</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Hero() {
  const [phase, setPhase] = useState<HeroPhase>("cinematic");
  const [exploded, setExploded] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Engine stage: mounted ("warmed") beneath the opaque video a short beat
  // before the clip reaches its final engine shot, so the WebGL context and
  // X-ray materials are ready the instant the crossfade opens. During the main
  // cinematic nothing 3D renders at all — video playback has priority.
  const [engineReady, setEngineReady] = useState(false);
  const engineStageOn = phase !== "cinematic" || engineReady;

  // Cut-clock. VIDEO-PLAYBACK PRIORITY: while the cinematic plays there is NO
  // rAF-driven React state and NO per-frame reconciliation anywhere in the hero
  // (that per-frame work was what stuttered the clip). The clock only starts at
  // the cut; every choreography timing below is in seconds since the cut.
  const clockOn = phase !== "cinematic";
  const [now, setNow] = useState(-1);
  useEffect(() => {
    if (!clockOn) return;
    let raf = 0;
    const start = performance.now();
    const loop = (ts: number) => {
      setNow((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clockOn]);

  const t = now >= 0 ? now : 0;
  const tRef = useRef(0);
  tRef.current = t;

  const onCut = useCallback(() => {
    setPhase("reveal");
    setEngineReady(true); // skip-intro path — stage must mount immediately
    if (typeof window !== "undefined") {
      // Signal the shared navigation to fade in as the video clears.
      window.setTimeout(
        () => window.dispatchEvent(new CustomEvent("aeris:reveal")),
        950,
      );
    }
  }, []);

  // While the video plays: (1) pull the lazy EngineCanvas module early so the
  // engine.glb fetch/parse (useGLTF.preload) lands in the black boot section,
  // not at the cut; (2) warm the stage ~0.5s before the video's final engine
  // shot so the crossfade opens on a live GLB, not a first-frame shader build.
  useEffect(() => {
    if (phase !== "cinematic") return;
    const warmModule = window.setTimeout(() => {
      void import("@/features/digital-twin/EngineCanvas").catch(() => undefined);
    }, ENGINE_MODULE_WARM_MS);
    const warmStage = window.setTimeout(() => setEngineReady(true), ENGINE_PREWARM_MS);
    return () => {
      window.clearTimeout(warmModule);
      window.clearTimeout(warmStage);
    };
  }, [phase]);

  // Rotation policy. `rotationSync` is a stable object mutated in the render
  // loop (never a fresh reference, so the memoized canvas is never reconciled
  // because of it). The actual angle integration lives with the derived values
  // below (it depends on `elapsedSinceCut`).
  const rotationSync = useMemo(() => ({ angle: 0 }), []);
  const prevTRef = useRef(-1);

  // Move to the fully interactive state once the choreography has settled.
  useEffect(() => {
    if (phase !== "reveal") return;
    const id = window.setTimeout(() => setPhase("live"), LIVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Keep the page from scrolling mid-cinematic.
  useEffect(() => {
    if (phase !== "cinematic" && phase !== "reveal") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Layout mode (desktop = split composition, everything else = stacked).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Demonstrator state — same model the rest of the product uses.
  const bucket = Math.floor(t * 2);
  const s = useMemo(() => simulate(t * 0.4, BASELINE_CONDITIONS, 0.12), [bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const rul = useMemo(() => estimateRul(s, BASELINE_CONDITIONS, 0.12), [bucket]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlights: PartHighlights = useMemo(
    () => ({
      cyl1CHT: s.cht + Math.sin(t * 0.7) * 3,
      cyl2CHT: s.cht + 14 + Math.sin(t * 0.5) * 4,
      cyl3CHT: s.cht + 16 + Math.sin(t * 0.6) * 5,
      cyl4CHT: s.cht - 2 + Math.sin(t * 0.8) * 3,
      egt: s.egt,
      rpm: s.rpm,
      vibration: s.vibrationRms,
      oilTemp: s.oilTemperature,
      health: s.health,
    }),
    [bucket], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const revealed = phase !== "cinematic";
  // Page chrome materializes as the video clears and the engine opens up the
  // right side. All timings below are seconds since the cut (`now`), so the
  // interface can never ghost through the still-playing video.
  const uiStart = revealed ? UI_SHIFT_S : 0;
  const elapsedSinceCut = revealed ? Math.max(0, now) : 0;

  // Engine rotation: held STATIC at angle 0 through the cinematic crossfade and
  // the centre→right glide — a GLB spinning independently under a fading video
  // can never overlap it, and the static pose is what makes the handoff read as
  // the same engine. Once the engine has fully landed (ENGINE_IDLE_AFTER_S) the
  // slow showcase idle rotation integrates smoothly from 0: no reset, no pop.
  if (engineStageOn && !exploded) {
    const dt =
      prevTRef.current >= 0 ? Math.min(0.1, Math.max(0, t - prevTRef.current)) : 0;
    prevTRef.current = t;
    if (elapsedSinceCut >= ENGINE_IDLE_AFTER_S) {
      rotationSync.angle += ENGINE_SPIN_RATE * dt;
    } else {
      rotationSync.angle = 0;
    }
  } else {
    prevTRef.current = -1;
  }

  // X-ray reveal strength: 1 = the engine rendered exactly like the video's
  // final X-ray shot (translucent cyan wireframe). It holds that holographic
  // look through the whole crossfade, then resolves to the physical engine as
  // it glides centre → right — fully physical the moment it lands at rest.
  const resolveP = revealed
    ? Math.min(1, Math.max(0, (elapsedSinceCut - XRAY_RESOLVE_START_S) / XRAY_RESOLVE_S))
    : 0;
  const xrayStrength = 1 - easeOutCubic(resolveP);

  // Macro → overview continuity: the twin opens at the cinematic MACRO framing
  // (big, centre) and HOLDS it through the crossfade — so the engine emerges
  // from the exact pixels the still-playing video leaves — then eases macro →
  // resting scale in lockstep with the CENTRE → RIGHT glide. 0 = handoff, 1 =
  // rest. The scale holds the macro framing for MACRO_HOLD_S (≈ crossfade),
  // then eases to rest.
  const handoffP = revealed
    ? Math.min(1, Math.max(0, (elapsedSinceCut - MACRO_HOLD_S) / MACRO_SHRINK_S))
    : 0;
  const handoffEase = easeOutCubic(handoffP);
  const modelScale = isDesktop
    ? DESKTOP_REST_SCALE + (DESKTOP_MACRO_SCALE - DESKTOP_REST_SCALE) * (1 - handoffEase)
    : MOBILE_REST_SCALE + (MOBILE_MACRO_SCALE - MOBILE_REST_SCALE) * (1 - handoffEase);
  // Memoized so the canvas gets a stable reference once the choreography settles
  // (React.memo shallow-compares props — a fresh array every frame would defeat it).
  const modelPosition = useMemo<[number, number, number]>(
    () => (isDesktop ? [0, -0.25 + 0.23 * (1 - handoffEase), 0] : [0, -0.2, 0]),
    [isDesktop, handoffEase],
  );

  // Holographic bloom — a soft cyan halo that swells as the video gives way to
  // the X-ray twin and decays before the engine glides right. It masks the
  // crossfade seam and sells the "the engine is materialising" moment. One
  // smooth hump across the fade window (0 → ~0.5 → 0 over ~1.5s).
  const bloomP = revealed
    ? Math.sin(Math.min(1, elapsedSinceCut / 1.5) * Math.PI) * 0.5
    : 0;

  // Warm/bright grade that tracks the same handoff clock as scale: strongest at
  // the video cut, neutral by the time the engine settles at its hero position.
  const grade = 1 - handoffEase;
  const handoffFilter =
    grade > 0.001
      ? `brightness(${(1 + (HANDOFF_GRADE_BRIGHTNESS - 1) * grade).toFixed(3)}) saturate(${(1 + (HANDOFF_GRADE_SATURATE - 1) * grade).toFixed(3)}) contrast(${(1 + (HANDOFF_GRADE_CONTRAST - 1) * grade).toFixed(3)})`
      : undefined;

  // Engine glides from screen centre (where the cinematic leaves it) to the
  // right-side digital-twin frame after the handoff. The hold + glide split
  // makes the viewer lock onto the same engine for a beat before the page
  // materializes around it — no hard cut, no teleport.
  // While the video plays (and through the macro hold) the twin sits at the
  // measured video-engine offset (slightly left + slightly lower than true
  // centre — where the video's engine actually is); at the cut the CSS
  // transition glides it from that pose to the existing right-frame resting
  // position (delay = hold), so the final layout is untouched.
  const engineShift = isDesktop
    ? revealed
      ? `translateX(${ENGINE_REST_SHIFT_VW}vw)`
      : `translate(${DESKTOP_MACRO_X_OFFSET_VW}vw, ${DESKTOP_MACRO_Y_OFFSET_VH}vh)`
    : undefined;
  const engineTransition =
    isDesktop && revealed
      ? `transform ${ENGINE_DRIFT_MS}ms ${ENGINE_EASE} ${ENGINE_DRIFT_DELAY_MS}ms`
      : "transform 300ms ease";

  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden lg:h-[100svh]">
      {/* ---- atmosphere (near-black engineering backdrop) ---- */}
      <div className="absolute inset-0 grid-bg opacity-70" />
      <div className="absolute inset-0 scanlines opacity-40" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 62% 48%, oklch(0.28 0.03 205 / 45%), transparent 62%)",
        }}
      />

      {/* ---- right-side digital-twin frame (decorative, desktop) ---- */}
      <div
        className="pointer-events-none absolute inset-y-12 right-0 z-[1] hidden w-[55%] lg:block"
        style={fadeStyle(now, uiStart, 260, 800)}
      >
        <div className="absolute inset-6 border-l border-border/60">
          <div className="absolute inset-0 grid-bg-fine opacity-30" />
          <div className="absolute inset-6 rounded-full border border-cyan/10" />
          <div className="absolute inset-[16%] rounded-full border border-amber/10" />
        </div>
      </div>

      {/* ---- text column (enters from the left after the handoff) ---- */}
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[76svh] max-w-[1600px] flex-col justify-center px-5 pt-24 pb-8 lg:min-h-0 lg:h-full lg:px-10 lg:pb-28 lg:pt-24">
        <div className="pointer-events-auto w-full max-w-[660px]">
          {/* 1 · platform label */}
          <div style={entranceStyle(now, uiStart, 120)}>
            <div className="mb-6 inline-flex items-center gap-2.5 border border-cyan/25 bg-cyan/[0.05] px-3 py-1.5 label-xs text-cyan">
              <span
                className="h-1.5 w-1.5 rounded-full bg-cyan"
                style={{ animation: "aeris-pulse 2.4s ease-in-out infinite" }}
              />
              TAPAS BH-201 · ROTAX 914 AERO ENGINE
            </div>
          </div>

          {/* 2 · wordmark */}
          <h1
            style={entranceStyle(now, uiStart, 250)}
            className="font-display text-[2.6rem] leading-[0.95] font-medium tracking-[0.04em] text-balance sm:text-6xl lg:text-[4.4rem]"
          >
            AERIS-TWIN
          </h1>

          {/* 3 · headline */}
          <h2
            style={entranceStyle(now, uiStart, 390, 950)}
            className="mt-5 max-w-[620px] font-display text-2xl leading-[1.16] font-medium tracking-tight text-balance sm:text-3xl lg:text-[2rem]"
          >
            Know the engine before it knows it&apos;s <span className="text-cyan">FAILING</span>.
          </h2>

          {/* 4 · supporting description */}
          <p
            style={entranceStyle(now, uiStart, 560, 950)}
            className="mt-5 max-w-[560px] text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            AI-enabled Digital Engine Intelligence for MALE UAVs. An explainable twin that combines
            live telemetry, physics-based engine modelling and predictive diagnostics to anticipate
            degradation before conventional thresholds are crossed.
          </p>

          {/* 5 · CTAs */}
          <div style={entranceStyle(now, uiStart, 760)} className="mt-9 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsStudioOpen(true)}
              className="group relative inline-flex items-center gap-3 border border-cyan/70 bg-cyan/15 px-6 py-3 font-mono text-[11px] tracking-[0.2em] uppercase text-cyan transition-colors hover:bg-cyan/25 cursor-pointer shadow-[0_0_20px_rgba(111,216,232,0.3)]"
            >
              <Zap className="h-4 w-4" /> Explore Digital Twin{" "}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <Link to="/sim">
              <TechButton variant="ghost">
                <Plane className="h-3.5 w-3.5" /> Flight Simulator
              </TechButton>
            </Link>
            <Link to="/gcs">
              <TechButton variant="ghost">Ground Control</TechButton>
            </Link>
          </div>

          {/* 6 · status badges */}
          <div
            style={entranceStyle(now, uiStart, 940)}
            className="mt-8 flex flex-wrap items-center gap-2 label-xs"
          >
            <span className="border border-amber/40 bg-amber/10 px-2 py-1 text-amber">
              PROTOTYPE / RESEARCH DEMONSTRATOR
            </span>
            <span className="text-muted-foreground">REPRESENTATIVE ENGINE AE-P4</span>
          </div>
        </div>
      </div>

      {/* ---- real 3D engine — warmed beneath the cinematic, live at the cut ---- */}
      <div
        className="relative z-[2] h-[64svh] w-full lg:absolute lg:inset-0 lg:h-auto"
        style={{
          transform: engineShift,
          transition: engineTransition,
          willChange: "transform",
        }}
      >
        {/* mobile-only alignment rings */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(92vw,58svh)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan/10 lg:hidden" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(70vw,44svh)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber/10 lg:hidden" />

        {/* Holographic bloom behind the canvas — masks the video→twin seam. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: bloomP,
            background:
              "radial-gradient(ellipse 36% 30% at 50% 47%, oklch(0.7 0.17 205 / 0.55), transparent 70%)",
          }}
        />

        <div className="absolute inset-0" style={handoffFilter ? { filter: handoffFilter } : undefined}>
          <ClientOnly fallback={null}>
            {engineStageOn && (
              <Suspense fallback={null}>
                <HeroEngineCanvas
                  interactive
                  autoRotate={false}
                  autoRotateSpeed={0.6}
                  spin={!exploded}
                  rotationSync={rotationSync}
                  cameraView="overview"
                  showLabels={showLabels}
                  fault={0.12}
                  exploded={exploded}
                  physicalTone
                  xrayReveal={xrayStrength}
                  highlights={highlights}
                  modelScale={modelScale}
                  modelPosition={modelPosition}
                  cameraZ={isDesktop ? 7 : 7.4}
                  onSelectZone={(zoneName) => setSelectedZone(zoneName)}
                  selectedZone={selectedZone}
                />
              </Suspense>
            )}
          </ClientOnly>
        </div>

        {/* mobile telemetry + hint */}
        <div className="absolute inset-x-3 bottom-3 lg:hidden">
          <LiveTelemetry s={s} rul={rul} now={now} start={uiStart} />
        </div>
      </div>

      {/* ---- engine HUD + live telemetry (desktop, right region) ---- */}
      <div className="pointer-events-none absolute inset-y-12 right-0 z-30 hidden w-[55%] lg:block">
        {/* controls */}
        <div
          className="pointer-events-auto absolute top-4 left-4"
          style={fadeStyle(now, uiStart, 380, 650)}
        >
          <div className="label-xs text-cyan/90 mb-2 flex items-center gap-1.5 font-bold">
            <Zap className="h-3 w-3 text-cyan" /> ROTAX 914 / DIGITAL TWIN
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsStudioOpen(true);
              }}
              className="flex min-h-10 cursor-pointer items-center gap-2 border border-cyan bg-cyan/20 px-3 py-1.5 text-[10px] font-mono tracking-wider text-cyan transition-all select-none hover:bg-cyan/30 shadow-[0_0_16px_rgba(111,216,232,0.35)] pointer-events-auto"
            >
              <Expand className="h-3.5 w-3.5" />
              FULL-SCREEN DISMANTLE LAB
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExploded((prev) => !prev);
              }}
              className="flex min-h-10 cursor-pointer items-center gap-2 border px-3 py-1.5 text-[10px] font-mono tracking-wider transition-all select-none pointer-events-auto"
              style={{
                borderColor: exploded ? "#6fd8e8" : "rgba(255,255,255,0.25)",
                background: exploded ? "rgba(111,216,232,0.25)" : "rgba(20,22,28,0.92)",
                color: exploded ? "#6fd8e8" : "#ffffff",
              }}
            >
              {exploded ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
              {exploded ? "ASSEMBLE" : "EXPLODE"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowLabels((prev) => !prev);
              }}
              className="flex min-h-10 cursor-pointer items-center gap-2 border px-3 py-1.5 text-[10px] font-mono tracking-wider transition-all select-none pointer-events-auto"
              style={{
                borderColor: showLabels ? "#f0a63c" : "rgba(255,255,255,0.25)",
                background: showLabels ? "rgba(240,166,60,0.25)" : "rgba(20,22,28,0.92)",
                color: showLabels ? "#f0a63c" : "#ffffff",
              }}
            >
              {showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showLabels ? "LABELS ON" : "LABELS OFF"}
            </button>
          </div>
        </div>

        {/* live telemetry */}
        <div className="absolute inset-x-5 bottom-5">
          <LiveTelemetry s={s} rul={rul} now={now} start={uiStart} />
        </div>
      </div>

      {/* desktop scroll cue */}
      <a
        href="#system"
        style={fadeStyle(now, uiStart, 1650, 600)}
        className="absolute bottom-16 left-1/2 z-20 hidden -translate-x-1/2 lg:block"
      >
        <ChevronDown className="h-4 w-4 animate-bounce text-cyan/70" />
      </a>

      {/* ---- MP4 cinematic overlay → real GLB crossfade ---- */}
      <CinematicIntro phase={phase} onCut={onCut} />

      {/* JARVIS Part Inspector Modal */}
      {selectedZone && (
        <JARVISPartInspector
          zoneName={selectedZone}
          highlights={highlights}
          onClose={() => setSelectedZone(null)}
          onExplodeToggle={() => setExploded(!exploded)}
          isExploded={exploded}
        />
      )}

      {/* Full-Screen JARVIS Explode Studio */}
      <JARVISExplodeStudio
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        highlights={highlights}
      />
    </section>
  );
}
