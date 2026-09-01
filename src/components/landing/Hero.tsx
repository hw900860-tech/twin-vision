import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Plane } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { TechButton, useReducedMotion } from "@/components/hud/primitives";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

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
        <button
          type="button"
          onClick={onDone}
          className="pointer-events-auto mt-8 min-h-11 border border-border px-3 text-[10px] tracking-[0.16em] text-muted-foreground transition-colors hover:border-cyan/60 hover:text-cyan"
        >
          SKIP BOOT SEQUENCE
        </button>
      </div>
    </div>
  );
}

export function Hero() {
  const [booted, setBooted] = useState(false);
  const onBooted = useCallback(() => setBooted(true), []);
  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-70" />
      <div className="absolute inset-0 scanlines opacity-40" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 62% 48%, oklch(0.28 0.03 205 / 45%), transparent 62%)" }}
      />

      <div className="pointer-events-none absolute inset-y-16 right-0 z-10 hidden w-[48%] lg:block">
        <div className="pointer-events-auto absolute inset-8 border-l border-border/60">
          <div className="absolute inset-0 grid-bg-fine opacity-30" />
          <div className="absolute inset-8 rounded-full border border-cyan/10" />
          <div className="absolute inset-[18%] rounded-full border border-amber/10" />
          <ClientOnly fallback={<div className="grid h-full place-items-center label-xs">LOADING ROTAX MODEL</div>}>
            <Suspense fallback={<div className="grid h-full place-items-center label-xs">LOADING ROTAX MODEL</div>}>
              <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
                <EngineCanvas interactive autoRotate spin={false} cameraView="overview" showLabels={false} fault={0.12} />
              </div>
            </Suspense>
          </ClientOnly>
          <div className="pointer-events-none absolute top-5 left-5 label-xs text-cyan/70">ROTAX / SHOW MODEL</div>
          <div className="pointer-events-none absolute right-5 bottom-5 text-right">
            <div className="label-xs">AE-P4 · ROTATION ACTIVE</div>
            <div className="mt-1 readout text-[10px] tracking-[0.22em] text-muted-foreground/70">DRAG TO INSPECT</div>
          </div>
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
            <Link to="/sim">
              <TechButton variant="ghost">
                <Plane className="h-3.5 w-3.5" /> FLIGHT SIMULATOR
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

      {!booted && <BootOverlay onDone={onBooted} />}
    </section>
  );
}
