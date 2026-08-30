import { lazy, Suspense, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  FileText,
  FlaskConical,
  Gauge,
  History,
  LayoutGrid,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { Bar, Panel, StatusDot, useClock } from "@/components/hud/primitives";
import { TelemetryDashboard } from "@/features/telemetry/TelemetryDashboard";
import { ExplainablePanel, MaintenanceAdvisory, RulPanel } from "@/features/predictive-maintenance/Diagnostics";
import { SimulationLab } from "@/features/simulation/SimulationLab";
import { ReplayConsole } from "@/features/mission-replay/ReplayConsole";
import { FleetPanel } from "@/features/fleet/FleetPanel";
import { BASELINE_CONDITIONS, simulate } from "@/lib/domain/engine/model";

const EngineCanvas = lazy(() => import("@/features/digital-twin/EngineCanvas"));

export const Route = createFileRoute("/gcs")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN GCS — Ground Control Station" },
      {
        name: "description",
        content:
          "AERIS-TWIN Ground Control Station: live engine twin, predictive diagnostics, RUL, mission replay and what-if simulation for MALE UAV piston engines.",
      },
      { property: "og:title", content: "AERIS-TWIN GCS — Ground Control Station" },
      {
        property: "og:description",
        content: "Fleet health, live digital twin telemetry, explainable diagnostics and mission-risk decision support.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const t = useClock();
  const state = simulate(t * 0.4, BASELINE_CONDITIONS, 0.34);

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      {/* top bar */}
      <header className="relative z-20 flex h-12 items-center justify-between border-b border-border bg-panel/70 px-4 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 label-xs hover:text-cyan">
            <ArrowLeft className="h-3 w-3" />
          </Link>
          <span className="font-display text-sm tracking-[0.3em]">AERIS-TWIN</span>
          <span className="hidden items-center gap-2 label-xs sm:flex">
            TWIN STATUS <StatusDot /> LIVE
          </span>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden label-xs sm:inline">DATA QUALITY 97%</span>
          <span className="hidden label-xs md:inline">MODEL v1.4</span>
          <span className="label-xs border border-amber/40 bg-amber/10 px-2 py-0.5 text-amber">DEMONSTRATOR</span>
        </div>
      </header>

      <div className="relative z-10 flex">
        {/* left nav */}
        <nav className="sticky top-12 hidden h-[calc(100vh-3rem)] w-56 shrink-0 border-r border-border bg-panel/50 p-3 lg:block">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left label-xs transition-colors ${
                  active ? "border-cyan bg-cyan/10 text-cyan" : "border-transparent hover:bg-panel-2/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.key}
              </button>
            );
          })}
          <div className="mt-8 space-y-2 border-t border-border pt-4">
            {["READ-ONLY ECU INTERFACE", "SECURE TELEMETRY", "AUDIT LOGGING", "STORE-AND-FORWARD"].map((s) => (
              <div key={s} className="label-xs text-[9px] opacity-70">
                · {s}
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          {/* mobile tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`shrink-0 border px-3 py-1.5 label-xs ${tab === n.key ? "border-cyan text-cyan" : "border-border"}`}
              >
                {n.key}
              </button>
            ))}
          </div>

          <div className="mb-4 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="ENGINE HEALTH" value={`${(state.health * 100).toFixed(1)}%`} sub="COMPOSITE / AE-P4" />
            <Kpi label="REMAINING USEFUL LIFE" value="8.7 — 11.2 H" sub="CONFIDENCE 78%" tone="amber" />
            <Kpi label="MISSION RISK" value="MEDIUM" sub="READINESS 72%" tone="amber" />
            <Kpi label="ACTIVE ADVISORIES" value="2" sub="1 MEDIUM / 1 LOW" tone="cyan" />
          </div>

          {tab === "LIVE TWIN" && (
            <div className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <TelemetryDashboard fault={0.34} />
                <Panel label="LIVE ENGINE TWIN" corner="AE-P4 / INTERACTIVE">
                  <div className="h-[320px]">
                    <ClientOnly>
                      <Suspense fallback={null}>
                        <EngineCanvas interactive spin={false} fault={0.5} cameraZ={8} />
                      </Suspense>
                    </ClientOnly>
                  </div>
                  <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
                    {[
                      { k: "CYL 3 CHT", v: "194°C" },
                      { k: "CYL 3 EGT", v: "782°C" },
                      { k: "CYL 3 VIB", v: "1.24 G" },
                    ].map((r) => (
                      <div key={r.k} className="bg-panel/90 p-2">
                        <div className="label-xs text-[9px]">{r.k}</div>
                        <div className="readout text-xs text-amber">{r.v}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {tab === "FLEET" && <FleetPanel />}
          {tab === "DIAGNOSTICS" && (
            <div className="grid gap-4">
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
  );
}
