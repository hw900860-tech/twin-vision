import { useEffect } from "react";
import { flightAudio } from "./flightEngineAudio";
import { useFlightStore } from "./flightStore";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Audio for the flight simulator — the ONLY sound UI in the product.
 *
 * Synchronised to the existing HIGH ALT / HIGH TEMP mission state events
 * (nothing fires from merely SELECTING the scenario — only once a running
 * mission reaches each stage):
 *
 *   NORMAL FLIGHT — continuous engine/airflow voice driven by live RPM +
 *                   airspeed (spooling up on mission start).
 *   ENGINE STRESS — once the mission is active and its stall window begins
 *                   (store: rpm/airspeed sag from ~3 s as engine health
 *                   falls), the engine voice gains a deeper gritty strain
 *                   layer that swells as healthIndex drops.
 *   ENGINE FAILURE — the instant health collapses, the store crosses into
 *                   forcedLanding ("ENGINE HEALTH 0% — EMERGENCY LANDING").
 *                   That edge plays a one-shot mechanical failure (deep
 *                   strain → metallic vibration → pneumatic release → rapid
 *                   RPM drop → rupture), then the engine voice cuts fast.
 *   AFTER FAILURE  — only wind/airflow ambience remains during the descent.
 *   CRASH          — the crashed edge plays a realistic impact + structure
 *                    settling + engine shutdown.
 *   RESTART        — a fresh mission re-follows telemetry; the engine spools
 *                    back up and the sequence can replay.
 *
 * Browsers block audio until a user gesture — the first click/tap/keystroke
 * on the sim page unlocks the bus; nothing else is required.
 */
export function FlightSimAudio() {
  useEffect(() => {
    // Set once the scenario's failure has actually played (cleared on a new
    // mission), so engine-dead ambience only applies after a real failure.
    let failureLatched = false;

    // Drive the audio from the CURRENT store snapshot (used by the unlock
    // gesture and by every store update). Never causes React re-renders.
    const drive = () => {
      const s = useFlightStore.getState();
      const crashed = s.emergencyState === "crashed";
      const isHighAlt = s.missionPreset === "highAltitudeFailure";
      const rpmN = clamp01((s.rpm - 900) / 5000);
      const windN = clamp01((s.speed * 0.5144) / 60);

      if (crashed) return; // impact already played; engine parked

      if (isHighAlt && failureLatched && s.emergencyState === "forcedLanding") {
        // Engine dead — wind/airflow ambience while the UAV tumbles down.
        // The store decays airspeed, so we shape a descent wind envelope
        // from the emergency timer (0 → touchdown ≈ 12 s).
        const et = s.emergencyTimer;
        const windEnv =
          0.5 * Math.min(1, et / 1.5) * Math.max(0, Math.min(1, (12 - et) / 4));
        flightAudio.fly(0, Math.max(windN * 0.3, windEnv), 0);
        return;
      }

      if (isHighAlt && s.missionActive && s.emergencyState === "nominal") {
        // Strain builds after the stall onset (~3 s) as healthIndex falls
        // toward 0 — the deeper, strained engine tone before failure.
        const el = s.missionElapsed;
        const strain =
          el >= 3
            ? clamp01((el - 3) / 6) * (0.35 + 0.65 * clamp01((1 - s.healthIndex) * 1.5))
            : 0;
        flightAudio.fly(rpmN, windN, strain);
        return;
      }

      // Nominal cruise / manual flight / any other scenario / pre-start.
      flightAudio.fly(rpmN, windN, 0);
    };

    const unlock = () => {
      void flightAudio.unlock().then(drive);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    // zustand vanilla subscription — fires with (state, prevState) on every
    // 50 ms telemetry tick without re-rendering React.
    const unsub = useFlightStore.subscribe((s, prev) => {
      const isHighAlt = s.missionPreset === "highAltitudeFailure";

      // Fresh mission → allow the whole sequence to replay.
      if (s.missionActive && !prev.missionActive) failureLatched = false;

      // CRASH edge — realistic impact + structure settling.
      if (s.emergencyState === "crashed" && prev.emergencyState !== "crashed") {
        flightAudio.crash();
        return;
      }

      // ENGINE FAILURE edge (HIGH ALT run only) — health hit 0 →
      // forcedLanding. Gated on the mission being active so selecting the
      // scenario alone never fires the failure sound.
      if (
        isHighAlt &&
        s.missionActive &&
        s.emergencyState === "forcedLanding" &&
        prev.emergencyState !== "forcedLanding" &&
        !failureLatched
      ) {
        failureLatched = true;
        flightAudio.engineFail();
      }

      drive();
    });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      unsub();
      flightAudio.shutdown();
    };
  }, []);

  return null;
}
