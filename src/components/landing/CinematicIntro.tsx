import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * AERIS-TWIN opening cinematic (MP4 → real GLB crossfade).
 *
 * Plays the local repository clip (/assets/aeris-intro.mp4) once, full
 * viewport. The real 3D engine (engine.glb) is preloaded and warmed by the
 * Hero while this plays, and mounts underneath the video just before the cut —
 * so no WebGL runs during the main cinematic and playback stays smooth.
 *
 * SOUND: the served clip carries a muxed cinematic mix — the original
 * soundtrack preserved, with a synthesised distant-aircraft → engine-roar
 * swell layered over 0–7.5s (peaking while the cinematic engine rotates) that
 * fades out just before the handoff. Because the roar lives ON the video
 * timeline, muting/unmuting mid-play never drifts out of sync.
 *
 * At CUT_AT_S the clip has reached its final X-ray engine shot (measured frame
 * analysis of the ~10.0s asset: engine macro rotates 5.6–8.0s, dashboard tail
 * begins ~8.0s). The Hero mounts the GLB X-ray twin at matching macro framing,
 * and THIS overlay starts its slow crossfade — crucially the video is NOT
 * paused: it keeps playing while its opacity drops to 0 over ~1.4s (the engine
 * motion continues naturally, exactly like the twin underneath), then pauses.
 *
 * Playback smoothness rules:
 *  - No React state is updated from video time. A single lightweight rAF loop
 *    only watches currentTime for the cut/pause moments.
 *  - The overlay and this component do not re-render per frame.
 */

/** Nominal cut — strongest clean rotating-X-ray-engine frame of the known asset. */
const CUT_AT_S = 7.55;
/** Seconds the video keeps playing while fading (crossfade length). */
const FADE_S = 1.4;
/** Cache-busting asset version so an updated clip can never be served stale. */
const VIDEO_SRC = "/assets/aeris-intro.mp4?v=5";

export function CinematicIntro({
  phase,
  onCut,
}: {
  phase: "cinematic" | "reveal" | "live";
  onCut: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const firedRef = useRef(false);
  const cutAtRef = useRef(CUT_AT_S);
  const [videoOn, setVideoOn] = useState(false);
  const [startPrompt, setStartPrompt] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [initHidden, setInitHidden] = useState(false);
  // Audible-intro state. Browsers only allow UNMUTED autoplay after a user
  // gesture on the page, so the clip starts muted; we probe for audible
  // playback right after it starts and, if the browser refuses, keep it muted
  // and lift the mute on the first gesture / the SOUND toggle (the roar is
  // muxed onto the video timeline, so unmuting mid-play stays in sync).
  const [soundOn, setSoundOn] = useState(false);
  const [soundLocked, setSoundLocked] = useState(false);
  const soundLockedRef = useRef(false);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onCut(); // NOTE: the video is NOT paused here — it keeps playing into the fade.
  }, [onCut]);

  // Manual skip (button / Escape / reduced-motion): end the intro NOW and stop
  // the clip — it must not keep playing invisibly behind the fading overlay.
  const skip = useCallback(() => {
    const v = videoRef.current;
    if (v) v.pause();
    fire();
  }, [fire]);

  // Audible playback. `on = true` unmutes and (re)starts playback — which the
  // browser only honours inside a real user gesture when it blocks unmuted
  // autoplay. If even the gesture-triggered play is refused we fall back to
  // muted playback and stay quiet rather than risk the intro not playing at
  // all. Because the roar is muxed onto the video timeline, sync is inherent.
  const applySound = useCallback((on: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    if (on) {
      v.muted = false;
      const p = v.play();
      if (p) {
        p
          .then(() => setSoundLocked(false))
          .catch(() => {
            // Unmuted playback refused (no user activation) — stay muted but
            // keep the cinematic playing.
            v.muted = true;
            setSoundOn(false);
            setSoundLocked(true);
            const p2 = v.play();
            if (p2) p2.catch(() => setStartPrompt(true));
          });
      } else {
        // play() returned null (unsupported/aborted) — revert to the muted
        // start so state and the actual element never disagree.
        v.muted = true;
        setSoundOn(false);
        setSoundLocked(true);
      }
    } else {
      v.muted = true;
    }
    setSoundOn(on);
  }, []);
  const applySoundRef = useRef(applySound);
  applySoundRef.current = applySound;
  soundLockedRef.current = soundLocked;

  // First user gesture on the page lifts the autoplay sound lock (pointer,
  // touch or keyboard) — the roar picks up exactly where the clip is.
  const unlockSoundOnGesture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !soundLockedRef.current || v.muted === false) return;
    if (v.currentTime >= cutAtRef.current + FADE_S) return; // cinematic already over
    applySoundRef.current(true);
  }, []);

  // Init caption + skip affordance timers.
  useEffect(() => {
    const t1 = window.setTimeout(() => setInitHidden(true), 1500);
    const t2 = window.setTimeout(() => setShowSkip(true), 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Autoplay, started AFTER listeners exist (a pre-hydration autoplay race left
  // the clip playing invisibly once). ReadyState/timeupdate backstops surface
  // the video the moment it genuinely has frames.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true; // always start muted: unmuted autoplay needs a user gesture

    const reveal = () => setVideoOn(true);
    const tryPlay = () => {
      const p = v.play();
      if (p) p.catch(() => setStartPrompt(true));
    };
    const onPlaying = () => {
      setVideoOn(true);
      setStartPrompt(false);
    };
    const onTimeUpdate = () => {
      // Backstop only — bails to a no-op once visible, never drives UI state.
      if (v.currentTime > 0.05) reveal();
    };
    const onEnded = () => fire();
    const onError = () => window.setTimeout(fire, 120);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    const unlock = () => unlockSoundOnGesture();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
    window.addEventListener("keydown", unlock);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      v.pause();
      window.setTimeout(skip, 250);
    } else {
      if (v.ended) {
        try {
          v.currentTime = 0;
        } catch {
          /* seek may fail while loading — play() will cope */
        }
      }
      if (!v.paused && v.currentTime > 0.05 && v.readyState >= 2) {
        reveal();
      } else {
        tryPlay();
      }
      // Hard safety net even if metadata/playback stalls.
      window.setTimeout(fire, (CUT_AT_S + FADE_S + 1.2) * 1000);
      // Probe for audible playback a beat after the clip is rolling: browsers
      // that allow unmuted autoplay keep sound on; those that don't reject the
      // play() and we stay muted until the first gesture above.
      window.setTimeout(() => {
        if (v.paused || v.ended || v.currentTime < 0.02) return;
        applySoundRef.current(true);
      }, 300);
    }
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single lightweight rAF loop — the ONLY per-frame work. It fires the cut at
  // CUT_AT_S and pauses the still-playing video once the crossfade is done.
  useEffect(() => {
    if (phase === "live" || !videoOn) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (!v) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!firedRef.current && v.currentTime >= cutAtRef.current) {
        fire();
      } else if (firedRef.current && v.currentTime >= cutAtRef.current + FADE_S && !v.paused) {
        v.pause();
      } else if (v.ended && !v.paused) {
        v.pause();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, videoOn, fire]);

  // Escape skips the intro.
  useEffect(() => {
    if (phase !== "cinematic") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, skip]);

  if (phase === "live") return null;

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    if (v.duration >= 9.2) {
      cutAtRef.current = CUT_AT_S;
    } else {
      cutAtRef.current = Math.min(CUT_AT_S, Math.max(4.6, v.duration - 2.45));
    }
  };

  const active = phase === "cinematic";

  return (
    <div
      aria-hidden={!active}
      className="fixed inset-0 z-[80] bg-[#040609]"
      style={{
        // The crossfade: opacity 1 → 0 over ~1.4s while the video KEEPS PLAYING
        // (motion continues into the GLB beneath). Pointer events release the
        // instant the fade starts so the live hero is already interactive. The
        // ease-in-out curve lingers on the mid-tones — that is where the video
        // engine and the X-ray twin overlap most, so the dissolve reads as one
        // object transforming instead of a hard hand-off.
        opacity: active ? 1 : 0,
        // Blur-dissolve: as the video fades it also defocuses + brightens, so
        // the emerging X-ray twin beneath reads as one object materialising
        // instead of a hard cross-dissolve of two different renderings.
        filter: active ? "none" : "blur(10px) brightness(1.12)",
        transition: active
          ? "none"
          : `opacity ${FADE_S * 1000}ms cubic-bezier(0.65, 0, 0.35, 1), filter ${FADE_S * 1000}ms cubic-bezier(0.65, 0, 0.35, 1)`,
        pointerEvents: active ? "auto" : "none",
      }}
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

      {/* Sound toggle — engine roar is muxed onto the clip; browsers often
          require a gesture to unlock audio, so this is also the unlock path. */}
      {active && showSkip && !startPrompt && (
        <button
          type="button"
          aria-pressed={soundOn}
          aria-label={soundOn ? "Mute intro audio" : "Enable intro audio"}
          onClick={() => applySound(!soundOn)}
          className="absolute bottom-4 left-4 flex min-h-9 cursor-pointer items-center gap-2 border bg-background/60 px-3 py-1 font-mono text-[10px] tracking-[0.2em] transition-colors backdrop-blur-sm sm:bottom-6 sm:left-6"
          style={{
            borderColor: soundOn ? "rgba(111,216,232,0.45)" : "var(--border)",
            color: soundOn ? "var(--cyan)" : "var(--muted-foreground)",
          }}
        >
          {soundOn ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX
              className="h-3.5 w-3.5"
              style={
                soundLocked
                  ? { color: "var(--cyan)", animation: "aeris-pulse 1.6s ease-in-out infinite" }
                  : undefined
              }
            />
          )}
          {soundOn ? "SOUND ON" : soundLocked ? "ENABLE SOUND" : "SOUND OFF"}
        </button>
      )}

      {/* Skip — after a beat, so accidental taps don't end it instantly. */}
      {active && showSkip && !startPrompt && (
        <button
          type="button"
          onClick={skip}
          className="absolute right-4 bottom-4 flex min-h-9 cursor-pointer items-center gap-2 border border-border bg-background/60 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground transition-colors hover:border-cyan/60 hover:text-cyan backdrop-blur-sm sm:right-6 sm:bottom-6"
        >
          SKIP INTRO <span className="text-cyan/80">ESC</span>
        </button>
      )}

      {/* Autoplay-blocked fallback (should be rare for a muted video). The tap
          is a real user gesture, so it also requests audible playback. */}
      {active && startPrompt && (
        <button
          type="button"
          onClick={() => {
            setStartPrompt(false);
            applySound(true);
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-cyan/60 bg-cyan/10 px-5 py-3 font-mono text-[11px] tracking-[0.22em] text-cyan transition-colors hover:bg-cyan/20 cursor-pointer"
        >
          TAP TO BEGIN — WITH SOUND
        </button>
      )}
    </div>
  );
}