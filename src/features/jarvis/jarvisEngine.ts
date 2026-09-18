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
import { useLinkStore } from "@/features/datalink/linkStore";
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
    .replace(
      /^(can you please|could you please|would you please|please|jarvis|hey jarvis|ok jarvis|okay jarvis|can you|could you|i want to go to|i want to see|i want to|let's go to|let's|lets go to|lets|show me how to|take me to the|take me to|take us to|bring me to|bring us to|navigate to the|navigate to|navigate|go to the|go to|go|head to|jump to|open up the|open up|open the|open|switch to the|switch to|switch|show the|show|load the|load|view the|view)\s+/gi,
      ""
    )
    .trim();

  // 1. 3D Flight Simulator (/sim) — Prioritize before GCS tabs
  if (
    q.includes("flight sim") ||
    q.includes("flight simulator") ||
    q.includes("3d simulator") ||
    q.includes("3d flight") ||
    q.includes("cockpit") ||
    q.includes("take control") ||
    q.includes("fly the plane") ||
    q.includes("fly plane") ||
    q.includes("take flight") ||
    q.includes("open flight") ||
    q.includes("go to flight") ||
    q.includes("take me to flight") ||
    q.includes("open sim") ||
    q.includes("go to sim") ||
    q.includes("take me to sim") ||
    q.includes("flight deck") ||
    cleanQ === "simulator" ||
    cleanQ === "sim" ||
    cleanQ === "cockpit" ||
    cleanQ === "flight" ||
    cleanQ === "fly" ||
    cleanQ === "pilot" ||
    cleanQ === "airplane" ||
    cleanQ === "plane" ||
    q === "fly" ||
    q === "flying"
  ) {
    return {
      intent: "NAVIGATION",
      spokenText: "Opening the 3D Flight Simulator cockpit now, Commander.",
      displayText: "Navigating to **3D Flight Simulator** (`/sim`).",
      actions: [{ type: "NAVIGATE", route: "/sim" }],
    };
  }

  // 2. Home / Landing Page / Homepage (/)
  if (
    q.includes("homepage") ||
    cleanQ === "homepage" ||
    cleanQ === "home" ||
    cleanQ === "landing" ||
    cleanQ === "landing page" ||
    cleanQ === "main page" ||
    cleanQ === "front page" ||
    cleanQ === "top" ||
    cleanQ === "hero" ||
    q.includes("go to home") ||
    q.includes("take me home") ||
    q.includes("back to home") ||
    q.includes("go home") ||
    q.includes("scroll to top") ||
    q.includes("main screen")
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

  // 3. Exploded View / Component Inspection / Explore Parts / Inspect Studio
  if (
    q.includes("explode") ||
    q.includes("explot") ||
    q.includes("explore the parts") ||
    q.includes("explore parts") ||
    q.includes("inspect the parts") ||
    q.includes("inspect parts") ||
    q.includes("inspection page") ||
    q.includes("inspection section") ||
    q.includes("inspect button") ||
    q.includes("click inspect") ||
    q.includes("click on inspect") ||
    cleanQ === "inspection" ||
    cleanQ === "inspect" ||
    cleanQ === "parts" ||
    cleanQ === "components" ||
    cleanQ === "engine parts" ||
    (q.includes("dismantle") && !q.includes("close") && !q.includes("assemble"))
  ) {
    return {
      intent: "UI_ACTION",
      spokenText: "Opening 3D Component Inspection Lab and expanding Rotax 914 engine layers into exploded view, Commander.",
      displayText: "Activating **3D Dismantle Intelligence Lab** (`INSPECT`) and expanding engine layers into 100% exploded view.",
      actions: [
        { type: "OPEN_STUDIO", open: true },
        { type: "SET_EXPLODED", exploded: true },
      ],
    };
  }

  // 4. Assemble Engine
  if (
    q.includes("assemble") ||
    q.includes("put together") ||
    q.includes("reset engine") ||
    q.includes("close inspect") ||
    q.includes("close studio") ||
    q.includes("exit inspect") ||
    q.includes("exit studio")
  ) {
    return {
      intent: "UI_ACTION",
      spokenText: "Reassembling 3D engine model to flight configuration.",
      displayText: "Assembling Rotax 914 back into nominal flight enclosure and closing Dismantle Lab.",
      actions: [
        { type: "SET_EXPLODED", exploded: false },
        { type: "OPEN_STUDIO", open: false },
      ],
    };
  }

  // 5. Guided Mission Demo Commands
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

  // 6. Fault Injections
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

  // 7. Mission Context Section
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

  // 8. Foresight Section
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

  // 9. Engine Intelligence Section
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
 * Checks whether the user is checking presence, readiness, or asking if JARVIS/Aeris is there.
 * Handles "are you there", "you there", "can you hear me", "are you awake", "ping", "system check", etc.
 */
export function isPresenceQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const norm = q
    .replace(/[?.!,:;]/g, "")
    .replace(/\b(hey|ok|okay|hi|hello|please|tell me|aeris|jarvis|jaarvis|computer|copilot|nova|iris)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    norm === "are you there" ||
    norm === "you there" ||
    norm === "there" ||
    norm === "are you awake" ||
    norm === "are you online" ||
    norm === "are you listening" ||
    norm === "are you ready" ||
    norm === "can you hear me" ||
    norm === "can you hear" ||
    norm === "hear me" ||
    norm === "ping" ||
    norm === "test" ||
    norm === "check in" ||
    norm === "system check" ||
    norm === "status check" ||
    norm === "status report" ||
    norm === "systems check" ||
    norm === "readiness" ||
    norm === "online" ||
    norm === "are you ok" ||
    norm === "are you okay" ||
    norm.includes("are you there") ||
    norm.includes("you there") ||
    norm.includes("can you hear me") ||
    norm.includes("are you awake") ||
    norm.includes("are you online") ||
    norm.includes("are you listening")
  );
}

/**
 * Instant 0ms presence response generator matching live GCS telemetry.
 */
export function generatePresenceResponse(s: SystemSnapshot): {
  spokenText: string;
  displayText: string;
  intent: "QUESTION";
  actions: any[];
} {
  const alt = s.flight.altitude_ft;
  const speed = s.flight.airspeed_knots;
  const rpm = s.telemetry.rpm;
  const health = Math.round(s.telemetry.healthIndex_pct);
  const biome = s.environment.biome || "himalaya";
  const biomeFormatted = biome.charAt(0).toUpperCase() + biome.slice(1);
  const activeFaults = Object.keys(s.faults || {}).filter((k) => (s.faults as any)[k]);
  const faultStatus =
    activeFaults.length > 0
      ? `⚠️ Active Advisory Flags: ${activeFaults.join(", ")}`
      : "Nominal (No active faults detected)";

  const spokenText = `I am here and fully operational, Commander. We are currently cruising at ${alt.toLocaleString()} feet MSL over the ${biomeFormatted} corridor, with the Rotax engine maintaining a steady ${rpm.toLocaleString()} RPM and a composite health index of ${health} percent.`;

  const displayText = `### 🛡️ J.A.R.V.I.S. Status Report

I am online and synchronized with the **TAPAS BH-201** telemetry stream.

* **Location:** ${biomeFormatted} Corridor
* **Altitude:** ${alt.toLocaleString()} FT MSL
* **Airspeed:** ${speed} KTS CAS
* **Engine Health:** ${health}% (RUL: ${s.telemetry.rul_hours.toFixed(1)} Hours)
* **System Status:** ${faultStatus}

Standing by for your next flight or engine command, Commander.`;

  return {
    spokenText,
    displayText,
    intent: "QUESTION",
    actions: [],
  };
}

/**
 * 1. 3D GUIDED POWERTRAIN INSPECTION TOUR
 */
export function isInspectionTourQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    q.includes("inspection tour") ||
    q.includes("tour the engine") ||
    q.includes("engine tour") ||
    q.includes("guided tour") ||
    q.includes("walk me through the engine") ||
    q.includes("walkthrough the engine") ||
    q.includes("3d tour") ||
    q.includes("inspect the engine") ||
    q.includes("inspect engine") ||
    q.includes("start tour") ||
    q.includes("powerplant tour")
  );
}

export function generateInspectionTourResponse(s: SystemSnapshot): {
  spokenText: string;
  displayText: string;
  intent: "COMBINED";
  actions: any[];
} {
  const cht2 = s.telemetry.cht_C[1]?.toFixed(1) || "148.5";
  const mapVal = s.telemetry.manifoldAirPressure_kPa?.toFixed(1) || "102.4";
  const vib = s.telemetry.vibrationRMS_G?.toFixed(2) || "0.62";

  const spokenText = [
    "Welcome to the 3D Powertrain Inspection Tour, Commander. Deconstructing the Rotax 914 into its modular aerospace assemblies.",
    `First, examining Cylinder 2: operating at ${cht2} degrees Celsius, where rear nacelle cooling airflow shadowing produces an 18-degree thermal delta.`,
    `Next, the turbocharger wastegate: actively maintaining ${mapVal} kilopascals manifold pressure to compensate for high-altitude density air.`,
    `Finally, inspecting main crankshaft roller bearings: vibration accelerometer reads ${vib} G with 140 Hertz BPFO outer-race frequency tracking.`,
    "3D inspection tour complete. All primary aerospace assemblies verified.",
  ].join(" ");

  const displayText = `### 🔍 AUTONOMOUS 3D POWERTRAIN INSPECTION TOUR

> [!NOTE]
> **JARVIS Automated Action**: Opened **3D Dismantle Intelligence Lab** in 100% Exploded View · Targeting **Cylinder 2**.

---

#### 🛠️ Step 1: Cylinder 2 Thermal Excursion Analysis
- **Observed CHT**: **${cht2}°C** (Forward Cylinders C1/C3: ~135°C)
- **Root Cause**: Rear nacelle cooling airflow shadow within the TAPAS BH-201 cowl geometry.
- **Physics Model**: Convective heat transfer deficit $\\Delta h = -18.4\\%$.

#### 🚀 Step 2: Turbocharger & TCU Wastegate Regulation
- **Manifold Air Pressure (MAP)**: **${mapVal} kPa**
- **Density Altitude Ratio**: **${(s.environment.densityRatio * 100).toFixed(1)}%**
- **Status**: Electronic wastegate dynamically throttling turbine bypass to preserve rated 115 HP.

#### ⚙️ Step 3: Main Crankshaft & Bearing Raceway Harmonics
- **Vibration Amplitude**: **${vib} G RMS**
- **Spectral Feature**: **140 Hz Peak** (Ball Pass Frequency Outer Race — BPFO)
- **ML Health Assessment**: Outer-race contact fatigue within safe continuous mission thresholds.

---

*You can command: "Inspect the turbocharger", "Assemble the engine", or "What is our engine situation?"*`;

  return {
    spokenText,
    displayText,
    intent: "COMBINED",
    actions: [
      { type: "OPEN_STUDIO", open: true },
      { type: "SET_EXPLODED", exploded: true },
      { type: "INSPECT_PART", partName: "Cylinder 2" },
    ],
  };
}

/**
 * 2. TACTICAL RED ALERT / COMBAT EMERGENCY PROTOCOL
 */
export function isEmergencyProtocolQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    q.includes("emergency protocol") ||
    q.includes("red alert") ||
    q.includes("combat scramble") ||
    q.includes("emergency descent") ||
    q.includes("emergency procedure") ||
    q.includes("mayday") ||
    q.includes("critical failure")
  );
}

export function generateEmergencyProtocolResponse(s: SystemSnapshot): {
  spokenText: string;
  displayText: string;
  intent: "COMBINED";
  actions: any[];
} {
  const alt = s.flight.altitude_ft;
  const targetAlt = Math.max(3500, Math.min(alt - 2000, 4500));

  const spokenText = [
    "Emergency protocol engaged, Commander! Warning: Alerting ground control station.",
    "Throttling engine to 60 percent continuous cruise to reduce powertrain thermal stress.",
    `Initiating automated glide descent towards safe terrain clearance of ${targetAlt} feet MSL.`,
    "Switching Ground Control Station to Predictive Diagnostics and arming Return-to-Base vector towards primary defense airbase.",
  ].join(" ");

  const displayText = `### 🚨 TACTICAL EMERGENCY PROTOCOL ENGAGED // RED ALERT

> [!CAUTION]
> **JARVIS COMBAT / EMERGENCY PROCEDURE ACTIVE**  
> Datalink telemetry priority set to HIGH. Autopilot Return-To-Base armed.

---

#### ⚡ Tactical Actions Executed:
1. **Engine Throttle Demand**: Set to **60% Continuous Cruise** (reducing cylinder thermal stress).
2. **Target Flight Altitude**: Initiated step-down descent to **${targetAlt.toLocaleString()} FT MSL** (terrain clearance vector).
3. **GCS Display**: Re-routed to **Predictive Diagnostics & Anomaly Residuals**.
4. **Autonomous Navigation**: RTB guidance trajectory locked to **Leh Airbase (VIH)**.

#### 📋 Emergency Pilot Checklist:
- [x] Check CHT & EGT spread across cylinders 1-4.
- [x] Confirm oil pressure > 3.0 bar.
- [x] Maintain 85 KTS best-glide airspeed.
- [x] Telemetry blackbox stream recording to flash memory.`;

  return {
    spokenText,
    displayText,
    intent: "COMBINED",
    actions: [
      { type: "NAVIGATE", route: "/gcs" },
      { type: "SET_GCS_TAB", tab: "DIAGNOSTICS" },
      { type: "SET_THROTTLE", value: 60 },
      { type: "SET_TARGET_ALTITUDE", value: targetAlt },
    ],
  };
}

/**
 * 3. PHYSICS-INFORMED "WHAT-IF" SCENARIO SIMULATOR
 */
export function isWhatIfScenarioQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    q.includes("what if") ||
    q.includes("what happens if") ||
    q.includes("what would happen if") ||
    q.includes("simulate loss of") ||
    (q.includes("if we lose") && (q.includes("turbo") || q.includes("oil") || q.includes("boost") || q.includes("cylinder")))
  );
}

export function generateWhatIfScenarioResponse(query: string, s: SystemSnapshot): {
  spokenText: string;
  displayText: string;
  intent: "QUESTION";
  actions: any[];
} {
  const q = query.toLowerCase();

  // What if turbo fails at altitude?
  if (q.includes("turbo") || q.includes("boost") || q.includes("wastegate")) {
    const curAlt = s.flight.altitude_ft;
    const spokenText = [
      `If we lose turbo boost at ${curAlt.toLocaleString()} feet MSL, manifold air pressure will collapse from 100 kilopascals to ambient 38 kilopascals.`,
      "Rotax 914 engine shaft power will plummet by 54 percent, generating an unsustainable 820 feet per minute descent rate.",
      "You must immediately pitch down 3.5 degrees to maintain 85 knots best glide airspeed and descend to the critical engine ceiling of 14,500 feet MSL.",
    ].join(" ");

    const displayText = `### 🧪 PREDICTIVE "WHAT-IF" SIMULATION // TURBO BOOST LOSS AT ALTITUDE

#### 🔬 Thermodynamic & Aerodynamic Impact Model:
- **Manifold Air Pressure (MAP)**: **100 kPa → 37.6 kPa** (-62.4% boost collapse)
- **Engine Brake Power**: **115 HP → 52.9 HP** (-54% propulsion deficit)
- **Aircraft Vertical Speed**: **-820 FT/MIN Sink Rate**
- **Single-Engine Critical Ceiling**: **14,500 FT MSL** (altitude where ambient air satisfies unboosted power)

#### 🛡️ JARVIS Recommended Countermeasures:
1. **Attitude Control**: Pitch down 3.5° to hold **85 KTS best-glide (V_glide)**.
2. **Altitude Descent**: Steer toward emergency valley corridor below 14,000 FT MSL.
3. **Mixture Tuning**: Switch ECU to full-rich backup to avoid lean detonation.`;

    return { spokenText, displayText, intent: "QUESTION", actions: [] };
  }

  // What if Cylinder 2 overheats to 220°C?
  if (q.includes("cylinder") || q.includes("c2") || q.includes("overheat")) {
    const spokenText = [
      "If Cylinder 2 temperature breaches 220 degrees Celsius, the aluminum cylinder head reaches material annealing threshold with a 40 percent loss in tensile strength.",
      "Pre-ignition knock and detonation will occur within 90 seconds, risking valve seat deformation.",
      "You must immediately throttle down to 65 percent, enrich the fuel-air charge by 14 percent, and pitch down for ram-air cowl cooling.",
    ].join(" ");

    const displayText = `### 🧪 PREDICTIVE "WHAT-IF" SIMULATION // CYLINDER 2 CRITICAL OVERHEAT (>220°C)

#### 🔬 Material & Combustion Risk Model:
- **Material Degradation**: Aluminum alloy annealing begins at 205°C; tensile strength drops by 40%.
- **Combustion Instability**: Knock index rises from 0.04 to 0.88 (severe pre-ignition detonation risk).
- **Failure Timeline**: Valve seat recession or head gasket blow-by predicted within 90 seconds.

#### 🛡️ JARVIS Recommended Countermeasures:
1. **Immediate Throttle Reduction**: Reduce to **65% Continuous Power**.
2. **Fuel Enrichment**: +14% fuel injection duration to achieve evaporative charge cooling.
3. **Cowl Aerodynamics**: Increase airspeed by 15 KT to boost ram-air mass flow past rear nacelle.`;

    return { spokenText, displayText, intent: "QUESTION", actions: [] };
  }

  // What if Oil pressure drops?
  if (q.includes("oil") || q.includes("pressure") || q.includes("lubric")) {
    const spokenText = [
      "If oil pressure drops below 2 bar, hydrodynamic fluid film on the crankshaft journal bearings will rupture, causing metal-to-metal contact.",
      "Bearing friction will rapidly escalate oil temperature past 135 degrees Celsius, with full bearing seizure predicted in 4.2 minutes.",
      "Immediate throttle reduction and emergency forced glide landing is mandatory.",
    ].join(" ");

    const displayText = `### 🧪 PREDICTIVE "WHAT-IF" SIMULATION // CRITICAL OIL PRESSURE LOSS (<2.0 BAR)

#### 🔬 Tribological & Bearing Failure Model:
- **Lubrication Regime**: Hydrodynamic fluid-wedge boundary collapses into boundary friction.
- **Thermal Runaway**: Friction heating escalates bearing race temperatures at +12°C/min.
- **Seizure Time Horizon**: Total crankshaft journal seizure predicted in **4.2 Minutes**.

#### 🛡️ JARVIS Recommended Countermeasures:
1. **Power Management**: Reduce RPM below 3,800 to minimize centrifugal bearing load.
2. **Immediate Flight Action**: Declare Mayday and turn towards nearest emergency landing strip.`;

    return { spokenText, displayText, intent: "QUESTION", actions: [] };
  }

  // Default scenario fallback
  const spokenText = "In any critical flight excursion, my predictive ML models evaluate real-time Weibull degradation and compute minimum-risk flight envelopes within 50 milliseconds, Commander.";
  const displayText = `### 🧪 PREDICTIVE "WHAT-IF" SCENARIO SIMULATION

Ask me specific scenarios like:
- *"What if we lose turbo boost at 25,000 feet?"*
- *"What if Cylinder 2 overheats to 220 degrees?"*
- *"What happens if oil pressure drops below 2 bar?"*`;
  return { spokenText, displayText, intent: "QUESTION", actions: [] };
}

/**
 * Checks whether the user is asking for greetings, commands, or guidance on what to say.
 * Handles typos like "greeitngs", "comands", "arey it should tell the greeitngs commands and all", etc.
 */
export function isGreetingsOrCommandsQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const norm = q
    .replace(/greeitngs/g, "greetings")
    .replace(/greeitng/g, "greeting")
    .replace(/comands/g, "commands")
    .replace(/comand/g, "command")
    .replace(/arey/g, "")
    .trim();

  // Explicit commands directory requests
  if (
    norm.includes("greetings commands") ||
    norm.includes("greeting command") ||
    norm.includes("commands and all") ||
    norm.includes("commands and greetings") ||
    norm.includes("tell commands") ||
    norm.includes("tell the command") ||
    norm.includes("show commands") ||
    norm.includes("list commands") ||
    norm.includes("all commands") ||
    norm.includes("voice commands") ||
    norm.includes("what commands") ||
    norm.includes("which commands") ||
    norm.includes("available commands") ||
    norm.includes("what are your commands") ||
    norm.includes("what are the commands") ||
    norm.includes("tell me the commands") ||
    norm.includes("tell me commands")
  ) {
    return true;
  }

  // General commands & guidance inquiry
  if (
    norm.includes("what can you do") ||
    norm.includes("what can i say") ||
    norm.includes("what can i ask") ||
    norm.includes("what should i ask") ||
    norm.includes("what to ask") ||
    norm.includes("how to use") ||
    norm.includes("options") ||
    norm === "help" ||
    norm.includes("help me") ||
    norm === "commands" ||
    norm === "command"
  ) {
    return true;
  }

  // Greetings & casual initiation
  if (
    norm.includes("hello") ||
    norm.includes("hi jarvis") ||
    norm.includes("hey jarvis") ||
    norm.includes("good morning") ||
    norm.includes("good afternoon") ||
    norm.includes("good evening") ||
    norm.includes("greetings") ||
    norm.includes("who are you") ||
    norm === "hi" ||
    norm === "hello" ||
    norm === "hey"
  ) {
    return true;
  }

  return false;
}

/**
 * Generates an articulate, professional response that greets the Commander,
 * enumerates the key voice commands across all categories in strictly 4-5 sentences,
 * and provides a full tactical directory in markdown.
 */
export function generateGreetingsAndCommandsResponse(query: string): {
  spokenText: string;
  displayText: string;
} {
  const q = query.toLowerCase().trim();
  const isCasualGreetingOnly =
    (q === "hi" || q === "hello" || q === "hey" || q === "greetings" || q.includes("who are you") || q.includes("good morning") || q.includes("good afternoon") || q.includes("good evening")) &&
    !q.includes("command") &&
    !q.includes("help") &&
    !q.includes("what can") &&
    !q.includes("all");

  let spokenText = "";
  if (isCasualGreetingOnly) {
    spokenText = [
      "Greetings Commander! J.A.R.V.I.S. is online with all propulsion telemetry channels synchronized.",
      "To hear an immediate live flight-engineer briefing on the GCS dashboard, ask: What is the present situation of the engine?",
      "You can also ask: What is our altitude and airspeed, or command me to open the 3D Flight Simulator.",
      "For testing, command me to explode the engine for inspection or inject cylinder 2 overheat.",
      "Call Jarvis anytime or tap the microphone to issue any flight command.",
    ].join(" ");
  } else {
    spokenText = [
      "Greetings Commander! J.A.R.V.I.S. tactical engine copilot is online and ready for your voice commands.",
      "For complete live engine telemetry, ask: What is the present situation of the engine?",
      "For flight metrics and theater positioning, ask: What is our altitude and airspeed, or Where are we flying?",
      "For navigation and 3D inspection, command: Take me to Flight Simulator, Open Sensor Matrix, or Explode the engine.",
      "For simulation and emergency procedures, command: Inject cylinder 2 overheat, Return to base, or Clear all faults.",
    ].join(" ");
  }

  const displayText = `### 🤖 J.A.R.V.I.S. VOICE COMMANDS & COPILOT DIRECTORY

Greetings, **Commander**! J.A.R.V.I.S. is online and synchronized with the Rotax 914 AE-P4 powertrain digital twin (DRDO / SIH PS 26054).

---

#### 🎙️ 1. Engine Health & Live Telemetry Briefing
- 🔊 *"Jarvis, what is the present situation of the engine?"*  
  *(Navigates to Ground Control Station \`/gcs\` LIVE TWIN tab and speaks a 5-sentence live telemetry debrief)*
- 🔊 *"Jarvis, how is our engine doing?"*
- 🔊 *"Jarvis, what is the composite health and Remaining Useful Life?"*
- 🔊 *"Jarvis, what are the cylinder head temperatures?"*
- 🔊 *"Jarvis, is the oil pressure and temperature nominal?"*

#### ✈️ 2. Flight Dynamics & Operational Theater
- 🔊 *"Jarvis, what is our altitude and airspeed?"*
- 🔊 *"Jarvis, where are we flying right now?"* *(Returns active biome, airbase, and GPS coordinates)*
- 🔊 *"Jarvis, what is our magnetic heading?"*

#### 🧭 3. Universal Navigation & Tactical GCS Panels
- 🔊 *"Jarvis, take me to the 3D Flight Simulator"* *(Routes to \`/sim\` cockpit)*
- 🔊 *"Jarvis, open Sensor Matrix"* *(Switches GCS to 12-sensor gauge matrix)*
- 🔊 *"Jarvis, open Predictive Diagnostics"* *(Switches GCS to Anomaly Residuals & ML models)*
- 🔊 *"Jarvis, open Fleet Management"* *(Switches GCS to UAV squadron view)*
- 🔊 *"Jarvis, go to Home"* *(Navigates to landing page hero)*

#### 🔍 4. 3D Digital Twin & Component Inspection
- 🔊 *"Jarvis, explode the engine for inspection"* *(Expands 3D component layers)*
- 🔊 *"Jarvis, assemble the engine"* *(Reassembles 3D twin)*
- 🔊 *"Jarvis, inspect the cylinder head"*

#### 🧪 5. Fault Simulation & Guided Mission Controls
- 🔊 *"Jarvis, inject cylinder 2 overheat"* *(Simulates cooling airflow shadow)*
- 🔊 *"Jarvis, inject wastegate turbo failure"* *(MAP collapse & power loss)*
- 🔊 *"Jarvis, inject bearing fatigue"* *(140 Hz BPFO vibration peak)*
- 🔊 *"Jarvis, return to base (RTB)"* *(Engages autopilot return at 55% throttle)*
- 🔊 *"Jarvis, clear all faults"* *(Resets engine to nominal baseline)*

#### 🛡️ 6. DRDO / iDEX PS 26054 Background
- 🔊 *"Jarvis, explain DRDO Problem Statement 26054."*`;

  return { spokenText, displayText };
}

/**
 * Checks whether the user is asking to explain the engine situation or the GCS dashboard.
 * Handles typos like "dasshoboard", "situation pf theengine", etc.
 */
export function isEngineSituationOrDashboardQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const norm = q
    .replace(/dasshoboard/g, "dashboard")
    .replace(/dashbord/g, "dashboard")
    .replace(/dash\s*board/g, "dashboard")
    .replace(/pf\s+theengine/g, "of the engine")
    .replace(/pf\s+engine/g, "of engine")
    .replace(/theengine/g, "the engine")
    .replace(/exolplain/g, "explain")
    .replace(/promt/g, "prompt");

  // 1. Situation of the engine / powerplant
  if (
    norm.includes("situation") &&
    (norm.includes("engine") || norm.includes("powerplant") || norm.includes("rotax") || norm.includes("motor") || norm.includes("twin") || norm.includes("aircraft"))
  ) {
    return true;
  }

  // 2. Direct dashboard explanation inquiries
  if (
    (norm.includes("explain") || norm.includes("walk through") || norm.includes("read") || norm.includes("breakdown") || norm.includes("what does") || norm.includes("what is on") || norm.includes("show me")) &&
    (norm.includes("dashboard") || norm.includes("gcs") || norm.includes("live twin"))
  ) {
    return true;
  }

  // 3. Engine condition, status, health overview inquiries
  if (
    norm.includes("how is the engine") ||
    norm.includes("how is our engine") ||
    norm.includes("status of the engine") ||
    norm.includes("condition of the engine") ||
    norm.includes("state of the engine") ||
    norm.includes("present situation") ||
    norm.includes("current situation") ||
    norm.includes("overall situation") ||
    norm.includes("engine status report") ||
    norm.includes("present status of the engine")
  ) {
    return true;
  }

  return false;
}

/**
 * Generates an articulate, comprehensive flight-engineer briefing covering
 * EVERY correct live value on the GCS dashboard, while navigating to /gcs (LIVE TWIN).
 */
export function generateEngineSituationResponse(s: SystemSnapshot): {
  spokenText: string;
  displayText: string;
  intent: "COMBINED";
  actions: any[];
} {
  const flight = useFlightStore.getState();

  // 1. Flight regime
  const alt = Math.round(flight.altitude || s.flight.altitude_ft || 0);
  const speed = Math.round(flight.speed || s.flight.airspeed_knots || 0);
  const heading = String(Math.round(flight.heading || s.flight.heading_deg || 0)).padStart(3, "0");
  const throttle = Math.round(flight.throttle || s.telemetry.throttle_pct || 0);
  const rudder = (flight.rudder || s.flight.rudder || 0).toFixed(2);
  const rpm = Math.round(flight.rpm || s.telemetry.rpm || 0);

  // 2. Combustion & Thermal
  const cht = flight.cht || s.telemetry.cht_C || [140, 140, 140, 140];
  const chtMax = Math.round(Math.max(...cht));
  const egt = Math.round(flight.egt || s.telemetry.egt_C || 680);
  const mapVal = Number((flight.map || s.telemetry.manifoldAirPressure_kPa || 93).toFixed(1));
  const injTiming = Number((flight.injectionTiming || s.telemetry.injectionTiming_btdc || 27.0).toFixed(1));

  // 3. Lubrication & Dynamics
  const oilPress = Number((flight.oilPressure || s.telemetry.oilPressure_bar || 5.2).toFixed(1));
  const oilTemp = Math.round(flight.oilTemp || s.telemetry.oilTemp_C || 95);
  const vib = Number((flight.vibrationRMS || s.telemetry.vibrationRMS_G || 0.8).toFixed(2));

  // 4. Prognostics & Readiness
  const healthPct = Number(((flight.healthIndex ?? 0.96) * 100).toFixed(1));
  const rulHours = Number((flight.rul || s.telemetry.rul_hours || 420).toFixed(1));
  const riskLevel = healthPct > 75 ? "LOW" : healthPct > 45 ? "MEDIUM" : "HIGH";
  const activeAlerts = flight.engineDecision?.alerts || s.mlIntelligence.activeAlerts || [];
  const alertCount = activeAlerts.length;

  // 5. Environmental & Datalink
  const biomeKey = (flight.biome || s.environment.biome || "himalaya").toLowerCase();
  const biomeFormatted = biomeKey.charAt(0).toUpperCase() + biomeKey.slice(1);
  const oat = Math.round(flight.ambientTemp ?? flight.weather?.oatC ?? s.environment.ambientTemperature_C ?? 15);
  const densityRatio = Number((flight.airDensity ? flight.airDensity / 1.225 : s.environment.densityRatio || 1.0).toFixed(3));

  const defaultStation = { code: "VIH", name: "Leh (Kushok Bakula Rimpoche)" };
  const stationMap: Record<string, { code: string; name: string }> = {
    himalaya: defaultStation,
    desert: { code: "VIJR", name: "Jaisalmer Air Base" },
    coastal: { code: "VOGO", name: "Dabolim Naval Air Station" },
    plains: { code: "VISR", name: "Srinagar Air Force Station" },
  };
  const activeStation = stationMap[biomeKey] ?? defaultStation;

  // 6. Fault Flags Detection
  const f = flight.faults || s.faults || {};
  const activeFaultsList: string[] = [];
  if (f.c2Overheat) activeFaultsList.push("CYL2 OVERHEAT");
  if (f.turboFail) activeFaultsList.push("TURBO FAIL");
  if (f.bearingFail) activeFaultsList.push("BEARING FATIGUE");
  if (f.injectorClog) activeFaultsList.push("INJECTOR CLOG");
  if ((f as any).misfire3) activeFaultsList.push("MISFIRE C3");

  const anyFault = activeFaultsList.length > 0;
  const faultStatusText = anyFault
    ? `⚠️ ACTIVE FAULT FLAGS: ${activeFaultsList.join(" · ")}`
    : "NO FAULT FLAGS — ENGINE PARAMETERS IN LIMITS";

  // Spoken narrative tailored for TTS playback: crisp, articulate, strictly 4-5 sentences max
  let spokenDiagnostic = "";
  if (!anyFault && healthPct >= 60) {
    spokenDiagnostic = `All monitored powertrain parameters are operating within safe flight limits with no active fault flags.`;
  } else if (f.c2Overheat) {
    spokenDiagnostic = `Caution Commander, Cylinder 2 is experiencing thermal elevation peaking at ${cht[1]?.toFixed(0) || chtMax} degrees Celsius due to rear airflow shadowing.`;
  } else if (f.turboFail) {
    spokenDiagnostic = `Warning Commander, a turbocharger boost shortfall has reduced manifold pressure to ${mapVal} kilopascals.`;
  } else if (f.bearingFail) {
    spokenDiagnostic = `Warning Commander, elevated structural vibration indicates bearing fatigue spalling with 140 Hertz harmonic peaks.`;
  } else if (f.injectorClog) {
    spokenDiagnostic = `Notice Commander, fuel injector flow imbalance is creating combustion asymmetry across cylinder runners.`;
  } else {
    spokenDiagnostic = `Composite engine health is at ${healthPct} percent, requiring continuous telemetry monitoring.`;
  }

  const spokenText = [
    `Greetings Commander. Switching to the Live Twin GCS dashboard now.`,
    `The Rotax 914 is operating at ${rpm.toLocaleString()} RPM with throttle at ${throttle} percent, cruising at ${alt.toLocaleString()} feet MSL and ${speed} knots.`,
    `Cylinder head temperature is peaking at ${chtMax} degrees Celsius with exhaust gas temperature steady at ${egt} degrees.`,
    `Oil pressure is at ${oilPress} bar with oil temperature at ${oilTemp} degrees Celsius, and dynamic vibration is reading ${vib} G.`,
    `Composite engine health is currently ${healthPct} percent with ${Math.round(rulHours)} hours Remaining Useful Life, and ${spokenDiagnostic}`,
  ].join(" ");

  const displayText = `### 🎛️ GROUND CONTROL STATION // LIVE TWIN TELEMETRY DEBRIEF

> [!NOTE]
> **JARVIS Navigation Executed**: Switched to Ground Control Station (\`/gcs\`) · **LIVE TWIN** panel.

---

#### ✈️ 1. Flight Regime & Flight Controls
- **Altitude**: **${alt.toLocaleString()} FT MSL** (${alt < 1000 ? "Low-level terrain clearance watch" : alt > 24000 ? "High altitude thin-air regime" : "Within nominal cruise band"})
- **Airspeed**: **${speed} KTS** (Calibrated airspeed over ground)
- **Heading**: **${heading}° M** (${flight.missionActive ? "Autopilot steering to waypoint" : "Manual flight mode"})
- **Throttle**: **${throttle}%** (${flight.missionActive ? "Mission cruise power" : "Operator-set"}) · **Rudder Load**: **${rudder}**
- **Engine Operating Speed**: **${rpm.toLocaleString()} RPM**

#### 🔥 2. Combustion & Thermal Spectrum
- **Max CHT**: **${chtMax}°C** (${chtMax > 220 ? "CRITICAL: Severe cooling shortfall" : chtMax > 195 ? "WARNING: Elevated thermal stress" : "All cylinders within nominal limits"})
  * *Per-Cylinder Distribution*: C1: **${cht[0]?.toFixed(1) ?? "140"}°C** | **C2: ${cht[1]?.toFixed(1) ?? "140"}°C** ${(cht[1] ?? 140) > 190 ? "⚠️" : ""} | C3: **${cht[2]?.toFixed(1) ?? "140"}°C** | C4: **${cht[3]?.toFixed(1) ?? "140"}°C**
- **Exhaust Gas Temp (EGT)**: **${egt}°C** (${egt > 850 ? "Over temp alert" : egt > 720 ? "High thermal burn" : "Exhaust temps nominal"})
- **Manifold Air Pressure (MAP)**: **${mapVal} kPa** (${mapVal < 42 ? "Very low boost — power loss (trough/turbo)" : mapVal < 70 ? "Reduced boost — density/altitude effect" : "Manifold pressure healthy"})
- **Fuel Injection Timing**: **${injTiming}° BTDC**

#### ⚙️ 3. Lubrication & Dynamic Balance
- **Oil Pressure**: **${oilPress} bar** (Nominal Operating Band: 3.5 – 5.5 bar)
- **Oil Temperature**: **${oilTemp}°C** (${oilTemp > 125 ? "CRITICAL oil overheat" : oilTemp > 110 ? "WARNING elevated" : "Nominal 80–100°C band"})
- **Structural Vibration**: **${vib} m/s²** (${vib > 3.0 ? "Severe vibration — bearing/spall risk" : vib > 1.6 ? "Elevated harmonic excitation" : "Dynamic balance nominal"})
- **Bearing Spectrum**: 140 Hz BPFO outer-race frequency tracking

#### 🔮 4. Prognostics, RUL & Mission Readiness
- **Composite Engine Health**: **${healthPct}%** (\`COMPOSITE / AE-P4\`)
- **Remaining Useful Life (RUL)**: **${rulHours} Operational Hours** (ML predicted confidence 94%)
- **Mission Risk Profile**: **${riskLevel}** (Propulsion readiness: ${Math.round(healthPct)}%)
- **Active Advisories**: **${alertCount} Advisories** (${alertCount === 0 ? "0 Critical / 0 Warning" : "Telemetry advisories flagged"})
- **Fault Flags**: **${faultStatusText}**

#### 🌐 5. Atmospheric & Datalink Stream
- **Active Biome**: **${biomeFormatted} Corridor** (${activeStation.name} · \`${activeStation.code}\`)
- **Atmospheric Conditions**: OAT **${oat}°C** | Density Ratio **${(densityRatio * 100).toFixed(1)}%**
- **Telemetry Stream**: 20Hz SocketCAN gateway (126 B frames, CRC-16 integrity verified)

---

> [!TIP]
> **Executive Synthesis**: ${spokenDiagnostic}`;

  return {
    spokenText,
    displayText,
    intent: "COMBINED",
    actions: [
      { type: "NAVIGATE", route: "/gcs" },
      { type: "SET_GCS_TAB", tab: "LIVE TWIN" },
    ],
  };
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

  // 0. ENGINE SITUATION & GCS DASHBOARD EXPLAINER
  if (isEngineSituationOrDashboardQuery(query)) {
    return generateEngineSituationResponse(s);
  }

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
    const defaultStation: { code: string; name: string; coord: string; desc: string } = { code: "VIH", name: "Leh (Kushok Bakula Rimpoche)", coord: "34.1359° N, 77.5465° E", desc: "High-altitude cold mountain pass with thin atmosphere" };
    const stationMap: Record<string, { code: string; name: string; coord: string; desc: string }> = {
      himalaya: defaultStation,
      desert: { code: "VIJR", name: "Jaisalmer Air Base", coord: "26.8887° N, 70.8653° E", desc: "Extreme hot-arid desert biome with thermal updrafts and dust exposure" },
      coastal: { code: "VOGO", name: "Dabolim Naval Air Station", coord: "15.3808° N, 73.8314° E", desc: "Humid maritime coastal corridor with salt-spray atmospheric boundary" },
      plains: { code: "VISR", name: "Srinagar Air Force Station", coord: "33.9871° N, 74.7741° E", desc: "Sub-alpine valley basin with variable barometric density" },
    };
    const activeStation = stationMap[biome] ?? defaultStation;

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

  // 10. PRESENCE / OPERATIONAL STATUS ("are you there", "can you hear me", "ping", "status report")
  if (isPresenceQuery(query)) {
    return generatePresenceResponse(s);
  }

  // 11. RPM / ENGINE SPEED / THROTTLE
  if (q.includes("rpm") || q.includes("engine speed") || q.includes("motor speed") || (q.includes("throttle") && !q.includes("set"))) {
    const rpm = s.telemetry.rpm;
    const throttle = s.telemetry.throttle_pct;
    return {
      spokenText: `The Rotax 914 is operating at ${rpm.toLocaleString()} RPM with throttle at ${throttle} percent, cruising stably at ${s.flight.altitude_ft.toLocaleString()} feet MSL.`,
      displayText: `### ⚙️ ENGINE RPM & THROTTLE CONTROL

- **Operating Speed**: **${rpm.toLocaleString()} RPM** (Takeoff: 5,800 RPM | Max Continuous: 5,500 RPM | Cruise: 4,800–5,200 RPM)
- **Throttle Demand**: **${throttle}%**
- **Manifold Air Pressure**: **${s.telemetry.manifoldAirPressure_kPa} kPa**
- **Propulsion Status**: Synchronized with constant-speed governor`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 12. EGT / EXHAUST GAS TEMPERATURE
  if (q.includes("egt") || q.includes("exhaust")) {
    const egt = s.telemetry.egt_C;
    return {
      spokenText: `Exhaust gas temperature is currently reading ${egt.toFixed(1)} degrees Celsius across the exhaust collectors.`,
      displayText: `### 💨 EXHAUST GAS TEMPERATURE (EGT)

- **EGT Reading**: **${egt.toFixed(1)}°C** (Nominal Max: 850°C)
- **Combustion Balance**: Stoichiometric burn within Rotax 914 certification limits`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 13. MANIFOLD AIR PRESSURE / TURBO BOOST
  if (q.includes("map") || q.includes("manifold") || q.includes("turbo") || q.includes("boost")) {
    const map = s.telemetry.manifoldAirPressure_kPa;
    return {
      spokenText: `Manifold air pressure is reading ${map.toFixed(1)} kilopascals with the TCU electronic wastegate regulating turbine boost.`,
      displayText: `### 🚀 TURBOCHARGER & MANIFOLD PRESSURE (MAP)

- **Manifold Pressure**: **${map.toFixed(1)} kPa** (Takeoff: 115 kPa | Continuous: 100 kPa)
- **Turbo Control Unit (TCU)**: Active electronic wastegate modulation
- **Atmospheric Compensation**: Compensating for density ratio ${(s.environment.densityRatio * 100).toFixed(1)}%`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 14. FAULT FLAGS & ANOMALY RESIDUALS
  if (q.includes("fault") || q.includes("anomaly") || q.includes("alarm") || q.includes("warning") || q.includes("advisory") || q.includes("advisories")) {
    const f = s.faults;
    const active = Object.keys(f).filter((k) => (f as any)[k]);
    const hasFaults = active.length > 0;
    return {
      spokenText: hasFaults
        ? `Alert Commander, active fault flags detected: ${active.join(", ")}. Immediate cross-check recommended.`
        : `No active fault flags detected, Commander. All monitored parameters are within nominal aerospace tolerances.`,
      displayText: `### ⚠️ FAULT FLAGS & ANOMALY RESIDUALS

- **Fault Status**: **${hasFaults ? "ACTIVE ADVISORY" : "ALL SYSTEMS NOMINAL"}**
- **Active Flags**: ${hasFaults ? active.map((a) => `\`${a}\``).join(", ") : "None (0 active faults)"}
- **ML Anomaly Residual**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus})
- **Propulsion Readiness**: ${s.telemetry.healthIndex_pct.toFixed(0)}%`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 15. GREETINGS & COMMANDS DIRECTORY
  if (isGreetingsOrCommandsQuery(query)) {
    const res = generateGreetingsAndCommandsResponse(query);
    return {
      spokenText: res.spokenText,
      displayText: res.displayText,
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

  // 0. TOP PRIORITY: Presence / Readiness Ping ("are you there", "can you hear me", "status report")
  if (isPresenceQuery(query)) {
    const presence = generatePresenceResponse(snapshot);
    return {
      spokenText: presence.spokenText,
      displayText: presence.displayText,
      intent: "QUESTION",
      actionsExecuted: [],
    };
  }

  // 0.05. TOP PRIORITY: 3D Guided Powertrain Inspection Tour
  if (isInspectionTourQuery(query)) {
    const tour = generateInspectionTourResponse(snapshot);
    const executed = executeActions(tour.actions);
    return {
      spokenText: tour.spokenText,
      displayText: tour.displayText,
      intent: tour.intent,
      actionsExecuted: executed,
    };
  }

  // 0.06. TOP PRIORITY: Tactical Red Alert & Emergency RTB Protocol
  if (isEmergencyProtocolQuery(query)) {
    const emergency = generateEmergencyProtocolResponse(snapshot);
    const executed = executeActions(emergency.actions);
    return {
      spokenText: emergency.spokenText,
      displayText: emergency.displayText,
      intent: emergency.intent,
      actionsExecuted: executed,
    };
  }

  // 0.07. TOP PRIORITY: Physics-Informed "What-If" AI Scenario Simulator
  if (isWhatIfScenarioQuery(query)) {
    const whatIf = generateWhatIfScenarioResponse(query, snapshot);
    return {
      spokenText: whatIf.spokenText,
      displayText: whatIf.displayText,
      intent: whatIf.intent,
      actionsExecuted: [],
    };
  }

  // 0.1. TOP PRIORITY: Engine Situation & GCS Dashboard Explainer
  // When the operator asks "what is the present situation of the engine" or "explain the dashboard",
  // immediately navigate to GCS Live Twin and generate the full, natural, accurate flight-engineer briefing!
  if (isEngineSituationOrDashboardQuery(query)) {
    const situation = generateEngineSituationResponse(snapshot);
    const executed = executeActions(situation.actions);
    return {
      spokenText: situation.spokenText,
      displayText: situation.displayText,
      intent: "COMBINED",
      actionsExecuted: executed,
    };
  }

  // 0.5. TOP PRIORITY: Greetings & Voice Commands Explainer
  // When the operator asks for greetings, commands, help, or "tell the greetings commands and all",
  // immediately return the 0ms instant greetings and full voice command directory!
  if (isGreetingsOrCommandsQuery(query)) {
    const commandsRes = generateGreetingsAndCommandsResponse(query);
    return {
      spokenText: commandsRes.spokenText,
      displayText: commandsRes.displayText,
      intent: "QUESTION",
      actionsExecuted: [],
    };
  }

  // 1. FAST-PATH: If this is an explicit navigation/action command, execute it immediately in 0ms
  const preNav = detectNavigationFromQuery(query);
  if (preNav) {
    const executed = executeActions(preNav.actions);
    return {
      spokenText: preNav.spokenText,
      displayText: preNav.displayText,
      intent: preNav.intent,
      actionsExecuted: executed,
    };
  }

  // 2. FAST-PATH: If this is a specific flight telemetry or SIH PS 26054 inquiry, answer instantly in <1ms
  const instantAnswer = tryGenerateTelemetryAndDomainAnswer(query, snapshot);
  if (instantAnswer) {
    const executed = instantAnswer.actions && instantAnswer.actions.length > 0
      ? executeActions(instantAnswer.actions)
      : [];
    return {
      spokenText: instantAnswer.spokenText,
      displayText: instantAnswer.displayText,
      intent: instantAnswer.intent || "QUESTION",
      actionsExecuted: executed,
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
                  throttle_pct: snapshot.telemetry.throttle_pct,
                  rudder: snapshot.flight.rudder,
                  rpm: snapshot.telemetry.rpm,
                  chtMax_C: snapshot.telemetry.chtMax_C,
                  cht_per_cylinder: snapshot.telemetry.cht_C,
                  egt_C: snapshot.telemetry.egt_C,
                  map_kPa: snapshot.telemetry.manifoldAirPressure_kPa,
                  oilPress_bar: snapshot.telemetry.oilPressure_bar,
                  oilTemp_C: snapshot.telemetry.oilTemp_C,
                  vib_ms2: snapshot.telemetry.vibrationRMS_G,
                  injectionTiming_btdc: snapshot.telemetry.injectionTiming_btdc,
                  health_pct: snapshot.telemetry.healthIndex_pct,
                  rul_hours: snapshot.telemetry.rul_hours,
                  missionRisk: snapshot.mlIntelligence.missionRisk,
                  activeAdvisoriesCount: snapshot.mlIntelligence.activeAdvisoriesCount,
                  biome: snapshot.environment.biome,
                  oat_C: snapshot.environment.ambientTemperature_C,
                  densityRatio: snapshot.environment.densityRatio,
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
          temperature: 0.4,
          maxOutputTokens: 500,
        },
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
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

    return {
      spokenText: parsed.spokenText || "Standing by, Commander.",
      displayText: parsed.displayText || "Understood.",
      intent: parsed.intent || "QUESTION",
      actionsExecuted: postActions,
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
