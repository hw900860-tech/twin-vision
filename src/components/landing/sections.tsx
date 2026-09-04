import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  Bar,
  DataRow,
  Panel,
  Reveal,
  SectionHeading,
  SimBadge,
  StatusDot,
  TechButton,
  useClock,
  useScrollProgress,
} from "@/components/hud/primitives";
import { ResidualChart, TelemetryDashboard } from "@/features/telemetry/TelemetryDashboard";
import { ExplainablePanel, MaintenanceAdvisory, RulPanel } from "@/features/predictive-maintenance/Diagnostics";
import { SimulationLab } from "@/features/simulation/SimulationLab";
import { ReplayConsole } from "@/features/mission-replay/ReplayConsole";
import { FleetPanel } from "@/features/fleet/FleetPanel";
import { simulate, BASELINE_CONDITIONS } from "@/lib/domain/engine/model";

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative border-t border-border/60 px-5 py-24 lg:px-10 lg:py-32 ${className}`}>
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </section>
  );
}

/* ---------------- 01 THE PROBLEM ---------------- */
/* ---------------- 01 OUR APPROACH (FROM DATA TO FORESIGHT) ---------------- */
export function ProblemSection() {
  return (
    <section id="predictive" className="relative border-t border-[#00A8D6]/15 bg-[#EBF2F7] px-6 py-28 lg:px-12 lg:py-36">
      <div className="mx-auto max-w-[1400px]">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="font-mono text-xs font-semibold tracking-[0.24em] text-[#526B7E] uppercase mb-3">
            · OUR APPROACH ·
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#0A1926] sm:text-5xl lg:text-[3.2rem]">
            From data to foresight.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#526B7E] sm:text-base">
            A complete digital twin pipeline that understands your engine, learns its behaviour and predicts what&apos;s next — so you can act early.
          </p>
        </div>

        {/* 4 Pristine 3D Glass Cards Row */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-center">
          {/* CARD 01: SENSE */}
          <div className="aeris-glass-card aeris-glass-card-hover rounded-xl p-6 relative flex flex-col justify-between h-[280px]">
            <div className="relative h-32 w-full grid place-items-center bg-gradient-to-b from-[#00A8D6]/10 to-transparent rounded-lg border border-[#00A8D6]/20">
              <svg viewBox="0 0 120 60" className="w-24 h-14 text-[#00A8D6]">
                <path d="M0 30 Q15 10 30 30 T60 30 T90 30 T120 30" stroke="#00A8D6" strokeWidth="2.5" fill="none" />
                <path d="M0 30 Q15 40 30 30 T60 30 T90 30 T120 30" stroke="#00C8FF" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
              </svg>
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-[#00A8D6]">01</span>
              <h3 className="font-display text-xl font-bold text-[#0A1926] mt-1">Sense</h3>
              <p className="text-xs text-[#526B7E] mt-1">Live engine telemetry.</p>
            </div>
          </div>

          {/* CARD 02: MODEL */}
          <div className="aeris-glass-card aeris-glass-card-hover rounded-xl p-6 relative flex flex-col justify-between h-[280px]">
            <div className="relative h-32 w-full grid place-items-center bg-gradient-to-b from-[#00A8D6]/10 to-transparent rounded-lg border border-[#00A8D6]/20">
              <svg viewBox="0 0 80 80" className="w-16 h-16 text-[#00A8D6]">
                <polygon points="40 10 70 25 70 55 40 70 10 55 10 25" stroke="#00A8D6" strokeWidth="2" fill="none" />
                <polygon points="40 20 60 30 60 50 40 60 20 50 20 30" stroke="#00C8FF" strokeWidth="1.2" strokeDasharray="4 2" fill="none" />
              </svg>
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-[#00A8D6]">02</span>
              <h3 className="font-display text-xl font-bold text-[#0A1926] mt-1">Model</h3>
              <p className="text-xs text-[#526B7E] mt-1">Physics-based engine modelling.</p>
            </div>
          </div>

          {/* CARD 03: PREDICT */}
          <div className="aeris-glass-card aeris-glass-card-hover rounded-xl p-6 relative flex flex-col justify-between h-[280px]">
            <div className="relative h-32 w-full grid place-items-center bg-gradient-to-b from-[#00A8D6]/10 to-transparent rounded-lg border border-[#00A8D6]/20">
              <svg viewBox="0 0 80 80" className="w-16 h-16 text-[#00A8D6]">
                <polygon points="40 15 70 30 40 45 10 30" fill="#00A8D6" opacity="0.3" stroke="#00A8D6" strokeWidth="1.5" />
                <polygon points="40 30 70 45 40 60 10 45" fill="#00C8FF" opacity="0.5" stroke="#00C8FF" strokeWidth="1.5" />
                <polygon points="40 45 70 60 40 75 10 60" fill="#00A8D6" opacity="0.8" stroke="#00A8D6" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-[#00A8D6]">03</span>
              <h3 className="font-display text-xl font-bold text-[#0A1926] mt-1">Predict</h3>
              <p className="text-xs text-[#526B7E] mt-1">AI detects early signs of degradation.</p>
            </div>
          </div>

          {/* CARD 04: PREVENT */}
          <div className="aeris-glass-card aeris-glass-card-hover rounded-xl p-6 relative flex flex-col justify-between h-[280px]">
            <div className="relative h-32 w-full grid place-items-center bg-gradient-to-b from-[#00A8D6]/10 to-transparent rounded-lg border border-[#00A8D6]/20">
              <svg viewBox="0 0 80 80" className="w-16 h-16 fill-[#00A8D6]/20 stroke-[#00A8D6]" strokeWidth="2">
                <path d="M40 10 L65 20 V45 C65 60 40 72 40 72 C40 72 15 60 15 45 V20 Z" />
              </svg>
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-[#00A8D6]">04</span>
              <h3 className="font-display text-xl font-bold text-[#0A1926] mt-1">Prevent</h3>
              <p className="text-xs text-[#526B7E] mt-1">Actionable insights for longer missions.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ---------------- 02 LIVE TWIN ---------------- */
export function LiveSection() {
  return (
    <Section id="live">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading index="03" kicker="LIVE DIGITAL TWIN" title={<>Live engine state, continuously reconciled.</>} />
        <SimBadge />
      </div>
      <Reveal className="mt-12">
        <TelemetryDashboard fault={0.22} />
      </Reveal>
    </Section>
  );
}

/* ---------------- 04 PHYSICS VS REALITY ---------------- */
/* ---------------- 04 AIRCRAFT MISSION SECTION (1:1 MATCHING REFERENCE) ---------------- */
export function PhysicsSection() {
  return (
    <section id="mission" className="relative border-t border-[#00A8D6]/20 bg-gradient-to-b from-[#DDE8F0] via-[#EBF2F7] to-white px-6 py-28 lg:px-12 lg:py-36 overflow-hidden">
      <div className="mx-auto max-w-[1400px] grid gap-12 lg:grid-cols-12 lg:items-center">
        {/* Left Column Text */}
        <div className="lg:col-span-5 z-10">
          <div className="font-mono text-xs font-semibold tracking-[0.2em] text-[#526B7E] uppercase mb-4">
            <span className="text-[#00A8D6]">◦—</span> BUILT FOR REAL MISSIONS —
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight text-[#0A1926] sm:text-5xl lg:text-[3.2rem] leading-[1.08]">
            A deeper understanding of every flight.
          </h2>

          <p className="mt-6 text-sm leading-relaxed text-[#526B7E] sm:text-base max-w-md">
            AERIS-TWIN integrates engine intelligence with real flight environments to help you operate smarter, safer and longer.
          </p>

          <div className="mt-8">
            <Link
              to="/sim"
              className="inline-flex items-center gap-3 rounded-full bg-[#0A1926] px-7 py-3.5 font-mono text-xs font-semibold tracking-[0.16em] text-white transition-all hover:bg-[#00A8D6] shadow-md hover:shadow-[0_0_24px_rgba(0,168,214,0.4)]"
            >
              <span>Explore the Platform</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Right Column: TAPAS BH-201 Aircraft Soaring over Mountains */}
        <div className="lg:col-span-7 relative flex items-center justify-center">
          <div className="relative w-full h-[420px] rounded-2xl overflow-hidden shadow-2xl border border-[#00A8D6]/30 bg-[#0A1926]">
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A1926] via-transparent to-transparent z-10" />
            
            {/* Mountain SVG Vector Background */}
            <svg viewBox="0 0 1000 500" fill="none" className="absolute inset-0 w-full h-full object-cover">
              <path d="M0 500 L200 280 L350 380 L550 200 L750 340 L1000 180 V500 Z" fill="#1A3447" opacity="0.6" />
              <path d="M0 500 L300 320 L500 420 L700 240 L900 380 L1000 280 V500 Z" fill="#0A1926" opacity="0.9" />
              <polygon points="550,200 510,240 590,240" fill="#EBF2F7" opacity="0.7" />
              <polygon points="1000,180 960,220 1000,240" fill="#EBF2F7" opacity="0.7" />
            </svg>

            {/* TAPAS BH-201 Aircraft Twin-Propeller Vector */}
            <div className="absolute inset-0 grid place-items-center z-20">
              <svg viewBox="0 0 600 300" className="w-[85%] h-auto drop-shadow-[0_15px_30px_rgba(0,168,214,0.5)]">
                <path d="M220 150 C280 120 400 120 460 150 C400 180 280 180 220 150 Z" fill="#CBDADE" stroke="#00A8D6" strokeWidth="2" />
                <path d="M120 150 L460 150 L520 142 L80 142 Z" fill="#9FB5C4" stroke="#00A8D6" strokeWidth="2" />
                <polygon points="460,150 510,100 530,100 480,150" fill="#E08B38" />
                <circle cx="260" cy="150" r="14" fill="#00C8FF" opacity="0.6" className="animate-spin" />
                <circle cx="420" cy="150" r="14" fill="#00C8FF" opacity="0.6" className="animate-spin" />
              </svg>
            </div>

            {/* Tactical HUD Reticle Overlay */}
            <div className="absolute inset-0 z-30 pointer-events-none grid place-items-center">
              <div className="h-64 w-64 rounded-full border border-[#00A8D6]/40 border-dashed animate-orbit-slow" />
              <div className="absolute top-6 right-6 aeris-glass-card rounded px-3 py-1 font-mono text-[10px] font-bold text-[#0A1926]">
                TAPAS BH-201 &nbsp;|&nbsp; <span className="text-[#00A8D6]">INDIAN MALE UAV</span>
              </div>
            </div>

            {/* Right Capability Tags */}
            <div className="absolute right-4 bottom-4 z-30 hidden sm:flex flex-col gap-1 font-mono text-[9px] font-bold text-[#526B7E] text-right tracking-widest uppercase">
              <div>SURVEILLANCE</div>
              <div>RECONNAISSANCE</div>
              <div>MARITIME</div>
              <div>BORDER SECURITY</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 05 PREDICTIVE + COMPARISON ---------------- */
export function PredictiveSection() {
  const steps = ["Sensor deviation", "Physics residual", "Anomaly detection", "Degradation trajectory", "Predicted failure"];
  const conventional = ["Threshold crossed", "Alert", "Maintenance"];
  const aeris = ["Telemetry", "Physics residual", "Anomaly", "Degradation trend", "Prediction", "Maintenance"];

  return (
    <Section id="predictive">
      <SectionHeading
        index="05"
        kicker="PREDICTIVE INTELLIGENCE"
        title={<>Detection lead is the entire product.</>}
        sub="The predictive chain runs continuously across every channel. Each stage narrows the hypothesis before a conventional limit is ever approached."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel label="PREDICTION CHAIN" corner="CURRENT MISSION">
          <div className="p-6">
            {steps.map((s, i) => (
              <Reveal key={s} delay={i * 90}>
                <div className="relative flex items-center gap-5 pb-7 last:pb-0">
                  <span className="relative z-10 grid h-6 w-6 shrink-0 place-items-center border border-cyan/60 bg-background">
                    <span className="h-1.5 w-1.5 bg-cyan" />
                  </span>
                  {i < steps.length - 1 && <span className="absolute top-6 left-3 h-full w-px bg-hairline" />}
                  <div className="flex flex-1 items-baseline justify-between border-b border-border/50 pb-2">
                    <span className="text-sm">{s}</span>
                    <span className="label-xs">T+{(i * 11).toString().padStart(2, "0")} MIN</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel label="EARLY WARNING" corner="DEMONSTRATOR">
            <div className="p-5">
              <div className="readout text-5xl text-cyan">47</div>
              <div className="label-xs mt-2">MINUTES BEFORE CONVENTIONAL THRESHOLD</div>
              <p className="mt-4 text-[10px] leading-relaxed tracking-wide text-muted-foreground uppercase">
                Scenario value from the synthetic demonstrator. Not a validated real-world performance claim.
              </p>
            </div>
          </Panel>
          <div className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-1">
            {[
              { k: "FAULT PROBABILITY", v: "87%", t: "amber" },
              { k: "MODEL CONFIDENCE", v: "81%", t: "cyan" },
              { k: "DATA QUALITY", v: "96%", t: "nominal" },
            ].map((r) => (
              <div key={r.k} className="bg-panel/90 p-4">
                <div className="label-xs">{r.k}</div>
                <div className="readout text-xl" style={{ color: `var(--${r.t})` }}>
                  {r.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel label="CONVENTIONAL MONITORING" corner="REACTIVE">
          <div className="p-6">
            {conventional.map((c, i) => (
              <Reveal key={c} delay={i * 140}>
                <div className="flex items-center gap-4 border-b border-border/50 py-4 last:border-0">
                  <span className="label-xs w-10 opacity-50">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm text-muted-foreground">{c}</span>
                </div>
              </Reveal>
            ))}
            <div className="mt-4 label-xs text-critical">RESPONSE BEGINS AFTER THE LIMIT</div>
          </div>
        </Panel>
        <Panel label="AERIS-TWIN" corner="PREDICTIVE">
          <div className="p-6">
            {aeris.map((c, i) => (
              <Reveal key={c} delay={i * 90}>
                <div className="flex items-center gap-4 border-b border-border/50 py-2.5 last:border-0">
                  <span className="label-xs w-10 text-cyan">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{c}</span>
                </div>
              </Reveal>
            ))}
            <div className="mt-4 label-xs text-nominal">RESPONSE BEGINS BEFORE THE LIMIT</div>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

/* ---------------- 06 EXPLAINABLE ---------------- */
export function ExplainSection() {
  return (
    <Section>
      <SectionHeading
        index="06"
        kicker="EXPLAINABLE DIAGNOSTICS"
        title={<>Every advisory carries its evidence.</>}
        sub="A prediction that cannot be interrogated cannot be trusted in a maintenance decision. Each diagnosis exposes its contributing channels and reasoning."
      />
      <Reveal className="mt-12">
        <ExplainablePanel />
      </Reveal>
    </Section>
  );
}

/* ---------------- 07 RUL ---------------- */
export function RulSection() {
  const [severity, setSeverity] = useState(0.45);
  return (
    <Section>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading
          index="07"
          kicker="REMAINING USEFUL LIFE"
          title={<>An interval, never a false decimal.</>}
          sub="RUL is reported with an explicit confidence band and data-quality qualifier. Move the fault severity to see the estimate respond."
        />
        <div className="w-full max-w-xs">
          <div className="mb-2 flex justify-between label-xs">
            <span>FAULT SEVERITY</span>
            <span className="text-amber">{(severity * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none bg-panel-2 accent-[var(--amber)]"
          />
        </div>
      </div>
      <div className="mt-12">
        <RulPanel severity={severity} />
      </div>
    </Section>
  );
}

/* ---------------- 08 MISSION ---------------- */
export function MissionSection() {
  return (
    <Section id="mission">
      <SectionHeading
        index="08"
        kicker="MISSION INTELLIGENCE"
        title={<>From engine health to mission decision.</>}
        sub="Engine state is projected onto the planned mission profile to produce a readiness figure a commander can act on."
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel label="MISSION PROFILE / MSN-2214" corner="MARITIME ISR">
          <div className="relative h-[380px] overflow-hidden">
            <div className="absolute inset-0 grid-bg-fine opacity-50" />
            <svg viewBox="0 0 600 380" className="absolute inset-0 h-full w-full">
              <defs>
                <marker id="arw" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#6fd8e8" />
                </marker>
              </defs>
              <path d="M40 330 L120 250 L250 230 L340 140 L470 120" fill="none" stroke="#6fd8e8" strokeWidth="1.4" strokeDasharray="6 4" markerEnd="url(#arw)" style={{ animation: "aeris-dash 9s linear infinite" }} />
              <path d="M470 120 C 530 90, 545 190, 470 210 C 400 230, 400 140, 470 120" fill="none" stroke="#f0a63c" strokeWidth="1.2" />
              {[
                [40, 330, "BASE"],
                [250, 230, "WP-02"],
                [340, 140, "WP-03"],
                [470, 120, "STATION"],
              ].map(([x, y, l]) => (
                <g key={l as string}>
                  <rect x={(x as number) - 3} y={(y as number) - 3} width="6" height="6" fill="none" stroke="#9aa4ab" />
                  <text x={(x as number) + 10} y={(y as number) + 3} fill="#8d979e" fontSize="9" fontFamily="IBM Plex Mono" letterSpacing="1.6">
                    {l}
                  </text>
                </g>
              ))}
              <circle cx="340" cy="140" r="16" fill="none" stroke="#f0a63c" strokeOpacity="0.6" />
              <text x="300" y="368" fill="#5f696f" fontSize="8" fontFamily="IBM Plex Mono" letterSpacing="2">
                SCHEMATIC — NOT FOR NAVIGATION
              </text>
            </svg>
            <div className="absolute top-3 left-3 space-y-1">
              {[
                ["MISSION", "MARITIME ISR"],
                ["ALTITUDE", "18,000 FT"],
                ["AMBIENT", "41°C"],
                ["DURATION", "08:00 H"],
                ["THROTTLE", "72%"],
                ["ENGINE WEAR", "31%"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="label-xs w-24">{k}</span>
                  <span className="readout text-[11px]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel label="MISSION READINESS" corner="ADVISORY">
          <div className="p-5">
            <div className="flex items-end justify-between">
              <span className="readout text-5xl text-amber">72%</span>
              <span className="label-xs text-amber">MEDIUM RISK</span>
            </div>
            <Bar className="mt-4" value={72} tone="amber" />
            <div className="mt-6 space-y-3">
              {["LOW THERMAL MARGIN", "RISING VIBRATION TREND", "RUL MARGIN LIMITED"].map((r) => (
                <div key={r} className="flex items-center gap-3 border-b border-border/50 pb-3 last:border-0">
                  <StatusDot tone="warn" />
                  <span className="label-xs">{r}</span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <DataRow k="RUL vs DURATION" v="10.0 H / 8.0 H" tone="text-amber" />
              <DataRow k="THERMAL MARGIN" v="9°C" tone="text-amber" />
              <DataRow k="RECOMMENDATION" v="PROCEED WITH MONITORING" />
            </div>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

/* ---------------- 09 SIMULATION ---------------- */
export function SimulationSection() {
  return (
    <Section>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading
          index="09"
          kicker="WHAT-IF SIMULATION"
          title={<>What if the mission changes?</>}
          sub="Re-run the twin against a different mission envelope. Engine state, health, RUL and mission risk recompute from the same physics model."
        />
        <SimBadge />
      </div>
      <div className="mt-12">
        <SimulationLab />
      </div>
    </Section>
  );
}

/* ---------------- 10 REPLAY ---------------- */
export function ReplaySection() {
  return (
    <Section>
      <SectionHeading
        index="10"
        kicker="MISSION REPLAY"
        title={<>Replay the mission the twin recorded.</>}
        sub="Deterministic playback of the full telemetry set with anomaly and threshold markers, so the detection advantage can be audited after flight."
      />
      <div className="mt-12">
        <ReplayConsole />
      </div>
    </Section>
  );
}

/* ---------------- 11 MAINTENANCE ---------------- */
export function MaintenanceSection() {
  return (
    <Section>
      <SectionHeading
        index="11"
        kicker="MAINTENANCE INTELLIGENCE"
        title={<>Advisories that fit a maintenance schedule.</>}
      />
      <Reveal className="mt-12">
        <MaintenanceAdvisory />
      </Reveal>
    </Section>
  );
}

/* ---------------- 12 FLEET ---------------- */
export function FleetSection() {
  return (
    <Section>
      <SectionHeading index="12" kicker="FLEET VIEW" title={<>One twin per engine. One picture per fleet.</>} />
      <Reveal className="mt-12">
        <FleetPanel />
      </Reveal>
    </Section>
  );
}

/* ---------------- 13 FINALE ---------------- */
export function FinaleSection() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const t = useClock();
  const s = simulate(t * 0.3, BASELINE_CONDITIONS, 0.4);
  const fade = Math.max(0, 1 - progress * 2.2);

  const lines = [
    { p: 0.35, text: "THE ENGINE ISN'T A NUMBER." },
    { p: 0.52, text: "IT'S A SYSTEM." },
  ];

  return (
    <div ref={ref} id="gcs" className="relative h-[280vh] border-t border-border/60">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="pointer-events-none absolute inset-0" style={{ opacity: fade }}>
          <div className="absolute top-1/2 left-1/2 h-[min(70vw,620px)] w-[min(70vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan/10" />
          <div className="absolute top-1/2 left-1/2 h-[min(48vw,420px)] w-[min(48vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber/10" />
        </div>

        <div className="absolute inset-x-0 top-24 mx-auto flex max-w-[1100px] justify-between px-6" style={{ opacity: fade }}>
          {[
            { k: "HEALTH", v: `${(s.health * 100).toFixed(0)}%` },
            { k: "RUL", v: "8.7 — 11.2 H" },
            { k: "MISSION RISK", v: "MEDIUM" },
          ].map((r) => (
            <div key={r.k}>
              <div className="label-xs">{r.k}</div>
              <div className="readout text-2xl text-cyan">{r.v}</div>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          {lines.map((l) => (
            <div
              key={l.text}
              className="absolute font-display text-2xl tracking-[0.18em] sm:text-4xl"
              style={{
                opacity: progress > l.p && progress < l.p + 0.15 ? 1 : 0,
                transition: "opacity .5s",
              }}
            >
              {l.text}
            </div>
          ))}

          <div
            className="absolute w-full max-w-2xl"
            style={{ opacity: progress > 0.68 ? 1 : 0, transform: progress > 0.68 ? "none" : "translateY(20px)", transition: "opacity .7s, transform .7s" }}
          >
            <div className="font-display text-4xl tracking-[0.24em] sm:text-6xl">AERIS-TWIN</div>
            <p className="mt-6 label-xs leading-relaxed">
              SEE THE DEGRADATION. UNDERSTAND THE FAILURE. MAKE THE MISSION DECISION.
            </p>
            <div className="mt-8 font-display text-lg tracking-tight text-muted-foreground">FROM PREDICTION TO DECISION.</div>
            <div className="mt-8 flex justify-center gap-3">
              <Link to="/gcs">
                <TechButton>
                  ENTER AERIS-TWIN GCS <ArrowRight className="h-3.5 w-3.5" />
                </TechButton>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ARCHITECTURE + FOOTER ---------------- */
export function ArchitectureStrip() {
  const items = [
    "READ-ONLY ECU INTERFACE",
    "SECURE TELEMETRY",
    "MODEL VERSIONING",
    "AUDIT LOGGING",
    "OFFLINE-FIRST OPERATION",
    "STORE-AND-FORWARD TELEMETRY",
  ];
  return (
    <div className="border-t border-border/60 px-5 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-10 gap-y-3">
        {items.map((i) => (
          <span key={i} className="flex items-center gap-2 label-xs">
            <StatusDot tone="idle" /> {i}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[#00A8D6]/20 bg-[#EBF2F7] px-6 py-10 lg:px-12">
      <div className="mx-auto flex max-w-[1600px] flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Triangle Logo & Descriptor */}
        <div className="flex items-center gap-3">
          <div className="grid h-6 w-6 place-items-center rounded-[3px] border border-[#00A8D6]/60 bg-[#00A8D6]/10">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-[#00A8D6]" strokeWidth="2.2">
              <polygon points="12 2 2 22 12 17 22 22 12 2" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-xs font-semibold tracking-[0.22em] text-[#0A1926]">
              AERIS-TWIN
            </span>
            <span className="font-mono text-[8px] font-medium tracking-[0.16em] text-[#526B7E] uppercase">
              DIGITAL INTELLIGENCE FOR FLIGHT
            </span>
          </div>
        </div>

        {/* Center: Links */}
        <div className="flex items-center gap-8 font-mono text-xs text-[#102A3C]">
          <a href="#top" className="hover:text-[#00A8D6]">System</a>
          <a href="#predictive" className="hover:text-[#00A8D6]">Engine</a>
          <a href="#predictive" className="hover:text-[#00A8D6]">Predictive</a>
          <a href="#mission" className="hover:text-[#00A8D6]">Mission</a>
          <a href="#mission" className="hover:text-[#00A8D6]">About</a>
        </div>

        {/* Right: Tag */}
        <div className="font-mono text-[10px] font-semibold text-[#526B7E] tracking-widest uppercase">
          THE FUTURE OF FLIGHT IS PREDICTIVE. <span className="text-[#00A8D6]">◦</span>
        </div>
      </div>
    </footer>
  );
}

