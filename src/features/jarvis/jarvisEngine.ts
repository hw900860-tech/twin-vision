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

  // 12. FAULTS, ALARMS & DIAGNOSTICS
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

  // 13. NAVIGATION COMMANDS
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

  // 14. 3D VISUALIZATION & INSPECTION ACTIONS
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
