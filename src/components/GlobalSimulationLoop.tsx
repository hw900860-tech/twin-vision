import { useEffect } from "react";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { useLinkStore } from "@/features/datalink/linkStore";

export function GlobalSimulationLoop() {
  useEffect(() => {
    let lastTime = performance.now();

    // 20 Hz background telemetry stream (50ms sampling rate)
    // Matches the authoritative AERIS-TWIN simulation sampling rate without overloading React rendering.
    // A GROUND window (/gcs receiving over the datalink) does NOT run its own
    // physics — it renders only what crossed the wire. AIRBORNE / OFFLINE windows tick.
    const interval = setInterval(() => {
      if (useLinkStore.getState().role === "ground") {
        lastTime = performance.now();
        return;
      }
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      useFlightStore.getState().tick(delta);
    }, 50);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return null;
}
