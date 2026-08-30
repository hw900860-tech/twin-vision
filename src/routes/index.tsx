import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import {
  ArchitectureStrip,
  ExplainSection,
  FinaleSection,
  FleetSection,
  Footer,
  LiveSection,
  MaintenanceSection,
  MissionSection,
  PhysicsSection,
  PredictiveSection,
  ProblemSection,
  ReplaySection,
  RulSection,
  SimulationSection,
  TwinSection,
} from "@/components/landing/sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AERIS-TWIN — Digital Twin for Aero Piston Engines" },
      {
        name: "description",
        content:
          "AERIS-TWIN is a real-time digital twin for MALE UAV aero piston engines: live telemetry, physics residuals, explainable fault prediction, RUL estimation and mission-risk assessment.",
      },
      { property: "og:title", content: "AERIS-TWIN — Digital Twin for Aero Piston Engines" },
      {
        property: "og:description",
        content: "Know the engine before it knows it's failing. Explainable predictive engine intelligence for mission reliability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative">
      <Nav />
      <main>
        <Hero />
        <ProblemSection />
        <TwinSection />
        <LiveSection />
        <PhysicsSection />
        <PredictiveSection />
        <ExplainSection />
        <RulSection />
        <MissionSection />
        <SimulationSection />
        <ReplaySection />
        <MaintenanceSection />
        <FleetSection />
        <ArchitectureStrip />
        <FinaleSection />
      </main>
      <Footer />
    </div>
  );
}
