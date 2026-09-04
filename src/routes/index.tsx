import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import {
  AerisLandingHero,
  DiagnosticPreview,
  ForesightSection,
  InspectionSection,
  IntelligenceSection,
  LandingFooter,
  MissionContextSection,
  FinaleSection,
} from "@/components/landing/AerisLanding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "AERIS-TWIN — Digital Engine Intelligence",
      },
      {
        name: "description",
        content:
          "Know the engine before it knows it's failing. Explainable predictive engine intelligence for mission reliability.",
      },
      {
        property: "og:title",
        content:
          "AERIS-TWIN — Digital Engine Intelligence",
      },
      {
        property: "og:description",
        content:
          "Know the engine before it knows it's failing.",
      },
      {
        property: "og:type",
        content: "website",
      },
    ],
  }),

  component: Landing,
});

function Landing() {
  return (
    <div className="aeris-landing">
      <Nav />

      <main>
        <AerisLandingHero />
        <ForesightSection />
        <MissionContextSection />
        <IntelligenceSection />
        <DiagnosticPreview />
        <InspectionSection />
        <FinaleSection />
      </main>

      <LandingFooter />
    </div>
  );
}
