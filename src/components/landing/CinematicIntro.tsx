import { useCallback, useEffect, useRef, useState } from "react";

/**
 * AERIS-TWIN opening cinematic.
 *
 * Plays the local repository MP4 (/assets/aeris-intro.mp4) once, full viewport.
 *
 * The clip runs ~10.0s: black system init → TAPAS BH-201 → aircraft flight →
 * deconstruction → engine reveal → engine rotating in a tight macro shot. From
 * ~8.0s the frame brightens and UI/text columns begin to appear — that final
 * AI-generated presentation tail must never be shown. The cut fires at ~7.7s,
 * on the strongest clean rotating-engine frame, and hands off to the already
 * preloaded, already-rotating real 3D engine beneath this overlay.
 *
 * The parent hero is responsible for the choreography that starts at `onCut`.
 */

/**
 * Nominal cut for the known ~10.0s asset — strongest engine frame, immediately
 * before the final presentation tail (measured frame analysis of the current
 * clip: engine macro rotates 5.6–8.0s; dashboard UI appears ~8.0s+).
 */
const NOMINAL_CUT_S = 7.7;
/** If a future clip has an unexpected duration, trim proportionally. */
const MAX_TAIL_S = 2.3;
/** Cache-busting version of the clip so an updated asset can never be served stale. */
const VIDEO_SRC = "/assets/aeris-intro.mp4?v=2";

export function CinematicIntro({
  phase,
  onCut,
}: {
  phase: "cinematic" | "reveal" | "live";
  onCut: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const firedRef = useRef(false);
  const cutAtRef = useRef(NOMINAL_CUT_S);
  const [videoOn, setVideoOn] = useState(false);
  const [initHidden, setInitHidden] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [startPrompt, setStartPrompt] = useState(false);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    onCut();
  }, [onCut]);

  // Init label + skip affordance timers.
  useEffect(() => {
    const t1 = window.setTimeout(() => setInitHidden(true), 1550);
    const t2 = window.setTimeout(() => setShowSkip(true), 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Precise frame-accurate cut while the video is actually playing.
  useEffect(() => {
    if (phase !== "cinematic" || !videoOn) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && v.currentTime >= cutAtRef.current) {
        fire();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, videoOn, fire]);

  // Autoplay + fallbacks.
  //
  // IMPORTANT: playback is started here, inside an effect, AFTER the event
  // listeners exist — never via the `autoPlay` attribute. When the page is
  // server-rendered the browser can otherwise start the video before React
  // hydrates; the `playing` event then fires to no listener, `videoOn` never
  // flips, and the clip plays invisibly under a black overlay. The extra
  // readyState/timeupdate backstops below make the video visible the instant
  // it genuinely has frames, no matter which events were missed.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;

    const reveal = () => {
      setVideoOn(true);
      setStartPrompt(false);
    };
    const tryPlay = () => {
      const p = v.play();
      if (p) p.catch(() => setStartPrompt(true));
    };
    const onPlaying = () => reveal();
    const onTimeUpdate = () => {
      // Backstop: if autoplay beat hydration, currentTime advances with no
      // `playing` event — surface the video the moment frames are moving.
      if (v.currentTime > 0.05) reveal();
    };
    const onEnded = () => fire();
    const onError = () => {
      // Never trap the visitor on a black screen.
      window.setTimeout(fire, 120);
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    // Reduced-motion: skip the cinematic quickly, keep the page content.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      v.pause();
      reveal();
      window.setTimeout(fire, 250);
    } else {
      // Already playing when hydration landed (autoplay raced us)? Just reveal.
      // Already ended? Rewind so the visitor still gets one clean cinematic run.
      if (v.ended) {
        try {
          v.currentTime = 0;
        } catch {
          /* seek may fail on some browsers while loading — play() will cope */
        }
      }
      if (!v.paused && v.currentTime > 0.05 && v.readyState >= 2) {
        reveal();
      } else {
        tryPlay();
      }
      // Hard safety net even if metadata/playback stalls.
      window.setTimeout(fire, NOMINAL_CUT_S * 1000 + 1600);
    }
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape skips the intro.
  useEffect(() => {
    if (phase !== "cinematic") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fire();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, fire]);

  if (phase === "live") return null;

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    if (v.duration >= 9.2) {
      cutAtRef.current = NOMINAL_CUT_S;
    } else {
      cutAtRef.current = Math.min(NOMINAL_CUT_S, Math.max(4.6, v.duration - MAX_TAIL_S));
    }
  };

  const active = phase === "cinematic";

  // The handoff dissolve: the video is paused on its strongest engine frame and
  // the overlay then fades SLOWLY (≈1.2s, gentle ease). Underneath, the real GLB
  // engine sits at the exact same macro framing, already rotating — so the twin
  // literally emerges from the fading video frame, then the page choreography
  // (engine centre → right, UI materializing) starts as the video clears.
  const overlayTransition = active
    ? "none"
    : "opacity 1200ms cubic-bezier(0.4, 0, 0.25, 1)";

  return (
    <div
      aria-hidden={!active}
      style={{ transition: overlayTransition }}
      className={`fixed inset-0 z-[80] bg-[#040609] ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
        loop={false}
        aria-label="AERIS-TWIN cinematic introduction"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onLoadedMetadata}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
        style={{ opacity: videoOn ? 1 : 0 }}
      />

      {/* Gentle vignette so the cinematic bleeds into the site's near-black atmosphere. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 46%, transparent 55%, oklch(0.05 0.01 240 / 62%) 100%)",
        }}
      />

      {/* Minimal system-initialization caption during the black opening. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[12svh] flex flex-col items-center gap-2 transition-opacity duration-700"
        style={{ opacity: initHidden ? 0 : 1 }}
      >
        <div className="readout text-[10px] tracking-[0.4em] text-cyan/85">AERIS-TWIN</div>
        <div className="flex items-center gap-2 label-xs text-muted-foreground">
          SYSTEM INITIALIZING
          <span
            className="h-1 w-1 bg-cyan"
            style={{ animation: "aeris-pulse 1.1s ease-in-out infinite" }}
          />
        </div>
      </div>

      {/* Skip — after a beat, so accidental taps don't end it instantly. */}
      {active && showSkip && !startPrompt && (
        <button
          type="button"
          onClick={fire}
          className="absolute right-4 bottom-4 flex min-h-9 items-center gap-2 border border-border bg-background/60 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground transition-colors hover:border-cyan/60 hover:text-cyan cursor-pointer backdrop-blur-sm sm:right-6 sm:bottom-6"
        >
          SKIP INTRO <span className="text-cyan/80">ESC</span>
        </button>
      )}

      {/* Autoplay-blocked fallback (should be rare for a muted video). */}
      {active && startPrompt && (
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            setStartPrompt(false);
            v.muted = true;
            const p = v.play();
            if (p) p.catch(() => setStartPrompt(true));
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-cyan/60 bg-cyan/10 px-5 py-3 font-mono text-[11px] tracking-[0.22em] text-cyan transition-colors hover:bg-cyan/20 cursor-pointer"
        >
          TAP TO BEGIN
        </button>
      )}
    </div>
  );
}
