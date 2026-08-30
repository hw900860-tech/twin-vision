import { lazy, Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
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
import { CYLINDERS, simulate, BASELINE_CONDITIONS } from "@/lib/domain/engine/model";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

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
export function ProblemSection() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const stages = ["NORMAL", "DEGRADATION", "ANOMALY", "PREDICTED FAILURE"];
  const active = Math.min(3, Math.floor(progress * 4));

  return (
    <div ref={ref} id="system" className="relative h-[220vh]">
      <div className="sticky top-0 flex min-h-screen items-center border-t border-border/60 px-5 py-20 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1400px] gap-12 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
          <div>
            <SectionHeading
              index="01"
              kicker="THE PROBLEM"
              title={<>Engines don&apos;t fail in an instant.</>}
              sub="Degradation begins long before a conventional threshold becomes an alarm. By the time a limit is crossed, the mission decision has already been made for you."
            />
            <div className="mt-10 space-y-3">
              {stages.map((s, i) => (
                <div key={s} className="flex items-center gap-4">
                  <span
                    className={`h-px transition-all duration-500 ${i <= active ? "w-10 bg-cyan" : "w-4 bg-hairline"}`}
                  />
                  <span
                    className={`label-xs transition-colors duration-500 ${
                      i <= active ? (i >= 2 ? "text-amber" : "text-cyan") : "opacity-40"
                    }`}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-10 space-y-2">
              <p className="font-display text-lg" style={{ opacity: progress > 0.72 ? 1 : 0.25, transition: "opacity .6s" }}>
                Traditional monitoring reacts to abnormality.
              </p>
              <p
                className="font-display text-lg text-cyan"
                style={{ opacity: progress > 0.86 ? 1 : 0.15, transition: "opacity .6s" }}
              >
                AERIS-TWIN detects divergence.
              </p>
            </div>
          </div>

          <Panel label="CYLINDER 03 · EGT" corner={`SCRUB ${(progress * 100).toFixed(0)}%`}>
            <div className="p-4">
              <div className="mb-4 flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <span className="h-px w-6 border-t border-dashed border-cyan" />
                  <span className="label-xs">EXPECTED</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-px w-6 bg-amber" />
                  <span className="label-xs">ACTUAL</span>
                </div>
                <SimBadge className="ml-auto" />
              </div>
              <ResidualChart progress={progress} />
              <div className="mt-4 grid grid-cols-3 gap-px bg-border">
                <div className="bg-panel/90 p-3">
                  <div className="label-xs">DIVERGENCE</div>
                  <div className="readout text-lg text-amber">+{(progress * 18.4).toFixed(1)}%</div>
                </div>
                <div className="bg-panel/90 p-3">
                  <div className="label-xs">ANOMALY SCORE</div>
                  <div className="readout text-lg text-amber">{(progress * 82).toFixed(0)}%</div>
                </div>
                <div className="bg-panel/90 p-3">
                  <div className="label-xs">THRESHOLD</div>
                  <div className="readout text-lg">{progress > 0.9 ? "CROSSED" : "NOT CROSSED"}</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 02 DIGITAL TWIN + interactive engine ---------------- */
export function TwinSection() {
  const [selected, setSelected] = useState<number | null>(3);
  const cyl = CYLINDERS.find((c) => c.id === selected) ?? null;

  const chain = [
    { k: "PHYSICAL ENGINE", d: "AE-P4 four-cylinder, read-only ECU interface" },
    { k: "LIVE TELEMETRY", d: "24 sensor channels, store-and-forward" },
    { k: "PHYSICS MODEL", d: "Thermodynamic + mechanical expectation model" },
    { k: "DIGITAL TWIN", d: "Synchronized state, residuals and diagnostics" },
  ];

  return (
    <Section id="twin">
      <SectionHeading
        index="02"
        kicker="DIGITAL TWIN"
        title={<>A synchronized model of the engine, not a dashboard of it.</>}
        sub="Telemetry is fused with a physics expectation model to build a continuously corrected virtual engine. Select a cylinder to inspect its subsystem state."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel label="INTERACTIVE TWIN" corner="DRAG TO ORBIT · CLICK A CYLINDER">
          <div className="relative h-[420px] sm:h-[520px]">
            <div className="absolute inset-0 grid-bg-fine opacity-40" />
            <ClientOnly
              fallback={
                <div className="grid h-full place-items-center label-xs">3D VIEW INITIALIZING — NON-WEBGL FALLBACK AVAILABLE</div>
              }
            >
              <Suspense fallback={<div className="grid h-full place-items-center label-xs">LOADING TWIN GEOMETRY…</div>}>
                <EngineCanvas interactive spin={false} fault={0.6} selectedCylinder={selected} onSelectCylinder={setSelected} />
              </Suspense>
            </ClientOnly>
            <div className="pointer-events-none absolute top-3 left-3 label-xs">AE-P4 / TWIN VIEW</div>
            <div className="pointer-events-none absolute right-3 bottom-3 label-xs">SENSOR NODES 24 · LINK LIVE</div>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel label={cyl ? `CYLINDER 0${cyl.id}` : "SELECT A CYLINDER"} corner={cyl?.status ?? "—"}>
            <div className="p-4">
              {cyl ? (
                <>
                  <DataRow k="CHT" v={`${cyl.cht}°C`} tone={cyl.health < 0.8 ? "text-amber" : ""} />
                  <DataRow k="EGT" v={`${cyl.egt}°C`} tone={cyl.health < 0.8 ? "text-amber" : ""} />
                  <DataRow k="VIBRATION" v={`${cyl.vib} G`} />
                  <DataRow k="HEALTH" v={`${(cyl.health * 100).toFixed(0)}%`} />
                  <DataRow k="STATUS" v={cyl.status} tone={cyl.health < 0.8 ? "text-amber" : "text-nominal"} />
                  <DataRow k="LIKELY ISSUE" v={cyl.issue} />
                  <Bar className="mt-4" value={cyl.health * 100} tone={cyl.health > 0.85 ? "nominal" : "amber"} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Click a cylinder in the twin view to inspect its state.</p>
              )}
            </div>
          </Panel>

          <Panel label="TWIN CONSTRUCTION">
            <div className="p-4">
              {chain.map((c, i) => (
                <div key={c.k} className="relative pb-5 pl-6 last:pb-0">
                  <span className="absolute top-1 left-0 h-1.5 w-1.5 bg-cyan" />
                  {i < chain.length - 1 && <span className="absolute top-3 left-[3px] h-full w-px bg-hairline" />}
                  <div className="label-xs text-foreground">{c.k}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.d}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- 03 LIVE TWIN ---------------- */
export function LiveSection() {
  return (
    <Section>
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
export function PhysicsSection() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  return (
    <div ref={ref} className="relative h-[200vh]">
      <div className="sticky top-0 flex min-h-screen items-center border-t border-border/60 px-5 py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1400px]">
          <SectionHeading
            index="04"
            kicker="PHYSICS VS REALITY"
            title={<>When reality begins to diverge, the twin notices.</>}
            sub="The physics model predicts what the engine should be doing under the current mission conditions. The residual between expectation and observation is the earliest usable signal."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Panel label="EXPECTED ENGINE BEHAVIOR" corner="PHYSICS MODEL">
              <div className="p-4">
                <ResidualChart progress={0} />
              </div>
            </Panel>
            <Panel label="OBSERVED ENGINE BEHAVIOR" corner="TELEMETRY">
              <div className="p-4">
                <ResidualChart progress={progress} />
              </div>
            </Panel>
          </div>
          <div className="mt-4 grid gap-px bg-border sm:grid-cols-4">
            <div className="bg-panel/90 p-4">
              <div className="label-xs">PHYSICS RESIDUAL</div>
              <div className="readout text-2xl text-amber">+{(progress * 18.4).toFixed(1)}%</div>
            </div>
            <div className="bg-panel/90 p-4">
              <div className="label-xs">ANOMALY SCORE</div>
              <div className="readout text-2xl text-amber">{(progress * 82).toFixed(0)}%</div>
            </div>
            <div className="bg-panel/90 p-4">
              <div className="label-xs">DRIVING CHANNEL</div>
              <div className="readout text-2xl">EGT-3</div>
            </div>
            <div className="bg-panel/90 p-4">
              <div className="label-xs">CLASSIFICATION</div>
              <div className="readout text-2xl">{progress > 0.5 ? "DEGRADATION" : "NOMINAL"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
        <div className="absolute inset-0" style={{ opacity: fade }}>
          <ClientOnly>
            <Suspense fallback={null}>
              <EngineCanvas spin fault={0.5} cameraZ={7.6} />
            </Suspense>
          </ClientOnly>
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
    <footer className="border-t border-border px-5 py-12 lg:px-10">
      <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="font-display text-sm tracking-[0.32em]">AERIS-TWIN</div>
          <div className="label-xs mt-2">AI-ENABLED DIGITAL ENGINE INTELLIGENCE</div>
          <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">
            Prototype / research demonstrator. All telemetry, faults, RUL estimates and lead times shown on this site are
            produced by a deterministic simulation of a representative four-cylinder engine (AE-P4). AERIS-TWIN is advisory and
            read-only; it does not command or control an engine.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {[
            { h: "SYSTEM", l: ["Architecture", "Technology", "Data model"] },
            { h: "RESOURCE", l: ["Documentation", "Model cards", "GitHub"] },
            { h: "CONTACT", l: ["Programme office", "Research enquiries"] },
          ].map((c) => (
            <div key={c.h}>
              <div className="label-xs text-cyan">{c.h}</div>
              <ul className="mt-3 space-y-2">
                {c.l.map((i) => (
                  <li key={i} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1400px] justify-between border-t border-border/60 pt-5 label-xs">
        <span>AERIS-TWIN / v1.4</span>
        <span>SYNTHETIC DATA · DEMONSTRATOR</span>
      </div>
    </footer>
  );
}
