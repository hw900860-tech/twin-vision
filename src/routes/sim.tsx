import { useState, Suspense, lazy } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plane, Zap, ShieldAlert, Expand, Shrink, Activity } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { StatusDot } from "@/components/hud/primitives";
import { FlightSimulator } from "@/features/flight-sim/FlightSimulator";
import { FlightHUD } from "@/features/flight-sim/FlightHUD";
import { ControlPanel } from "@/features/flight-sim/ControlPanel";
import { SimEngineTwinConsole } from "@/features/flight-sim/SimEngineTwinConsole";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useFlightStore } from "@/features/flight-sim/flightStore";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

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
  const s = useFlightStore();
  const [showFullConsole, setShowFullConsole] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(1.0);
  const [showControlDrawer, setShowControlDrawer] = useState(true);

  const decision = s.engineDecision;
  const outputs = decision?.modelOutputs;
  const selectedZoneName = s.selectedSubsystem;

  const highlights = {
    cyl1CHT: outputs?.cylhead.cht1 ?? s.cht[0],
    cyl2CHT: outputs?.cylhead.cht2 ?? s.cht[1],
    cyl3CHT: outputs?.cylhead.cht3 ?? s.cht[2],
    cyl4CHT: outputs?.cylhead.cht4 ?? s.cht[3],
    egt: outputs?.exhaust.avgEGT ?? s.egt,
    rpm: s.rpm,
    vibration: s.vibrationRMS,
    oilTemp: s.oilTemp,
    health: s.healthIndex,
  };

  // Helper calculation for fixed component inspection panel
  let selectedStress = 0;
  let selectedMetricVal = "NOMINAL";
  let selectedMlRisk = 0;

  if (selectedZoneName) {
    if (selectedZoneName.includes("CYLINDER")) {
      selectedStress = Math.max(...s.componentStress.cylinders);
      selectedMetricVal = `${Math.max(...s.cht).toFixed(0)}°C CHT`;
      selectedMlRisk = decision?.subsystems?.cylHead ? Math.round(100 - decision.subsystems.cylHead.health) : 15;
    } else if (selectedZoneName.includes("EXHAUST")) {
      selectedStress = Math.max(...s.componentStress.exhaustRunners);
      selectedMetricVal = `${s.egt.toFixed(0)}°C EGT`;
      selectedMlRisk = decision?.subsystems?.exhaust ? Math.round(100 - decision.subsystems.exhaust.health) : 18;
    } else if (selectedZoneName.includes("TURBO") || selectedZoneName.includes("INTAKE")) {
      selectedStress = s.componentStress.turbo;
      selectedMetricVal = `${s.map.toFixed(1)} kPa`;
      selectedMlRisk = decision?.subsystems?.turboIntake ? Math.round(100 - decision.subsystems.turboIntake.health) : 22;
    } else if (selectedZoneName.includes("CRANKCASE")) {
      selectedStress = s.componentStress.crankcase;
      selectedMetricVal = `${s.vibrationRMS.toFixed(2)} m/s²`;
      selectedMlRisk = decision?.subsystems?.crankcase ? Math.round(100 - decision.subsystems.crankcase.health) : 12;
    } else if (selectedZoneName.includes("OIL")) {
      selectedStress = s.componentStress.oilSystem;
      selectedMetricVal = `${s.oilTemp.toFixed(0)}°C / ${s.oilPressure.toFixed(1)} bar`;
      selectedMlRisk = decision?.subsystems?.oilSump ? Math.round(100 - decision.subsystems.oilSump.health) : 10;
    } else if (selectedZoneName.includes("GEARBOX") || selectedZoneName.includes("PROP")) {
      selectedStress = s.componentStress.gearbox;
      selectedMetricVal = `${s.rpm.toFixed(0)} RPM`;
      selectedMlRisk = decision?.subsystems?.propGearbox ? Math.round(100 - decision.subsystems.propGearbox.health) : 14;
    }
  }

  const selectedStressPct = Math.round(selectedStress * 100);
  const selectedStatusText = selectedStressPct > 85 ? "CRITICAL" : selectedStressPct > 70 ? "WARNING" : selectedStressPct > 50 ? "ELEVATED" : "NOMINAL";
  const selectedStatusColor = selectedStressPct > 85 ? "#ef4444" : selectedStressPct > 70 ? "#f97316" : selectedStressPct > 50 ? "#eab308" : "#10b981";

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
            <StatusDot /> <span className="text-nominal font-semibold">● LIVE ENGINE & FLIGHT SIM</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/gcs"
            className="flex h-7 items-center gap-1.5 border border-cyan/60 bg-cyan/10 px-2.5 text-[9px] font-mono label-xs text-cyan transition-all hover:bg-cyan/20 cursor-pointer"
          >
            <Activity className="h-3 w-3" /> GCS DASHBOARD
          </Link>

          <button
            onClick={() => setShowFullConsole(!showFullConsole)}
            className={`flex h-7 items-center gap-1.5 border px-2.5 text-[9px] font-mono tracking-wider transition-all ${
              showFullConsole
                ? 'border-cyan bg-cyan/20 text-cyan shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'border-cyan/50 bg-cyan/10 text-cyan hover:bg-cyan/20'
            }`}
          >
            <Zap className="h-3 w-3 animate-pulse" />
            {showFullConsole ? 'COLLAPSE CONSOLE' : 'FULL DIAGNOSTIC CONSOLE'}
          </button>

          <span className="hidden label-xs sm:inline">ROTAX 914 / 6-ML TWIN</span>
          <span className="label-xs border border-amber/40 bg-amber/10 px-2 py-0.5 text-amber font-mono font-bold">SIM</span>
          <SignOutButton />
        </div>
      </header>

      {/* Full Diagnostic Modal overlay if requested */}
      {showFullConsole && (
        <div className="absolute inset-x-2 bottom-2 top-12 z-50 lg:left-auto lg:right-2 lg:top-12 lg:w-[850px] lg:h-[calc(100vh-60px)] shadow-2xl rounded-lg overflow-hidden border border-cyan/40 bg-background/95 backdrop-blur-xl">
          <ClientOnly>
            <SimEngineTwinConsole onClose={() => setShowFullConsole(false)} />
          </ClientOnly>
        </div>
      )}

      {/* Main Split-Screen Viewport Container: ~38% LEFT (Engine), ~62% RIGHT (Flight Sim) */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden relative">
        {/* ============================================================ */}
        {/* LEFT VIEWPORT: LIVE 3D ENGINE DIGITAL TWIN (~38% width) */}
        {/* ============================================================ */}
        <div className="relative flex flex-col lg:w-[38%] xl:w-[36%] w-full h-1/2 lg:h-full border-b lg:border-b-0 lg:border-r border-cyan/30 bg-[#030507]">
          {/* Engine Sub-header ribbon */}
          <div className="flex flex-wrap items-center justify-between border-b border-border/80 bg-[#05080c] px-3 py-1 text-[8.5px] font-mono text-cyan z-20 gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-cyan flex items-center gap-1">
                <Zap className="h-3 w-3 text-cyan" /> LIVE DIGITAL TWIN
              </span>
            </div>

            {/* Visualization Mode Selector */}
            <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded border border-border/80">
              {(['NORMAL', 'PRESSURE', 'THERMAL', 'VIBRATION', 'ML_RISK', 'XRAY'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => s.setVizMode(mode)}
                  className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                    s.vizMode === mode
                      ? 'bg-cyan text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                      : 'text-muted-foreground hover:text-cyan'
                  }`}
                >
                  {mode.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Clean 3D Engine Viewport (No floating labels) */}
          <div className="relative flex-1 bg-[#020406]">
            <ClientOnly>
              <Suspense fallback={<div className="grid h-full place-items-center label-xs text-cyan">LOADING 3D ENGINE DIGITAL TWIN...</div>}>
                <EngineCanvas
                  interactive
                  spin={false}
                  cameraZ={7.6}
                  modelScale={1.0}
                  modelPosition={[0, -0.25, 0]}
                  highlights={highlights}
                  exploded={exploded}
                  wireframe={wireframe}
                  explodeAmount={explodeAmount}
                  showLabels={true}
                  selectedZone={selectedZoneName}
                  onSelectZone={(name) => s.setSelectedSubsystem(name ?? '')}
                />
              </Suspense>
            </ClientOnly>

            {/* Orbit & Dismantle Controls */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-panel/90 p-1.5 backdrop-blur-md border border-border/60 text-[8.5px] font-mono text-cyan rounded shadow-lg">
              <button
                onClick={() => setExploded(!exploded)}
                className="flex h-5 items-center gap-1 border border-cyan/50 bg-cyan/15 px-2 text-[8px] font-mono text-cyan hover:bg-cyan/30 rounded"
              >
                {exploded ? <Shrink className="h-2.5 w-2.5" /> : <Expand className="h-2.5 w-2.5" />}
                {exploded ? 'ASSEMBLE' : 'DISMANTLE'}
              </button>
              {exploded && (
                <input
                  type="range"
                  min="0.2"
                  max="1.5"
                  step="0.1"
                  value={explodeAmount}
                  onChange={(e) => setExplodeAmount(parseFloat(e.target.value))}
                  className="w-14 accent-cyan cursor-pointer"
                />
              )}
            </div>

            {/* Subtle Heatmap Legend */}
            <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 bg-panel/90 px-2 py-1 backdrop-blur-md border border-border/60 text-[7.5px] font-mono text-muted-foreground rounded shadow-lg">
              <span className="font-bold text-cyan">HEATMAP:</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded bg-[#06b6d4]" /> NORM</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded bg-[#10b981]" /> LOW</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded bg-[#eab308]" /> ELEV</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded bg-[#f97316]" /> WARN</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded bg-[#ef4444]" /> CRIT</span>
            </div>
          </div>

          {/* Dedicated Component Inspection Panel or Active Subsystem Load Map */}
          {selectedZoneName ? (
            /* DEDICATED FIXED INSPECTION PANEL (When a component is clicked) */
            <div className="border-t border-cyan/30 bg-panel/95 p-2 text-[8.5px] font-mono z-20">
              <div className="flex items-center justify-between border-b border-border/60 pb-1 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-cyan" />
                  <span className="font-bold text-cyan uppercase tracking-wider">SELECTED COMPONENT: {selectedZoneName}</span>
                </div>
                <button
                  onClick={() => s.setSelectedSubsystem('')}
                  className="px-1.5 py-0.5 border border-cyan/40 bg-cyan/10 text-cyan text-[7.5px] hover:bg-cyan/20 rounded font-bold"
                >
                  RESET FOCUS
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5 py-1 text-center">
                <div className="bg-background/60 p-1.5 rounded border border-border/60">
                  <span className="text-[7px] text-muted-foreground block">LOAD STRESS</span>
                  <span className="font-bold text-[10.5px]" style={{ color: selectedStatusColor }}>{selectedStressPct}%</span>
                </div>
                <div className="bg-background/60 p-1.5 rounded border border-border/60">
                  <span className="text-[7px] text-muted-foreground block">PRIMARY METRIC</span>
                  <span className="font-bold text-[10.5px] text-foreground">{selectedMetricVal}</span>
                </div>
                <div className="bg-background/60 p-1.5 rounded border border-border/60">
                  <span className="text-[7px] text-muted-foreground block">OPERATING STATUS</span>
                  <span className="font-bold text-[10.5px]" style={{ color: selectedStatusColor }}>{selectedStatusText}</span>
                </div>
                <div className="bg-background/60 p-1.5 rounded border border-border/60">
                  <span className="text-[7px] text-muted-foreground block">ML SUBSYSTEM RISK</span>
                  <span className="font-bold text-[10.5px] text-cyan">{selectedMlRisk}%</span>
                </div>
              </div>
            </div>
          ) : (
            /* COMPACT ACTIVE SUBSYSTEM LOAD MAP (Default view) */
            <div className="border-t border-cyan/30 bg-panel/90 p-2 text-[8.5px] font-mono z-20">
              <div className="flex items-center justify-between border-b border-border/60 pb-1 mb-1.5">
                <span className="font-bold text-cyan flex items-center gap-1">
                  <Activity className="h-3 w-3 text-cyan" /> ACTIVE SUBSYSTEM LOAD MAP
                </span>
                <span className="text-[7.5px] text-muted-foreground">CLICK COMPONENT TO INSPECT</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[
                  { key: 'CYLINDER HEAD', stress: Math.max(...s.componentStress.cylinders), zone: 'CYLINDER HEAD (ROTAX RED)' },
                  { key: 'EXHAUST MANIFOLD', stress: Math.max(...s.componentStress.exhaustRunners), zone: 'EXHAUST MANIFOLD' },
                  { key: 'TURBO / INTAKE', stress: s.componentStress.turbo, zone: 'INTAKE / TURBO & CARBS' },
                  { key: 'CRANKCASE / BEARING', stress: s.componentStress.crankcase, zone: 'CRANKCASE BLOCK' },
                  { key: 'OIL LUBRICATION', stress: s.componentStress.oilSystem, zone: 'OIL SUMP & FILTER' },
                  { key: 'GEARBOX & PROP', stress: s.componentStress.gearbox, zone: 'GEARBOX & PROP FLANGE' },
                ].map((item) => {
                  const pct = Math.round(item.stress * 100);
                  const isSelected = selectedZoneName === item.zone;
                  const color = pct > 85 ? '#ef4444' : pct > 70 ? '#f97316' : pct > 50 ? '#eab308' : '#06b6d4';

                  return (
                    <button
                      key={item.key}
                      onClick={() => s.setSelectedSubsystem(item.zone)}
                      className={`flex items-center justify-between p-1 border text-left transition-all ${
                        isSelected ? 'border-cyan bg-cyan/15 shadow-[0_0_8px_rgba(6,182,212,0.3)]' : 'border-border/60 bg-background/50 hover:border-cyan/40'
                      }`}
                    >
                      <span className="text-[7.5px] text-foreground font-semibold truncate max-w-[85px]">{item.key}</span>
                      <span className="font-bold text-[8.5px]" style={{ color }}>{pct}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* RIGHT VIEWPORT: LIVE AIRCRAFT FLIGHT SIMULATOR (~62% width) */}
        {/* ============================================================ */}
        <div className="relative flex flex-col lg:w-[62%] xl:w-[64%] w-full h-1/2 lg:h-full bg-[#020406]">
          {/* Flight Sub-header ribbon */}
          <div className="flex items-center justify-between border-b border-border/80 bg-[#05080c] px-3 py-1 text-[8.5px] font-mono text-cyan z-20">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-cyan flex items-center gap-1">
                <Plane className="h-3 w-3 text-cyan" /> AIRCRAFT FLIGHT SIMULATOR
              </span>
              <span className="text-[7.5px] text-muted-foreground uppercase hidden sm:inline">
                SCENARIO: {s.missionPreset} | BIOME: {s.biome}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowControlDrawer(!showControlDrawer)}
                className="px-2 py-0.5 border border-cyan/40 bg-cyan/10 text-cyan text-[8px] font-mono font-bold hover:bg-cyan/20 rounded"
              >
                {showControlDrawer ? 'HIDE CONTROLS' : 'SHOW CONTROLS'}
              </button>
            </div>
          </div>

          {/* 3D Aircraft Canvas */}
          <div className="relative flex-1">
            <ClientOnly>
              <FlightSimulator />
            </ClientOnly>

            {/* HUD overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none">
              <ClientOnly>
                <FlightHUD />
              </ClientOnly>
            </div>

            {/* Floating Control Panel Sidebar */}
            {showControlDrawer && (
              <div className="pointer-events-auto absolute right-2 top-2 bottom-2 w-[260px] z-30 shadow-2xl rounded border border-cyan/30 bg-panel/95 backdrop-blur-md overflow-y-auto">
                <ClientOnly>
                  <ControlPanel />
                </ClientOnly>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* BOTTOM FOOTER: LIVE TELEMETRY & JARVIS DIAGNOSTICS BAR */}
      {/* ============================================================ */}
      <footer className="shrink-0 border-t border-cyan/30 bg-[#040608] px-3 py-1.5 z-40 font-mono text-[8.5px] flex flex-col gap-1">
        {/* Telemetry Metrics & Telemetry Logger Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-cyan">
            <div><span className="text-[7.5px] text-muted-foreground block">RPM</span><span className="font-bold text-foreground">{s.rpm.toFixed(0)}</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">ALTITUDE</span><span className="font-bold text-foreground">{s.altitude.toFixed(0)} ft</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">THROTTLE</span><span className="font-bold text-foreground">{s.throttle.toFixed(0)}%</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">EGT</span><span className="font-bold" style={{ color: s.egt > 750 ? '#ef4444' : '#06b6d4' }}>{s.egt.toFixed(0)}°C</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">MAP</span><span className="font-bold text-foreground">{s.map.toFixed(1)} kPa</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">OIL TEMP</span><span className="font-bold text-foreground">{s.oilTemp.toFixed(0)}°C</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">VIB RMS</span><span className="font-bold" style={{ color: s.vibrationRMS > 1.5 ? '#ef4444' : '#06b6d4' }}>{s.vibrationRMS.toFixed(2)} m/s²</span></div>
            <div><span className="text-[7.5px] text-muted-foreground block">HEALTH</span><span className="font-bold text-nominal">{(s.healthIndex * 100).toFixed(0)}%</span></div>
          </div>

          {/* Telemetry Recording Controls */}
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
              title="Export complete telemetry log to CSV"
            >
              EXPORT CSV ({(s.recordedLogs?.length || s.sessionLogs?.length || 1)})
            </button>
          </div>
        </div>

        {/* JARVIS Diagnostics Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-amber">
          <div className="flex items-center gap-1.5 truncate max-w-[80%]">
            <ShieldAlert className="h-3 w-3 text-amber shrink-0" />
            <span className="font-bold text-[8px] uppercase tracking-wider">JARVIS DIAGNOSIS:</span>
            <span className="text-[8.5px] text-amber/90 truncate">{decision?.diagnosisText || "All systems nominal."}</span>
          </div>

          <div className="flex items-center gap-2 text-[8px]">
            <span className="font-bold text-foreground">ACTION:</span>
            <span className="text-muted-foreground">{decision?.recommendedAction || "Maintain flight profile."}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
