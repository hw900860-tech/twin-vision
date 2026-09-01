import { useEffect } from "react";
import { useFlightStore } from "@/features/flight-sim/flightStore";

export function GlobalSimulationLoop() {
  useEffect(() => {
    let lastTime = performance.now();

    // 20 Hz background telemetry stream (50ms sampling rate)
    // Matches the authoritative AERIS-TWIN simulation sampling rate without overloading React rendering
    const interval = setInterval(() => {
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
