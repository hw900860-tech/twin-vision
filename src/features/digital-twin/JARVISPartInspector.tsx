import React from "react";
import { X, Activity, Thermometer, ShieldAlert, Cpu, Layers, Radio, Zap } from "lucide-react";
import type { PartHighlights } from "./EngineModel";

export interface ZoneMetadata {
  name: string;
  code: string;
  sub: string;
  material: string;
  tech: string;
  description: string;
  diagnosticNote: string;
  glow: string;
  getTelemetry: (h: PartHighlights) => Array<{ label: string; value: string; tone?: string }>;
}

export const ZONE_DETAILS: Record<string, ZoneMetadata> = {
  "CYLINDER HEAD": {
    name: "CYLINDER HEAD ASSEMBLY",
    code: "ROTAX-914-CH4",
    sub: "Aluminum Alloy · Dual Ignition",
    material: "A356.0-T6 Cast Aluminum Alloy",
    tech: "4-Cylinder Liquid Cooled Heads · Dual Spark Plugs per Cylinder",
    description: "Houses the four combustion chambers, overhead valves, intake ports, and dual ignition spark plugs. Features water jackets for precision thermal dissipation.",
    diagnosticNote: "High CHT (>180°C) indicates localized thermal stress, inadequate coolant flow, or high-altitude lean burn condition.",
    glow: "#6fd8e8",
    getTelemetry: (h) => [
      { label: "CYL 1 CHT", value: `${h.cyl1CHT.toFixed(1)}°C`, tone: h.cyl1CHT > 180 ? "#f0a63c" : "#6fd8e8" },
      { label: "CYL 2 CHT", value: `${h.cyl2CHT.toFixed(1)}°C`, tone: h.cyl2CHT > 180 ? "#f0a63c" : "#6fd8e8" },
      { label: "CYL 3 CHT", value: `${h.cyl3CHT.toFixed(1)}°C`, tone: h.cyl3CHT > 180 ? "#f0a63c" : "#6fd8e8" },
      { label: "CYL 4 CHT", value: `${h.cyl4CHT.toFixed(1)}°C`, tone: h.cyl4CHT > 180 ? "#f0a63c" : "#6fd8e8" },
    ],
  },
  "EXHAUST MANIFOLD": {
    name: "EXHAUST MANIFOLD & EGT PROBES",
    code: "ROTAX-EXH-4IN1",
    sub: "Stainless Steel 321 · Equal Length",
    material: "AISI 321 Heat-Resistant Stainless Steel",
    tech: "4-into-1 Tuned Collector Header · K-Type Thermocouple Sensors",
    description: "Channels high-velocity 700°C+ exhaust gas from all 4 cylinders directly into the turbocharger turbine wheel.",
    diagnosticNote: "EGT variance exceeding 40°C between runners signals individual fuel injector clogging or air intake leak.",
    glow: "#f0a63c",
    getTelemetry: (h) => [
      { label: "EXHAUST TEMP (EGT)", value: `${h.egt.toFixed(0)}°C`, tone: h.egt > 720 ? "#e2523f" : "#f0a63c" },
      { label: "RUNNER BALANCING", value: "98.4%", tone: "#6fd8e8" },
      { label: "THERMAL EMISSIVITY", value: "0.88", tone: "#6fd8e8" },
    ],
  },
  "INTAKE / TURBO": {
    name: "TURBOCHARGER & INTAKE BOOST",
    code: "GARRETT-TC-914",
    sub: "Forced Induction · Auto Wastegate",
    material: "Inconel 713C Turbine · Forged Billet Aluminum Impeller",
    tech: "Automatic Altitude Compensated Wastegate (TCU Controlled)",
    description: "Pressurizes ambient intake air to maintain sea-level manifold pressure up to 25,000 ft altitude for maximum UAV payload performance.",
    diagnosticNote: "Wastegate actuator hysteresis causes boost loss at high density altitudes.",
    glow: "#7fd6e8",
    getTelemetry: (h) => [
      { label: "ENGINE SPEED", value: `${h.rpm.toFixed(0)} RPM`, tone: "#6fd8e8" },
      { label: "BOOST MAP", value: "32.4 kPa", tone: "#6fd8e8" },
      { label: "TURBO SHAFT SPEED", value: "142,000 RPM", tone: "#7fd6e8" },
    ],
  },
  "CRANKCASE": {
    name: "CRANKCASE & PISTON MATRIX",
    code: "ROTAX-CC-BXR4",
    sub: "Horizontally Opposed Flat-4 Block",
    material: "High-Strength Sand-Cast Aluminum Alloy",
    tech: "Split Crankcase · Nitrided Forged Crankshaft · Firing 1-3-4-2",
    description: "The core structural engine block holding the crankshaft, connecting rods, and horizontally opposed pistons in a balanced boxer configuration.",
    diagnosticNote: "Vibration FFT peak at 140 Hz indicates early-stage outer race bearing fatigue (BPFO).",
    glow: "#9aa0a5",
    getTelemetry: (h) => [
      { label: "HEALTH INDEX", value: `${(h.health * 100).toFixed(1)}%`, tone: h.health > 0.8 ? "#6fd8e8" : "#f0a63c" },
      { label: "STRUCTURAL VIB", value: `${h.vibration.toFixed(2)} m/s²`, tone: h.vibration > 1.2 ? "#e2523f" : "#6fd8e8" },
      { label: "FIRING BALANCE", value: "1-3-4-2 STABLE", tone: "#6fd8e8" },
    ],
  },
  "OIL SUMP": {
    name: "OIL SUMP & LUBRICATION SYSTEM",
    code: "ROTAX-OIL-WS25",
    sub: "Wet Sump · 2.5L Capacity",
    material: "Die-Cast Aluminum Pan with Cooling Fins",
    tech: "Trochoid Positive-Displacement Oil Pump · Integrated Heat Exchanger",
    description: "Stores and cools engine oil, delivering high-pressure lubrication to main journal bearings, turbo shaft, and valve train.",
    diagnosticNote: "Oil temp > 115°C with pressure drop below 3.0 bar indicates severe thermal viscosity shear.",
    glow: "#c87020",
    getTelemetry: (h) => [
      { label: "OIL TEMP", value: `${h.oilTemp.toFixed(1)}°C`, tone: h.oilTemp > 110 ? "#f0a63c" : "#6fd8e8" },
      { label: "OIL PRESSURE", value: "4.8 BAR", tone: "#6fd8e8" },
      { label: "FLUID CAPACITY", value: "2.5 L", tone: "#6fd8e8" },
    ],
  },
  "PROP FLANGE": {
    name: "PROPELLER REDUCTION GEARBOX",
    code: "ROTAX-GBX-243",
    sub: "Helical Reduction · SAE 1 Flange",
    material: "Case-Hardened Chrome-Moly Alloy Steel",
    tech: "1:2.43 Ratio Helical Gears · Integrated Torsional Slipper Clutch",
    description: "Reduces engine output RPM down to optimal propeller speed while damping crankshaft torsional harmonics.",
    diagnosticNote: "Vibration RMS spikes above 1.5 G suggest propeller track imbalance or gear tooth pitting.",
    glow: "#c0c4ca",
    getTelemetry: (h) => [
      { label: "PROPELLER VIB", value: `${h.vibration.toFixed(2)} G`, tone: h.vibration > 1.5 ? "#e2523f" : "#6fd8e8" },
      { label: "GEAR RATIO", value: "1 : 2.43", tone: "#6fd8e8" },
      { label: "PROP SHAFT RPM", value: `${(h.rpm / 2.43).toFixed(0)} RPM`, tone: "#6fd8e8" },
    ],
  },
};

export function JARVISPartInspector({
  zoneName,
  highlights,
  onClose,
  onExplodeToggle,
  isExploded,
}: {
  zoneName: string;
  highlights: PartHighlights;
  onClose: () => void;
  onExplodeToggle?: () => void;
  isExploded?: boolean;
}) {
  const meta = ZONE_DETAILS[zoneName] ?? {
    name: zoneName,
    code: "ROTAX-PART-UNKN",
    sub: "Aero Engine Component",
    material: "Aerospace Grade Alloy",
    tech: "Digital Twin Sensor Monitored",
    description: "Engine component monitored by real-time JARVIS digital twin telemetry system.",
    diagnosticNote: "No active anomaly detected on this node.",
    glow: "#6fd8e8",
    getTelemetry: (h) => [{ label: "HEALTH", value: `${(h.health * 100).toFixed(0)}%` }],
  };

  const telemetryItems = meta.getTelemetry(highlights);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl overflow-hidden border bg-panel/95 p-6 shadow-2xl transition-all"
        style={{
          borderColor: meta.glow,
          boxShadow: `0 0 40px ${meta.glow}33, inset 0 0 20px ${meta.glow}11`,
        }}
      >
        {/* Top JARVIS HUD Banner */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 animate-pulse" style={{ color: meta.glow }} />
            <span className="font-display text-xs tracking-[0.25em]" style={{ color: meta.glow }}>
              JARVIS // SUB-SYSTEM ANALYSIS
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-cyan hover:text-cyan"
            aria-label="Close inspection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title & Code */}
        <div className="mt-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl tracking-tight text-foreground">{meta.name}</h2>
            <div className="mt-1 readout text-xs font-semibold tracking-wider" style={{ color: meta.glow }}>
              SYS ID: {meta.code} · {meta.sub}
            </div>
          </div>
          <span
            className="border px-2.5 py-1 text-[10px] font-mono tracking-widest uppercase"
            style={{
              borderColor: meta.glow,
              color: meta.glow,
              background: `${meta.glow}15`,
            }}
          >
            ACTIVE NODE
          </span>
        </div>

        {/* Description */}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>

        {/* Specs Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-xs">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-cyan" />
            <div>
              <div className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">Material Spec</div>
              <div className="font-mono text-[11px] text-foreground">{meta.material}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-amber" />
            <div>
              <div className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">Architecture</div>
              <div className="font-mono text-[11px] text-foreground">{meta.tech}</div>
            </div>
          </div>
        </div>

        {/* Live Telemetry Matrix */}
        <div className="mt-4">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-cyan uppercase mb-2">
            <Activity className="h-3 w-3" /> LIVE DIAGNOSTIC MATRIX
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {telemetryItems.map((item, idx) => (
              <div key={idx} className="border border-border/80 bg-background/60 p-2.5">
                <div className="text-[9px] font-mono text-muted-foreground/80 tracking-wider">{item.label}</div>
                <div className="mt-1 readout text-sm font-bold" style={{ color: item.tone || meta.glow }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Diagnostic Note */}
        <div className="mt-4 flex items-start gap-2.5 border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold tracking-wider uppercase text-[10px] block mb-0.5">JARVIS PROGNOSTIC ASSESSMENT</span>
            {meta.diagnosticNote}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4">
          {onExplodeToggle ? (
            <button
              onClick={onExplodeToggle}
              className="flex items-center gap-2 border border-cyan/60 bg-cyan/10 px-4 py-2 text-xs font-mono tracking-wider text-cyan transition-colors hover:bg-cyan/20"
            >
              <Zap className="h-3.5 w-3.5" />
              {isExploded ? "ASSEMBLE ENGINE" : "IRON MAN DISMANTLE EXPLODE"}
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="border border-border bg-panel-2 px-4 py-2 text-xs font-mono tracking-wider text-foreground transition-colors hover:border-cyan hover:text-cyan"
          >
            RETURN TO ENGINE VIEW
          </button>
        </div>
      </div>
    </div>
  );
}
