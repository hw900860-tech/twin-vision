import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Plane } from "lucide-react";
import { StatusDot } from "@/components/hud/primitives";

const ITEMS = [
  { label: "SYSTEM", href: "#system" },
  { label: "DIGITAL TWIN", href: "#twin" },
  { label: "PREDICTIVE", href: "#predictive" },
  { label: "MISSION", href: "#mission" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${
        scrolled ? "border-border bg-background/85 backdrop-blur-md" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-5 lg:px-10">
        <a href="#top" className="flex items-center gap-3">
          <span className="grid h-6 w-6 place-items-center border border-cyan/60">
            <span className="h-1.5 w-1.5 bg-cyan" />
          </span>
          <span className="font-display text-sm tracking-[0.32em]">AERIS-TWIN</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {ITEMS.map((i) => (
            <a key={i.href} href={i.href} className="label-xs transition-colors hover:text-cyan">
              {i.label}
            </a>
          ))}
          <Link to="/sim" className="label-xs flex items-center gap-1.5 border border-cyan/60 px-3 py-1.5 text-cyan transition-colors hover:bg-cyan/10">
            <Plane className="h-3 w-3" />
            FLIGHT SIM
          </Link>
          <Link to="/gcs" className="label-xs border border-cyan/60 px-3 py-1.5 text-cyan transition-colors hover:bg-cyan/10">
            GCS
          </Link>
          <span className="flex items-center gap-2 label-xs">
            SYSTEM ONLINE <StatusDot />
          </span>
        </nav>

        <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background/95 px-5 py-4 md:hidden">
          {ITEMS.map((i) => (
            <a key={i.href} href={i.href} onClick={() => setOpen(false)} className="block py-2 label-xs">
              {i.label}
            </a>
          ))}
          <Link to="/sim" onClick={() => setOpen(false)} className="mt-2 flex items-center gap-2 py-2 label-xs text-cyan">
            <Plane className="h-3 w-3" /> FLIGHT SIMULATOR
          </Link>
          <Link to="/gcs" onClick={() => setOpen(false)} className="mt-2 block py-2 label-xs text-cyan">
            ENTER GCS
          </Link>
        </div>
      )}
    </header>
  );
}
