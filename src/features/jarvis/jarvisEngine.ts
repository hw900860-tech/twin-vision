/**
 * JARVIS Reasoning & Action Engine.
 * Dual-core architecture:
 * 1. Immediate local pre-navigation & flight command dispatcher for instantaneous (0ms) execution.
 * 2. Primary Google Gemini (gemini-3.1-flash-lite) LLM for rich, natural, conversational chatbot intelligence.
 * 3. Guided mission demo, RTB, CAN telemetry faults, and graceful local fallback.
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
 * Identifies explicit commands and runs them in 0ms.
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
 * Main query execution entry point.
 * 1. Executes navigation & UI commands immediately in 0ms.
 * 2. Queries Gemini (gemini-3.1-flash-lite) for natural conversational chatbot intelligence.
 * 3. Falls back gracefully to rich local intelligence if offline.
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

  // 2. QUERY GEMINI (gemini-3.1-flash-lite) FOR NATURAL CONVERSATIONAL INTELLIGENCE
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
                  altitude: `${Math.round(snapshot.flight.altitude_ft)} FT`,
                  airspeed: `${Math.round(snapshot.flight.airspeed_knots)} KT`,
                  health: `${snapshot.telemetry.healthIndex_pct}%`,
                  rpm: Math.round(snapshot.telemetry.rpm),
                  chtMax: `${snapshot.telemetry.chtMax_C}°C`,
                  oilPress: `${snapshot.telemetry.oilPressure_bar} bar`,
                  vib: `${snapshot.telemetry.vibrationRMS_G} G`,
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

  // 3. IF GEMINI SUCCEEDED:
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

  // 4. FALLBACK IF OFFLINE:
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

  // All pages / navigation directory
  if (q.includes("page") || q.includes("where can i go") || q.includes("tabs")) {
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

Hello! I am **J.A.R.V.I.S.** (Joint Aerospace Real-time Virtual Intelligence System), your AI copilot for the AERIS-TWIN platform.

I can assist you with:
- **Universal Navigation**: Command me to open any tab (e.g. *Sensor Matrix*, *Diagnostics*, *Simulation Lab*, *Fleet*, *Reports*) or fly in the *3D Flight Simulator*.
- **Live Engine Intelligence**: Ask about composite health, Remaining Useful Life (RUL), cylinder temperatures, or vibration harmonics.
- **Causal Fault Diagnosis**: Ask *"Why is the health dropping?"* or *"Is the oil pressure nominal?"*
- **3D Digital Twin Interaction**: Command me to *"Explode the engine"*, *"Inspect the cylinder head"*, or *"Assemble the twin"*.
- **General & Aerospace Theory**: Feel free to ask general questions about aviation, science, or technology!`,
      intent: "QUESTION" as const,
      actions: [],
    };
  }

  // General fallback
  return {
    spokenText: `All systems are nominal with engine health at ${s.telemetry.healthIndex_pct} percent, Commander. How can I assist you with the aircraft or general flight operations?`,
    displayText: `### J.A.R.V.I.S. COPILOT ONLINE

I am standing by and monitoring the Rotax 914 AE-P4 digital twin.

- **Current Engine Health**: **${s.telemetry.healthIndex_pct}%**
- **Altitude / Speed**: **${Math.round(s.flight.altitude_ft)} FT** | **${Math.round(s.flight.airspeed_knots)} KT**
- **Active Tab**: \`${s.screen.gcsTab}\` on \`${s.screen.route}\`

You can command me to navigate to any panel (*"open Sensor matrix"*, *"go to fleet"*, *"open flight simulator"*, *"go to homepage"*, *"explore the parts"*), or ask any question about the engine, flight physics, or general topics!`,
    intent: "QUESTION" as const,
    actions: [],
  };
}
