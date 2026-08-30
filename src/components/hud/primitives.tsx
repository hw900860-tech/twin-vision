import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** 0 → 1 as the element travels through the viewport. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const v = total > 0 ? -r.top / total : 1 - r.bottom / (window.innerHeight + r.height);
      setP(Math.min(1, Math.max(0, v)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return { ref, progress: p };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = () => setReduced(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return reduced;
}

/** requestAnimationFrame clock in seconds. */
export function useClock(active = true, speed = 1) {
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setT(((now - start) / 1000) * speed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, speed, reduced]);
  return t;
}

export function Panel({
  className,
  children,
  label,
  corner,
}: {
  className?: string;
  children?: ReactNode;
  label?: string;
  corner?: string;
}) {
  return (
    <div className={cn("relative border border-border bg-panel/70 backdrop-blur-[2px]", className)}>
      <span className="pointer-events-none absolute -top-px -left-px h-2 w-2 border-t border-l border-cyan/60" />
      <span className="pointer-events-none absolute -right-px -bottom-px h-2 w-2 border-r border-b border-cyan/60" />
      {(label || corner) && (
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          {label && <span className="label-xs">{label}</span>}
          {corner && <span className="label-xs text-cyan-dim">{corner}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="h-px w-8 bg-cyan/60" />
      <span className="label-xs text-cyan">{children}</span>
    </div>
  );
}

export function SectionHeading({
  index,
  kicker,
  title,
  sub,
  className,
}: {
  index?: string;
  kicker?: string;
  title: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {(index || kicker) && (
        <div className="mb-5 flex items-center gap-3">
          {index && <span className="label-xs text-cyan">{index}</span>}
          <span className="h-px w-10 bg-hairline" />
          {kicker && <span className="label-xs">{kicker}</span>}
        </div>
      )}
      <h2 className="font-display text-3xl leading-[1.08] font-medium tracking-tight text-balance sm:text-4xl lg:text-[2.9rem]">
        {title}
      </h2>
      {sub && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{sub}</p>}
    </div>
  );
}

export function StatusDot({ tone = "nominal", className }: { tone?: "nominal" | "warn" | "critical" | "idle"; className?: string }) {
  const color =
    tone === "nominal" ? "bg-nominal" : tone === "warn" ? "bg-amber" : tone === "critical" ? "bg-critical" : "bg-muted-foreground";
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5", className)}>
      <span className={cn("absolute inset-0 rounded-full", color)} style={{ animation: "aeris-pulse 2.4s ease-in-out infinite" }} />
    </span>
  );
}

export function Readout({
  label,
  value,
  unit,
  tone,
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "cyan" | "amber" | "critical" | "nominal";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const toneClass =
    tone === "cyan"
      ? "text-cyan"
      : tone === "amber"
        ? "text-amber"
        : tone === "critical"
          ? "text-critical"
          : tone === "nominal"
            ? "text-nominal"
            : "text-foreground";
  const sizeClass = size === "lg" ? "text-3xl sm:text-4xl" : size === "sm" ? "text-base" : "text-xl sm:text-2xl";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="label-xs">{label}</span>
      <span className={cn("readout font-medium", sizeClass, toneClass)}>
        {value}
        {unit && <span className="ml-1 text-[0.55em] tracking-widest text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

export function Bar({ value, tone = "cyan", className }: { value: number; tone?: "cyan" | "amber" | "critical" | "nominal"; className?: string }) {
  const bg = tone === "cyan" ? "bg-cyan" : tone === "amber" ? "bg-amber" : tone === "critical" ? "bg-critical" : "bg-nominal";
  return (
    <div className={cn("h-1 w-full bg-panel-2", className)}>
      <div className={cn("h-full transition-[width] duration-700 ease-out", bg)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function TechButton({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "group relative inline-flex items-center gap-3 px-6 py-3 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors",
        variant === "primary"
          ? "border border-cyan/70 bg-cyan/10 text-cyan hover:bg-cyan/20"
          : "border border-border text-muted-foreground hover:border-cyan/50 hover:text-foreground",
        className,
      )}
    >
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-current opacity-80" />
      <span className="absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b border-current opacity-80" />
      {children}
    </button>
  );
}

export function DataRow({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="label-xs">{k}</span>
      <span className={cn("readout text-sm", tone)}>{v}</span>
    </div>
  );
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(18px)",
        transition: `opacity .7s cubic-bezier(.22,.61,.36,1) ${delay}ms, transform .7s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function SimBadge({ className }: { className?: string }) {
  return (
    <span className={cn("label-xs border border-amber/40 bg-amber/10 px-2 py-1 text-amber", className)}>
      SIMULATION / DEMONSTRATOR DATA
    </span>
  );
}
