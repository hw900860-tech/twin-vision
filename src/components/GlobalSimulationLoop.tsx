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
      const link = useLinkStore.getState();
      // If an airborne stream is actively transmitting frames over the network link,
      // let the remote network packets drive the GCS display.
      // Otherwise, keep the 20Hz Rotax 914 engine physics running locally so the
      // GCS dashboard live dials, RPM, CHT, oil, and flight metrics dynamically update in real time!
      if (link.role === "ground" && link.airborneOnline && link.rxFrames > 0 && link.lastFrameAgeMs < 2000) {
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
