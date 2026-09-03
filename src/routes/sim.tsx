import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plane, Activity, ShieldAlert } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { StatusDot } from "@/components/hud/primitives";
import { FlightSimulator } from "@/features/flight-sim/FlightSimulator";
import { FlightHUD } from "@/features/flight-sim/FlightHUD";
import { ControlPanel } from "@/features/flight-sim/ControlPanel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { startAirborneLink, stopAirborneLink } from "@/features/datalink/airborne";
import { AirborneLinkPanel } from "@/features/datalink/AirborneLinkPanel";
import { LinkStatusChip } from "@/features/datalink/LinkStatusChip";

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

function SimPageContent() {
  // Datalink role: this window is the AIRBORNE session. It owns the physics
  // tick and streams binary telemetry to ground stations through the relay.
  useEffect(() => {
    startAirborneLink();
    return () => stopAirborneLink();
  }, []);

  const s = useFlightStore();
  const [showControlDrawer, setShowControlDrawer] = useState(true);

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
          <LinkStatusChip detailed />
          <Link
            to="/gcs"
            className="flex h-7 items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-2.5 text-[9px] font-mono label-xs text-cyan transition-all hover:bg-cyan/20 cursor-pointer"
          >
            <Activity className="h-3 w-3" /> GCS DASHBOARD
          </Link>
          <span className="hidden label-xs sm:inline">TAPAS BH-201 / ROTAX 914</span>
          <span className="label-xs border border-amber/40 bg-amber/10 px-2 py-0.5 text-amber font-mono font-bold">SIM</span>
          <SignOutButton />
        </div>
      </header>

      {/* Main Flight Viewport: full-screen UAV simulator */}
      <div className="relative flex-1 overflow-hidden bg-[#020406]">
        <ClientOnly>
          <FlightSimulator />
        </ClientOnly>

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
