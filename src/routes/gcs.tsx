import { lazy, Suspense, useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, Activity, Stethoscope, History, FlaskConical, Wrench, FileText, Expand, Shrink, Tag, Plane } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { Bar, Panel, StatusDot, useClock } from "@/components/hud/primitives";
import { TelemetryDashboard } from "@/features/telemetry/TelemetryDashboard";
import { ExplainablePanel, MaintenanceAdvisory, RulPanel } from "@/features/predictive-maintenance/Diagnostics";
import { SimulationLab } from "@/features/simulation/SimulationLab";
import { ReplayConsole } from "@/features/mission-replay/ReplayConsole";
import { FleetPanel } from "@/features/fleet/FleetPanel";
import { BASELINE_CONDITIONS, simulate } from "@/lib/domain/engine/model";
import { EngineAlertsPanel } from "@/features/digital-twin/EngineAlerts";
import type { PartHighlights } from "@/features/digital-twin/EngineModel";
import { JARVISPartInspector } from "@/features/digital-twin/JARVISPartInspector";
import { JARVISExplodeStudio } from "@/features/digital-twin/JARVISExplodeStudio";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useFlightStore } from "@/features/flight-sim/flightStore";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

export const Route = createFileRoute("/gcs")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN GCS — Ground Control Station" },
      {
        name: "description",
        content: "AERIS-TWIN Ground Control Station: live engine twin, predictive diagnostics, RUL, mission replay and what-if simulation for MALE UAV piston engines.",
      },
    ],
  }),
  component: GcsPage,
});

const NAV = [
  { key: "FLEET", icon: LayoutGrid },
  { key: "LIVE TWIN", icon: Activity },
  { key: "DIAGNOSTICS", icon: Stethoscope },
  { key: "MISSION REPLAY", icon: History },
  { key: "SIMULATION LAB", icon: FlaskConical },
  { key: "MAINTENANCE", icon: Wrench },
  { key: "REPORTS", icon: FileText },
] as const;

type NavKey = (typeof NAV)[number]["key"];

function Kpi({ label, value, sub, tone = "cyan" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="border border-border bg-panel/70 p-4">
      <div className="label-xs">{label}</div>
      <div className="readout mt-2 text-2xl" style={{ color: `var(--${tone})` }}>
        {value}
      </div>
      {sub && <div className="label-xs mt-1 text-[9px]">{sub}</div>}
    </div>
  );
}

function GcsPage() {
  const [tab, setTab] = useState<NavKey>("LIVE TWIN");
  const [exploded, setExploded] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  // Primitive selectors to trigger immediate React re-renders on every simulation frame tick
  const rpm = useFlightStore((s) => s.rpm);
  const cht = useFlightStore((s) => s.cht);
  const egt = useFlightStore((s) => s.egt);
  const map = useFlightStore((s) => s.map);
  const oilPressure = useFlightStore((s) => s.oilPressure);
  const oilTemp = useFlightStore((s) => s.oilTemp);
  const vibrationRMS = useFlightStore((s) => s.vibrationRMS);
  const healthIndex = useFlightStore((s) => s.healthIndex);
  const rulHours = useFlightStore((s) => s.rul);
  const activeAlerts = useFlightStore((s) => s.engineDecision?.alerts) || [];

  const throttle = useFlightStore((s) => s.throttle);
  const setThrottle = useFlightStore((s) => s.setThrottle);
  const rudder = useFlightStore((s) => s.rudder);
  const setRudder = useFlightStore((s) => s.setRudder);
  const altitude = useFlightStore((s) => s.altitude);
  const targetAltitude = useFlightStore((s) => s.targetAltitude);
  const setTargetAltitude = useFlightStore((s) => s.setTargetAltitude);
  const faults = useFlightStore((s) => s.faults);
  const toggleFault = useFlightStore((s) => s.toggleFault);

  // Compute part highlights directly from live aircraft flightStore telemetry
  const highlights: PartHighlights = useMemo(() => ({
    cyl1CHT: cht?.[0] ?? 140,
    cyl2CHT: cht?.[1] ?? 140,
    cyl3CHT: cht?.[2] ?? 140,
    cyl4CHT: cht?.[3] ?? 140,
    egt: egt ?? 680,
    rpm: rpm ?? 2400,
    vibration: vibrationRMS ?? 0.8,
    oilTemp: oilTemp ?? 95,
    health: healthIndex ?? 0.96,
  }), [cht, egt, rpm, vibrationRMS, oilTemp, healthIndex]);

  // Telemetry object for alerts panel
  const telemetry = useMemo(() => ({
    cht: cht || [140, 140, 140, 140],
    egt: egt ?? 680,
    map: map ?? 93,
    oilPressure: oilPressure ?? 5.2,
    oilTemp: oilTemp ?? 95,
    vibrationRMS: vibrationRMS ?? 0.8,
    rpm: rpm ?? 2400,
    health: healthIndex ?? 0.96,
  }), [cht, egt, map, oilPressure, oilTemp, vibrationRMS, rpm, healthIndex]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      {/* top bar */}
      <header className="relative z-20 flex h-12 items-center justify-between border-b border-border bg-panel/70 px-4 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link to="/" aria-label="Return to AERIS-TWIN landing page" className="flex min-h-11 items-center gap-2 label-xs hover:text-cyan">
            <ArrowLeft className="h-3 w-3" />
          </Link>
          <span className="font-display text-sm tracking-[0.3em]">AERIS-TWIN</span>
          <span className="hidden items-center gap-2 label-xs sm:flex">
            FLIGHT SIMULATOR STREAM <StatusDot /> CONNECTED 1:1
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/sim"
            className="flex min-h-8 items-center gap-2 border border-amber/70 bg-amber/10 px-3 text-[11px] font-mono label-xs text-amber backdrop-blur transition-all hover:bg-amber/20 hover:border-amber cursor-pointer"
          >
            <Plane className="h-3.5 w-3.5" /> 3D FLIGHT SIMULATOR
          </Link>
          <span className="hidden label-xs sm:inline">DATA QUALITY 100%</span>
          <span className="hidden label-xs md:inline">ML PIPELINE v2.4</span>
          <span className="label-xs border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-cyan">AIRCRAFT LIVE TWIN</span>
          <SignOutButton />
        </div>
      </header>

      <div className="relative z-10 flex">
        {/* left nav */}
        <nav aria-label="Ground control views" role="tablist" className="sticky top-12 hidden h-[calc(100vh-3rem)] w-56 shrink-0 border-r border-border bg-panel/50 p-3 lg:block">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.key}
                role="tab"
                aria-selected={tab === n.key}
                aria-controls={`gcs-panel-${n.key.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setTab(n.key)}
                className={`mb-1 flex w-full min-h-11 items-center gap-3 border px-3 py-2 label-xs transition-colors ${
                  tab === n.key
                    ? "border-cyan/70 bg-cyan/10 text-cyan"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{n.key}</span>
              </button>
            );
          })}
          <div className="my-2 border-t border-border/60" />
          <Link
            to="/sim"
            className="flex w-full min-h-11 items-center gap-3 border border-amber/60 bg-amber/10 px-3 py-2 label-xs font-bold text-amber transition-all hover:bg-amber/20 hover:border-amber"
          >
            <Plane className="h-4 w-4 text-amber" />
            <span>FLIGHT SIMULATOR</span>
          </Link>
        </nav>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          {/* mobile tabs */}
          <div role="tablist" aria-label="Ground control views mobile" className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <button
                key={n.key}
                role="tab"
                aria-selected={tab === n.key}
                aria-controls={`gcs-panel-${n.key.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setTab(n.key)}
                className={`min-h-11 shrink-0 border px-3 py-1.5 label-xs ${tab === n.key ? "border-cyan text-cyan" : "border-border"}`}
              >
                {n.key}
              </button>
            ))}
            <Link
              to="/sim"
              className="flex min-h-11 shrink-0 items-center gap-2 border border-amber/50 px-3 py-1.5 label-xs text-amber"
            >
              <Plane className="h-3 w-3" /> SIMULATOR
            </Link>
          </div>

          <div className="mb-4 border border-cyan/30 bg-cyan/5 px-3 py-2 label-xs text-cyan flex items-center justify-between" role="status">
            <span>LIVE TELEMETRY STREAM · CONNECTED 1:1 TO FLIGHT SIMULATOR AIRCRAFT</span>
            <span className="text-[10px] text-cyan/70 font-mono">RPM: {rpm.toFixed(0)} | ALT: {altitude.toFixed(0)} FT</span>
          </div>

          {/* GCS LIVE AIRCRAFT COMMAND & CONTROL BAR */}
          <div className="mb-4 border border-cyan/40 bg-panel/90 p-3 backdrop-blur grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Throttle Control */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between label-xs">
                <span className="text-cyan font-bold">LIVE THROTTLE</span>
                <span className="readout text-xs text-cyan font-bold">{throttle.toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={throttle}
                onChange={(e) => setThrottle(Number(e.target.value))}
                className="accent-cyan cursor-pointer h-2 bg-panel-2 rounded mt-1"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>IDLE (1400 RPM)</span>
                <span>FULL (5800 RPM)</span>
              </div>
            </div>

            {/* Rudder Control */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between label-xs">
                <span className="text-cyan font-bold">RUDDER LOAD</span>
                <span className="readout text-xs text-cyan font-bold">{rudder > 0 ? `+${rudder.toFixed(2)}` : rudder.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={rudder}
                onChange={(e) => setRudder(Number(e.target.value))}
                className="accent-cyan cursor-pointer h-2 bg-panel-2 rounded mt-1"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>PORT (-1.0)</span>
                <span>STBD (+1.0)</span>
              </div>
            </div>

            {/* Target Altitude */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between label-xs">
                <span className="text-cyan font-bold">ALTITUDE COMMAND</span>
                <span className="readout text-xs text-cyan font-bold">{altitude.toFixed(0)} FT</span>
              </div>
              <div className="flex gap-1 mt-1">
                {[3000, 6000, 12000, 18000].map((altVal) => (
                  <button
                    key={altVal}
                    onClick={() => setTargetAltitude(altVal)}
                    className={`flex-1 py-1 text-[9px] font-mono border transition-colors ${targetAltitude === altVal ? 'border-cyan bg-cyan/20 text-cyan font-bold' : 'border-border text-muted-foreground hover:border-cyan/50'}`}
                  >
                    {(altVal / 1000).toFixed(0)}k ft
                  </button>
                ))}
              </div>
            </div>

            {/* Live Fault Injectors */}
            <div className="flex flex-col gap-1">
              <span className="label-xs text-amber font-bold">LIVE FAULT INJECTORS</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button
                  onClick={() => toggleFault('c2Overheat')}
                  className={`py-1 text-[8px] font-mono border transition-colors ${faults.c2Overheat ? 'border-critical bg-critical/20 text-critical font-bold' : 'border-border text-muted-foreground hover:border-amber/50'}`}
                >
                  CYL 2 OVERHEAT
                </button>
                <button
                  onClick={() => toggleFault('turboFail')}
                  className={`py-1 text-[8px] font-mono border transition-colors ${faults.turboFail ? 'border-critical bg-critical/20 text-critical font-bold' : 'border-border text-muted-foreground hover:border-amber/50'}`}
                >
                  TURBO FAIL
                </button>
                <button
                  onClick={() => toggleFault('bearingFail')}
                  className={`py-1 text-[8px] font-mono border transition-colors ${faults.bearingFail ? 'border-critical bg-critical/20 text-critical font-bold' : 'border-border text-muted-foreground hover:border-amber/50'}`}
                >
                  BEARING FAIL
                </button>
                <button
                  onClick={() => toggleFault('injectorClog')}
                  className={`py-1 text-[8px] font-mono border transition-colors ${faults.injectorClog ? 'border-critical bg-critical/20 text-critical font-bold' : 'border-border text-muted-foreground hover:border-amber/50'}`}
                >
                  INJECTOR CLOG
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="ENGINE HEALTH" value={`${(healthIndex * 100).toFixed(1)}%`} sub="COMPOSITE / AE-P4" />
            <Kpi label="REMAINING USEFUL LIFE" value={`${(rulHours || 420).toFixed(1)} H`} sub="ML PREDICTED CONFIDENCE 94%" tone="cyan" />
            <Kpi label="MISSION RISK" value={healthIndex < 0.6 ? "HIGH" : healthIndex < 0.8 ? "MEDIUM" : "NOMINAL"} sub={`READINESS ${(healthIndex * 100).toFixed(0)}%`} tone={healthIndex < 0.7 ? "amber" : "cyan"} />
            <Kpi
              label="ACTIVE ADVISORIES"
              value={`${activeAlerts.length}`}
              sub={
                activeAlerts.filter((a) => a.severity === 'CRITICAL').length > 0
                  ? `${activeAlerts.filter((a) => a.severity === 'CRITICAL').length} CRITICAL / ${activeAlerts.filter((a) => a.severity === 'WARNING').length} WARN`
                  : activeAlerts.length > 0
                  ? `${activeAlerts.length} WARNINGS`
                  : "0 CRITICAL / NOMINAL"
              }
              tone={
                activeAlerts.some((a) => a.severity === 'CRITICAL')
                  ? "amber"
                  : activeAlerts.length > 0
                  ? "amber"
                  : "nominal"
              }
            />
          </div>

          {tab === "LIVE TWIN" && (
            <div id="gcs-panel-live-twin" role="tabpanel" aria-label="Live engine twin" className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <TelemetryDashboard fault={0.34} />
                <Panel label="LIVE ENGINE TWIN" corner="AE-P4 / INTERACTIVE">
                  <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsStudioOpen(true);
                      }}
                      className="flex min-h-10 items-center gap-1.5 border border-cyan bg-cyan/20 px-2.5 text-[9px] font-mono label-xs text-cyan backdrop-blur-sm transition-colors hover:bg-cyan/30 cursor-pointer pointer-events-auto select-none"
                    >
                      <Expand className="h-3 w-3" /> FULL-SCREEN LAB
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExploded((prev) => !prev);
                      }}
                      aria-pressed={exploded}
                      className="flex min-h-10 items-center gap-2 border border-cyan/50 bg-panel/95 px-3 text-[9px] font-mono label-xs text-cyan backdrop-blur-sm transition-colors hover:bg-cyan/20 cursor-pointer pointer-events-auto select-none"
                    >
                      {exploded ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
                      {exploded ? "ASSEMBLE" : "JARVIS EXPLODE"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowLabels((visible) => !visible);
                    }}
                    aria-pressed={showLabels}
                    aria-label={showLabels ? "Hide engine annotations" : "Show engine annotations"}
                    className="absolute top-3 left-3 z-30 flex min-h-10 items-center gap-2 border border-border bg-panel/95 px-3 text-[9px] font-mono label-xs backdrop-blur-sm transition-colors hover:border-cyan/50 hover:text-cyan cursor-pointer pointer-events-auto select-none"
                  >
                    <Tag className="h-3 w-3" /> LABELS {showLabels ? "ON" : "OFF"}
                  </button>
                  <div className="h-[360px]">
                    <ClientOnly>
                      <Suspense fallback={null}>
                         <EngineCanvas
                           interactive
                           spin={false}
                           fault={0.5}
                           cameraZ={8.3}
                           cameraView="gcs"
                           modelScale={0.82}
                           modelPosition={[0, -0.05, 0]}
                           highlights={highlights}
                           exploded={exploded}
                           showLabels={showLabels}
                           onSelectZone={(zoneName) => setSelectedZone(zoneName)}
                           selectedZone={selectedZone}
                         />
                      </Suspense>
                    </ClientOnly>
                  </div>
                  <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
                    {[
                      { k: "CYL 3 CHT", v: `${highlights.cyl3CHT.toFixed(0)}°C`, t: highlights.cyl3CHT > 200 ? 'text-[#e2523f]' : highlights.cyl3CHT > 170 ? 'text-[#f0a63c]' : '' },
                      { k: "CYL 3 EGT", v: `${highlights.egt.toFixed(0)}°C` },
                      { k: "CYL 3 VIB", v: `${highlights.vibration.toFixed(2)} G`, t: highlights.vibration > 1.5 ? 'text-[#e2523f]' : '' },
                    ].map((r) => (
                      <div key={r.k} className="bg-panel/90 p-2">
                        <div className="label-xs text-[9px]">{r.k}</div>
                        <div className={`readout text-xs ${r.t || 'text-amber'}`}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
              {/* Engine Alerts Panel */}
              <EngineAlertsPanel />
            </div>
          )}

          {selectedZone && (
            <JARVISPartInspector
              zoneName={selectedZone}
              highlights={highlights}
              onClose={() => setSelectedZone(null)}
              onExplodeToggle={() => setExploded(!exploded)}
              isExploded={exploded}
            />
          )}

          <JARVISExplodeStudio
            isOpen={isStudioOpen}
            onClose={() => setIsStudioOpen(false)}
            highlights={highlights}
          />


          {tab === "FLEET" && <FleetPanel />}
          {tab === "DIAGNOSTICS" && (
            <div className="grid gap-4">
              <EngineAlertsPanel />
              <ExplainablePanel />
              <RulPanel severity={0.45} />
            </div>
          )}
          {tab === "MISSION REPLAY" && <ReplayConsole />}
          {tab === "SIMULATION LAB" && <SimulationLab />}
          {tab === "MAINTENANCE" && <MaintenanceAdvisory />}
          {tab === "REPORTS" && (
            <Panel label="REPORTS" corner="EXPORT">
              <div className="p-4">
                {[
                  { k: "MSN-2214 MISSION REPORT", v: "GENERATED 00:41 UTC", p: 100 },
                  { k: "FLEET HEALTH SUMMARY / 30 D", v: "GENERATED 21:12 UTC", p: 100 },
                  { k: "AERIS-RUL-01 MODEL CARD", v: "v1.4 — SYNTHETIC VALIDATION", p: 100 },
                  { k: "ADVISORY AUDIT TRAIL", v: "STREAMING", p: 64 },
                ].map((r) => (
                  <div key={r.k} className="border-b border-border/60 py-3 last:border-0">
                    <div className="flex items-baseline justify-between">
                      <span className="label-xs">{r.k}</span>
                      <span className="readout text-[10px] text-muted-foreground">{r.v}</span>
                    </div>
                    <Bar className="mt-2" value={r.p} tone={r.p === 100 ? "nominal" : "cyan"} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <p className="mt-6 label-xs text-[9px] opacity-60">
            AERIS-TWIN is advisory and read-only. All values shown are produced by a deterministic simulation of a
            representative four-cylinder engine (AE-P4) and do not represent validated flight performance.
          </p>
        </main>
      </div>
      </div>
    </ProtectedRoute>
  );
}
