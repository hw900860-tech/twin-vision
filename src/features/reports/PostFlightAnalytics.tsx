import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Database, Download, FileUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { serializeTelemetryLogs } from "@/lib/flight-analysis/sessionCsv";
import { buildDebrief, parseFlightCsv, type PostFlightDebrief } from "@/lib/flight-analysis/csvToJson";
import { generateAiDebrief, type RulEstimate } from "@/lib/flight-analysis/groqDebrief";

/**
 * Post-flight CSV → JSON analytics (Feature C).
 *
 * Default path is fully offline and air-gap safe: CSV (uploaded or the
 * current session) is parsed into a standardized `aeris-postflight-debrief-v1`
 * JSON packet — stats, exceedances, fault activity, rule-based findings, a
 * deterministic maintenance work order and a rule-based RUL band. Nothing
 * leaves the ground station.
 *
 * Optional: the operator can push that deterministic packet to a Groq-hosted
 * open-weights model for a plain-language engineering report (sortie overview,
 * key stats, anomalies, RUL translation, care items). The key is read only in
 * the server function — never in the browser — and the call fires only on an
 * explicit button click, never in a live loop.
 */
export function PostFlightAnalytics() {
  const recordedLogs = useFlightStore((s) => s.recordedLogs);
  const sessionLogs = useFlightStore((s) => s.sessionLogs);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [debrief, setDebrief] = useState<PostFlightDebrief | null>(null);
  const [sourceName, setSourceName] = useState<string>("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiRul, setAiRul] = useState<RulEstimate | null>(null);
  const [aiModel, setAiModel] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const runAiReport = useCallback(async () => {
    if (!debrief) return;
    setAiBusy(true);
    setAiError(null);
    setAiReport(null);
    try {
      const result = await generateAiDebrief({ data: { debrief } });
      setAiReport(result.report);
      setAiRul(result.rul);
      setAiModel(result.model);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "The AI report request failed — check the GROQ_API_KEY and try again.");
    } finally {
      setAiBusy(false);
    }
  }, [debrief]);

  const analyzeCsv = useCallback((csvText: string, label: string) => {
    try {
      const rows = parseFlightCsv(csvText);
      if (rows.length === 0) {
        setAnalysisError("No telemetry rows found — is this an AERIS-TWIN telemetry export?");
        setDebrief(null);
        return;
      }
      setDebrief(buildDebrief(rows));
      setSourceName(label);
      setAnalysisError(null);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to parse telemetry CSV");
      setDebrief(null);
    }
  }, []);

  function useSessionLogs() {
    const logs = recordedLogs.length > 0 ? recordedLogs : sessionLogs;
    if (!logs || logs.length === 0) {
      setAnalysisError("Session has no telemetry yet — record a flight (REC TELEMETRY) or fly the simulator first.");
      return;
    }
    analyzeCsv(serializeTelemetryLogs(logs), `SESSION LOG · ${logs.length} SAMPLES`);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => analyzeCsv(String(reader.result ?? ""), `UPLOAD · ${file.name}`);
    reader.onerror = () => setAnalysisError("Could not read the selected file.");
    reader.readAsText(file);
  }

  function downloadDebriefJson() {
    if (!debrief) return;
    const blob = new Blob([JSON.stringify(debrief, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AERIS_Debrief_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sampleCount = recordedLogs.length > 0 ? recordedLogs.length : sessionLogs.length;
  const critExc = (debrief?.exceedances ?? []).filter((e) => e.severity === "CRITICAL").length;
  const warnExc = (debrief?.exceedances ?? []).filter((e) => e.severity === "WARNING").length;

  return (
    <section className="border-t border-border/70 pt-4" aria-label="Post-flight CSV to JSON analytics">
      {/* heading + data-source controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label-xs text-cyan font-bold text-[11px]">POST-FLIGHT CSV → JSON ANALYTICS</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Offline conversion of raw flight logs into standardized debrief packets · rule-based work orders · optional on-demand AI engineering report
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={useSessionLogs}
            className="flex items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan transition-colors hover:bg-cyan/20"
          >
            <Database className="h-3.5 w-3.5" />
            ANALYZE SESSION ({sampleCount} SAMPLES)
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan transition-colors hover:bg-cyan/20"
          >
            <FileUp className="h-3.5 w-3.5" />
            UPLOAD CSV LOG
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {analysisError && (
        <div className="mt-3 flex items-center gap-2 border border-[#e2523f]/50 bg-[#2b0d0a]/70 px-3 py-2 font-mono text-[10px] font-bold text-[#e2523f]">
          <TriangleAlert className="h-3.5 w-3.5" /> {analysisError}
        </div>
      )}

      {debrief && (
        <>
          {/* summary strip */}
          <div className="mt-4 grid gap-px bg-border sm:grid-cols-4 lg:grid-cols-8">
            {[
              { k: "SOURCE", v: sourceName, small: true },
              { k: "DURATION", v: debrief.mission.durationHms },
              { k: "MAX ALT", v: `${debrief.mission.maxAltitudeFt.toLocaleString()} FT` },
              { k: "HEALTH MIN / END", v: `${debrief.health.min.toFixed(0)}% / ${debrief.health.end.toFixed(0)}%`, warn: debrief.health.min < 55 },
              { k: "CRITICAL EXCEED.", v: `${critExc}`, warn: critExc > 0 },
              { k: "WARN EXCEED.", v: `${warnExc}`, warn: warnExc > 0 },
              { k: "FINDINGS", v: `${debrief.findings.length}`, warn: debrief.findings.some((f) => f.severity === "CRITICAL") },
              { k: "FAULT ACTIVITY", v: `${debrief.faultActivity.length} FLAGS`, warn: debrief.faultActivity.length > 0 },
            ].map((cell) => (
              <div key={cell.k} className="min-w-0 bg-panel/90 p-2.5">
                <div className="label-xs text-[8px]">{cell.k}</div>
                <div className={`readout mt-0.5 truncate text-xs font-bold ${cell.small ? "text-cyan" : cell.warn ? "text-[#e2523f]" : "text-foreground"}`} title={cell.v}>
                  {cell.v}
                </div>
              </div>
            ))}
          </div>

          {/* AI engineering report (Groq · server-side key · explicit click only) */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-cyan/25 bg-cyan/[0.04] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-cyan" />
              <div className="min-w-0">
                <div className="label-xs font-bold text-cyan text-[10px]">AI ENGINEERING REPORT</div>
                <div className="text-[9px] text-muted-foreground">
                  Groq open-weights model reads the debrief + GCS RUL band · key stays server-side · fires only on click
                </div>
              </div>
            </div>
            <button
              onClick={runAiReport}
              disabled={aiBusy}
              className="flex items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan transition-colors hover:bg-cyan/20 disabled:cursor-wait disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiBusy ? "GENERATING…" : aiReport ? "REGENERATE" : "GENERATE REPORT"}
            </button>
          </div>

          {aiError && (
            <div className="mt-2 flex items-center gap-2 border border-[#e2523f]/50 bg-[#2b0d0a]/70 px-3 py-2 font-mono text-[10px] font-bold text-[#e2523f]">
              <TriangleAlert className="h-3.5 w-3.5" /> {aiError}
            </div>
          )}

          {aiReport && aiRul && (
            <div className="mt-3 border border-cyan/20 bg-panel/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-xs font-bold text-cyan text-[10px]">ENGINEERING REPORT — SORTIE {sourceName}</span>
                  <span className="flex items-center gap-1 border border-cyan/50 bg-cyan/10 px-1.5 py-0.5 font-mono text-[8px] font-black text-cyan">
                    RUL {aiRul.label} · {aiRul.bandHours} · CONSUMED {aiRul.consumed}/100
                  </span>
                </div>
                <span className="font-mono text-[8px] text-muted-foreground">MODEL {aiModel}</span>
              </div>
              {aiRul.basis.length > 0 && (
                <div className="border-b border-border/40 bg-panel/40 px-3 py-1.5">
                  <span className="label-xs text-[8px] opacity-60">RUL BASIS · {aiRul.basis.join(" · ")}</span>
                </div>
              )}
              <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[10px] leading-relaxed text-foreground/90">{aiReport}</pre>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Maintenance work order + findings */}
            <div className="min-w-0">
              <div className="flex items-center justify-between">
                <span className="label-xs font-bold text-amber text-[10px]">DETERMINISTIC MAINTENANCE WORK ORDER</span>
                <span className="label-xs text-[8px] opacity-60">RULE-BASED · OFFLINE</span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {debrief.workOrder.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 border border-border/60 bg-panel/70 px-2.5 py-2">
                    <span
                      className={`mt-px shrink-0 border px-1 font-mono text-[8px] font-black ${
                        line.priority === "P1"
                          ? "border-[#e2523f]/60 bg-[#e2523f]/15 text-[#e2523f]"
                          : line.priority === "P2"
                            ? "border-amber/50 bg-amber/10 text-amber"
                            : "border-nominal/40 bg-nominal/10 text-nominal"
                      }`}
                    >
                      {line.priority}
                    </span>
                    <span className="text-[10px] leading-relaxed text-foreground/85">{line.action}</span>
                  </div>
                ))}
              </div>

              {debrief.findings.length > 0 && (
                <>
                  <span className="label-xs mt-4 block font-bold text-[10px]">RULE-BASED FINDINGS</span>
                  <div className="mt-1.5 space-y-1.5">
                    {debrief.findings.map((f) => (
                      <div key={f.code} className="border-l-2 border-amber/60 bg-panel/60 px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`label-xs font-bold ${f.severity === "CRITICAL" ? "text-[#e2523f]" : "text-amber"}`}>{f.severity}</span>
                          <span className="text-[10px] font-semibold text-foreground/90">{f.title}</span>
                        </div>
                        <div className="mt-0.5 text-[9px] text-muted-foreground">{f.detail}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Standardized debrief JSON */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="label-xs font-bold text-[10px]">STANDARDIZED DEBRIEF JSON</span>
                  <div className="text-[9px] text-muted-foreground">aeris-postflight-debrief-v1 · generated entirely offline on the ground station</div>
                </div>
                <button
                  onClick={downloadDebriefJson}
                  className="flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground hover:border-cyan/50 hover:text-cyan"
                >
                  <Download className="h-3 w-3" /> DOWNLOAD JSON
                </button>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto border border-border/60 bg-panel/70 p-2.5 font-mono text-[9px] leading-relaxed text-cyan-dim">
                {JSON.stringify(debrief, null, 2)}
              </pre>
            </div>
          </div>

          {debrief.health.min < 55 && (
            <div className="mt-3 flex items-center gap-2 border border-[#e2523f]/40 bg-[#2b0d0a]/60 px-3 py-2 font-mono text-[9px] font-bold text-[#e2523f]">
              <CheckCircle2 className="h-3 w-3" />
              THIS FLIGHT CONTAINED AN EMERGENCY WINDOW — SEE MAYDAY CAUSES IN THE LIVE-TWIN LOG AND PRIORITIZE P1 WORK ORDERS.
            </div>
          )}
        </>
      )}

      {!debrief && !analysisError && (
        <div className="mt-3 border border-border/60 bg-panel/40 p-6 text-center">
          <div className="label-xs text-[10px] text-muted-foreground">
            Fly a mission, record telemetry, then analyze the session — or upload a previously exported AERIS-TWIN CSV.
            The JSON debrief is generated entirely offline on the ground station.
          </div>
        </div>
      )}
    </section>
  );
}
