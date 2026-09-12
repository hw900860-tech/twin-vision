import { useEffect, useRef } from "react";

const PARTICLES = Array.from({ length: 30 }, (_, index) => ({
  left: (index * 37 + 11) % 100,
  top: (index * 53 + 7) % 100,
  size: 1 + ((index * 7) % 3),
  duration: 7 + ((index * 11) % 9),
  delay: -((index * 13) % 12),
}));

/**
 * Keeps landing-page motion outside React's render loop. Pointer and scroll
 * values are written directly to CSS custom properties so the WebGL engine is
 * never reconciled just because the mouse moved.
 */
export function LandingMotionController() {
  const controllerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controller = controllerRef.current;
    const root = controller?.closest<HTMLElement>(".aeris-landing");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let currentX = window.innerWidth / 2;
    let currentY = window.innerHeight / 2;
    let targetX = currentX;
    let targetY = currentY;

    const writePointer = () => {
      frame = 0;
      currentX += (targetX - currentX) * 0.13;
      currentY += (targetY - currentY) * 0.13;

      const normalizedX = currentX / Math.max(1, window.innerWidth) - 0.5;
      const normalizedY = currentY / Math.max(1, window.innerHeight) - 0.5;
      root.style.setProperty("--aeris-pointer-x", `${currentX.toFixed(1)}px`);
      root.style.setProperty("--aeris-pointer-y", `${currentY.toFixed(1)}px`);
      root.style.setProperty("--aeris-shift-back-x", `${(normalizedX * -10).toFixed(2)}px`);
      root.style.setProperty("--aeris-shift-back-y", `${(normalizedY * -8).toFixed(2)}px`);
      root.style.setProperty("--aeris-shift-front-x", `${(normalizedX * 8).toFixed(2)}px`);
      root.style.setProperty("--aeris-shift-front-y", `${(normalizedY * 6).toFixed(2)}px`);

      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
        frame = requestAnimationFrame(writePointer);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || !finePointer.matches) return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!frame) frame = requestAnimationFrame(writePointer);
    };

    const onScroll = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
      progressRef.current?.style.setProperty("transform", `scaleY(${progress})`);
      root.style.setProperty(
        "--aeris-scroll-shift",
        `${Math.min(54, window.scrollY * 0.065).toFixed(1)}px`,
      );
    };

    const revealTargets = Array.from(
      root.querySelectorAll<HTMLElement>(".aeris-diagnostic-preview, .aeris-finale, .aeris-footer"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-motion-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5%" },
    );

    revealTargets.forEach((target) => observer.observe(target));
    root.classList.add("aeris-motion-ready");
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    writePointer();

    return () => {
      root.classList.remove("aeris-motion-ready");
      revealTargets.forEach((target) => observer.unobserve(target));
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={controllerRef} className="aeris-motion-controller" aria-hidden="true">
      <div className="aeris-page-progress">
        <span ref={progressRef} />
      </div>
    </div>
  );
}

export function HeroMotionBackdrop() {
  return (
    <div className="aeris-hero-motion" aria-hidden="true">
      <div className="aeris-pointer-aura" />
      <div className="aeris-energy-sweep" />
      <div className="aeris-constellation">
        {PARTICLES.map((particle, index) => (
          <i
            key={index}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>
      <svg className="aeris-flight-paths" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path d="M-80 650 C 250 500, 360 720, 690 480 S 1140 240, 1520 320" />
        <path d="M120 880 C 340 610, 540 720, 770 520 S 1190 410, 1470 90" />
      </svg>
      <span className="aeris-reticle aeris-reticle-one" />
      <span className="aeris-reticle aeris-reticle-two" />
    </div>
  );
}
