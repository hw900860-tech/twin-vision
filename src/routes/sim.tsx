import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plane } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { StatusDot } from "@/components/hud/primitives";
import { FlightSimulator } from "@/features/flight-sim/FlightSimulator";
import { FlightHUD } from "@/features/flight-sim/FlightHUD";
import { ControlPanel } from "@/features/flight-sim/ControlPanel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const Route = createFileRoute("/sim")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN — Flight Simulator" },
      {
        name: "description",
        content:
          "Interactive 3D UAV flight simulator with real-time engine telemetry, textured terrain, and mission presets.",
      },
    ],
  }),
  component: SimPage,
});

function SimPage() {
  return (
    <ProtectedRoute>
      <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Top bar — highest z-index */}
      <header className="absolute inset-x-0 top-0 z-50 flex h-10 items-center justify-between border-b border-border bg-panel/70 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link to="/" aria-label="Return to AERIS-TWIN landing page" className="flex min-h-10 items-center gap-2 label-xs hover:text-cyan transition-colors">
            <ArrowLeft className="h-3 w-3" />
            <span className="hidden sm:inline">AERIS-TWIN</span>
          </Link>
          <span className="flex items-center gap-2 label-xs">
            <Plane className="h-3 w-3 text-cyan" />
            FLIGHT SIMULATOR
          </span>
          <span className="hidden items-center gap-2 label-xs sm:flex">
            <StatusDot /> SIMULATION
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden label-xs sm:inline">TAPAS BH-201 / ROTAX 914</span>
          <span className="label-xs border border-amber/40 bg-amber/10 px-2 py-0.5 text-amber">SIM</span>
          <SignOutButton />
        </div>
      </header>

      {/* 3D Canvas — base layer */}
      <div className="absolute inset-0">
        <ClientOnly>
          <FlightSimulator />
        </ClientOnly>
      </div>

      {/* HUD overlay — above canvas, below top bar and controls */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <ClientOnly>
          <FlightHUD />
        </ClientOnly>
      </div>

      {/* Right control panel — interactive, above HUD */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-10 z-40 lg:inset-y-10 lg:left-auto">
        <ClientOnly>
          <ControlPanel />
        </ClientOnly>
      </div>
      </div>
    </ProtectedRoute>
  );
}
