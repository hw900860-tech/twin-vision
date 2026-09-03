import { useState, Suspense, lazy } from "react";
import { X, Expand, Shrink, Eye, EyeOff, RotateCw, Activity, Layers, Zap, Info, ShieldCheck, ChevronRight, Sliders, Box } from "lucide-react";
import { engineViewerAudio } from "./engineViewerAudio";
import type { PartHighlights } from "./EngineModel";
import { ZONES } from "./EngineModel";
import { ZONE_DETAILS } from "./JARVISPartInspector";

const EngineCanvas = lazy(() => import("./EngineCanvas"));

export function JARVISExplodeStudio({
  isOpen,
  onClose,
  highlights,
}: {
  isOpen: boolean;
  onClose: () => void;
  highlights: PartHighlights;
}) {
  const [exploded, setExploded] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(1.0);
  const [selectedPart, setSelectedPart] = useState<string | null>("CYLINDER HEAD");

  if (!isOpen) return null;

  const activeZone = ZONES.find((z) => z.name === selectedPart) ?? ZONES[0];
  const meta = ((selectedPart ? ZONE_DETAILS[selectedPart] : null) ?? ZONE_DETAILS["CYLINDER HEAD"])!;
  const telemetryItems = meta.getTelemetry(highlights);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070a0d] text-foreground animate-in fade-in duration-300 overflow-hidden select-none">
      {/* Top HUD Control Bar */}
      <header className="relative z-30 flex h-14 items-center justify-between border-b border-cyan/30 bg-panel/90 px-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-cyan animate-pulse" />
          <div>
            <span className="font-display text-sm font-bold tracking-[0.25em] text-cyan">
              JARVIS // DISMANTLE INTELLIGENCE LAB
            </span>
            <span className="ml-3 hidden text-[10px] font-mono text-muted-foreground sm:inline">
              ROTAX 914 AE-P4 · 360° UNRESTRICTED 3D STUDIO
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Dismantle Distance Slider */}
          <div className="hidden items-center gap-2 border border-border/80 bg-background/60 px-3 py-1 text-xs font-mono text-cyan md:flex">
            <Sliders className="h-3.5 w-3.5" />
            <span className="text-[10px] text-muted-foreground">DISMANTLE:</span>
            <input
              type="range"
              min="0.2"
              max="1.8"
              step="0.1"
              value={explodeAmount}
              onChange={(e) => {
                setExplodeAmount(parseFloat(e.target.value));
                if (!exploded) {
                  engineViewerAudio.explode();
                  setExploded(true);
                }
              }}
              className="w-24 accent-cyan cursor-pointer"
            />
            <span className="w-8 text-right font-bold">{(explodeAmount * 100).toFixed(0)}%</span>
          </div>

          <button
            onClick={() => {
              const next = !exploded;
              if (next) engineViewerAudio.explode();
              else engineViewerAudio.assemble();
              setExploded(next);
            }}
            className="flex h-9 items-center gap-2 border border-cyan/60 bg-cyan/15 px-3 text-xs font-mono tracking-wider text-cyan transition-all hover:bg-cyan/30 shadow-[0_0_12px_rgba(111,216,232,0.25)]"
          >
            {exploded ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            {exploded ? "ASSEMBLE ENGINE" : "DISMANTLE EXPLODE"}
          </button>

          <button
            onClick={() => setWireframe(!wireframe)}
            className={`flex h-9 items-center gap-2 border px-3 text-xs font-mono tracking-wider transition-all ${
              wireframe
                ? "border-cyan bg-cyan/20 text-cyan"
                : "border-border bg-panel-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Box className="h-4 w-4" />
            {wireframe ? "SOLID MODEL" : "X-RAY HOLOGRAM"}
          </button>

          <button
            onClick={() => setShowLabels(!showLabels)}
            className="flex h-9 items-center gap-2 border border-amber/60 bg-amber/15 px-3 text-xs font-mono tracking-wider text-amber transition-all hover:bg-amber/30"
          >
            {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showLabels ? "LABELS ON" : "LABELS OFF"}
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex h-9 items-center gap-2 border px-3 text-xs font-mono tracking-wider transition-all ${
              autoRotate
                ? "border-cyan bg-cyan/20 text-cyan"
                : "border-border bg-panel-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            <RotateCw className={`h-4 w-4 ${autoRotate ? "animate-spin" : ""}`} />
            AUTO-ROTATE
          </button>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded border border-border bg-panel-2 text-muted-foreground transition-colors hover:border-cyan hover:text-cyan cursor-pointer"
            aria-label="Exit Studio"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Component Selector Drawer */}
        <aside className="relative z-20 hidden w-72 flex-col border-r border-border/80 bg-panel/70 p-4 backdrop-blur-sm lg:flex">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-mono text-xs tracking-wider text-cyan uppercase font-bold">
            <Layers className="h-4 w-4" /> ENGINE COMPONENTS
          </div>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {ZONES.map((zone) => {
              const isSelected = selectedPart === zone.name;
              return (
                <button
                  key={zone.id}
                  onClick={() => setSelectedPart(zone.name)}
                  className={`group flex w-full items-center justify-between border p-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-cyan bg-cyan/15 text-cyan shadow-[0_0_15px_rgba(111,216,232,0.2)]"
                      : "border-border/60 bg-background/50 text-muted-foreground hover:border-cyan/50 hover:bg-cyan/5 hover:text-foreground"
                  }`}
                >
                  <div>
                    <div className="font-mono text-xs font-bold tracking-wider">{zone.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{zone.sub}</div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${
                      isSelected ? "translate-x-1 text-cyan" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border/60 pt-3 text-[10px] font-mono text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 text-cyan font-bold">
              <ShieldCheck className="h-3.5 w-3.5" /> 360° UNRESTRICTED FREEDOM
            </div>
            <div>LEFT DRAG: ROTATE 360°</div>
            <div>RIGHT DRAG: PAN CAMERA</div>
            <div>SCROLL: ZOOM CLOSE IN</div>
          </div>
        </aside>

        {/* 3D Interactive Canvas Area */}
        <div className="relative flex-1 h-full w-full bg-[#070a0d]">
          <Suspense fallback={<div className="grid h-full place-items-center label-xs text-cyan">LOADING 3D DISMANTLE STUDIO...</div>}>
            <EngineCanvas
              interactive
              autoRotate={autoRotate}
              spin={false}
              cameraZ={6.8}
              cameraView="overview"
              modelScale={1.1}
              modelPosition={[0, -0.2, 0]}
              highlights={highlights}
              exploded={exploded}
              wireframe={wireframe}
              explodeAmount={explodeAmount}
              showLabels={showLabels}
              onSelectZone={(zoneName) => setSelectedPart(zoneName)}
              selectedZone={selectedPart}
            />
          </Suspense>

          {/* Bottom HUD Hint */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded border border-cyan/40 bg-panel/90 px-4 py-1.5 backdrop-blur-md text-[11px] font-mono text-cyan tracking-wider shadow-lg">
            360° FREE ORBIT · LEFT CLICK & DRAG ROTATE · RIGHT CLICK PAN · SCROLL ZOOM
          </div>
        </div>

        {/* Right Active Part Telemetry Inspector Panel */}
        <aside className="relative z-20 hidden w-80 flex-col border-l border-border/80 bg-panel/70 p-5 backdrop-blur-sm xl:flex">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-mono text-xs tracking-wider text-cyan uppercase font-bold">
            <Activity className="h-4 w-4" /> PART INSPECTOR MATRIX
          </div>

          <div className="mt-4">
            <h3 className="font-display text-lg font-bold tracking-tight text-foreground">{meta.name}</h3>
            <div className="mt-1 font-mono text-xs font-semibold text-cyan tracking-wider">
              {meta.code} · {meta.sub}
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>

          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="text-[10px] font-mono text-muted-foreground/80 uppercase tracking-wider mb-1">
              Material Specification
            </div>
            <div className="font-mono text-xs text-foreground bg-background/60 border border-border/60 p-2">
              {meta.material}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-mono text-cyan uppercase tracking-wider mb-2">
              LIVE TELEMETRY MATRIX
            </div>
            <div className="grid grid-cols-2 gap-2">
              {telemetryItems.map((item, idx) => (
                <div key={idx} className="border border-border/80 bg-background/70 p-2.5">
                  <div className="text-[9px] font-mono text-muted-foreground/80 tracking-wider">{item.label}</div>
                  <div className="mt-1 font-mono text-sm font-bold" style={{ color: item.tone || meta.glow }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex-1 border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
            <div className="flex items-center gap-1.5 font-bold tracking-wider text-[10px] uppercase mb-1">
              <Info className="h-3.5 w-3.5" /> PROGNOSTIC ADVISORY
            </div>
            {meta.diagnosticNote}
          </div>
        </aside>
      </div>
    </div>
  );
}
