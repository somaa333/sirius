import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Reset window scroll when the route pathname changes (new “page”).
 * Hash-only updates on the same path are left to {@link ScrollToHash}.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
