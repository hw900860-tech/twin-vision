import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { StatusDot, TechButton, useClock, useReducedMotion } from "@/components/hud/primitives";
import { simulate, BASELINE_CONDITIONS } from "@/lib/domain/engine/model";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

const TELEMETRY = [
  { k: "RPM", pos: "top-[16%] left-[46%]", get: (s: ReturnType<typeof simulate>) => s.rpm.toFixed(0), u: "" },
  { k: "CHT", pos: "top-[28%] right-[6%]", get: (s: ReturnType<typeof simulate>) => s.cht.toFixed(0), u: "°C" },
  { k: "EGT", pos: "top-[50%] right-[4%]", get: (s: ReturnType<typeof simulate>) => s.egt.toFixed(0), u: "°C" },
  { k: "OIL PRESSURE", pos: "bottom-[22%] left-[44%]", get: (s: ReturnType<typeof simulate>) => s.oilPressure.toFixed(1), u: "BAR" },
  { k: "FUEL FLOW", pos: "bottom-[12%] right-[10%]", get: (s: ReturnType<typeof simulate>) => s.fuelFlow.toFixed(1), u: "L/h" },
  { k: "VIBRATION", pos: "top-[68%] left-[52%]", get: (s: ReturnType<typeof simulate>) => s.vibrationRms.toFixed(2), u: "G" },
];

function BootOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const times = [180, 520, 900, 1400, 2000, 2600, 3100];
    const timers = times.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    const end = setTimeout(onDone, 3400);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [onDone, reduced]);

  const lines = [
    "SYSTEM GRID .......... OK",
    "AERIS-TWIN CORE ...... v1.4",
    "TELEMETRY LINK ....... ESTABLISHED",
    "SENSOR ARRAY ......... 24 NODES",
    "PHYSICS MODEL ........ AE-P4 LOADED",
    "ANOMALY ENGINE ....... ARMED",
    "TWIN SYNCHRONIZED",
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-30 bg-background transition-opacity duration-700" style={{ opacity: step >= 7 ? 0 : 1 }}>
      <div className="absolute inset-0 grid-bg-fine opacity-60" style={{ opacity: step >= 1 ? 0.6 : 0 , transition: "opacity .5s"}} />
      <div className="absolute top-1/2 left-1/2 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2">
        <div className="mb-6 font-display text-sm tracking-[0.42em]" style={{ opacity: step >= 2 ? 1 : 0, transition: "opacity .6s" }}>
          AERIS-TWIN
        </div>
        <div className="space-y-1">
          {lines.map((l, i) => (
            <div
              key={l}
              className={`readout text-[11px] tracking-[0.12em] ${i === lines.length - 1 ? "text-cyan" : "text-muted-foreground"}`}
              style={{ opacity: step > i ? 1 : 0, transition: "opacity .35s" }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusStrip() {
  const t = useClock();
  const q = 98.7 + Math.sin(t * 0.4) * 0.4;
  const lat = 127 + Math.round(Math.sin(t * 0.7) * 9);
  const items = [
    { k: "TWIN STATUS", v: "SYNCHRONIZED", dot: true },
    { k: "TELEMETRY", v: "LIVE" },
    { k: "MODEL", v: "AE-P4 / v1.4" },
    { k: "DATA QUALITY", v: `${q.toFixed(1)}%` },
    { k: "LATENCY", v: `${lat} ms` },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-10 gap-y-2 px-5 py-3 lg:px-10">
        {items.map((i) => (
          <div key={i.k} className="flex items-center gap-2">
            <span className="label-xs">{i.k}</span>
            {i.dot && <StatusDot />}
            <span className="readout text-[11px] tracking-[0.1em] text-foreground">{i.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const [booted, setBooted] = useState(false);
  const onBooted = useCallback(() => setBooted(true), []);
  const t = useClock();
  const s = simulate(t * 0.35, BASELINE_CONDITIONS, 0.12);

  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-70" />
      <div className="absolute inset-0 scanlines opacity-40" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 62% 48%, oklch(0.28 0.03 205 / 45%), transparent 62%)" }}
      />

      {/* 3D engine */}
      <div className="absolute inset-0 lg:left-[26%]">
        <ClientOnly>
          <Suspense fallback={null}>
            <EngineCanvas spin fault={0.25} />
          </Suspense>
        </ClientOnly>
      </div>

      {/* floating telemetry */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block" style={{ opacity: booted ? 1 : 0, transition: "opacity 1s .2s" }}>
        {TELEMETRY.map((tl, i) => (
          <div key={tl.k} className={`absolute ${tl.pos}`} style={{ animation: `aeris-rise .6s ${i * 120}ms both` }}>
            <div className="border-l border-cyan/50 pl-3">
              <div className="label-xs">{tl.k}</div>
              <div className="readout text-lg text-foreground">
                {tl.get(s)}
                <span className="ml-1 text-[10px] tracking-widest text-muted-foreground">{tl.u}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="absolute top-[8%] right-[7%] border border-cyan/30 bg-panel/60 px-4 py-3">
          <div className="label-xs">ENGINE HEALTH</div>
          <div className="readout text-2xl text-cyan">{(s.health * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* text block */}
      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] items-center px-5 pt-20 pb-28 lg:px-10">
        <div className="max-w-xl" style={{ opacity: booted ? 1 : 0, transform: booted ? "none" : "translateY(20px)", transition: "opacity .9s, transform .9s" }}>
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-cyan" />
            <span className="label-xs text-cyan">AI-ENABLED DIGITAL ENGINE INTELLIGENCE</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.04] font-medium tracking-tight text-balance sm:text-5xl lg:text-[3.6rem]">
            Know the engine before it knows it&apos;s failing.
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            An explainable Digital Twin that combines live telemetry, physics-based engine modelling and predictive diagnostics
            to anticipate degradation before conventional thresholds are crossed.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/gcs">
              <TechButton>
                ENTER DIGITAL TWIN <ArrowRight className="h-3.5 w-3.5" />
              </TechButton>
            </Link>
            <a href="#system">
              <TechButton variant="ghost">EXPLORE SYSTEM</TechButton>
            </a>
          </div>
          <div className="mt-8 flex items-center gap-2 label-xs">
            <span className="border border-amber/40 bg-amber/10 px-2 py-1 text-amber">PROTOTYPE / RESEARCH DEMONSTRATOR</span>
            <span>REPRESENTATIVE ENGINE AE-P4</span>
          </div>
        </div>
      </div>

      <a href="#system" className="absolute bottom-20 left-1/2 z-20 hidden -translate-x-1/2 lg:block">
        <ChevronDown className="h-4 w-4 animate-bounce text-cyan/70" />
      </a>

      <StatusStrip />
      {!booted && <BootOverlay onDone={onBooted} />}
    </section>
  );
}
