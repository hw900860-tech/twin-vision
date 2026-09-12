import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plane, Zap, Activity, Cpu, Shield, Layers } from "lucide-react";
import { createTopDockController, type TopDockOptions } from "./topDockController";
import { scrollToLandingSection } from "@/features/jarvis/jarvisNavigation";

type DockItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
};

const ITEMS: readonly DockItem[] = [
  {
    id: "home",
    label: "Home",
    href: "#top",
    icon: (
      <svg viewBox="0 0 16 16">
        <path d="M8 1.9 14.1 5v6L8 14.1 1.9 11V5z" />
        <path d="M1.9 5 8 8.1 14.1 5M8 8.1v6" />
      </svg>
    ),
  },
  {
    id: "live",
    label: "Live Engine",
    href: "#top",
    icon: (
      <svg viewBox="0 0 16 16">
        <path d="M8 1.9 14.4 5.6 8 9.3 1.6 5.6z" />
        <path d="m2.6 8 5.4 3.1L13.4 8M2.6 10.7 8 13.8l5.4-3.1" />
      </svg>
    ),
  },
  {
    id: "predictive",
    label: "Predictive",
    href: "#intelligence",
    icon: (
      <svg viewBox="0 0 16 16">
        <path d="M3.4 2.4h5.4l3.8 3.8v7.4H3.4z" />
        <path d="M8.8 2.4v3.8h3.8M5.9 9h4.2M5.9 11.2h3" />
      </svg>
    ),
  },
  {
    id: "mission",
    label: "Mission",
    href: "#mission",
    icon: (
      <svg viewBox="0 0 16 16">
        <path d="M8.6 2.2H13v4.4l-6.6 6.6a1.2 1.2 0 0 1-1.7 0L2.2 10.5a1.2 1.2 0 0 1 0-1.7z" />
        <circle cx="10.6" cy="4.6" r=".9" />
      </svg>
    ),
  },
  {
    id: "inspection",
    label: "Inspection",
    href: "#inspection",
    icon: (
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="5.9" />
        <path d="M8 4.6V8l2.4 1.5" />
      </svg>
    ),
  },
  {
    // Static asset in public/ — downloads the 6-slide SIH idea submission deck.
    id: "deck",
    label: "Deck PDF",
    href: "/sih-idea-submission.pdf",
    icon: (
      <svg viewBox="0 0 16 16">
        <path d="M3.6 1.9h6.2l2.6 2.6v4.1M3.6 1.9v12.2h4.1" />
        <path d="M9.8 1.9v2.6h2.6M7.9 8.4v4.6M6.1 11.2l1.8 1.8 1.8-1.8" />
      </svg>
    ),
  },
];

const DECK_DOWNLOAD_NAME = "AERIS-TWIN-SIH-Idea-Submission.pdf";

const BRAND_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="4.5" fill="#00d2ff" />
    <path d="M6 6h8.6L18 9.35v8.15H9.15L6 14.35V6Z" fill="#07080c" />
    <path d="M9 9h5.15L15 9.85V15H9.85L9 14.15V9Z" fill="#00d2ff" />
    <path d="M12 9v6M9 12h6" stroke="#07080c" strokeWidth=".7" />
  </svg>
);

export function Nav() {
  const [active, setActive] = useState("home");
  const navigate = useNavigate();
  const optionsRef = useRef<TopDockOptions>({
    proximity: 122,
    spring: 0.19,
    damping: 0.7,
    widthGrowth: 17,
    heightGrowth: 16,
    drop: 3.5,
    axis: "x",
    distribute: false,
    lockTrack: true,
  });

  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    return createTopDockController(root, () => optionsRef.current);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string, id?: string) => {
    e.preventDefault();
    if (id) setActive(id);
    scrollToLandingSection(href, (path) => navigate({ to: path as any }));
  };

  return (
    <header className="animated-top-dock-component atd-modern aeris-top-dock-header">
      <div className="atd-modern__aurora" aria-hidden="true" />
      <div className="atd-modern__bar">
        <a className="atd-modern__brand" href="#top" onClick={(e) => handleNavClick(e, "#top", "home")}>
          <span className="atd-modern__mark" aria-hidden="true">
            {BRAND_MARK}
          </span>
          <span className="atd-modern__word">AERIS-TWIN</span>
        </a>

        <nav
          ref={rootRef}
          className="atd-modern__dock"
          aria-label="Primary Navigation"
          data-dock-state="idle"
          data-dock-max="0.00"
        >
          {ITEMS.map((item) => {
            const isDeck = item.id === "deck";
            return (
              <a
                key={item.id}
                href={item.href}
                className="atd-modern__item"
                data-dock-item
                download={isDeck ? DECK_DOWNLOAD_NAME : undefined}
                title={isDeck ? "Download the 6-slide SIH idea submission deck (PDF)" : undefined}
                aria-pressed={isDeck ? undefined : active === item.id}
                onClick={isDeck ? undefined : (e) => handleNavClick(e, item.href, item.id)}
              >
                <span className="atd-modern__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="atd-modern__actions">
          <Link to="/sim" className="atd-modern__cta">
            <span>Flight Sim</span>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.2 8h9.1M8.6 4.3 12.4 8l-3.8 3.7" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

