/**
 * JARVIS Reasoning & Action Engine.
 * Tailored for Smart India Hackathon (SIH 2026) Problem Statement 26054 (DRDO / iDEX):
 * "AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs."
 *
 * Architecture:
 * 1. Immediate 0ms local navigation & flight command dispatcher.
 * 2. Instantaneous live telemetry facts engine (altitude, airspeed, position/biome, health, RUL, CHT, oil, PS 26054).
 * 3. Primary Google Gemini (gemini-3.1-flash-lite) LLM for rich, natural conversational chatbot intelligence.
 * 4. Resilient local fallback ensuring specific, exact data is ALWAYS returned.
 */

import { JARVIS_CONFIG } from "./jarvisConfig";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPrompt";
import { captureSystemSnapshot, type SystemSnapshot } from "./jarvisContext";
import { useJarvisStore, type JarvisMessage } from "./jarvisStore";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { scrollToLandingSection } from "./jarvisNavigation";
import {
  startGuidedDemo,
  stopGuidedDemo,
  closeDemoReport,
} from "@/features/flight-sim/guidedDemo";

export interface JarvisExecutionResult {
  spokenText: string;
  displayText: string;
  intent: "QUESTION" | "ANALYSIS" | "NAVIGATION" | "UI_ACTION" | "COMBINED";
  actionsExecuted: string[];
}

export function normalizeGcsTab(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[_-]/g, " ").trim();

  // Sensor Matrix
  if (s.includes("sensor") || s.includes("matrix") || s.includes("gauge") || s.includes("transducer")) {
    return "SENSOR MATRIX";
  }
  // Fleet
  if (s.includes("fleet") || s.includes("uav") || s.includes("aircraft") || s.includes("drone") || s.includes("planes")) {
    return "FLEET";
  }
  // Live Twin
  if (s.includes("live twin") || (s.includes("live") && s.includes("engine")) || (s.includes("3d") && s.includes("engine")) || s === "twin" || s === "live") {
    return "LIVE TWIN";
  }
  // Diagnostics
  if (s.includes("diagnostic") || s.includes("residual") || s.includes("health panel") || s.includes("anomaly")) {
    return "DIAGNOSTICS";
  }
  // Mission Replay
  if (s.includes("mission") || s.includes("blackbox") || s.includes("playback") || (s.includes("flight") && s.includes("record"))) {
    return "MISSION REPLAY";
  }
  // Sortie Replay
  if (s.includes("sortie") || s.includes("flight log") || s.includes("logs")) {
    return "SORTIE REPLAY";
  }
  // Region Log
  if (s.includes("region") || s.includes("geo") || s.includes("excursion") || s.includes("biome") || s.includes("terrain")) {
    return "REGION LOG";
  }
  // Simulation Lab
  if (
    (s.includes("sim") && (s.includes("lab") || s.includes("what") || s.includes("scenario") || s.includes("experiment") || s.includes("test") || s.includes("inject"))) ||
    s === "simulation" ||
    s === "simulation lab" ||
    s === "sim lab" ||
    s === "scenarios"
  ) {
    return "SIMULATION LAB";
  }
  // Maintenance
  if (s.includes("maint") || s.includes("repair") || s.includes("service") || s.includes("advisory") || s.includes("work order") || s.includes("depot") || s.includes("overhaul")) {
    return "MAINTENANCE";
  }
  // Reports
  if (s.includes("report") || s.includes("post flight") || s.includes("debrief") || s.includes("analytics") || s.includes("summary")) {
    return "REPORTS";
  }

  return null;
}

export interface DetectedNavigation {
  actions: any[];
  spokenText: string;
  displayText: string;
  intent: "NAVIGATION" | "UI_ACTION";
}

/**
 * Instant local parser for navigation and UI commands.
 * Identifies explicit commands and executes them in 0ms.
 */
export function detectNavigationFromQuery(query: string): DetectedNavigation | null {
  const q = query.toLowerCase().trim();

  // Strip conversational openers
  const cleanQ = q
    .replace(/^(can you please|could you please|please|jarvis|hey jarvis|ok jarvis|okay jarvis|can you|could you|i want to|let's|lets|show me how to|take me to the|take me to|navigate to the|navigate to|go to the|go to|open the|open up the|open up|open|switch to the|switch to|show the|show)\s+/gi, "")
    .trim();

  // 1. Home / Landing Page / Homepage
  if (
    q.includes("homepage") ||
    cleanQ === "homepage" ||
    cleanQ === "home" ||
    cleanQ === "landing" ||
    cleanQ === "landing page" ||
    cleanQ === "main page" ||
    cleanQ === "front page" ||
    cleanQ === "top" ||
    q.includes("go to home") ||
    q.includes("take me home") ||
    q.includes("back to home") ||
    q.includes("go home") ||
    q.includes("scroll to top")
  ) {
    return {
      intent: "NAVIGATION",
      spokenText: "Navigating to the Home overview.",
      displayText: "Navigating to **Home** (`/`) and scrolling to top hero stage.",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
      ],
    };
  }

  // 2. Exploded View / Component Inspection / Explore Parts
  if (
    q.includes("explore the parts") ||
    q.includes("explore parts") ||
    q.includes("inspect the parts") ||
    q.includes("inspect parts") ||
    q.includes("inspection page") ||
    q.includes("inspection section") ||
    cleanQ === "inspection" ||
    cleanQ === "parts" ||
    q.includes("explode engine") ||
    q.includes("explode the engine") ||
    q.includes("exploded view") ||
    (q.includes("dismantle") && !q.includes("close"))
  ) {
    return {
      intent: "UI_ACTION",
      spokenText: "Navigating to 3D Component Inspection and expanding engine layers.",
      displayText: "Navigating to **Digital Twin Inspection** (`#inspection`) and activating exploded view.",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "inspection" },
        { type: "SET_EXPLODED", exploded: true },
      ],
    };
  }

  // 3. Assemble Engine
  if (q.includes("assemble") || q.includes("put together") || q.includes("reset engine")) {
    return {
      intent: "UI_ACTION",
      spokenText: "Reassembling 3D engine model to flight configuration.",
      displayText: "Assembling Rotax 914 back into nominal flight enclosure.",
      actions: [
        { type: "SET_EXPLODED", exploded: false },
        { type: "OPEN_STUDIO", open: false },
      ],
    };
  }

  // 4. Guided Mission Demo Commands
  if (q.includes("demo") && (q.includes("start") || q.includes("launch") || q.includes("run") || q.includes("begin"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Initiating the guided mission demo. Launching the Himalaya region transect now.",
      displayText: "**GUIDED DEMO LAUNCH** — running the full value chain: launch → transect → turbo fault → GCS alert → MAYDAY → RTB → mission report.",
      actions: [{ type: "START_DEMO" }],
    };
  }

  if (q.includes("demo") && (q.includes("stop") || q.includes("abort") || q.includes("cancel") || q.includes("halt"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Guided demo stopped.",
      displayText: "**GUIDED DEMO STOPPED**.",
      actions: [{ type: "STOP_DEMO" }],
    };
  }

  if (q.includes("return to base") || q.includes(" rtb") || q.startsWith("rtb") || q.includes("come home") || q.includes("head home") || q.includes("fly home")) {
    return {
      intent: "UI_ACTION",
      spokenText: "Return to base engaged. Reducing power to 55 percent and routing home.",
      displayText: "**RTB ENGAGED** — return-to-base navigation active at reduced power. Remaining waypoints will be skipped.",
      actions: [{ type: "RTB" }],
    };
  }

  if (q.includes("dismiss") && (q.includes("report") || q.includes("debrief"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Mission report dismissed.",
      displayText: "**MISSION REPORT CLOSED**.",
      actions: [{ type: "CLOSE_DEMO_REPORT" }],
    };
  }

  // 5. Fault Injections
  if (q.includes("misfire")) {
    return {
      intent: "UI_ACTION",
      spokenText: "Injecting misfire on cylinder 3. Expect rough running, EGT 3 collapse, and erratic injection timing.",
      displayText: "**FAULT INJECTED: MISFIRE CYL 3** — combustion loss on C3: EGT3 collapse ~55°C, knock vibration, timing hunting.",
      actions: [{ type: "INJECT_FAULT", fault: "misfire3" }],
    };
  }

  if (q.includes("overheat") || (q.includes("cylinder 2") && (q.includes("hot") || q.includes("heat")))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Injecting cylinder 2 overheat. Cooling airflow blocked, CHT 2 will spike past 220 degrees.",
      displayText: "**FAULT INJECTED: CYLINDER 2 OVERHEAT** — CHT2 rising >220°C, thermal stress climbing.",
      actions: [{ type: "INJECT_FAULT", fault: "c2Overheat" }],
    };
  }

  if (q.includes("wastegate") || (q.includes("turbo") && (q.includes("fail") || q.includes("inject")))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Injecting wastegate turbo failure. Manifold pressure will collapse with a power loss.",
      displayText: "**FAULT INJECTED: WASTEGATE / TURBO FAILURE** — MAP collapse, power loss, turbo spool shortfall.",
      actions: [{ type: "INJECT_FAULT", fault: "turboFail" }],
    };
  }

  if (q.includes("bearing") && (q.includes("fail") || q.includes("inject") || q.includes("spall"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Injecting bearing fatigue spall. Expect a high amplitude 140 hertz vibration peak in the FFT.",
      displayText: "**FAULT INJECTED: BEARING FATIGUE SPALL** — BPFO 140 Hz peak injected into the vibration spectrum.",
      actions: [{ type: "INJECT_FAULT", fault: "bearingFail" }],
    };
  }

  if (q.includes("clog") || (q.includes("fuel") && q.includes("inject") && q.includes("fail"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "Injecting fuel injector clog. Expect EGT imbalance and cylinder knock.",
      displayText: "**FAULT INJECTED: FUEL INJECTOR CLOG** — EGT runner imbalance >40°C, combustion instability.",
      actions: [{ type: "INJECT_FAULT", fault: "injectorClog" }],
    };
  }

  if (q.includes("clear") && (q.includes("fault") || q.includes("injection"))) {
    return {
      intent: "UI_ACTION",
      spokenText: "All fault injections cleared.",
      displayText: "**ALL FAULT INJECTIONS CLEARED** — engine returned to nominal baseline.",
      actions: [{ type: "CLEAR_FAULTS" }],
    };
  }

  // 6. Mission Context Section
  if (
    q.includes("mission context") ||
    cleanQ === "mission context" ||
    (q.includes("tapas") && (q.includes("mission") || q.includes("context") || q.includes("airframe")))
  ) {
    return {
      intent: "NAVIGATION",
      spokenText: "Navigating to TAPAS BH-201 Mission Context.",
      displayText: "Navigating to Home and scrolling to **03 / MISSION CONTEXT** (`#mission`).",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "mission" },
      ],
    };
  }

  // 7. Foresight Section
  if (q.includes("foresight") || cleanQ === "foresight" || q.includes("future tech") || q.includes("roadmap")) {
    return {
      intent: "NAVIGATION",
      spokenText: "Scrolling to Architectural Foresight.",
      displayText: "Navigating to Home and scrolling to **02 / ARCHITECTURAL FORESIGHT** (`#foresight`).",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "foresight" },
      ],
    };
  }

  // 8. Engine Intelligence Section
  if (q.includes("engine intelligence") || cleanQ === "engine intelligence" || (q.includes("predictive") && q.includes("landing"))) {
    return {
      intent: "NAVIGATION",
      spokenText: "Scrolling to Engine Intelligence on the landing overview.",
      displayText: "Navigating to Home and scrolling to **04 / ENGINE INTELLIGENCE** (`#intelligence`).",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "intelligence" },
      ],
    };
  }

  // 9. 3D Flight Simulator (/sim)
  if (
    q.includes("flight sim") ||
    q.includes("flight simulator") ||
    q.includes("3d simulator") ||
    q.includes("3d flight") ||
    q.includes("cockpit") ||
    cleanQ === "simulator" ||
    cleanQ === "sim" ||
    cleanQ === "cockpit" ||
    q.includes("take control") ||
    q.includes("fly the plane") ||
    q === "fly"
  ) {
    return {
      intent: "NAVIGATION",
      spokenText: "Opening the 3D Flight Simulator cockpit.",
      displayText: "Navigating to **3D Flight Simulator** (`/sim`).",
      actions: [{ type: "NAVIGATE", route: "/sim" }],
    };
  }

  // 10. Ground Control Station Tabs
  const tab = normalizeGcsTab(cleanQ) || normalizeGcsTab(q);
  if (tab) {
    return {
      intent: "NAVIGATION",
      spokenText: `Opening the ${tab.toLowerCase()} panel now.`,
      displayText: `Navigating to GCS **${tab}** panel.`,
      actions: [
        { type: "NAVIGATE", route: "/gcs" },
        { type: "SET_GCS_TAB", tab },
      ],
    };
  }

  // 11. GCS General Dashboard
  if (
    q.includes("gcs") ||
    q.includes("ground control") ||
    q.includes("ground station") ||
    cleanQ === "dashboard" ||
    q.includes("control station")
  ) {
    return {
      intent: "NAVIGATION",
      spokenText: "Navigating to the Ground Control Station.",
      displayText: "Opening **Ground Control Station** (`/gcs`).",
      actions: [{ type: "NAVIGATE", route: "/gcs" }],
    };
  }

  // 12. Auth Routes
  if (q.includes("login") || q.includes("sign in") || q.includes("auth")) {
    const isAdmin = q.includes("admin");
    const route = isAdmin ? "/admin/login" : "/login";
    return {
      intent: "NAVIGATION",
      spokenText: `Opening ${isAdmin ? "Administrator" : "Operator"} login.`,
      displayText: `Navigating to **${isAdmin ? "Admin Login" : "Operator Login"}** (\`${route}\`).`,
      actions: [{ type: "NAVIGATE", route }],
    };
  }

  return null;
}

function normalizeAction(act: any): any {
  if (!act) return null;
  const rawType = (act.type || act.name || act.action || "").toUpperCase().trim();

  if (
    rawType === "SET_GCS_TAB" ||
    rawType === "OPEN_SCREEN" ||
    rawType === "SWITCH_TAB" ||
    rawType === "NAVIGATE_TAB" ||
    rawType === "SELECT_TAB" ||
    rawType === "OPEN_TAB"
  ) {
    const rawTab = act.tab || act.screen || act.parameters?.screen || act.parameters?.tab || act.target;
    return { type: "SET_GCS_TAB", tab: normalizeGcsTab(rawTab) || rawTab };
  }

  if (rawType === "NAVIGATE" || rawType === "GO_TO" || rawType === "OPEN_PAGE" || rawType === "ROUTE") {
    const rawRoute = act.route || act.path || act.parameters?.route || act.parameters?.path;
    const detectedTab = normalizeGcsTab(rawRoute);
    if (detectedTab) {
      return { type: "SET_GCS_TAB", tab: detectedTab };
    }
    return {
      type: "NAVIGATE",
      route: rawRoute || act.route,
      sectionId: act.sectionId || act.section,
      tab: act.tab ? normalizeGcsTab(act.tab) : undefined,
    };
  }

  if (rawType === "SCROLL_TO" || rawType === "SCROLL") {
    return {
      type: "SCROLL_TO",
      sectionId: act.sectionId || act.section || act.id || act.parameters?.sectionId,
    };
  }

  return act;
}

/**
 * Synchronous action execution across GCS, Simulator, 3D Twin, and Guided Demo.
 */
export function executeActions(rawActions: any[]): string[] {
  const actionsExecuted: string[] = [];
  const jarvisState = useJarvisStore.getState();
  const flightState = useFlightStore.getState();

  for (const rawAct of rawActions) {
    const act = normalizeAction(rawAct);
    if (!act || !act.type) continue;

    switch (act.type) {
      case "NAVIGATE": {
        const targetRoute = act.route;
        if (targetRoute) {
          if (targetRoute.includes("#") || targetRoute.startsWith("#")) {
            const [path, hash] = targetRoute.split("#");
            const targetPath = path || "/";
            if (targetPath && typeof window !== "undefined" && window.location.pathname !== targetPath && jarvisState.navHandler) {
              jarvisState.navHandler(targetPath);
            }
            if (hash) {
              scrollToLandingSection(hash, jarvisState.navHandler);
              actionsExecuted.push(`Navigated to ${targetRoute}`);
              break;
            }
          }
          if (jarvisState.navHandler) {
            jarvisState.navHandler(targetRoute);
            actionsExecuted.push(`Navigated to ${targetRoute}`);
          } else if (typeof window !== "undefined") {
            window.location.href = targetRoute;
            actionsExecuted.push(`Navigated to ${targetRoute}`);
          }
        }
        if (act.sectionId) {
          scrollToLandingSection(act.sectionId, jarvisState.navHandler);
          actionsExecuted.push(`Scrolled to section: ${act.sectionId}`);
        }
        if (act.tab) {
          const tabKey = normalizeGcsTab(act.tab);
          if (tabKey) {
            jarvisState.setActiveGcsTab(tabKey);
            if (jarvisState.gcsTabHandler) jarvisState.gcsTabHandler(tabKey);
            actionsExecuted.push(`Switched tab to ${tabKey}`);
          }
        }
        break;
      }

      case "SCROLL_TO": {
        const sid = act.sectionId || act.section || act.id;
        if (sid) {
          scrollToLandingSection(sid, jarvisState.navHandler);
          actionsExecuted.push(`Scrolled to section: ${sid}`);
        }
        break;
      }

      case "SET_GCS_TAB": {
        const tabKey = normalizeGcsTab(act.tab || act.screen);
        if (tabKey) {
          if (typeof window !== "undefined" && window.location.pathname !== "/gcs") {
            if (jarvisState.navHandler) {
              jarvisState.navHandler("/gcs");
            } else {
              window.location.href = "/gcs";
            }
          }
          jarvisState.setActiveGcsTab(tabKey);
          if (jarvisState.gcsTabHandler) {
            jarvisState.gcsTabHandler(tabKey);
          }
          actionsExecuted.push(`Opened ${tabKey} tab`);
        }
        break;
      }

      case "SET_THROTTLE": {
        const val = Number(act.value);
        if (!isNaN(val)) {
          flightState.setThrottle(Math.max(0, Math.min(100, val)));
          actionsExecuted.push(`Set throttle to ${val}%`);
        }
        break;
      }

      case "SET_TARGET_ALTITUDE": {
        const alt = Number(act.value);
        if (!isNaN(alt)) {
          flightState.setTargetAltitude(Math.max(0, alt));
          actionsExecuted.push(`Target altitude set to ${alt} FT`);
        }
        break;
      }

      case "INJECT_FAULT": {
        const key = act.fault as keyof typeof flightState.faults;
        if (key in flightState.faults) {
          if (flightState.faults[key]) {
            actionsExecuted.push(`Fault already active: ${key}`);
          } else {
            flightState.toggleFault(key);
            actionsExecuted.push(`Injected fault: ${key}`);
          }
        }
        break;
      }

      case "TOGGLE_FAULT": {
        if (act.fault) {
          flightState.toggleFault(act.fault);
          actionsExecuted.push(`Toggled fault: ${act.fault}`);
        }
        break;
      }

      case "START_DEMO": {
        startGuidedDemo();
        actionsExecuted.push("Started guided mission demo");
        break;
      }

      case "STOP_DEMO": {
        stopGuidedDemo();
        actionsExecuted.push("Stopped guided mission demo");
        break;
      }

      case "RTB": {
        flightState.triggerRtb();
        actionsExecuted.push("Return-to-base engaged");
        break;
      }

      case "CLOSE_DEMO_REPORT": {
        closeDemoReport();
        actionsExecuted.push("Mission report dismissed");
        break;
      }

      case "CLEAR_FAULTS": {
        const curFaults = flightState.faults;
        if (curFaults.c2Overheat) flightState.toggleFault("c2Overheat");
        if (curFaults.turboFail) flightState.toggleFault("turboFail");
        if (curFaults.bearingFail) flightState.toggleFault("bearingFail");
        if (curFaults.injectorClog) flightState.toggleFault("injectorClog");
        if ((curFaults as any).misfire3) flightState.toggleFault("misfire3" as any);
        actionsExecuted.push("All engine fault injections cleared");
        break;
      }

      case "SET_EXPLODED": {
        const exp = Boolean(act.exploded);
        if (jarvisState.explodeHandler) jarvisState.explodeHandler(exp);
        jarvisState.setIsExploded(exp);
        actionsExecuted.push(exp ? "Engine exploded for inspection" : "Engine assembled");
        break;
      }

      case "INSPECT_PART": {
        if (act.partName) {
          if (jarvisState.partSelectHandler) jarvisState.partSelectHandler(act.partName);
          jarvisState.setSelectedPart(act.partName);
          actionsExecuted.push(`Inspecting component: ${act.partName}`);
        }
        break;
      }

      case "OPEN_STUDIO": {
        const open = Boolean(act.open);
        if (jarvisState.studioHandler) jarvisState.studioHandler(open);
        jarvisState.setIsStudioOpen(open);
        actionsExecuted.push(open ? "Opened Dismantle Studio" : "Closed Dismantle Studio");
        break;
      }

      case "SET_VIZ_MODE": {
        if (act.mode) {
          flightState.setVizMode(act.mode);
          actionsExecuted.push(`Visualizer mode set to ${act.mode}`);
        }
        break;
      }

      case "EXPORT_CSV": {
        flightState.exportCSV();
        actionsExecuted.push("Exported telemetry CSV");
        break;
      }
    }
  }

  return actionsExecuted;
}

/**
 * Deterministic, instant live telemetry and SIH PS 26054 solver.
 * Delivers exact flight numbers, positioning, and problem statement domain mastery in <1ms.
 */
export function tryGenerateTelemetryAndDomainAnswer(
  query: string,
  s: SystemSnapshot
): { spokenText: string; displayText: string; intent?: any; actions?: any[] } | null {
  const q = query.toLowerCase().trim();

  // 1. ALTITUDE / ELEVATION
  if (
    q.includes("altitude") ||
    q.includes("how high") ||
    q.includes("height") ||
    q.includes("elevation") ||
    q.includes("ceiling") ||
    (q.includes("alt") && (q.includes("what") || q.includes("current") || q.includes("is")))
  ) {
    const alt = s.flight.altitude_ft;
    const targetAlt = s.flight.targetAltitude_ft;
    const densityRatio = s.environment.densityRatio;
    return {
      spokenText: `The aircraft is currently maintaining an altitude of ${alt.toLocaleString()} feet MSL at ${s.flight.airspeed_knots} knots, Commander.`,
      displayText: `### ✈️ CURRENT FLIGHT ALTITUDE & VERTICAL PROFILE

- **Current Altitude**: **${alt.toLocaleString()} FT MSL**
- **Target / Assigned Altitude**: **${targetAlt.toLocaleString()} FT**
- **Calibrated Airspeed**: **${s.flight.airspeed_knots} Knots**
- **Density Altitude Ratio**: **${(densityRatio * 100).toFixed(1)}%** (${alt > 18000 ? "High altitude thin-air regime" : "Nominal air density"})
- **Rotax 914 Service Ceiling**: 28,000 FT MSL (Turbine boost active)
- **Cooling Convection Margin**: ${densityRatio < 0.7 ? "Reduced mass flow cooling on cylinder head 2" : "Adequate mass flow cooling"}`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 2. LOCATION / WHERE ARE WE / FLYING REGION / BIOME
  if (
    q.includes("where are we") ||
    q.includes("where we are") ||
    q.includes("where am i") ||
    q.includes("our location") ||
    q.includes("current location") ||
    q.includes("what region") ||
    q.includes("what biome") ||
    q.includes("where flying") ||
    q.includes("flying where") ||
    q.includes("coordinates") ||
    q.includes("position")
  ) {
    const biome = s.environment.biome || "himalaya";
    const biomeFormatted = biome.charAt(0).toUpperCase() + biome.slice(1);
    const stationMap: Record<string, { code: string; name: string; coord: string; desc: string }> = {
      himalaya: { code: "VIH", name: "Leh (Kushok Bakula Rimpoche)", coord: "34.1359° N, 77.5465° E", desc: "High-altitude cold mountain pass with thin atmosphere" },
      desert: { code: "VIJR", name: "Jaisalmer Air Base", coord: "26.8887° N, 70.8653° E", desc: "Extreme hot-arid desert biome with thermal updrafts and dust exposure" },
      coastal: { code: "VOGO", name: "Dabolim Naval Air Station", coord: "15.3808° N, 73.8314° E", desc: "Humid maritime coastal corridor with salt-spray atmospheric boundary" },
      plains: { code: "VISR", name: "Srinagar Air Force Station", coord: "33.9871° N, 74.7741° E", desc: "Sub-alpine valley basin with variable barometric density" },
    };
    const activeStation = stationMap[biome] || stationMap.himalaya;

    return {
      spokenText: `We are currently operating in the ${biomeFormatted} defense theater over ${activeStation.name}, cruising at ${s.flight.altitude_ft.toLocaleString()} feet, heading ${s.flight.heading_deg} degrees North.`,
      displayText: `### 📍 ACTIVE OPERATIONAL DISPOSITION & FLIGHT THEATER

- **Current Location / Waypoint**: **${activeStation.name}** (\`${activeStation.code}\`)
- **Coordinates**: **${activeStation.coord}**
- **Operating Biome**: **${biomeFormatted} Corridor** (${activeStation.desc})
- **Flight Altitude**: **${s.flight.altitude_ft.toLocaleString()} FT MSL** (Airspeed: **${s.flight.airspeed_knots} KT**)
- **Magnetic Heading**: **${s.flight.heading_deg}°** (Pitch: ${s.flight.pitch_deg}°, Roll: ${s.flight.roll_deg}°)
- **Ambient Conditions**: OAT **${s.environment.ambientTemperature_C}°C** | Density Ratio **${(s.environment.densityRatio * 100).toFixed(1)}%**
- **Datalink Status**: Synchronized 20Hz SocketCAN stream`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 3. AIRSPEED / SPEED / HOW FAST
  if (
    q.includes("airspeed") ||
    q.includes("how fast") ||
    q.includes("speed") ||
    q.includes("velocity") ||
    q.includes("knots")
  ) {
    const tas = Math.round(s.flight.airspeed_knots / Math.sqrt(Math.max(0.2, s.environment.densityRatio)));
    return {
      spokenText: `Current calibrated airspeed is ${s.flight.airspeed_knots} knots at ${s.flight.altitude_ft.toLocaleString()} feet MSL, with true airspeed estimated at ${tas} knots.`,
      displayText: `### ⚡ AIRCRAFT SPEED & AERODYNAMIC METRICS

- **Calibrated Airspeed (CAS)**: **${s.flight.airspeed_knots} Knots**
- **True Airspeed (TAS)**: ~**${tas} Knots** (corrected for altitude density ratio ${(s.environment.densityRatio * 100).toFixed(1)}%)
- **Engine Operating Speed**: **${s.telemetry.rpm.toLocaleString()} RPM** (Throttle: **${s.telemetry.throttle_pct}%**)
- **Operational Band**: Safe cruise envelope (Stall: 45 KT | V_ne: 160 KT)`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 4. HEADING / COMPASS / DIRECTION
  if (q.includes("heading") || q.includes("direction") || q.includes("which way") || q.includes("compass")) {
    return {
      spokenText: `Aircraft heading is currently ${s.flight.heading_deg} degrees Magnetic North.`,
      displayText: `### 🧭 AIRCRAFT HEADING & ATTITUDE VECTOR

- **Magnetic Heading**: **${s.flight.heading_deg}°**
- **Pitch Angle**: **${s.flight.pitch_deg}°** (${s.flight.pitch_deg > 0.5 ? "Climbing" : s.flight.pitch_deg < -0.5 ? "Descending" : "Level"})
- **Roll / Bank Angle**: **${s.flight.roll_deg}°** (${Math.abs(s.flight.roll_deg) < 1.5 ? "Wings Level" : "Banking"})
- **Assigned Altitude**: **${s.flight.targetAltitude_ft.toLocaleString()} FT**`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 5. SMART INDIA HACKATHON PROBLEM STATEMENT 26054 (DRDO / IDEX)
  if (
    q.includes("problem statement") ||
    q.includes("26054") ||
    q.includes("sih") ||
    q.includes("drdo") ||
    q.includes("idex") ||
    q.includes("male uav") ||
    q.includes("digital twin system") ||
    q.includes("hackathon")
  ) {
    return {
      spokenText: "AERIS-TWIN is our indigenous cyber-physical Digital Twin built for DRDO Problem Statement 26054, monitoring the Rotax 914 engine for MALE UAVs.",
      displayText: `### 🛡️ DRDO / iDEX PROBLEM STATEMENT 26054: AERIS-TWIN OVERVIEW

**Problem Statement ID**: \`26054\`  
**Organization**: **Defence Research and Development Organisation (DRDO)** / Department of Defence Production (iDEX)  
**Title**: *AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs.*

---

#### ✈️ Operational Defense Context
- **Airframe**: DRDO **TAPAS BH-201** (Rustom-II) MALE UAV (operating weight 2,200 kg, 24–30 hr endurance).
- **Powerplant**: **Rotax 914 F/UL (AE-P4)** — 4-cylinder, 4-stroke boxer, turbocharged, 115 HP aero piston engine.
- **The Core Problem**: Conventional UAV monitoring is threshold-based and reactive (alarms only trigger after catastrophic failure). At 28,000+ FT in thin air, engine degradation leads to mission aborts and UAV asset loss.

---

#### 🚀 AERIS-TWIN Core Architectural Deliverables (A to F):
1. **A. Digital Twin Core Framework**:
   - Continuous **20Hz telemetry synchronization** via simulated SocketCAN bus (\`vcan0\`) with CAN hardware gateway.
   - Interactive 3D Digital Twin with exploded component view and component inspection breakdown.
2. **B. Subsystem Health Monitoring**:
   - 12-sensor live telemetry grid: RPM, CHT (Cylinders 1–4), EGT, Oil Pressure & Temperature, MAP/Boost, Vibration RMS, and 140Hz BPFO bearing harmonics.
3. **C. Intelligent Fault Prediction**:
   - Shifts from reactive thresholds to early causal prediction:
     * **C2 Overheat**: CHT2 thermal excursion detection caused by rear nacelle cowl airflow shadowing.
     * **Bearing Fatigue**: 140Hz BPFO harmonic micro-spalling in vibration spectrum.
     * **Turbo Boost Shortfall**: Electronic wastegate TCU boost collapse at high density altitudes.
     * **Injector Clogging**: EGT runner thermal imbalance spread (>40°C).
4. **D. AI/ML Analytics Layer**:
   - **Variational Autoencoder (VAE)**: Learns multidimensional nominal flight manifolds to extract anomaly residuals.
   - **XGBoost Classifier**: Multi-class root-cause attribution.
   - **Weibull Hazard RUL Prognosis**: Estimates Remaining Useful Life based on cumulative thermal and vibration cycle stress.
5. **E. Mission Simulation & Replay**:
   - Historical blackbox flight replay with scrubbable telemetry timeline.
   - Environmental biome simulations (Himalaya altitude cold, Thar desert heat, Coastal humidity).
   - Autonomous Return-to-Base (RTB) flight commands and guided mission demo.
6. **F. Visualization Dashboard (GCS)**:
   - Defense-grade tactical Ground Control Station with 10 mission panels, 3D exploded twin, and automated per-sortie health report cards.`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 6. ENGINE HEALTH / RUL / DEGRADATION
  if (
    q.includes("health") ||
    q.includes("rul") ||
    q.includes("useful life") ||
    q.includes("lifetime") ||
    q.includes("hours left") ||
    q.includes("overhaul") ||
    q.includes("tbo") ||
    q.includes("why is health") ||
    q.includes("why is the engine health")
  ) {
    const health = s.telemetry.healthIndex_pct;
    const rul = s.telemetry.rul_hours;
    const isC2Hot = s.telemetry.cht_C[1] > 180 || s.faults.c2Overheat;
    const isBearingBad = s.faults.bearingFail || s.telemetry.vibrationRMS_G > 1.2;
    const isTurboBad = s.faults.turboFail;
    const isInjectorBad = s.faults.injectorClog;

    let primaryCause = "Nominal mechanical wear along standard Weibull baseline.";
    if (isC2Hot) {
      primaryCause = `Cylinder 2 CHT thermal excursion (${s.telemetry.cht_C[1]}°C) exceeding safe cooling bounds due to rear nacelle airflow shadowing.`;
    } else if (isBearingBad) {
      primaryCause = `Elevated structural vibration (${s.telemetry.vibrationRMS_G} G) indicating 140Hz outer-race bearing fatigue.`;
    } else if (isTurboBad) {
      primaryCause = `Turbocharger TCU boost shortfall (${s.telemetry.manifoldAirPressure_kPa} kPa) causing high thermal load and power loss.`;
    } else if (isInjectorBad) {
      primaryCause = `Injector spray pattern imbalance across cylinder runners creating combustion asymmetry.`;
    }

    return {
      spokenText: `Engine composite health index is currently at ${health} percent with ${rul.toFixed(0)} operating hours remaining useful life, Commander. ${primaryCause}`,
      displayText: `### 🩺 ROTAX 914 COMPOSITE HEALTH & RUL PROGNOSIS

- **Composite Health Index**: **${health}%** (Status: ${health > 80 ? "NOMINAL" : health > 50 ? "DEGRADED / MONITOR" : "CRITICAL"})
- **Remaining Useful Life (RUL)**: **${rul.toFixed(1)} Operational Hours** (TBO: 1,200 Total Hours)
- **ML Anomaly Score**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus})
- **Primary Diagnostic Finding**: ${primaryCause}

#### Sensor Parameter Matrix:
- **Cylinder Head Temp (CHT)**: C1: ${s.telemetry.cht_C[0]}°C | **C2: ${s.telemetry.cht_C[1]}°C** | C3: ${s.telemetry.cht_C[2]}°C | C4: ${s.telemetry.cht_C[3]}°C
- **Vibration RMS**: **${s.telemetry.vibrationRMS_G} G** (Dominant harmonic: 140 Hz BPFO)
- **Oil System**: **${s.telemetry.oilPressure_bar} bar** / **${s.telemetry.oilTemp_C}°C**
- **Manifold Air Pressure (MAP)**: **${s.telemetry.manifoldAirPressure_kPa} kPa**`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 7. OIL PRESSURE & TEMPERATURE
  if (q.includes("oil") || q.includes("lubric") || (q.includes("pressure") && !q.includes("manifold"))) {
    const press = s.telemetry.oilPressure_bar;
    const temp = s.telemetry.oilTemp_C;
    const isNominal = press >= 3.0 && press <= 5.5 && temp <= 110;
    return {
      spokenText: `Oil pressure is reading ${press.toFixed(2)} bar with oil temperature at ${temp.toFixed(1)} degrees Celsius, rated ${isNominal ? "nominal" : "elevated"}.`,
      displayText: `### 🛢️ LUBRICATION & OIL SYSTEM TELEMETRY

- **Oil Pressure**: **${press.toFixed(2)} bar** (Nominal Operating Band: 3.5 – 5.5 bar | Warning: <3.0 bar)
- **Oil Temperature**: **${temp.toFixed(1)}°C** (Nominal: 80 – 100°C | Warning: >110°C)
- **Viscosity Shear Status**: ${temp > 105 ? "Thermal thinning risk detected" : "Hydrodynamic boundary layer stable"}
- **Assessment**: ${isNominal ? "Nominal operating margins" : "Approaching caution threshold"}`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 8. CHT / CYLINDER HEAD TEMPERATURE
  if (q.includes("cht") || q.includes("cylinder") || (q.includes("temp") && !q.includes("oil"))) {
    const cht = s.telemetry.cht_C;
    const maxCht = Math.max(...cht);
    return {
      spokenText: `Cylinder head temperatures are peaking at ${maxCht.toFixed(1)} degrees Celsius on Cylinder 2 due to rear airflow shadowing.`,
      displayText: `### 🌡️ CYLINDER HEAD TEMPERATURE (CHT) MATRIX

- **Max Cylinder Temp**: **${maxCht.toFixed(1)}°C**
- **Per-Cylinder Distribution**:
  * **Cylinder 1**: ${cht[0].toFixed(1)}°C
  * **Cylinder 2**: **${cht[1].toFixed(1)}°C** ${cht[1] > 175 ? "⚠️ [Elevated Thermal Stress]" : "✓"}
  * **Cylinder 3**: ${cht[2].toFixed(1)}°C
  * **Cylinder 4**: ${cht[3].toFixed(1)}°C
- **Operating Limits**: Normal 140–170°C | Caution >180°C | Critical >220°C`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 9. VIBRATION / BEARING / HARMONICS
  if (q.includes("vibrat") || q.includes("bearing") || q.includes("harmonic") || q.includes("bpfo")) {
    const vib = s.telemetry.vibrationRMS_G;
    return {
      spokenText: `Vibration RMS is reading ${vib.toFixed(2)} G. Spectral analysis tracks a 140 Hz peak corresponding to outer-race bearing harmonics.`,
      displayText: `### 📊 VIBRATION & BEARING SPECTRAL ANALYSIS

- **Vibration RMS**: **${vib.toFixed(2)} G** (Nominal: 0.3 – 0.8 G | Caution: >1.2 G)
- **Spectral Feature**: **140 Hz Peak** (BPFO — Ball Pass Frequency Outer Race)
- **Mechanical Classification**: ${vib > 1.2 ? "Bearing outer-race micro-spalling detected" : "Dynamic balance within aerospace flight limits"}`,
      intent: "QUESTION",
      actions: [],
    };
  }

  return null;
}

/**
 * Main query execution entry point.
 * 1. Executes navigation & UI commands immediately in 0ms.
 * 2. Resolves specific flight & telemetry queries instantly in <1ms.
 * 3. Queries Gemini (gemini-3.1-flash-lite) for natural conversational chatbot intelligence.
 * 4. Falls back gracefully to rich local intelligence if offline.
 */
export async function executeJarvisQuery(
  query: string,
  history: JarvisMessage[]
): Promise<JarvisExecutionResult> {
  const snapshot = captureSystemSnapshot();

  // 1. FAST-PATH: If this is an explicit navigation/action command, execute it immediately in 0ms
  const preNav = detectNavigationFromQuery(query);
  let preActions: string[] = [];
  if (preNav) {
    preActions = executeActions(preNav.actions);
  }

  // 2. FAST-PATH: If this is a specific flight telemetry or SIH PS 26054 inquiry, answer instantly in <1ms
  const instantAnswer = tryGenerateTelemetryAndDomainAnswer(query, snapshot);
  if (instantAnswer) {
    return {
      spokenText: instantAnswer.spokenText,
      displayText: instantAnswer.displayText,
      intent: instantAnswer.intent || (preNav ? preNav.intent : "QUESTION"),
      actionsExecuted: preActions,
    };
  }

  // 3. QUERY GEMINI (gemini-3.1-flash-lite) FOR NATURAL CONVERSATIONAL INTELLIGENCE
  const apiKey = JARVIS_CONFIG.apiKey;
  let parsed: any = null;

  if (apiKey) {
    try {
      const recentTurns = history.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [
          {
            text:
              m.role === "user"
                ? m.content
                : JSON.stringify({ spokenText: m.spokenText, displayText: m.content }),
          },
        ],
      }));

      const payload = {
        contents: [
          ...recentTurns,
          {
            role: "user",
            parts: [
              {
                text: `CURRENT FLIGHT SNAPSHOT:\n${JSON.stringify({
                  route: snapshot.screen.route,
                  gcsTab: snapshot.screen.gcsTab,
                  altitude_ft: snapshot.flight.altitude_ft,
                  airspeed_knots: snapshot.flight.airspeed_knots,
                  heading_deg: snapshot.flight.heading_deg,
                  biome: snapshot.environment.biome,
                  oat_C: snapshot.environment.ambientTemperature_C,
                  health_pct: snapshot.telemetry.healthIndex_pct,
                  rpm: snapshot.telemetry.rpm,
                  chtMax_C: snapshot.telemetry.chtMax_C,
                  oilPress_bar: snapshot.telemetry.oilPressure_bar,
                  vib_G: snapshot.telemetry.vibrationRMS_G,
                  rul_hours: snapshot.telemetry.rul_hours,
                  faults: Object.keys(snapshot.faults).filter((k) => (snapshot.faults as any)[k]),
                })}\n\nUSER INQUIRY / COMMAND:\n"${query}"`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: JARVIS_SYSTEM_PROMPT }],
        },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.6,
        },
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
          }
        }
      }
    } catch (err) {
      console.warn("Gemini query exception:", err);
    }
  }

  // 4. IF GEMINI SUCCEEDED:
  if (parsed) {
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const postActions = executeActions(rawActions);
    const combinedActions = Array.from(new Set([...preActions, ...postActions]));

    return {
      spokenText: parsed.spokenText || preNav?.spokenText || "Standing by, Commander.",
      displayText: parsed.displayText || preNav?.displayText || "Understood.",
      intent: parsed.intent || (preNav ? preNav.intent : "QUESTION"),
      actionsExecuted: combinedActions,
    };
  }

  // 5. FALLBACK IF OFFLINE:
  if (preNav) {
    return {
      spokenText: preNav.spokenText,
      displayText: preNav.displayText,
      intent: preNav.intent,
      actionsExecuted: preActions,
    };
  }

  const localAnswer = generateLocalIntelligenceResponse(query, snapshot);
  return {
    spokenText: localAnswer.spokenText,
    displayText: localAnswer.displayText,
    intent: localAnswer.intent || "QUESTION",
    actionsExecuted: [],
  };
}

/**
 * Rich local fallback response when offline.
 */
function generateLocalIntelligenceResponse(
  query: string,
  s: SystemSnapshot
) {
  const q = query.toLowerCase().trim();

  // Try the specific telemetry & domain solver first
  const specificAnswer = tryGenerateTelemetryAndDomainAnswer(query, s);
  if (specificAnswer) {
    return specificAnswer;
  }

  // All pages / navigation directory
  if (q.includes("page") || q.includes("where can i go") || q.includes("tabs") || q.includes("directory")) {
    return {
      spokenText: "I can navigate to any view across AERIS-TWIN, including all ten Ground Control panels, the 3D Flight Simulator, and the digital twin landing overview. Where would you like to go?",
      displayText: `### 🧭 AERIS-TWIN NAVIGATION DIRECTORY

You can command me to navigate to any of the following views:

#### 📡 Ground Control Station (\`/gcs\`)
- **Sensor Matrix**: Live sensor calibration, signal redundancy, and variance bounds.
- **Fleet**: Fleet tracking, multi-UAV map, and platform readiness status.
- **Live Twin**: Primary real-time 3D engine model and critical telemetry dials.
- **Diagnostics**: Predictive maintenance, RUL estimation, and physics anomaly residuals.
- **Mission Replay**: Historical flight telemetry blackbox playback.
- **Sortie Replay**: Individual sortie logs and aircraft mission records.
- **Region Log**: Geographic biome telemetry and environmental excursion logs.
- **Simulation Lab**: What-if scenario testing and multi-failure injection.
- **Maintenance**: Maintenance advisories, depot service schedules, and work orders.
- **Reports**: Post-flight analytics, flight debriefs, and automated reports.

#### ✈️ 3D Flight Simulator (\`/sim\`)
- Interactive cockpit controls, throttle response, altitude climbs, and real-time aerodynamics.

#### 🏛️ Home & Digital Twin Hero (\`/\`)
- **Live Engine & 3D Explorer** (\`#top\`)
- **Architectural Foresight** (\`#foresight\`)
- **TAPAS BH-201 Mission Context** (\`#mission\`)
- **Engine Intelligence & RUL** (\`#intelligence\`)
- **Explainable Diagnostics** (\`#diagnostics\`)
- **Component Inspection Breakdown** (\`#inspection\`)`,
      intent: "QUESTION" as const,
      actions: [],
    };
  }

  // Greetings
  if (q.includes("hello") || q.includes("hi") || q.includes("hey") || q.includes("good morning") || q.includes("who are you")) {
    return {
      spokenText: "Good day, Commander! All telemetry channels are connected, and I am standing by. How can I assist you today?",
      displayText: `### J.A.R.V.I.S. ONLINE // TACTICAL COPILOT

Hello! I am **J.A.R.V.I.S.** (Joint Aerospace Real-time Virtual Intelligence System), your AI copilot for the AERIS-TWIN platform (SIH Problem Statement 26054 / DRDO).

I can assist you with:
- **Universal Navigation**: Command me to open any tab (*Sensor Matrix*, *Diagnostics*, *Simulation Lab*, *Fleet*, *Reports*) or fly in the *3D Flight Simulator*.
- **Live Flight Metrics**: Ask *"What is the altitude?"*, *"Where are we?"*, or *"How fast are we flying?"*
- **Live Engine Intelligence**: Ask about composite health, Remaining Useful Life (RUL), cylinder temperatures, or vibration harmonics.
- **Causal Fault Diagnosis**: Ask *"Why is the health dropping?"* or *"Is the oil pressure nominal?"*
- **3D Digital Twin Interaction**: Command me to *"Explode the engine"*, *"Inspect the cylinder head"*, or *"Assemble the twin"*.
- **SIH PS 26054 Domain Mastery**: Ask about the DRDO MALE UAV digital twin architecture!`,
      intent: "QUESTION" as const,
      actions: [],
    };
  }

  // General fallback
  return {
    spokenText: `Aircraft is cruising at ${s.flight.altitude_ft.toLocaleString()} feet MSL and ${s.flight.airspeed_knots} knots with engine health at ${s.telemetry.healthIndex_pct} percent, Commander.`,
    displayText: `### J.A.R.V.I.S. COPILOT ONLINE // TELEMETRY CORRELATION

- **Current Altitude / Airspeed**: **${s.flight.altitude_ft.toLocaleString()} FT MSL** | **${s.flight.airspeed_knots} KT** (Heading: **${s.flight.heading_deg}°**)
- **Active Operational Biome**: **${s.environment.biome.toUpperCase()} Corridor** (OAT: **${s.environment.ambientTemperature_C}°C**)
- **Composite Engine Health**: **${s.telemetry.healthIndex_pct}%** (RUL: **${s.telemetry.rul_hours.toFixed(0)} Hours**)
- **Rotax 914 Operating State**: **${s.telemetry.rpm.toLocaleString()} RPM** | CHT Max **${s.telemetry.chtMax_C}°C** | Oil **${s.telemetry.oilPressure_bar} bar**

You can ask me specific questions regarding our altitude, location, problem statement 26054, engine health, or command navigation across any panel!`,
    intent: "QUESTION" as const,
    actions: [],
  };
}
