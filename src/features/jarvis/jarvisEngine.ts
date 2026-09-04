/**
 * JARVIS Reasoning & Action Engine.
 * Powered by Google Gemini with multi-model fallback and local reasoning resilience.
 * Performs multi-system causal reasoning, screen understanding, and dynamic action dispatching.
 */

import { JARVIS_CONFIG } from "./jarvisConfig";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPrompt";
import { captureSystemSnapshot, type SystemSnapshot } from "./jarvisContext";
import { useJarvisStore, type JarvisMessage } from "./jarvisStore";
import { useFlightStore } from "@/features/flight-sim/flightStore";

export interface JarvisExecutionResult {
  spokenText: string;
  displayText: string;
  intent: "QUESTION" | "ANALYSIS" | "NAVIGATION" | "UI_ACTION" | "COMBINED";
  actionsExecuted: string[];
}

const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

export async function executeJarvisQuery(
  query: string,
  history: JarvisMessage[]
): Promise<JarvisExecutionResult> {
  const snapshot = captureSystemSnapshot();

  // Format past turns for conversational context
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

  const currentContextPrompt = `
CURRENT LIVE SYSTEM SNAPSHOT:
\`\`\`json
${JSON.stringify(snapshot, null, 2)}
\`\`\`

USER INQUIRY / COMMAND:
"${query}"

Inspect the CURRENT state, correlate cross-system telemetry, ML anomaly scores, environmental conditions, and screen status.
Emit your JSON response matching the required format.
`.trim();

  const payload = {
    contents: [
      ...recentTurns,
      {
        role: "user",
        parts: [{ text: currentContextPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: JARVIS_SYSTEM_PROMPT }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25,
    },
  };

  let rawText: string | null = null;
  let lastError: any = null;

  // Try candidate models with resilience
  for (const model of FALLBACK_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": JARVIS_CONFIG.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) break;
      } else {
        const errText = await response.text();
        lastError = new Error(`${model} HTTP ${response.status}: ${errText}`);
        // If 503 or 429, continue to next fallback model
        if (response.status === 503 || response.status === 429 || response.status === 404) {
          continue;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  let parsed: any;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = null;
        }
      }
    }
  }

  // Fallback to local rule-based intelligence if Gemini API was temporarily unreachable
  if (!parsed) {
    parsed = generateLocalIntelligenceResponse(query, snapshot, lastError);
  }

  const spokenText: string = parsed.spokenText || parsed.spoken || "Standing by.";
  const displayText: string = parsed.displayText || parsed.display || parsed.text || spokenText;
  const intent = parsed.intent || "ANALYSIS";
  const actions: any[] = Array.isArray(parsed.actions) ? parsed.actions : [];

  // Execute actions
  const actionsExecuted: string[] = [];
  const jarvisState = useJarvisStore.getState();
  const flightState = useFlightStore.getState();

  for (const act of actions) {
    if (!act || !act.type) continue;

    switch (act.type) {
      case "NAVIGATE": {
        if (act.route && jarvisState.navHandler) {
          jarvisState.navHandler(act.route);
          actionsExecuted.push(`Navigated to ${act.route}`);
        }
        if (act.tab && jarvisState.gcsTabHandler) {
          jarvisState.gcsTabHandler(act.tab);
          actionsExecuted.push(`Switched tab to ${act.tab}`);
        }
        break;
      }

      case "SET_GCS_TAB": {
        if (act.tab) {
          if (jarvisState.gcsTabHandler) jarvisState.gcsTabHandler(act.tab);
          jarvisState.setActiveGcsTab(act.tab);
          actionsExecuted.push(`Opened ${act.tab} tab`);
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

      case "TOGGLE_FAULT": {
        if (act.fault) {
          flightState.toggleFault(act.fault);
          actionsExecuted.push(`Toggled fault: ${act.fault}`);
        }
        break;
      }

      case "CLEAR_FAULTS": {
        const curFaults = flightState.faults;
        if (curFaults.c2Overheat) flightState.toggleFault("c2Overheat");
        if (curFaults.turboFail) flightState.toggleFault("turboFail");
        if (curFaults.bearingFail) flightState.toggleFault("bearingFail");
        if (curFaults.injectorClog) flightState.toggleFault("injectorClog");
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

      default:
        console.warn("Unrecognized JARVIS action:", act);
    }
  }

  return {
    spokenText,
    displayText,
    intent,
    actionsExecuted,
  };
}

/**
 * Local deterministic intelligence fallback.
 * Uses real engine physics and snapshot telemetry if cloud API is offline.
 */
function generateLocalIntelligenceResponse(
  query: string,
  s: SystemSnapshot,
  _error: any
) {
  const q = query.toLowerCase();

  // 1. Health drop analysis
  if (q.includes("health") || q.includes("drop") || q.includes("degrad")) {
    const isC2Hot = s.telemetry.cht_C[1] > 180 || s.faults.c2Overheat;
    const isTurboBad = s.faults.turboFail;
    const isBearingBad = s.faults.bearingFail || s.telemetry.vibrationRMS_G > 1.2;
    const isInjectorBad = s.faults.injectorClog;

    let primaryCause = "Nominal mechanical wear across baseline parameters.";
    if (isC2Hot) primaryCause = `Cylinder 2 CHT thermal excursion (${s.telemetry.cht_C[1]}°C) exceeding safe cooling bounds.`;
    else if (isBearingBad) primaryCause = `High structural vibration (${s.telemetry.vibrationRMS_G} G) showing 140Hz bearing race micro-spalling.`;
    else if (isTurboBad) primaryCause = `Turbocharger boost shortfall (MAP: ${s.telemetry.manifoldAirPressure_kPa} kPa) causing altitude power loss.`;
    else if (isInjectorBad) primaryCause = `Injector spray imbalance (EGT spread > 40°C) degrading combustion balance.`;

    return {
      spokenText: `Engine health is currently at ${s.telemetry.healthIndex_pct} percent. Primary driver is ${primaryCause}`,
      displayText: `### TELEMETRY HEALTH DEGRADATION ANALYSIS

- **Composite Health**: **${s.telemetry.healthIndex_pct}%** (RUL: **${s.telemetry.rul_hours} Hours**)
- **Anomaly Score**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus} STATUS)
- **Primary Finding**: ${primaryCause}

#### Key Parameter Correlates:
- **Cylinder Head Temp (CHT)**: C1: ${s.telemetry.cht_C[0]}°C | **C2: ${s.telemetry.cht_C[1]}°C** | C3: ${s.telemetry.cht_C[2]}°C | C4: ${s.telemetry.cht_C[3]}°C
- **Vibration RMS**: **${s.telemetry.vibrationRMS_G} G** (Normal < 0.8 G)
- **Manifold Air Pressure**: **${s.telemetry.manifoldAirPressure_kPa} kPa** (Boost: ${s.telemetry.boost_bar} bar)
- **Oil System**: ${s.telemetry.oilTemp_C}°C / ${s.telemetry.oilPressure_bar} bar
- **Recent Delta**: Health Δ ${(s.recentTrends.healthDelta * 100).toFixed(1)}% | CHT Δ ${s.recentTrends.chtMaxDelta > 0 ? "+" : ""}${s.recentTrends.chtMaxDelta}°C`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 2. What am I looking at / Screen analysis
  if (q.includes("looking at") || q.includes("screen") || q.includes("what is this")) {
    return {
      spokenText: `You are on the Ground Control Station viewing the ${s.screen.gcsTab} panel with live aircraft telemetry linked.`,
      displayText: `### ACTIVE SCREEN CONTEXT: GCS // ${s.screen.gcsTab}

You are viewing the **AERIS-TWIN Ground Control Station** monitoring the Rotax 914 AE-P4 engine.

- **Current Route**: \`${s.screen.route}\`
- **Active Subsystem**: \`${s.screen.gcsTab}\`
- **Aircraft State**: Altitude **${s.flight.altitude_ft} FT**, Airspeed **${s.flight.airspeed_knots} KT**, Throttle **${s.telemetry.throttle_pct}%**
- **3D Engine State**: ${s.screen.isEngineExploded ? "Exploded Inspection View" : "Assembled Flight View"} ${s.screen.inspectedPart ? `(Inspecting ${s.screen.inspectedPart})` : ""}
- **Environmental Context**: Biome: **${s.environment.biome.toUpperCase()}**, Density Ratio: **${s.environment.densityRatio}**, Ambient Temp: **${s.environment.ambientTemperature_C}°C**`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 3. What changed / Trends
  if (q.includes("what changed") || q.includes("change") || q.includes("trend")) {
    return {
      spokenText: `Over the past 20 seconds, CHT changed by ${s.recentTrends.chtMaxDelta.toFixed(1)} degrees, vibration changed by ${s.recentTrends.vibrationDelta.toFixed(2)} G, and composite health shifted by ${(s.recentTrends.healthDelta * 100).toFixed(1)} percent.`,
      displayText: `### 20-SECOND TELEMETRY DELTA AUDIT

- **Health Delta**: **${(s.recentTrends.healthDelta * 100).toFixed(1)}%**
- **Max CHT Drift**: **${s.recentTrends.chtMaxDelta > 0 ? "+" : ""}${s.recentTrends.chtMaxDelta.toFixed(1)}°C**
- **EGT Drift**: **${s.recentTrends.egtDelta > 0 ? "+" : ""}${s.recentTrends.egtDelta.toFixed(1)}°C**
- **Vibration Drift**: **${s.recentTrends.vibrationDelta > 0 ? "+" : ""}${s.recentTrends.vibrationDelta.toFixed(2)} G**
- **Oil Pressure**: **${s.recentTrends.oilPressureDelta > 0 ? "+" : ""}${s.recentTrends.oilPressureDelta.toFixed(2)} bar**
- **Oil Temperature**: **${s.recentTrends.oilTempDelta > 0 ? "+" : ""}${s.recentTrends.oilTempDelta.toFixed(1)}°C**`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 4. Altitude & Temperature relationship
  if (q.includes("altitude") && (q.includes("temp") || q.includes("hot") || q.includes("heat"))) {
    return {
      spokenText: `At ${s.flight.altitude_ft} feet, air density ratio is down to ${s.environment.densityRatio}. Reduced mass flow diminishes cylinder cooling while the turbocharger works harder, raising CHT.`,
      displayText: `### ALTITUDE & THERMAL DISSIPATION ANALYSIS

- **Current Flight Altitude**: **${s.flight.altitude_ft} FT**
- **Atmospheric Density Ratio (ρ/ρ0)**: **${s.environment.densityRatio}** (Loss of ${((1 - s.environment.densityRatio) * 100).toFixed(0)}% air density)
- **Cooling Mass Flow**: Mass flow through the cowl radiator decreases proportionally with air density, diminishing convective cooling efficiency by **${((1 - s.environment.densityRatio) * 45).toFixed(0)}%**.
- **Turbocharger TCU Compounding**: The Garrett turbo spins up to compensate for thin air, heating compressed intake air before the manifold.
- **Conclusion**: The elevated temperature is heavily correlated with density altitude stress.`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 5. Navigation commands
  if (q.includes("predictive") || q.includes("diagnostics")) {
    return {
      spokenText: "Switching to Predictive Diagnostics panel and Remaining Useful Life analysis.",
      displayText: "Navigating to **DIAGNOSTICS** tab.",
      intent: "NAVIGATION",
      actions: [{ type: "SET_GCS_TAB", tab: "DIAGNOSTICS" }],
    };
  }

  if (q.includes("sim") || q.includes("simulator") || q.includes("fly")) {
    return {
      spokenText: "Opening 3D Flight Simulator console.",
      displayText: "Navigating to flight simulator console (`/sim`).",
      intent: "NAVIGATION",
      actions: [{ type: "NAVIGATE", route: "/sim" }],
    };
  }

  if (q.includes("live engine") || q.includes("live twin")) {
    return {
      spokenText: "Opening Live Engine Twin view.",
      displayText: "Navigating to **LIVE TWIN** tab.",
      intent: "NAVIGATION",
      actions: [{ type: "SET_GCS_TAB", tab: "LIVE TWIN" }],
    };
  }

  // 6. Explode / 3D actions
  if (q.includes("explode") || q.includes("dismantle")) {
    return {
      spokenText: "Exploding 3D engine model into component inspection zones.",
      displayText: "Executing **JARVIS EXPLODE** on the Rotax 914 3D twin.",
      intent: "UI_ACTION",
      actions: [{ type: "SET_EXPLODED", exploded: true }],
    };
  }

  if (q.includes("assemble")) {
    return {
      spokenText: "Reassembling 3D engine model to flight configuration.",
      displayText: "Assembling Rotax 914 3D twin.",
      intent: "UI_ACTION",
      actions: [{ type: "SET_EXPLODED", exploded: false }],
    };
  }

  if (q.includes("cylinder head")) {
    return {
      spokenText: "Isolating and inspecting Cylinder Head assembly.",
      displayText: "Highlighting **CYLINDER HEAD ASSEMBLY**.",
      intent: "UI_ACTION",
      actions: [
        { type: "SET_GCS_TAB", tab: "LIVE TWIN" },
        { type: "INSPECT_PART", partName: "CYLINDER HEAD" },
      ],
    };
  }

  // Default response
  return {
    spokenText: `Telemetric state is nominal. Engine speed is ${s.telemetry.rpm} RPM at ${s.flight.altitude_ft} feet with health index at ${s.telemetry.healthIndex_pct} percent.`,
    displayText: `### TELEMETRY STATUS REPORT

- **Rotax 914 Speed**: **${s.telemetry.rpm} RPM** (Throttle: **${s.telemetry.throttle_pct}%**)
- **Max CHT**: **${s.telemetry.chtMax_C}°C** | **EGT**: **${s.telemetry.egt_C}°C**
- **Oil System**: **${s.telemetry.oilPressure_bar} bar** | **${s.telemetry.oilTemp_C}°C**
- **Vibration RMS**: **${s.telemetry.vibrationRMS_G} G**
- **Composite Health Index**: **${s.telemetry.healthIndex_pct}%**
- **Estimated RUL**: **${s.telemetry.rul_hours} Hours**

*Standing by for further inquiries or flight commands.*`,
    intent: "QUESTION",
    actions: [],
  };
}
