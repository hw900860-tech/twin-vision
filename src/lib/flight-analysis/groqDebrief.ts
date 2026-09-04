/**
 * AERIS-TWIN post-flight AI debrief (Groq-backed, server-side only).
 *
 * The deterministic `aeris-postflight-debrief-v1` packet (stats, exceedances,
 * fault timeline, findings, work order — see csvToJson.ts) is handed to a
 * Groq-hosted open-weights model over an OpenAI-compatible chat endpoint.
 * The model writes a short, grounded engineering report: sortie overview,
 * key engine stats, anomaly read, an estimated remaining-useful-life band
 * (anchored by the deterministic RUL estimator below) and prioritized care
 * items.
 *
 * Hard rules baked into the design:
 *  - The `GROQ_API_KEY` is read only inside this server function — it never
 *    enters the browser bundle or any client state.
 *  - Fires only on an explicit operator click in the Reports tab; never in a
 *    live telemetry loop.
 *  - The model is anchored to the deterministic debrief + RUL estimator so it
 *    summarises data rather than inventing numbers; the RUL is explicitly
 *    labeled an engineering estimate.
 */
import { createServerFn } from "@tanstack/react-start";
import type { PostFlightDebrief } from "@/lib/flight-analysis/csvToJson";

/** Default Groq catalog model (verified live against this account's key). */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

/* ------------------------------------------------------------------ */
/* Env access (server only)                                           */
/* ------------------------------------------------------------------ */

// Server functions execute in the Node runtime, so process.env is always the
// correct (and only sanctioned) source for secrets. Dynamic import.meta.env
// access is forbidden by the Vite module runner — never fall back to it.
function readEnv(key: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[key];
}

/* ------------------------------------------------------------------ */
/* Deterministic RUL anchor (engineers' ground truth, not model talk)  */
/* ------------------------------------------------------------------ */

export interface RulEstimate {
  /** Life-consumption score 0 (fresh) → 100 (at overhaul). */
  consumed: number;
  /** Remaining-useful-life band in flight hours (vs ~600 h TBO type life). */
  bandHours: string;
  label: string;
  basis: string[];
}

/**
 * Rule-based remaining-useful-life band over the debrief packet. Consumed-life
 * is driven by end-of-flight composite health, critical/warning exceedances,
 * latched fault flags and the deterministic P1/P2 work-order load — the same
 * evidence the rule engine already turns into alarms and maintenance actions.
 */
export function estimateRul(debrief: PostFlightDebrief): RulEstimate {
  const p1 = debrief.workOrder.filter((w) => w.priority === "P1").length;
  const p2 = debrief.workOrder.filter((w) => w.priority === "P2").length;
  const healthLoss = Math.max(0, 100 - debrief.health.end);
  const basis: string[] = [];

  let consumed = 0;
  // Health trajectory — the single biggest life driver.
  consumed += healthLoss * 0.55;
  basis.push(
    healthLoss >= 45
      ? `end-of-flight health ${debrief.health.end.toFixed(0)}% — deep degradation trajectory`
      : healthLoss >= 20
        ? `end-of-flight health ${debrief.health.end.toFixed(0)}% — measurable wear trajectory`
        : `end-of-flight health ${debrief.health.end.toFixed(0)}% — near-nominal`,
  );

  // Emergency window in flight.
  if (debrief.health.min < 30) {
    consumed += 18;
    basis.push("in-flight MAYDAY window (health < 30%) observed");
  } else if (debrief.health.min < 55) {
    consumed += 8;
    basis.push(`health dipped to ${debrief.health.min.toFixed(0)}% in flight`);
  }

  // Work-order load mirrors underlying degradation.
  consumed += p1 * 12 + p2 * 5;
  if (p1 > 0) basis.push(`${p1} P1 maintenance action${p1 > 1 ? "s" : ""} raised`);
  if (p2 > 0) basis.push(`${p2} P2 action${p2 > 1 ? "s" : ""} raised`);

  // Latched fault flags (turbo / bearing / overheat latches are hard events).
  const latched = debrief.faultActivity.filter((f) => /FAIL|OVERHEAT|BEARING|OIL/i.test(f.flag)).length;
  if (latched > 0) {
    consumed += 6 * latched;
    basis.push(`${latched} latched fault flag${latched > 1 ? "s" : ""} on the timeline`);
  }

  // Severe physical signatures push toward teardown.
  const vibCrit = debrief.exceedances.find((e) => e.channelKey === "vibrationRMS" && e.severity === "CRITICAL");
  if (vibCrit) {
    consumed += 14;
    basis.push(`critical vibration RMS ${vibCrit.peak} m/s² — bearing-wear signature`);
  }
  const oilCrit = debrief.exceedances.find((e) => e.channelKey.startsWith("oil") && e.severity === "CRITICAL");
  if (oilCrit) {
    consumed += 12;
    basis.push(`critical oil-circuit excursion (${oilCrit.channelLabel})`);
  }

  consumed = Math.max(0, Math.min(100, Math.round(consumed)));

  // Band against a nominal ~600 flight-hour overhaul (TBO) life.
  let label: string;
  let bandHours: string;
  if (consumed >= 55) {
    label = "SEVERE";
    bandHours = "< 60 h";
  } else if (consumed >= 30) {
    label = "REDUCED";
    bandHours = "60 – 200 h";
  } else if (consumed >= 12) {
    label = "NOMINAL";
    bandHours = "200 – 400 h";
  } else {
    label = "LOW WEAR";
    bandHours = "> 400 h";
  }

  return { consumed, bandHours, label, basis };
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a senior UAV powertrain maintenance engineer (Rotax 914 turbocharged four-stroke) writing the post-sortie engineering report for a military MALE UAS ground station.

You are given: (1) the deterministic aeris-postflight-debrief-v1 packet computed offline from the flight CSV, and (2) the GCS rule engine's remaining-useful-life (RUL) estimate with its basis.

Rules:
- Summarise ONLY what the data supports. Never invent sensor values, part numbers or timestamps.
- The RUL band and 'consumed life' come from the GCS rule engine. Translate it, do not contradict or restate it as exact.
- Keep the report short and dense (≈300–380 words), aimed at an operator deciding whether to fly again tonight.
- Plain text with these exact section headings, in this order:
  SORTIE OVERVIEW
  KEY ENGINE STATS
  ANOMALIES & WEAR SIGNALS
  REMAINING USEFUL LIFE
  WHAT TO TAKE CARE OF
- 'WHAT TO TAKE CARE OF' must be prioritized (tonight / this week / next inspection) and concrete (pre-flight checks, parts to inspect, ground-run verification).
- Flag anything that should ground the airframe with a clear "GROUND AIRFRAME" line at the top of WHAT TO TAKE CARE OF.
- Do not use markdown bullets like "-" or "*"; use plain numbered items.`;

function buildUserMessage(debrief: PostFlightDebrief, rul: RulEstimate): string {
  return [
    `MISSION: ${debrief.mission.durationHms} sortie · ${debrief.mission.samples} samples · max alt ${debrief.mission.maxAltitudeFt} ft · max RPM ${debrief.mission.maxRpm} · mean throttle ${debrief.mission.meanThrottlePct}% · phases ${debrief.mission.phaseProfile.map((p) => `${p.phase} ${p.pct}%`).join(", ")}`,
    `HEALTH: min ${debrief.health.min}% · end ${debrief.health.end}% · mean ${debrief.health.mean}%`,
    `CHANNEL STATS: ${debrief.channels
      .map((c) => `${c.label} min/mean/max ${c.min}/${c.mean}/${c.max} ${c.unit}${c.std > 0 ? ` (σ${c.std})` : ""}`)
      .join(" · ")}`,
    `EXCEEDANCES: ${debrief.exceedances.length > 0 ? debrief.exceedances.map((e) => `${e.severity} ${e.channelLabel} peak ${e.peak} ${e.unit} ${e.fractionPct}% of flight (${e.durationS}s)`).join(" · ") : "none"}`,
    `FAULT FLAGS: ${debrief.faultActivity.length > 0 ? debrief.faultActivity.map((f) => `${f.flag} ×${f.samples}`).join(", ") : "none"}`,
    `FINDINGS: ${debrief.findings.length > 0 ? debrief.findings.map((f) => `[${f.severity}] ${f.title} — ${f.detail}`).join(" | ") : "none"}`,
    `WORK ORDER: ${debrief.workOrder.length > 0 ? debrief.workOrder.map((w) => `${w.priority}: ${w.action}`).join(" | ") : "none"}`,
    `TREND (last buckets): health ${debrief.trend.slice(-5).map((t) => t.health).join(" → ")} · CHT max ${debrief.trend.slice(-5).map((t) => t.chtMax).join(" → ")} °C`,
    ``,
    `GCS RUL ESTIMATE: label ${rul.label} · band ${rul.bandHours} · consumed-life score ${rul.consumed}/100`,
    `RUL BASIS: ${rul.basis.join("; ")}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Server function                                                     */
/* ------------------------------------------------------------------ */

export interface AiDebriefResult {
  /** The raw model report (plain text, sectioned). */
  report: string;
  model: string;
  rul: RulEstimate;
  completedAt: string;
}

export const generateAiDebrief = createServerFn({ method: "POST" })
  .validator((input: { debrief: PostFlightDebrief }) => {
    if (!input?.debrief || typeof input.debrief.schema !== "string") {
      throw new Error("A valid debrief packet is required — analyze a session or upload a CSV first.");
    }
    return { debrief: input.debrief };
  })
  .handler(async ({ data }): Promise<AiDebriefResult> => {
    const key = readEnv("GROQ_API_KEY");
    if (!key) {
      throw new Error("GROQ_API_KEY is not configured — add it in Settings → Environment.");
    }

    const rul = estimateRul(data.debrief);
    const model = readEnv("GROQ_MODEL") ?? DEFAULT_MODEL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(data.debrief, rul) },
          ],
          temperature: 0.3,
          max_tokens: 1800,
        }),
      });

      if (!res.ok) {
        let detail = `Groq responded ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body?.error?.message) detail = `${detail} — ${body.error.message}`;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const report = json.choices?.[0]?.message?.content?.trim();
      if (!report) throw new Error("Groq returned an empty report — try again.");

      return { report, model, rul, completedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  });
