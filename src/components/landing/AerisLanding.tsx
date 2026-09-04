import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  CircleDot,
  Eye,
  EyeOff,
  Expand,
  Plane,
  RotateCw,
  Shrink,
  Zap,
} from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { CinematicIntro } from "./CinematicIntro";
import { JARVISExplodeStudio } from "@/features/digital-twin/JARVISExplodeStudio";
import { JARVISPartInspector } from "@/features/digital-twin/JARVISPartInspector";
import heroBgImage from "../../../../../../.gemini/antigravity/brain/2d616611-0521-4be1-8b59-3533b99f2adf/media__1788537086097.jpg";
import type { PartHighlights } from "@/features/digital-twin/EngineModel";
import { ENGINE_SPIN_RATE, engineSpinAngle } from "@/features/digital-twin/EngineModel";
import { engineViewerAudio } from "@/features/digital-twin/engineViewerAudio";
import {
  simulate,
  estimateRul,
  BASELINE_CONDITIONS,
} from "@/lib/domain/engine/model";
import {
  ExplainablePanel,
  RulPanel,
} from "@/features/predictive-maintenance/Diagnostics";

const EngineCanvas = lazy(
  () => import("@/features/digital-twin/EngineCanvas")
);

const HeroEngineCanvas = memo(EngineCanvas);

const STEPS = [
  {
    num: "01",
    title: "SENSE",
    copy: "Live telemetry establishes the engine's operating truth.",
  },
  {
    num: "02",
    title: "MODEL",
    copy: "Physics turns every flight condition into an expected state.",
  },
  {
    num: "03",
    title: "ANALYZE",
    copy: "Residuals reveal the small drift that thresholds miss.",
  },
  {
    num: "04",
    title: "PREDICT",
    copy: "Degradation trajectories become a decision window.",
  },
  {
    num: "05",
    title: "ACT",
    copy: "Maintenance moves from reaction to readiness.",
  },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setVisible(entry.isIntersecting);
      },
      { threshold: 0.12 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Section({
  eyebrow,
  title,
  children,
  id,
  className = "",
}: {
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const { ref, visible } = useReveal();

  return (
    <section
      id={id}
      ref={ref}
      className={`aeris-section ${visible ? "is-visible" : ""} ${className}`}
    >
      <div className="aeris-rule" />

      <div className="aeris-section-inner">
        <div className="aeris-section-heading">
          <span className="aeris-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>

        {children}
      </div>
    </section>
  );
}

function EngineSparkles() {
  const sparkles = [
    { top: "8%", left: "16%", size: 4, delay: "0s" },
    { top: "24%", left: "84%", size: 5, delay: "0.4s" },
    { top: "64%", left: "12%", size: 3, delay: "0.8s" },
    { top: "78%", left: "78%", size: 4, delay: "1.2s" },
    { top: "42%", left: "5%", size: 3, delay: "1.6s" },
    { top: "54%", left: "90%", size: 5, delay: "0.3s" },
    { top: "14%", left: "68%", size: 4, delay: "0.7s" },
    { top: "86%", left: "36%", size: 3, delay: "1.1s" },
    { top: "4%", left: "44%", size: 4, delay: "1.5s" },
    { top: "48%", left: "24%", size: 2, delay: "0.2s" },
    { top: "32%", left: "60%", size: 4, delay: "0.9s" },
    { top: "72%", left: "58%", size: 3, delay: "1.4s" },
    { top: "18%", left: "32%", size: 3, delay: "0.5s" },
    { top: "38%", left: "76%", size: 4, delay: "1.0s" },
    { top: "70%", left: "22%", size: 5, delay: "1.3s" },
    { top: "82%", left: "66%", size: 3, delay: "0.6s" },
    { top: "28%", left: "10%", size: 4, delay: "1.7s" },
    { top: "60%", left: "70%", size: 3, delay: "0.1s" },
    { top: "12%", left: "54%", size: 4, delay: "0.85s" },
    { top: "90%", left: "50%", size: 5, delay: "1.25s" },
    { top: "36%", left: "42%", size: 2, delay: "0.45s" },
    { top: "66%", left: "36%", size: 4, delay: "1.05s" },
    { top: "22%", left: "92%", size: 4, delay: "1.35s" },
    { top: "76%", left: "8%", size: 3, delay: "0.75s" },
  ];

  return (
    <div className="engine-sparkle-field" aria-hidden="true">
      <div className="sparkle-orbit-container">
        {sparkles.map((sp, idx) => (
          <span
            key={idx}
            className="sparkle-particle"
            style={{
              top: sp.top,
              left: sp.left,
              width: `${sp.size}px`,
              height: `${sp.size}px`,
              animationDelay: sp.delay,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OrbitalRings() {
  return (
    <div className="aeris-orbits" aria-hidden="true">
      <span className="aeris-scan" />
      <span className="aeris-scan-vertical" />

      {/* Scattered Rotating 3D Sparkle Starfield */}
      <EngineSparkles />

      {/* Clean Open Flowing White Sine Wave Ribbons around Engine Base */}
      <div className="engine-white-waves-container">
        <svg
          className="engine-wave-svg"
          viewBox="0 0 1000 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wave-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#00d2ff" stopOpacity="1" />
              <stop offset="75%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <filter id="wave-glow" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Primary Wave Ribbon */}
          <path
            className="wave-path wave-path-1"
            d="M 60 160 Q 280 60, 500 160 T 940 160"
            stroke="url(#wave-grad-1)"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#wave-glow)"
          />

          {/* Secondary Wave Ribbon */}
          <path
            className="wave-path wave-path-2"
            d="M 100 185 Q 320 240, 520 145 T 900 175"
            stroke="url(#wave-grad-1)"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#wave-glow)"
          />
        </svg>
      </div>
    </div>
  );
}

export function AerisLandingHero() {
  const [phase, setPhase] = useState<"cinematic" | "reveal" | "live">("cinematic");
  const [exploded, setExploded] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [blend, setBlend] = useState(1.0);

  const handleCut = useCallback(() => {
    setPhase("reveal");
    setTimeout(() => setPhase("live"), 1400);
  }, []);

  useEffect(() => {
    if (phase === "cinematic") {
      setBlend(1.0);
    } else if (phase === "reveal") {
      let animId = 0;
      const start = performance.now();
      const duration = 1400;
      const tick = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentBlend = 1.0 - ease;
        setBlend(currentBlend);
        if (progress < 1) {
          animId = requestAnimationFrame(tick);
        } else {
          setBlend(0);
        }
      };
      animId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animId);
    } else {
      setBlend(0);
    }
  }, [phase]);

  const simulation = useMemo(
    () => simulate(0, BASELINE_CONDITIONS, 0.12),
    []
  );

  const rul = useMemo(
    () => estimateRul(simulation, BASELINE_CONDITIONS, 0.12),
    [simulation]
  );

  const highlights = useMemo<PartHighlights>(
    () => ({
      cyl1CHT: simulation.cht,
      cyl2CHT: simulation.cht + 3,
      cyl3CHT: simulation.cht + 8,
      cyl4CHT: simulation.cht - 2,
      egt: simulation.egt,
      rpm: simulation.rpm,
      vibration: simulation.vibrationRms,
      oilTemp: simulation.oilTemperature,
      health: simulation.health,
    }),
    [simulation]
  );

function SpaceStationLabBackground() {
  return (
    <div className="aeris-spacestation-bg" aria-hidden="true">
      <img
        src={heroBgImage}
        alt="Aeris Space Lab Hangar Background"
        className="lab-chamber-img"
      />
      <div className="lab-light-pillar lab-pillar-left" />
      <div className="lab-light-pillar lab-pillar-right" />
      <div className="lab-center-chamber-glow" />
    </div>
  );
}

  return (
    <section id="top" className="aeris-hero">
      {phase !== "live" && <CinematicIntro phase={phase} onCut={handleCut} />}
      <div className="aeris-hero-atmosphere" aria-hidden="true" />
      <div className="aeris-hero-grid" aria-hidden="true" />
      <div className="aeris-hero-blueprint" aria-hidden="true" />
      <SpaceStationLabBackground />

      <div className="aeris-hero-inner">
        <div className="aeris-hero-copy">
          <div className="aeris-kicker aeris-rise">
            <span className="aeris-pulse-dot" />
            AI-ENABLED ENGINE INTELLIGENCE
          </div>

          <p className="aeris-index aeris-rise">
            AERIS-TWIN / 01 — DIGITAL ENGINE INTELLIGENCE
          </p>

          <h1 className="aeris-rise">
            Know the engine
            <br />
            before it knows
            <br />
            <em>it's failing.</em>
          </h1>

          <p className="aeris-lede aeris-rise">
            A live digital twin for aero piston engines — reconciling
            telemetry, physics and explainable AI to turn degradation into
            foresight.
          </p>

          <div className="aeris-actions aeris-rise">
            <button
              className="aeris-button aeris-button-primary"
              onClick={() => setIsStudioOpen(true)}
            >
              <Zap size={15} />
              EXPLORE THE TWIN
              <ArrowRight size={15} />
            </button>

            <Link
              className="aeris-button aeris-button-quiet"
              to="/sim"
            >
              <Plane size={15} />
              FLIGHT SIMULATOR
            </Link>
          </div>

          <div className="aeris-hero-meta aeris-rise">
            <span>ROTAX 914 / DIGITAL TWIN</span>
            <span>TAPAS BH-201</span>
            <span className="aeris-online">
              <CircleDot size={11} />
              SYSTEM ONLINE
            </span>
          </div>
        </div>

        <div className="aeris-engine-stage">
          <div className="aeris-engine-halo" />

          {/* Top Left Glass HUD Card - DIGITAL TWIN */}
          <div className="aeris-glass-hud hud-top-left">
            <div className="hud-title">
              <span className="hud-dot" />
              DIGITAL TWIN
            </div>
            <ul className="hud-list">
              <li>• REAL-TIME</li>
              <li>• PHYSICS-BASED</li>
              <li>• AI DIAGNOSTICS</li>
            </ul>
          </div>

          {/* Top Right Glass HUD Card - ROTAX 914 */}
          <div className="aeris-glass-hud hud-top-right">
            <div className="hud-header">
              <span className="hud-target-icon">⊙</span>
              <span className="hud-title-right">ROTAX 914</span>
            </div>
            <div className="hud-schematic-box">
              <svg viewBox="0 0 160 90" className="hud-schematic-svg">
                <path d="M20 50 L40 30 L100 30 L130 45 L140 65 L110 75 L30 75 Z" strokeDasharray="3 2" />
                <circle cx="50" cy="50" r="14" />
                <circle cx="95" cy="50" r="18" />
                <path d="M50 36 L50 64 M95 32 L95 68" />
                <path d="M10 50 L150 50" strokeOpacity="0.4" />
              </svg>
            </div>
          </div>

          <OrbitalRings />

          <div
            className="aeris-engine-canvas"
            style={
              phase !== "live"
                ? {
                    position: "fixed",
                    inset: 0,
                    zIndex: 75,
                    pointerEvents: "none",
                    transition: "opacity 0.5s ease",
                  }
                : undefined
            }
          >
            <ClientOnly fallback={null}>
              <Suspense
                fallback={
                  <div className="aeris-engine-loading">
                    LOADING DIGITAL TWIN
                    <span>•••</span>
                  </div>
                }
              >
                <HeroEngineCanvas
                  frameloop={phase === "cinematic" ? "never" : "always"}
                  interactive={phase === "live"}
                  autoRotate={true}
                  autoRotateSpeed={0.8}
                  spin={!exploded}
                  cameraView="overview"
                  showLabels={showLabels}
                  fault={0.12}
                  exploded={exploded}
                  physicalTone
                  xrayReveal={blend}
                  rotationSync={{ angle: engineSpinAngle() }}
                  macroPose={{ yawDeg: -28, pitchDeg: 14, blend }}
                  modelPosition={[-0.15 * blend, 0.1 * blend, 0]}
                  modelScale={1.55 * blend + 1.18 * (1 - blend)}
                  cameraZ={7}
                  highlights={highlights}
                  onSelectZone={setSelectedZone}
                  selectedZone={selectedZone}
                />
              </Suspense>
            </ClientOnly>
          </div>

          {/* 3D Holographic Pedestal Stand with Upward Light Beam */}
          <div className="aeris-stand-container">
            {/* Upward Projection Hologram Light Cone */}
            <div className="hologram-light-cone" aria-hidden="true" />
            <div className="hologram-vertical-laser" aria-hidden="true" />

            {/* 3D Metallic Stand Base Structure - Dual-Tiered 2-Layer Stage */}
            <div className="stand-pedestal-wrapper">
              {/* UPPER LAYER (STAGE 1) */}
              <div className="stand-stage-upper">
                <div className="stand-top-plate">
                  <div className="stand-emitter-ring" />
                  <div className="stand-emitter-core" />
                </div>
                <div className="stand-upper-rim-glow" />
              </div>

              {/* LOWER LAYER (STAGE 2) */}
              <div className="stand-stage-lower">
                <div className="stand-lower-plate" />
                <div className="stand-front-wall">
                  <div className="stand-engraved-badge">
                    <span className="badge-glow-dot" />
                    REAL ENGINE. VIRTUAL INSIGHT.
                    <span className="badge-glow-dot" />
                  </div>
                </div>
                <div className="stand-bottom-flange" />
              </div>
            </div>

            <div className="stand-ground-reflection" aria-hidden="true" />
          </div>

          <div className="aeris-engine-controls">
            <button
              type="button"
              className="cursor-pointer pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setIsStudioOpen(true);
              }}
            >
              <Expand size={13} />
              INSPECT
            </button>

            <button
              type="button"
              className="cursor-pointer pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                if (exploded) {
                  engineViewerAudio.assemble();
                } else {
                  engineViewerAudio.explode();
                }
                setExploded(!exploded);
              }}
            >
              {exploded ? (
                <Shrink size={13} />
              ) : (
                <Expand size={13} />
              )}
              {exploded ? "ASSEMBLE" : "EXPLODE"}
            </button>

            <button
              type="button"
              className="cursor-pointer pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setShowLabels(!showLabels);
              }}
            >
              {showLabels ? (
                <Eye size={13} />
              ) : (
                <EyeOff size={13} />
              )}
              LABELS
            </button>
          </div>

          <div className="aeris-engine-status">
            <span>MODEL STATUS</span>
            <strong>SYNCED</strong>
            <small>ROTAX 914 / LIVE MODEL</small>
          </div>
        </div>
      </div>

      <a className="aeris-scroll-cue" href="#foresight">
        <ChevronDown size={18} />
        <span>SCROLL TO EXPLORE</span>
      </a>

      {selectedZone && (
        <JARVISPartInspector
          zoneName={selectedZone}
          highlights={highlights}
          onClose={() => setSelectedZone(null)}
          isExploded={exploded}
          onExplodeToggle={() => {
            exploded
              ? engineViewerAudio.assemble()
              : engineViewerAudio.explode();

            setExploded(!exploded);
          }}
        />
      )}

      <JARVISExplodeStudio
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        highlights={highlights}
      />
    </section>
  );
}

export function ForesightSection() {
  return (
    <Section
      id="foresight"
      eyebrow="02 / FROM DATA TO FORESIGHT"
      title={
        <>
          The engine tells a story.
          <br />
          <span>We make it legible.</span>
        </>
      }
    >
      <div className="aeris-process-line" />

      <div className="aeris-process-grid">
        {STEPS.map((step, index) => (
          <div className="aeris-process-step" key={step.title}>
            <span className="aeris-step-num">{step.num}</span>

            <div className={`aeris-step-mark mark-${index}`}>
              <span />
            </div>

            <h3>{step.title}</h3>

            <p>{step.copy}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function MissionContextSection() {
  return (
    <Section
      id="mission"
      eyebrow="03 / MISSION CONTEXT"
      title={
        <>
          A clearer view of
          <br />
          <span>what is at stake.</span>
        </>
      }
      className="aeris-mission-section"
    >
      <div className="aeris-mission-layout">
        <div className="aeris-aircraft-plate">
          <div className="aeris-aircraft-glow" />

          <svg
            viewBox="0 0 720 300"
            role="img"
            aria-label="Technical silhouette of TAPAS BH-201 aircraft"
          >
            <path
              d="M76 171 C170 168 235 142 319 132 L440 76 L488 79 L454 129 L632 152 L651 168 L461 169 L418 222 L379 226 L400 174 L207 177 L162 216 L124 216 L146 176 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />

            <path
              d="M319 132 L354 173 M441 77 L482 167 M207 177 L205 239 M518 160 L538 205"
              fill="none"
              stroke="currentColor"
              strokeWidth=".8"
            />

            <circle
              cx="365"
              cy="158"
              r="8"
              fill="none"
              stroke="currentColor"
            />
          </svg>

          <div className="aeris-aircraft-caption">
            <strong>TAPAS BH-201</strong>
            <span>MALE UAV / LONG ENDURANCE</span>
          </div>
        </div>

        <div className="aeris-mission-copy">
          <span className="aeris-eyebrow">THE PLATFORM</span>

          <p>
            One engine. One mission. Thousands of decisions between
            take-off and return.
          </p>

          <div className="aeris-stat-list">
            <span>
              <b>01</b> MARITIME ISR
            </span>
            <span>
              <b>02</b> PERSISTENT SURVEILLANCE
            </span>
            <span>
              <b>03</b> MISSION READINESS
            </span>
          </div>

          <Link className="aeris-text-link" to="/gcs">
            ENTER GROUND CONTROL
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function IntelligenceSection() {
  return (
    <Section
      id="intelligence"
      eyebrow="04 / ENGINE INTELLIGENCE"
      title={
        <>
          Live. Predictive.
          <br />
          <span>Explainable.</span>
        </>
      }
    >
      <div className="aeris-intel-grid">
        {[
          [
            "01",
            "LIVE",
            "A continuously reconciled view of what the engine is doing now.",
          ],
          [
            "02",
            "PREDICTIVE",
            "A physics-informed trajectory of where it is going next.",
          ],
          [
            "03",
            "EXPLAINABLE",
            "Evidence for every advisory, not another black box.",
          ],
          [
            "04",
            "RUL",
            "A confidence interval that respects uncertainty.",
          ],
          [
            "05",
            "3D INSPECTION",
            "Every component available for a closer look.",
          ],
        ].map(([num, title, copy]) => (
          <div className="aeris-intel-item" key={title}>
            <span>{num}</span>
            <h3>{title}</h3>
            <p>{copy}</p>
            <ArrowRight size={15} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function DiagnosticPreview() {
  return (
    <section className="aeris-diagnostic-preview">
      <div className="aeris-diagnostic-copy">
        <span className="aeris-eyebrow">
          AI / EXPLAINABLE DIAGNOSTICS
        </span>

        <h2>
          Every prediction
          <br />
          <span>carries its evidence.</span>
        </h2>

        <p>
          AERIS-TWIN doesn't just flag an anomaly. It connects the
          signal, model residual and physical subsystem behind it.
        </p>
      </div>

      <div className="aeris-diagnostic-panel">
        <ExplainablePanel />
      </div>
    </section>
  );
}

export function InspectionSection() {
  return (
    <Section
      id="inspection"
      eyebrow="05 / DIGITAL TWIN INSPECTION"
      title={
        <>
          From a signal
          <br />
          <span>to a component.</span>
        </>
      }
      className="aeris-inspection-section"
    >
      <div className="aeris-inspection-layout">
        <div className="aeris-inspection-visual">
          <div className="aeris-inspection-glow" />
          <div className="aeris-wireframe-ring" />
          <div className="aeris-inspection-crosshair" />
          <div className="aeris-inspection-engine-word">
            914
          </div>

          <span className="aeris-inspection-tag tag-one">
            CYLINDER 03 / EGT DRIFT
          </span>

          <span className="aeris-inspection-tag tag-two">
            FUEL SUBSYSTEM / 87%
          </span>

          <span className="aeris-inspection-tag tag-three">
            CLICK TO INSPECT
          </span>
        </div>

        <div className="aeris-inspection-copy">
          <p>
            The twin gives engineers a shared visual language. Watch a
            component, isolate a signal, interrogate the evidence —
            before the part becomes a problem.
          </p>

          <button
            className="aeris-button aeris-button-primary"
            onClick={() =>
              document
                .getElementById("top")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            OPEN LIVE ENGINE
            <RotateCw size={15} />
          </button>
        </div>
      </div>
    </Section>
  );
}

export function RulPreview() {
  return (
    <div className="aeris-rul-preview">
      <RulPanel severity={0.45} />
    </div>
  );
}

export function FinaleSection() {
  return (
    <section className="aeris-finale">
      <div className="aeris-finale-atmosphere" />
      <div className="aeris-finale-grid" />

      <span className="aeris-eyebrow">
        06 / THE DECISION WINDOW
      </span>

      <h2>
        Know the engine
        <br />
        before it knows
        <br />
        <em>it's failing.</em>
      </h2>

      <p>
        Predictive engine intelligence for the missions that cannot
        wait for an alarm.
      </p>

      <Link
        className="aeris-button aeris-button-primary"
        to="/sim"
      >
        ENTER THE MISSION
        <ArrowRight size={15} />
      </Link>

      <div className="aeris-finale-mark">
        <span>AERIS-TWIN</span>
        <span>ENGINE INTELLIGENCE / 2026</span>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="aeris-footer">
      <span>AERIS-TWIN / DIGITAL ENGINE INTELLIGENCE</span>
      <span>ROTAX 914 / TAPAS BH-201</span>
      <span>RESEARCH DEMONSTRATOR</span>
    </footer>
  );
}
