/** Emergency state union mirrored from flightStore (numeric codes live in protocol.ts). */
export type EmergencyCode = 0 | 1 | 2 | 3;

export type LinkMode = "LOS" | "SATCOM" | "OUTAGE";
export type LinkRole = "offline" | "airborne" | "ground";
export type WsStatus = "connecting" | "online" | "offline";
