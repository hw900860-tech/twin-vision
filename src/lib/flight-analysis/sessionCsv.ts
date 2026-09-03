/**
 * AERIS-TWIN telemetry CSV serialization — the single source of truth for the
 * exported file format. Used both by the live "EXPORT CSV" buttons and by the
 * post-flight analytics flow when it converts the current session into a CSV
 * for debrief analysis (Feature C).
 */

import type { TelemetryLogEntry } from "@/features/flight-sim/flightStore";

export const TELEMETRY_CSV_HEADERS =
  "timestamp,altitude,speed,verticalSpeed,pitch,roll,heading,throttle,engineLoad,rpm,map,boost,cht1,cht2,cht3,cht4,egt1,egt2,egt3,egt4,oilTemp,oilPressure,vibrationRMS,health,faultState";

export function serializeTelemetryLogs(logs: TelemetryLogEntry[]): string {
  const rows = logs.map((l) =>
    `${l.timestamp},${l.altitude.toFixed(1)},${l.speed.toFixed(1)},${l.verticalSpeed.toFixed(1)},${l.pitch.toFixed(2)},${l.roll.toFixed(2)},${l.heading.toFixed(1)},${l.throttle.toFixed(1)},${l.engineLoad.toFixed(1)},${l.rpm.toFixed(0)},${l.map.toFixed(1)},${l.boost.toFixed(2)},${l.cht1.toFixed(1)},${l.cht2.toFixed(1)},${l.cht3.toFixed(1)},${l.cht4.toFixed(1)},${l.egt1.toFixed(1)},${l.egt2.toFixed(1)},${l.egt3.toFixed(1)},${l.egt4.toFixed(1)},${l.oilTemp.toFixed(1)},${l.oilPressure.toFixed(2)},${l.vibrationRMS.toFixed(3)},${l.health.toFixed(1)},${l.faultState}`
  );
  return [TELEMETRY_CSV_HEADERS, ...rows].join("\n");
}
