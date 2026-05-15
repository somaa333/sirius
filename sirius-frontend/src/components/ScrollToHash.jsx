import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * After navigation (including cross-route jumps), scroll to `location.hash` if present.
 * Retries briefly so async page content can mount before the target `#id` exists.
 */
export default function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    const raw = location.hash.replace(/^#/, "").trim();
    if (!raw) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduced ? "auto" : "smooth";

    let cancelled = false;

    const tryScroll = () => {
      if (cancelled) return false;
      const el = document.getElementById(raw);
      if (!el) return false;
      el.scrollIntoView({ behavior, block: "start" });
      return true;
    };

    tryScroll();
    const t1 = window.setTimeout(tryScroll, 0);
    const t2 = window.setTimeout(tryScroll, 80);
    const t3 = window.setTimeout(tryScroll, 280);
    const t4 = window.setTimeout(tryScroll, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [location.pathname, location.hash]);

  return null;
}
