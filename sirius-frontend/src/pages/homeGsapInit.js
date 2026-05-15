import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Set to `true` to verify ScrollTrigger positions (markers on viewport).
 * Set back to `false` for production.
 */
const DEBUG_MARKERS = false;

gsap.registerPlugin(ScrollTrigger);

/** Scroll reveals: stronger offset so motion reads clearly on scroll */
const REVEAL_Y = 70;
const REVEAL_DURATION = 1.08;
const START = "top 92%";

const scrollRevealDefaults = {
  start: START,
  once: true,
  markers: DEBUG_MARKERS,
};

/**
 * One ScrollTrigger per element; trigger is the element itself.
 */
function bindScrollReveal(el, duration = REVEAL_DURATION) {
  if (!el) return;
  gsap.set(el, { opacity: 0, y: REVEAL_Y, force3D: true });
  gsap.to(el, {
    opacity: 1,
    y: 0,
    duration,
    ease: "power3.out",
    scrollTrigger: {
      trigger: el,
      ...scrollRevealDefaults,
    },
  });
}

/**
 * Home page motion. Native scroll for accurate ScrollTrigger measurements.
 */
export function initHomeGsap(container) {
  if (!container) return () => {};

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    container.querySelector(".home-flow")?.style.setProperty("--flow-line-progress", "1");
    return () => {};
  }

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const isFinePointer = window.matchMedia("(pointer: fine)").matches;

  const pointerCleanups = [];

  const ctx = gsap.context(() => {
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);
    pointerCleanups.push(() => window.removeEventListener("load", onLoad));

    const progressEl = container.querySelector(".home-scroll-progress");
    if (progressEl) {
      gsap.set(progressEl, { scaleX: 0, transformOrigin: "left center" });
      ScrollTrigger.create({
        trigger: document.documentElement,
        start: "top top",
        end: "max",
        scrub: 0.3,
        onUpdate: (self) => {
          gsap.set(progressEl, { scaleX: self.progress });
        },
      });
    }

    const cursorGlow = container.querySelector(".home-cursor-glow");
    if (cursorGlow && !isMobile && isFinePointer) {
      gsap.set(cursorGlow, { opacity: 0.4, xPercent: -50, yPercent: -50 });
      const onMove = (e) => {
        gsap.to(cursorGlow, {
          x: e.clientX,
          y: e.clientY,
          duration: 0.35,
          ease: "power2.out",
          overwrite: "auto",
        });
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      pointerCleanups.push(() => window.removeEventListener("pointermove", onMove));
    } else if (cursorGlow) {
      gsap.set(cursorGlow, { display: "none" });
    }

    const bg = container.querySelector(".home-page-bg");
    if (bg) {
      gsap.fromTo(
        bg,
        { y: 0 },
        {
          y: isMobile ? 0 : 40,
          ease: "none",
          scrollTrigger: {
            trigger: container,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        }
      );
    }

    const mesh = container.querySelector(".home-hero-mesh");
    if (mesh) {
      gsap.to(mesh, {
        backgroundPosition: "120% 40%",
        duration: 22,
        ease: "none",
        repeat: -1,
        yoyo: true,
      });
    }

    /* Hero — load timeline (not scroll) */
    const chars = container.querySelectorAll(".home-hero-char");
    const heroEyebrow = container.querySelector(".home-hero-eyebrow");
    const heroAcronym = container.querySelector(".home-hero-acronym");
    const heroSubtitle = container.querySelector(".home-hero-subtitle");
    const heroBody = container.querySelector(".home-hero-body");
    const heroActions = container.querySelector(".home-hero-actions");
    gsap.set(
      [heroEyebrow, heroAcronym, heroSubtitle, heroBody, heroActions].filter(Boolean),
      { opacity: 0, y: REVEAL_Y, force3D: true }
    );
    if (chars.length) gsap.set(chars, { opacity: 0, y: REVEAL_Y, force3D: true });

    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTl.to(heroEyebrow, { opacity: 1, y: 0, duration: 1 });
    if (chars.length) {
      heroTl.to(chars, { opacity: 1, y: 0, duration: 0.85, stagger: 0.08 }, "-=0.4");
    }
    heroTl.to(heroAcronym, { opacity: 1, y: 0, duration: 1.05 }, "-=0.45");
    heroTl.to(heroSubtitle, { opacity: 1, y: 0, duration: 1.08 }, "-=0.5");
    heroTl.to(heroBody, { opacity: 1, y: 0, duration: 1.1 }, "-=0.55");
    heroTl.to(heroActions, { opacity: 1, y: 0, duration: 1.05 }, "-=0.5");

    /* About — each .home-animate-item, trigger = element */
    container.querySelectorAll("#why-it-matters .home-animate-item").forEach((el) => bindScrollReveal(el));

    /* Capabilities */
    container
      .querySelectorAll("#capabilities .home-animate-item")
      .forEach((el) => bindScrollReveal(el));

    /* Environment */
    container
      .querySelectorAll("#space-context .home-animate-item")
      .forEach((el) => bindScrollReveal(el));

    /* Pipeline */
    const flowSection = container.querySelector("#pipeline");
    const flowRoot = container.querySelector(".home-flow");
    if (flowSection && flowRoot) {
      flowRoot.style.setProperty("--flow-line-progress", "0");

      ScrollTrigger.create({
        trigger: flowSection,
        start: "top 80%",
        end: "bottom 30%",
        scrub: 0.5,
        onUpdate: (self) => {
          flowRoot.style.setProperty("--flow-line-progress", String(self.progress));
        },
      });

      const flowHeader = flowSection.querySelector(".home-flow-header");
      if (flowHeader) {
        flowHeader
          .querySelectorAll(".home-section-eyebrow, .home-section-title, .home-section-intro")
          .forEach((el) => bindScrollReveal(el));
      }

      const steps = flowSection.querySelectorAll(".home-flow-step");
      steps.forEach((step) => {
        const inner = step.querySelector(".home-flow-step-inner");
        const idx = step.querySelector(".home-flow-step-index");
        const odd = step.classList.contains("home-flow-step--odd");

        if (inner) {
          gsap.set(inner, {
            opacity: 0,
            y: REVEAL_Y,
            x: odd ? -40 : 40,
            force3D: true,
          });
          gsap.to(inner, {
            opacity: 1,
            y: 0,
            x: 0,
            duration: 1.12,
            ease: "power3.out",
            scrollTrigger: {
              trigger: inner,
              ...scrollRevealDefaults,
            },
          });
        }
        if (idx) {
          gsap.set(idx, { scale: 0.45, opacity: 0, force3D: true });
          gsap.to(idx, {
            scale: 1,
            opacity: 1,
            duration: 0.95,
            ease: "back.out(1.35)",
            scrollTrigger: {
              trigger: idx,
              ...scrollRevealDefaults,
            },
          });
        }

        ScrollTrigger.create({
          trigger: step,
          start: "top 55%",
          end: "bottom 45%",
          onToggle: (self) => step.classList.toggle("home-flow-step--active", self.isActive),
        });
      });
    }

    /* Contact — panel + each inner .home-animate-item */
    container.querySelectorAll("#collaboration .home-animate-item").forEach((el) => bindScrollReveal(el));

    /* Footer — each line */
    container.querySelectorAll(".home-footer .home-animate-item").forEach((el) => bindScrollReveal(el));

    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }, container);

  return () => {
    pointerCleanups.forEach((fn) => fn());
    ctx.revert();
  };
}
