/**
 * Fast, high-performance smooth scroll utilities for AERIS-TWIN and JARVIS.
 * Provides instant, silky 400ms quartic easing to bring target sections into view,
 * with route-aware landing page redirection and tactical HUD highlighting.
 */

export function fastSmoothScrollTo(targetY: number, durationMs = 400): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    const startY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const diff = targetY - startY;

    if (Math.abs(diff) < 6) {
      window.scrollTo(0, targetY);
      resolve();
      return;
    }

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Snappy quartic easeOut curve (fast acceleration, buttery deceleration)
      const ease = 1 - Math.pow(1 - progress, 4);
      window.scrollTo(0, startY + diff * ease);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        window.scrollTo(0, targetY);
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

/**
 * Scrolls directly to a landing page section (#top, #foresight, #mission, #intelligence, #diagnostics, #inspection).
 * If currently on another route (e.g. /gcs, /sim), it navigates to "/" first and scrolls as soon as the DOM renders.
 */
export function scrollToLandingSection(
  sectionId: string,
  navHandler?: ((path: string) => void) | null
): void {
  if (typeof window === "undefined") return;

  const cleanId = sectionId.replace(/^#/, "").trim().toLowerCase();
  const currentPath = window.location.pathname;
  const isHome = currentPath === "/" || currentPath === "";

  const performScroll = (): boolean => {
    if (cleanId === "top" || cleanId === "home" || cleanId === "hero") {
      fastSmoothScrollTo(0, 380);
      const topEl = document.getElementById("top");
      if (topEl) highlightSection(topEl);
      return true;
    }

    const el = document.getElementById(cleanId);
    if (el) {
      const navOffset = 68; // Height of top dock header
      const rect = el.getBoundingClientRect();
      const targetY = Math.max(0, rect.top + window.pageYOffset - navOffset);
      fastSmoothScrollTo(targetY, 420);
      highlightSection(el);
      return true;
    }
    return false;
  };

  function highlightSection(element: HTMLElement) {
    element.classList.remove("aeris-section-target-highlight");
    // Force reflow so re-triggering the same section works
    void element.offsetWidth;
    element.classList.add("aeris-section-target-highlight");
    setTimeout(() => {
      element.classList.remove("aeris-section-target-highlight");
    }, 2200);
  }

  if (!isHome) {
    if (navHandler) {
      navHandler("/");
    } else {
      window.location.href = `/#${cleanId}`;
      return;
    }

    // Repeatedly check until section is in DOM post-route change
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "")) {
        if (performScroll() || attempts >= 30) {
          clearInterval(timer);
        }
      } else if (attempts >= 30) {
        clearInterval(timer);
      }
    }, 50);
  } else {
    performScroll();
  }
}
