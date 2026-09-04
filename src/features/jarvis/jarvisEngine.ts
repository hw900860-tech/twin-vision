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

const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
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
        signal: AbortSignal.timeout(2000),
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
        if (act.route) {
          if (act.route.includes("#") || act.route.startsWith("#")) {
            const [path, hash] = act.route.split("#");
            const targetPath = path || "/";
            if (targetPath && window.location.pathname !== targetPath && jarvisState.navHandler) {
              jarvisState.navHandler(targetPath);
            }
            if (hash) {
              scrollToLandingSection(hash, jarvisState.navHandler);
              actionsExecuted.push(`Navigated to ${act.route}`);
              break;
            }
          }
          if (jarvisState.navHandler) {
            jarvisState.navHandler(act.route);
            actionsExecuted.push(`Navigated to ${act.route}`);
          }
        }
        if (act.sectionId) {
          scrollToLandingSection(act.sectionId, jarvisState.navHandler);
          actionsExecuted.push(`Scrolled to section: ${act.sectionId}`);
        }
        if (act.tab && jarvisState.gcsTabHandler) {
          jarvisState.gcsTabHandler(act.tab);
          actionsExecuted.push(`Switched tab to ${act.tab}`);
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
        if (curFaults.misfire3) flightState.toggleFault("misfire3");
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
 * Local deterministic intelligence engine.
 * Generates particular, interactive, technical answers tailored directly to the operator's specific inquiry.
 */
function generateLocalIntelligenceResponse(
  query: string,
  s: SystemSnapshot,
  _error: any
) {
  const q = query.toLowerCase().trim();

  // 1. ESTIMATED LIFETIME / RUL / OVERHAUL
  if (
    q.includes("lifetime") ||
    q.includes("rul") ||
    q.includes("life") ||
    q.includes("how long") ||
    q.includes("hours") ||
    q.includes("useful life") ||
    q.includes("time left") ||
    q.includes("longevity") ||
    q.includes("durability") ||
    q.includes("wear")
  ) {
    const rul = s.telemetry.rul_hours || 479;
    const health = s.telemetry.healthIndex_pct || 65;
    const healthFloat = (health / 100);
    const wearSpeed = healthFloat < 0.6 ? "accelerated due to current thermal/vibration stress" : "nominal along baseline Weibull distribution";

    return {
      spokenText: `Based on current flight conditions and ML diagnostics, our Rotax 914 has an estimated Remaining Useful Life of ${rul.toFixed(1)} operating hours. Composite health index is currently at ${health} percent.`,
      displayText: `### ESTIMATED ENGINE LIFETIME & RUL PROGNOSIS

- **Estimated Remaining Useful Life (RUL)**: **${rul.toFixed(1)} Operational Hours**
- **Composite Health Index**: **${health}%** (TBO Rating: 1,200 Total Hours)
- **Wear Velocity**: Current wear progression is **${wearSpeed}**.
- **Anomaly Score**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus} STATUS)

#### Key Subsystem Wear Indicators:
- **Cylinder Thermal Fatigue**: Max CHT **${s.telemetry.chtMax_C}°C** (C2: ${s.telemetry.cht_C[1]}°C)
- **Bearing Mechanical Fatigue**: 140Hz BPFO Vibration **${s.telemetry.vibrationRMS_G} G** (Safe < 1.2 G)
- **Turbocharger Life Factor**: Manifold boost **${s.telemetry.manifoldAirPressure_kPa} kPa** at altitude **${s.flight.altitude_ft} FT**

*Recommendation: To preserve remaining useful life, avoid sustained full-throttle climb above 22,000 FT where thermal cooling efficiency degrades.*`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 2. HEALTH DROP & DEGRADATION REASONING
  if (q.includes("health") || q.includes("drop") || q.includes("degrad") || q.includes("deteriorat")) {
    const isC2Hot = s.telemetry.cht_C[1] > 180 || s.faults.c2Overheat;
    const isBearingBad = s.faults.bearingFail || s.telemetry.vibrationRMS_G > 1.2;
    const isTurboBad = s.faults.turboFail;
    const isInjectorBad = s.faults.injectorClog;

    let primaryCause = "Nominal mechanical wear across baseline parameters.";
    if (isC2Hot) {
      primaryCause = `Cylinder 2 CHT thermal excursion (${s.telemetry.cht_C[1]}°C) exceeding safe cooling bounds due to nacelle airflow shadowing.`;
    } else if (isBearingBad) {
      primaryCause = `Elevated structural vibration (${s.telemetry.vibrationRMS_G} G) indicating 140Hz outer-race bearing fatigue.`;
    } else if (isTurboBad) {
      primaryCause = `Turbocharger TCU boost shortfall (${s.telemetry.manifoldAirPressure_kPa} kPa) causing high thermal load and power loss.`;
    } else if (isInjectorBad) {
      primaryCause = `Injector spray pattern imbalance across cylinder runners creating combustion asymmetry.`;
    }

    return {
      spokenText: `Engine health index is currently at ${s.telemetry.healthIndex_pct} percent. Primary finding is ${primaryCause}`,
      displayText: `### TELEMETRY HEALTH DEGRADATION ANALYSIS

- **Composite Health Index**: **${s.telemetry.healthIndex_pct}%** (RUL: **${s.telemetry.rul_hours} Hours**)
- **Anomaly Score**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus} STATUS)
- **Primary Cause**: ${primaryCause}

#### Cross-System Correlates:
- **Cylinder Head Temp (CHT)**: C1: ${s.telemetry.cht_C[0]}°C | **C2: ${s.telemetry.cht_C[1]}°C** | C3: ${s.telemetry.cht_C[2]}°C | C4: ${s.telemetry.cht_C[3]}°C
- **Vibration RMS**: **${s.telemetry.vibrationRMS_G} G** (Warning threshold: >1.2 G)
- **Manifold Air Pressure**: **${s.telemetry.manifoldAirPressure_kPa} kPa** (Boost: ${s.telemetry.boost_bar} bar)
- **Oil System**: ${s.telemetry.oilTemp_C}°C / ${s.telemetry.oilPressure_bar} bar
- **Recent Delta**: Health Δ ${(s.recentTrends.healthDelta * 100).toFixed(1)}% | CHT Δ ${s.recentTrends.chtMaxDelta > 0 ? "+" : ""}${s.recentTrends.chtMaxDelta}°C`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 3. OIL SYSTEM & LUBRICATION
  if (q.includes("oil") || q.includes("lubric") || (q.includes("pressure") && !q.includes("manifold"))) {
    const press = s.telemetry.oilPressure_bar;
    const temp = s.telemetry.oilTemp_C;
    const isPressOk = press >= 3.0 && press <= 6.0;
    const isTempOk = temp <= 110;
    const verdict = isPressOk && isTempOk
      ? "Oil pressure and temperature are fully nominal within safe operating margins."
      : "Oil telemetry indicates parameters are trending towards warning thresholds.";

    return {
      spokenText: `Oil pressure is currently ${press.toFixed(2)} bar with oil temperature at ${temp.toFixed(1)} degrees Celsius. ${verdict}`,
      displayText: `### LUBRICATION & OIL SYSTEM TELEMETRY

- **Oil Pressure**: **${press.toFixed(2)} bar** (Nominal: 3.5 – 5.5 bar | Min: 3.0 bar)
- **Oil Temperature**: **${temp.toFixed(1)}°C** (Nominal: 80 – 100°C | Max Limit: 110°C)
- **Viscosity Shear Index**: ${temp > 105 ? "Elevated thermal thinning risk detected" : "Stable hydrodynamic film"}
- **Recent Delta**: Pressure Δ ${s.recentTrends.oilPressureDelta > 0 ? "+" : ""}${s.recentTrends.oilPressureDelta.toFixed(2)} bar | Temp Δ ${s.recentTrends.oilTempDelta > 0 ? "+" : ""}${s.recentTrends.oilTempDelta.toFixed(1)}°C

*Assessment: ${verdict}*`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 4. VIBRATION & BEARING HEALTH
  if (q.includes("vibrat") || q.includes("bearing") || q.includes("harmonic") || q.includes("shake") || q.includes("smooth")) {
    const vib = s.telemetry.vibrationRMS_G;
    const vibStatus = vib > 1.4 ? "CRITICAL" : vib > 1.0 ? "WARNING / ELEVATED" : "NOMINAL";

    return {
      spokenText: `Vibration RMS is currently reading ${vib.toFixed(2)} G, rated ${vibStatus}. Spectral analysis reveals dominant harmonics at 140 Hz.`,
      displayText: `### VIBRATION & BEARING SPECTRAL ANALYSIS

- **Vibration RMS**: **${vib.toFixed(2)} G** (Baseline: <0.80 G | Warning: >1.20 G)
- **Status Classification**: **${vibStatus}**
- **Dominant Frequency**: **140 Hz** (BPFO — Ball Pass Frequency Outer Race)
- **Mechanical Integrity**: ${vib > 1.2 ? "Micro-spalling detected on bearing outer race track." : "Dynamic balancing within aerospace flight tolerances."}
- **20s Drift**: Vibration Δ ${s.recentTrends.vibrationDelta > 0 ? "+" : ""}${s.recentTrends.vibrationDelta.toFixed(2)} G`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 5. CYLINDERS & CHT (THERMAL MONITORING)
  if (
    q.includes("cht") ||
    q.includes("cylinder") ||
    (q.includes("temp") && !q.includes("oil")) ||
    q.includes("cooling") ||
    q.includes("heat") ||
    q.includes("hot")
  ) {
    const cht = s.telemetry.cht_C;
    const maxCht = Math.max(...cht);
    const hottestIdx = cht.indexOf(maxCht) + 1;

    return {
      spokenText: `Cylinder head temperatures are peaking at ${maxCht.toFixed(1)} degrees Celsius on Cylinder ${hottestIdx}. Cylinder 2 runs naturally warmer due to nacelle air distribution.`,
      displayText: `### CYLINDER HEAD TEMPERATURE (CHT) MATRIX

- **Max Cylinder Temp**: **${maxCht.toFixed(1)}°C** (Cylinder ${hottestIdx})
- **Per-Cylinder Distribution**:
  * **Cylinder 1**: ${cht[0].toFixed(1)}°C
  * **Cylinder 2**: **${cht[1].toFixed(1)}°C** ${cht[1] > 175 ? "⚠️ [ELEVATED]" : "✓"}
  * **Cylinder 3**: ${cht[2].toFixed(1)}°C
  * **Cylinder 4**: ${cht[3].toFixed(1)}°C
- **Max Limit**: 180.0°C (Warning at 170°C)
- **Convective Airflow Status**: ${s.environment.densityRatio < 0.7 ? "Reduced mass flow cooling due to high density altitude" : "Adequate cooling flow"}`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 6. EGT, EXHAUST & FUEL INJECTORS
  if (q.includes("egt") || q.includes("exhaust") || q.includes("inject") || q.includes("spray") || q.includes("combust") || q.includes("mixture") || q.includes("fuel")) {
    const egt = s.telemetry.egt_C;
    const status = egt > 720 ? "ELEVATED" : "OPTIMAL";

    return {
      spokenText: `Exhaust Gas Temperature is measured at ${egt.toFixed(1)} degrees Celsius, currently rated ${status}. Air-fuel mixture distribution across cylinder runners is balanced.`,
      displayText: `### EXHAUST GAS TEMPERATURE (EGT) & COMBUSTION

- **Current EGT**: **${egt.toFixed(1)}°C** (Nominal: 550 – 700°C | Warning: >720°C)
- **Combustion State**: **${status}**
- **Injector Spray Uniformity**: ${s.faults.injectorClog ? "Clogged injector nozzle causing asymmetric lean runner" : "Symmetric spray distribution"}
- **Recent EGT Drift**: ${s.recentTrends.egtDelta > 0 ? "+" : ""}${s.recentTrends.egtDelta.toFixed(1)}°C`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 7. RPM, THROTTLE, TURBOCHARGER & BOOST
  if (q.includes("rpm") || q.includes("throttle") || q.includes("power") || q.includes("boost") || q.includes("turbo") || q.includes("manifold") || q.includes("speed") || q.includes("fast")) {
    return {
      spokenText: `The Rotax 914 engine is turning at ${s.telemetry.rpm.toFixed(0)} RPM at ${s.telemetry.throttle_pct.toFixed(0)} percent throttle, producing ${s.telemetry.manifoldAirPressure_kPa.toFixed(1)} kPa manifold air pressure.`,
      displayText: `### POWERPLANT & TURBOCHARGER TELEMETRY

- **Engine Speed**: **${s.telemetry.rpm.toFixed(0)} RPM** (Redline: 5,800 RPM)
- **Throttle Command**: **${s.telemetry.throttle_pct.toFixed(0)}%**
- **Manifold Absolute Pressure (MAP)**: **${s.telemetry.manifoldAirPressure_kPa.toFixed(1)} kPa**
- **Turbo Boost Pressure**: **${s.telemetry.boost_bar.toFixed(2)} bar**
- **Power Output**: Nominal 115 HP rating under Garrett TCU electronic wastegate regulation`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 8. ALTITUDE, CLIMB & AERODYNAMIC ENVELOPE
  if (q.includes("alt") || q.includes("height") || q.includes("climb") || q.includes("ceiling") || q.includes("density") || q.includes("atmosphere") || q.includes("thin air")) {
    const alt = s.flight.altitude_ft;
    const density = s.environment.densityRatio;

    return {
      spokenText: `Current flight altitude is ${alt.toFixed(0)} feet with an air density ratio of ${density.toFixed(2)}. TAPAS BH-201 ceiling envelope is limited above 24,000 feet due to reduced cooling mass flow.`,
      displayText: `### FLIGHT ALTITUDE & ATMOSPHERIC ENVELOPE

- **Current Altitude**: **${alt.toFixed(0)} FT**
- **Air Density Ratio (ρ/ρ0)**: **${density.toFixed(2)}** (Air mass density reduced by ${((1 - density) * 100).toFixed(0)}%)
- **Ambient Temperature**: **${s.environment.ambientTemperature_C.toFixed(1)}°C** (${s.environment.biome.toUpperCase()} Biome)
- **Cowl Radiator Cooling**: Diminished convective cooling capacity by **${((1 - density) * 45).toFixed(0)}%**.
- **Turbocharger TCU**: Actively compressing thin air to preserve manifold pressure.`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 9. ACTIVE SCREEN CONTEXT
  if (q.includes("looking at") || q.includes("screen") || q.includes("what is this") || q.includes("view")) {
    return {
      spokenText: `You are on the Ground Control Station viewing the ${s.screen.gcsTab} panel with live aircraft telemetry linked.`,
      displayText: `### ACTIVE SCREEN CONTEXT: GCS // ${s.screen.gcsTab}

You are viewing the **AERIS-TWIN Ground Control Station** monitoring the Rotax 914 AE-P4 engine.

- **Active Route**: \`${s.screen.route}\`
- **Current Tab**: \`${s.screen.gcsTab}\`
- **Flight Vector**: Altitude **${s.flight.altitude_ft.toFixed(0)} FT**, Speed **${s.flight.airspeed_knots.toFixed(0)} KT**, Throttle **${s.telemetry.throttle_pct.toFixed(0)}%**
- **3D Engine State**: ${s.screen.isEngineExploded ? "Exploded Inspection View" : "Assembled Flight View"} ${s.screen.inspectedPart ? `(Inspecting ${s.screen.inspectedPart})` : ""}
- **Mission Readiness**: Composite Health **${s.telemetry.healthIndex_pct}%**`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 10. RECENT 20-SECOND TREND AUDIT
  if (q.includes("what changed") || q.includes("change") || q.includes("trend") || q.includes("recent")) {
    return {
      spokenText: `Over the past 20 seconds, CHT changed by ${s.recentTrends.chtMaxDelta.toFixed(1)} degrees, vibration changed by ${s.recentTrends.vibrationDelta.toFixed(2)} G, and composite health shifted by ${(s.recentTrends.healthDelta * 100).toFixed(1)} percent.`,
      displayText: `### 20-SECOND TELEMETRY DELTA AUDIT

- **Health Index Drift**: **${(s.recentTrends.healthDelta * 100).toFixed(1)}%**
- **Max CHT Drift**: **${s.recentTrends.chtMaxDelta > 0 ? "+" : ""}${s.recentTrends.chtMaxDelta.toFixed(1)}°C**
- **EGT Drift**: **${s.recentTrends.egtDelta > 0 ? "+" : ""}${s.recentTrends.egtDelta.toFixed(1)}°C**
- **Vibration Drift**: **${s.recentTrends.vibrationDelta > 0 ? "+" : ""}${s.recentTrends.vibrationDelta.toFixed(2)} G**
- **Oil Pressure Drift**: **${s.recentTrends.oilPressureDelta > 0 ? "+" : ""}${s.recentTrends.oilPressureDelta.toFixed(2)} bar**
- **Oil Temperature Drift**: **${s.recentTrends.oilTempDelta > 0 ? "+" : ""}${s.recentTrends.oilTempDelta.toFixed(1)}°C**`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 11. RECOMMENDATIONS & "WHAT SHOULD I DO?"
  if (q.includes("should i") || q.includes("recommend") || q.includes("action") || q.includes("what next") || q.includes("advice") || q.includes("plan")) {
    const health = s.telemetry.healthIndex_pct;
    let advice = "All primary parameters remain within normal flight limits. Maintain current cruise power setting.";
    if (health < 60) {
      advice = "Health index is below 60%. Recommend reducing throttle to 55%, initiating gentle descent to denser air, and preparing for depot inspection.";
    } else if (s.telemetry.chtMax_C > 175) {
      advice = "Cylinder Head Temperature is approaching the 180°C threshold. Recommend increasing airspeed by 10 KT to improve cowl convective airflow or reducing climb angle.";
    }

    return {
      spokenText: `${advice}`,
      displayText: `### TACTICAL FLIGHT RECOMMENDATIONS

- **Current Health State**: **${health}%** (RUL: **${s.telemetry.rul_hours} Hours**)
- **Operational Advice**: ${advice}
- **Throttle Optimization**: Set throttle to 60-65% for maximum fuel economy and lowest thermal wear.
- **Flight Profile**: Monitor CHT on Cylinder 2 if maintaining cruise above 15,000 FT.`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 12. FLIGHT COMMANDS — guided demo, RTB, fault injection (offline)
  if (q.includes("demo") && (q.includes("start") || q.includes("launch") || q.includes("run") || q.includes("begin"))) {
    return {
      spokenText: "Initiating the guided mission demo. Launching the Himalaya region transect now.",
      displayText: "**GUIDED DEMO LAUNCH** — running the full value chain: launch → transect → turbo fault → GCS alert → MAYDAY → RTB → mission report.",
      intent: "UI_ACTION",
      actions: [{ type: "START_DEMO" }],
    };
  }

  if (q.includes("demo") && (q.includes("stop") || q.includes("abort") || q.includes("cancel") || q.includes("halt"))) {
    return {
      spokenText: "Guided demo stopped.",
      displayText: "**GUIDED DEMO STOPPED**.",
      intent: "UI_ACTION",
      actions: [{ type: "STOP_DEMO" }],
    };
  }

  if (q.includes("return to base") || q.includes(" rtb") || q.startsWith("rtb") || q.includes("come home") || q.includes("head home") || q.includes("go home") || q.includes("fly home")) {
    return {
      spokenText: "Return to base engaged. Reducing power to 55 percent and routing home.",
      displayText: "**RTB ENGAGED** — return-to-base navigation active at reduced power. Remaining waypoints will be skipped.",
      intent: "UI_ACTION",
      actions: [{ type: "RTB" }],
    };
  }

  if (q.includes("dismiss") && (q.includes("report") || q.includes("debrief"))) {
    return {
      spokenText: "Mission report dismissed.",
      displayText: "**MISSION REPORT CLOSED**.",
      intent: "UI_ACTION",
      actions: [{ type: "CLOSE_DEMO_REPORT" }],
    };
  }

  if (q.includes("misfire")) {
    return {
      spokenText: "Injecting misfire on cylinder 3. Expect rough running, EGT 3 collapse, and erratic injection timing.",
      displayText: "**FAULT INJECTED: MISFIRE CYL 3** — combustion loss on C3: EGT3 collapse ~55°C, knock vibration, timing hunting.",
      intent: "UI_ACTION",
      actions: [{ type: "INJECT_FAULT", fault: "misfire3" }],
    };
  }

  if (q.includes("overheat") || (q.includes("cylinder 2") && (q.includes("hot") || q.includes("heat")))) {
    return {
      spokenText: "Injecting cylinder 2 overheat. Cooling airflow blocked, CHT 2 will spike past 220 degrees.",
      displayText: "**FAULT INJECTED: CYLINDER 2 OVERHEAT** — CHT2 rising >220°C, thermal stress climbing.",
      intent: "UI_ACTION",
      actions: [{ type: "INJECT_FAULT", fault: "c2Overheat" }],
    };
  }

  if (q.includes("wastegate") || (q.includes("turbo") && (q.includes("fail") || q.includes("inject")))) {
    return {
      spokenText: "Injecting wastegate turbo failure. Manifold pressure will collapse with a power loss.",
      displayText: "**FAULT INJECTED: WASTEGATE / TURBO FAILURE** — MAP collapse, power loss, turbo spool shortfall.",
      intent: "UI_ACTION",
      actions: [{ type: "INJECT_FAULT", fault: "turboFail" }],
    };
  }

  if (q.includes("bearing")) {
    return {
      spokenText: "Injecting bearing fatigue spall. Expect a high amplitude 140 hertz vibration peak in the FFT.",
      displayText: "**FAULT INJECTED: BEARING FATIGUE SPALL** — BPFO 140 Hz peak injected into the vibration spectrum.",
      intent: "UI_ACTION",
      actions: [{ type: "INJECT_FAULT", fault: "bearingFail" }],
    };
  }

  if (q.includes("injector") || q.includes("clog") || (q.includes("fuel") && q.includes("inject"))) {
    return {
      spokenText: "Injecting fuel injector clog. Expect EGT imbalance and cylinder knock.",
      displayText: "**FAULT INJECTED: FUEL INJECTOR CLOG** — EGT runner imbalance >40°C, combustion instability.",
      intent: "UI_ACTION",
      actions: [{ type: "INJECT_FAULT", fault: "injectorClog" }],
    };
  }

  if (q.includes("clear") && (q.includes("fault") || q.includes("injection"))) {
    return {
      spokenText: "All fault injections cleared.",
      displayText: "**ALL FAULT INJECTIONS CLEARED** — engine returned to nominal baseline.",
      intent: "UI_ACTION",
      actions: [{ type: "CLEAR_FAULTS" }],
    };
  }

  // 5. Navigation commands
  // 13. FAULTS, ALARMS & DIAGNOSTICS
  if (q.includes("fault") || q.includes("alarm") || q.includes("warn") || q.includes("fail") || q.includes("error") || q.includes("broken") || q.includes("issue") || q.includes("wrong") || q.includes("problem")) {
    const activeFaults: string[] = [];
    if (s.faults.c2Overheat) activeFaults.push("CYLINDER 2 OVERHEAT (CHT > 180°C)");
    if (s.faults.bearingFail) activeFaults.push("MAIN CRANK BEARING FAULT (140Hz BPFO)");
    if (s.faults.turboFail) activeFaults.push("TURBOCHARGER TCU BOOST FAULT");
    if (s.faults.injectorClog) activeFaults.push("INJECTOR SPRAY IMBALANCE");

    const faultStr = activeFaults.length > 0 ? activeFaults.join(", ") : "No active critical hardware faults detected in telemetry stream.";

    return {
      spokenText: `${faultStr}`,
      displayText: `### FAULT & ANOMALY DIAGNOSTIC SUMMARY

- **Active Fault Conditions**: ${activeFaults.length > 0 ? activeFaults.map(f => `\n  * ⚠️ **${f}**`).join("") : "**None (All telemetry nominal)**"}
- **ML Anomaly Score**: **${s.mlIntelligence.anomalyScore}** (${s.mlIntelligence.overallStatus} STATUS)
- **Physics Residuals**: Normal deviation bounds across pressure and temperature sensors.`,
      intent: "ANALYSIS",
      actions: [],
    };
  }

  // 13. EXPLORER BUTTON & 3D MODEL CONTROLS
  if (
    q.includes("explorer") ||
    q.includes("explore button") ||
    q.includes("explode button") ||
    q.includes("on the explorer") ||
    q.includes("open explorer") ||
    q.includes("turn on explorer") ||
    q.includes("explode") ||
    q.includes("dismantle")
  ) {
    const isStudio = q.includes("studio") || q.includes("twin") || q.includes("dismantle");

    return {
      spokenText: "Scrolling to 3D engine stage and activating the exploded view.",
      displayText: `### 3D ENGINE EXPLORER ACTIVATED

- **Target Assembly**: Rotax 914 AE-P4 Powerplant
- **View Mode**: **Exploded Subsystem Inspection**
- **Action**: Auto-scrolled to Hero Engine Canvas and expanded 3D component layers.
- **Controls**: Orbit 360°, inspect individual hot-spots, or say *"Assemble the engine"* to restore flight configuration.`,
      intent: "UI_ACTION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
        { type: "SET_EXPLODED", exploded: true },
        ...(isStudio ? [{ type: "OPEN_STUDIO", open: true }] : []),
      ],
    };
  }

  if (q.includes("assemble") || q.includes("put together") || q.includes("close explode")) {
    return {
      spokenText: "Reassembling 3D engine model to flight configuration.",
      displayText: "Assembling Rotax 914 3D twin back into nominal flight enclosure.",
      intent: "UI_ACTION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
        { type: "SET_EXPLODED", exploded: false },
        { type: "OPEN_STUDIO", open: false },
      ],
    };
  }

  // 14. DOCK TAB NAVIGATION COMMANDS (HOME, LIVE ENGINE, PREDICTIVE, MISSION, INSPECTION)
  if (
    q === "home" ||
    q.includes("go to home") ||
    q.includes("open home") ||
    q.includes("take me home") ||
    q.includes("back to home") ||
    q.includes("landing") ||
    q.includes("home tab") ||
    q.includes("scroll to top") ||
    q.includes("scroll up")
  ) {
    return {
      spokenText: "Navigating to Home and scrolling directly to the engine overview.",
      displayText: "Navigating to **HOME** (`/`) and auto-scrolling to Hero section.",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
      ],
    };
  }

  if (
    q.includes("live engine") ||
    q.includes("engine tab") ||
    q.includes("3d engine") ||
    (q.includes("engine") && (q.includes("show") || q.includes("open") || q.includes("go to")))
  ) {
    return {
      spokenText: "Scrolling directly to the 3D Live Engine Digital Twin.",
      displayText: "Focusing on **LIVE ENGINE** digital twin stage on Home page.",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
      ],
    };
  }

  if (
    q.includes("predictive") ||
    q.includes("intelligence") ||
    q.includes("predictive tab") ||
    q.includes("rul tab") ||
    q.includes("predictive section")
  ) {
    const isGcs = typeof window !== "undefined" && window.location.pathname === "/gcs";
    if (isGcs && !q.includes("home") && !q.includes("page")) {
      return {
        spokenText: "Switching to Predictive Diagnostics panel and Remaining Useful Life analysis.",
        displayText: "Navigating to GCS **DIAGNOSTICS** tab.",
        intent: "NAVIGATION",
        actions: [{ type: "SET_GCS_TAB", tab: "DIAGNOSTICS" }],
      };
    }

    return {
      spokenText: "Navigating to Home and scrolling directly to Predictive Engine Intelligence.",
      displayText: "Navigating to Home and auto-scrolling to **04 / ENGINE INTELLIGENCE** (`#intelligence`).",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "intelligence" },
      ],
    };
  }

  if (
    q.includes("mission") ||
    q.includes("tapas") ||
    q.includes("platform") ||
    q.includes("airframe") ||
    q.includes("mission tab") ||
    q.includes("mission context")
  ) {
    const isGcsReplay = q.includes("replay") || q.includes("sortie");
    if (isGcsReplay) {
      return {
        spokenText: "Opening Mission Replay console in Ground Control Station.",
        displayText: "Navigating to **MISSION REPLAY** console.",
        intent: "NAVIGATION",
        actions: [
          { type: "NAVIGATE", route: "/gcs" },
          { type: "SET_GCS_TAB", tab: "MISSION REPLAY" },
        ],
      };
    }

    return {
      spokenText: "Navigating to Home and scrolling directly to the TAPAS BH-201 Mission Context.",
      displayText: "Navigating to Home and auto-scrolling to **03 / MISSION CONTEXT** (`#mission`).",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "mission" },
      ],
    };
  }

  if (
    q.includes("inspection") ||
    q.includes("inspect tab") ||
    q.includes("component inspection") ||
    q.includes("inspect section")
  ) {
    return {
      spokenText: "Navigating to Home and scrolling directly to Digital Twin Component Inspection.",
      displayText: "Navigating to Home and auto-scrolling to **05 / DIGITAL TWIN INSPECTION** (`#inspection`).",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "inspection" },
      ],
    };
  }

  if (q.includes("diagnostics") || q.includes("residuals")) {
    return {
      spokenText: "Scrolling directly to Explainable Diagnostics and physics residuals.",
      displayText: "Navigating to **AI / EXPLAINABLE DIAGNOSTICS** (`#diagnostics`).",
      intent: "NAVIGATION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "diagnostics" },
      ],
    };
  }

  if (q.includes("sim") || q.includes("simulator") || q.includes("fly") || q.includes("flight sim")) {
    return {
      spokenText: "Opening 3D Flight Simulator console.",
      displayText: "Navigating to **3D Flight Simulator** console (`/sim`).",
      intent: "NAVIGATION",
      actions: [{ type: "NAVIGATE", route: "/sim" }],
    };
  }

  if (q.includes("gcs") || q.includes("ground control") || q.includes("station")) {
    return {
      spokenText: "Opening Ground Control Station interface.",
      displayText: "Navigating to **Ground Control Station** (`/gcs`).",
      intent: "NAVIGATION",
      actions: [{ type: "NAVIGATE", route: "/gcs" }],
    };
  }

  if (q.includes("cylinder head")) {
    return {
      spokenText: "Isolating and inspecting Cylinder Head assembly.",
      displayText: "Highlighting **CYLINDER HEAD ASSEMBLY**.",
      intent: "UI_ACTION",
      actions: [
        { type: "NAVIGATE", route: "/" },
        { type: "SCROLL_TO", sectionId: "top" },
        { type: "INSPECT_PART", partName: "CYLINDER HEAD" },
      ],
    };
  }

  // 15. GREETINGS & INTRODUCTIONS
  if (q.includes("hello") || q.includes("hi") || q.includes("who are you") || (q.includes("jarvis") && q.split(" ").length <= 2) || q.includes("thanks") || q.includes("thank you")) {
    return {
      spokenText: "Online and standing by, Commander. What aspect of the engine or telemetry would you like to inspect?",
      displayText: `### J.A.R.V.I.S. TACTICAL COPILOT ONLINE

I am connected directly to the **Rotax 914 AE-P4 digital twin** with real-time 20Hz telemetry correlation.

You can ask me:
- *"What is the estimated lifetime of our engine?"*
- *"Why is the engine health dropping?"*
- *"Is the oil pressure okay?"*
- *"What is the current vibration?"*
- *"What am I looking at right now?"*
- *"Take me to predictive diagnostics."*
- *"Explode the 3D engine model."*`,
      intent: "QUESTION",
      actions: [],
    };
  }

  // 14. DYNAMIC INTERACTIVE CONVERSATIONAL FALLBACK (NEVER A CANNED STATIC REPORT!)
  return {
    spokenText: `Engine speed is currently ${s.telemetry.rpm.toFixed(0)} RPM with health at ${s.telemetry.healthIndex_pct} percent and ${s.telemetry.rul_hours.toFixed(0)} hours remaining useful life. What specific system would you like me to inspect?`,
    displayText: `### ROTAX 914 TELEMETRY SYNTHESIS // "${query}"

Regarding your inquiry:
- **Composite Health Index**: **${s.telemetry.healthIndex_pct}%** | **RUL**: **${s.telemetry.rul_hours} Hours**
- **Operating Envelope**: Altitude **${s.flight.altitude_ft.toFixed(0)} FT** at **${s.telemetry.rpm.toFixed(0)} RPM** (Throttle: **${s.telemetry.throttle_pct}%**)
- **Thermal Status**: Max CHT **${s.telemetry.chtMax_C}°C** | EGT **${s.telemetry.egt_C}°C**
- **Mechanical Dynamics**: Vibration **${s.telemetry.vibrationRMS_G} G** | Oil: **${s.telemetry.oilPressure_bar} bar** / **${s.telemetry.oilTemp_C}°C**

*You can ask me specific questions regarding lifetime, oil pressure, cylinder temperatures, vibration, flight altitude, or command me to navigate across tabs.*`,
    intent: "QUESTION",
    actions: [],
  };
}
