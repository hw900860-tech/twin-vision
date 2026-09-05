import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plane, Activity, ShieldAlert, Zap, Volume2, VolumeX, Map, MapPinOff } from "lucide-react";
import { useJarvisStore } from "@/features/jarvis/jarvisStore";
import { ClientOnly } from "@/components/ClientOnly";
import { StatusDot } from "@/components/hud/primitives";
import { MiniMap } from "@/features/flight-sim/MiniMap";
import { flightAudio } from "@/features/flight-sim/flightEngineAudio";
import { installSortieRecorder, uninstallSortieRecorder } from "@/features/flight-sim/sortieRecorder";
import { FlightSimulator } from "@/features/flight-sim/FlightSimulator";
import { FlightHUD } from "@/features/flight-sim/FlightHUD";
import { ControlPanel } from "@/features/flight-sim/ControlPanel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import type { MissionReport } from "@/features/flight-sim/flightStore";
import { installGuidedDemo, uninstallGuidedDemo, closeDemoReport, startGuidedDemo } from "@/features/flight-sim/guidedDemo";
import { FlightSimAudio } from "@/features/flight-sim/FlightSimAudio";
import { startAirborneLink, stopAirborneLink } from "@/features/datalink/airborne";
import { AirborneLinkPanel } from "@/features/datalink/AirborneLinkPanel";
import { LinkStatusChip } from "@/features/datalink/LinkStatusChip";
import { FileJson, X, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/sim")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN — Flight Simulator & Real-Time Engine Digital Twin" },
      {
        name: "description",
        content:
          "Split-screen command console with live 3D UAV Flight Simulator on Right and Real-Time Rotax 914 3D Engine Digital Twin on Left.",
      },
    ],
  }),
  component: SimPage,
});

function SimPage() {
  return (
    <ProtectedRoute>
      <ClientOnly fallback={<div className="grid h-screen w-screen place-items-center bg-[#040608] font-mono text-cyan text-xs tracking-wider animate-pulse">INITIALIZING AEROSPACE COMMAND CONSOLE…</div>}>
        <SimPageContent />
      </ClientOnly>
    </ProtectedRoute>
  );
}

function fmtDemoTime(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function exportReportJson(report: MissionReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AERIS_MISSION_REPORT_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DemoReportModal({ report, onClose }: { report: MissionReport; onClose: () => void }) {
  const e = report.extremes;
  const tone = (v: number, warn: number, crit: number) =>
    v >= crit ? "text-critical" : v >= warn ? "text-amber" : "text-nominal";
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="pointer-events-auto w-[520px] max-w-[94vw] max-h-[88vh] overflow-y-auto border border-cyan/40 bg-panel/95 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-cyan/30 bg-cyan/10 px-4 py-2.5">
          <div>
            <div className="label-xs text-cyan font-bold tracking-widest">AUTO MISSION REPORT — AERIS-TWIN</div>
            <div className="text-[8px] text-muted-foreground font-mono mt-0.5">
              {report.mission} · {report.biome} · {fmtDemoTime(report.durationSec)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close mission report" className="p-1 text-muted-foreground hover:text-cyan transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {/* outcome */}
          <div className={`border px-3 py-2 text-[9px] font-mono font-bold tracking-wider ${report.outcome.startsWith("CRASHED") || report.outcome.startsWith("FORCED") ? "border-critical bg-critical/10 text-critical" : "border-nominal/50 bg-nominal/10 text-nominal"}`}>
            {report.outcome}
          </div>

          {/* timeline */}
          <div>
            <div className="label-xs mb-1 text-cyan">MISSION TIMELINE</div>
            <div className="space-y-1">
              {report.chips.map((c, i) => (
                <div key={i} className={`flex items-start gap-2 text-[8.5px] font-mono leading-tight ${
                  c.tone === "critical" ? "text-critical" : c.tone === "amber" ? "text-amber" : c.tone === "nominal" ? "text-nominal" : "text-cyan"
                }`}>
                  <span className="shrink-0 opacity-70">T+{String(c.t).padStart(2, "0")}s</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* fault / rtb timing */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border p-2">
              <div className="text-[7px] text-muted-foreground">FAULT AT</div>
              <div className="text-[10px] font-mono text-critical">{fmtDemoTime(report.faultAtSec)}</div>
            </div>
            <div className="border border-border p-2">
              <div className="text-[7px] text-muted-foreground">MAYDAY AT</div>
              <div className="text-[10px] font-mono text-amber">{fmtDemoTime(report.maydayAtSec)}</div>
            </div>
            <div className="border border-border p-2">
              <div className="text-[7px] text-muted-foreground">RTB AT</div>
              <div className="text-[10px] font-mono text-nominal">{fmtDemoTime(report.rtbAtSec)}</div>
            </div>
          </div>

          {/* engine extremes */}
          <div>
            <div className="label-xs mb-1 text-cyan">ENGINE EXTREMES (FAULT WINDOW)</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[8.5px] font-mono">
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">CHT-1 MAX</span>
                <span className={tone(e.maxCht[0], 170, 200)}>{e.maxCht[0].toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">CHT-2 MAX</span>
                <span className={tone(e.maxCht[1], 170, 200)}>{e.maxCht[1].toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">CHT-3 MAX</span>
                <span className={tone(e.maxCht[2], 170, 200)}>{e.maxCht[2].toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">CHT-4 MAX</span>
                <span className={tone(e.maxCht[3], 170, 200)}>{e.maxCht[3].toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">EGT MAX</span>
                <span className={tone(e.maxEgt, 800, 880)}>{e.maxEgt.toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">MAP MIN</span>
                <span className={tone(100 - e.minMap, 100 - 55, 100 - 45)}>{e.minMap.toFixed(1)} kPa</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">OIL TEMP MAX</span>
                <span className={tone(e.maxOilTemp, 100, 115)}>{e.maxOilTemp.toFixed(0)}°C</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">VIBRATION MAX</span>
                <span className={tone(e.maxVib, 1.2, 2.2)}>{e.maxVib.toFixed(2)} m/s²</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">HEALTH MIN</span>
                <span className={tone(e.minHealthPct, 70, 40)}>{e.minHealthPct.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">RUL CONSUMED</span>
                <span className="text-cyan">{e.rulConsumed.toFixed(1)} h</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">MAX ALTITUDE</span>
                <span className="text-cyan">{e.maxAltFt.toFixed(0)} ft</span>
              </div>
              <div className="flex justify-between border-b border-border/50 py-0.5">
                <span className="text-muted-foreground">FAULT</span>
                <span className="text-critical">{report.faultInjected}</span>
              </div>
            </div>
          </div>

          {/* waypoints + region crossings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-xs mb-1 text-cyan">WAYPOINT CAPTURES</div>
              <div className="space-y-0.5 text-[8px] font-mono text-foreground">
                {report.waypointCaptures.length === 0 && <div className="text-muted-foreground">—</div>}
                {report.waypointCaptures.map((c, i) => (
                  <div key={i} className="flex justify-between border-b border-border/40 py-0.5">
                    <span>WP-{String(c.wp).padStart(2, "0")}</span>
                    <span className="text-cyan">{fmtDemoTime(c.t)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="label-xs mb-1 text-cyan">REGION CROSSINGS</div>
              <div className="space-y-0.5 text-[8px] font-mono">
                {report.regionCrossings.length === 0 && <div className="text-muted-foreground">—</div>}
                {report.regionCrossings.map((r, i) => (
                  <div key={i} className="border-b border-border/40 py-0.5 text-amber">{r}</div>
                ))}
              </div>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => exportReportJson(report)}
              className="flex-1 flex items-center justify-center gap-1.5 border border-cyan/60 bg-cyan/10 p-2 text-[9px] font-bold text-cyan hover:bg-cyan/20 transition-colors"
            >
              <FileJson className="h-3 w-3" /> EXPORT REPORT (JSON)
            </button>
            <button
              onClick={() => { onClose(); startGuidedDemo(); }}
              className="flex-1 flex items-center justify-center gap-1.5 border border-amber/60 bg-amber/10 p-2 text-[9px] font-bold text-amber hover:bg-amber/20 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> RUN DEMO AGAIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimPageContent() {
  // Datalink role: this window is the AIRBORNE session. It owns the physics
  // tick and streams binary telemetry to ground stations through the relay.
  useEffect(() => {
    startAirborneLink();
    installSortieRecorder();
    installGuidedDemo();
    return () => {
      stopAirborneLink();
      uninstallSortieRecorder();
      uninstallGuidedDemo();
    };
  }, []);

  const s = useFlightStore();
  const [showControlDrawer, setShowControlDrawer] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showMap, setShowMap] = useState(true);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#040608] text-foreground select-none">
      {/* Top Header Bar */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-cyan/30 bg-panel/90 px-4 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <Link to="/gcs" aria-label="Return to GCS Dashboard" className="flex items-center gap-2 label-xs text-cyan hover:text-cyan/80 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-bold">BACK TO GCS FLEET DASHBOARD</span>
          </Link>
          <span className="flex items-center gap-2 label-xs text-cyan font-bold tracking-wider">
            <Plane className="h-3.5 w-3.5 text-cyan" />
            AEROSPACE COMMAND CONSOLE
          </span>
          <span className="hidden items-center gap-2 label-xs sm:flex">
            <StatusDot /> <span className="text-nominal font-semibold">● LIVE FLIGHT SIM</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => useJarvisStore.getState().toggleOpen()}
            className="flex h-7 items-center gap-1.5 border border-cyan bg-cyan/15 px-2.5 text-[9px] font-mono label-xs text-cyan backdrop-blur transition-all hover:bg-cyan/25 hover:shadow-[0_0_15px_rgba(111,216,232,0.35)] cursor-pointer"
            title="Toggle JARVIS AI Voice Copilot"
          >
            <Zap className="h-3 w-3 text-cyan animate-pulse" />
            <span className="font-bold">JARVIS COPILOT</span>
          </button>
          <LinkStatusChip detailed />
          <Link
            to="/gcs"
            className="flex h-7 items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-2.5 text-[9px] font-mono label-xs text-cyan transition-all hover:bg-cyan/20 cursor-pointer"
          >
            <Activity className="h-3 w-3" /> GCS DASHBOARD
          </Link>
          <span className="hidden label-xs sm:inline">TAPAS BH-201 / ROTAX 914</span>
          <button
            type="button"
            onClick={() => { setAudioMuted(m => { const v = !m; flightAudio.muted = v; return v; }); }}
            className="flex h-7 w-7 items-center justify-center border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/25 transition-colors cursor-pointer"
            title={audioMuted ? "Unmute Engine Audio" : "Mute Engine Audio"}
          >
            {audioMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => setShowMap(m => !m)}
            className="flex h-7 w-7 items-center justify-center border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/25 transition-colors cursor-pointer"
            title={showMap ? "Hide Tactical Map" : "Show Tactical Map"}
          >
            {showMap ? <Map className="h-3 w-3" /> : <MapPinOff className="h-3 w-3" />}
          </button>
          <span className="label-xs border border-amber/40 bg-amber/10 px-2 py-0.5 text-amber font-mono font-bold">SIM</span>
          <SignOutButton />
        </div>
      </header>

      {/* Sim-only audio: continuous engine voice follows live RPM/airspeed;
          crash = impact + engine shutdown; restart spools back up. */}
      <FlightSimAudio />

      {/* Main Flight Viewport: full-screen UAV simulator */}
      <div className="relative flex-1 overflow-hidden bg-[#020406]">
        <ClientOnly>
          <FlightSimulator />
        </ClientOnly>

        {/* Tactical mini-map (top-left, closeable) */}
        {showMap && (
          <div className="pointer-events-none absolute left-2 top-2 z-20 w-[248px]">
            <ClientOnly>
              <MiniMap />
            </ClientOnly>
          </div>
        )}

        {/* HUD overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <ClientOnly>
            <FlightHUD />
          </ClientOnly>
        </div>

        {/* Datalink modem panel (LOS / SATCOM / OUTAGE) */}
        <div className="pointer-events-none absolute left-2 bottom-2 z-20 w-[240px]">
          <AirborneLinkPanel />
        </div>

        {/* Floating Control Panel Sidebar */}
        {showControlDrawer && (
          <div className="pointer-events-auto absolute right-2 top-2 bottom-2 w-[280px] z-30 shadow-2xl rounded border border-cyan/30 bg-panel/95 backdrop-blur-md overflow-y-auto">
            <ClientOnly>
              <ControlPanel />
            </ClientOnly>
          </div>
        )}
      </div>

        {/* Guided demo auto mission report */}
        {s.demo.report && (
          <ClientOnly>
            <DemoReportModal report={s.demo.report} onClose={closeDemoReport} />
          </ClientOnly>
        )}

      {/* Bottom Footer: flight telemetry + recording + datalink readout */}
      <footer className="shrink-0 border-t border-cyan/30 bg-[#040608] px-3 py-1.5 z-40 font-mono text-[8.5px] flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-cyan">
          <div><span className="text-[7.5px] text-muted-foreground block">ALTITUDE</span><span className="font-bold text-foreground">{s.altitude.toFixed(0)} ft</span></div>
          <div><span className="text-[7.5px] text-muted-foreground block">SPEED</span><span className="font-bold text-foreground">{s.speed.toFixed(0)} kts</span></div>
          <div><span className="text-[7.5px] text-muted-foreground block">THROTTLE</span><span className="font-bold text-foreground">{s.throttle.toFixed(0)}%</span></div>
          <div><span className="text-[7.5px] text-muted-foreground block">HEADING</span><span className="font-bold text-foreground">{s.heading.toFixed(0)}°</span></div>
          <div><span className="text-[7.5px] text-muted-foreground block">RPM</span><span className="font-bold text-foreground">{s.rpm.toFixed(0)}</span></div>
          <div><span className="text-[7.5px] text-muted-foreground block">MISSION</span><span className="font-bold text-foreground">{s.missionActive ? "ACTIVE" : "STANDBY"}</span></div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={s.toggleRecording}
            className={`px-2 py-0.5 border text-[8px] font-bold rounded transition-all ${
              s.isRecording ? 'border-critical bg-critical/20 text-critical animate-pulse' : 'border-border bg-panel-2 text-muted-foreground hover:text-cyan'
            }`}
          >
            {s.isRecording ? '● RECORDING TELEMETRY' : 'REC TELEMETRY'}
          </button>
          <button
            onClick={s.exportCSV}
            className="px-2 py-0.5 border border-cyan/50 bg-cyan/15 text-[8px] text-cyan font-bold hover:bg-cyan/30 rounded transition-colors shadow-sm"
            title="Export the recorded telemetry log to CSV (a ground-side debrief report — never a transport format)"
          >
            EXPORT CSV ({(s.recordedLogs?.length || s.sessionLogs?.length || 1)})
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-amber truncate max-w-[40%]">
          <ShieldAlert className="h-3 w-3 text-amber shrink-0" />
          <span className="text-[8.5px] text-amber/90 truncate">{s.systemMessage ?? "All systems nominal. Mission parameters cleared."}</span>
        </div>
      </footer>
    </div>
  );
}
