import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "./HeroOrbitVisual.css";

/**
 * Hero orbital simulation: layered depth, atmosphere, multi-tier rings, glow — space-dashboard style.
 */
export default function HeroOrbitVisual() {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const cardClass = [
    "home-orbit-card",
    hovered && !reduced ? "home-orbit-card--hover" : "",
    reduced ? "home-orbit-card--static" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="home-hero-visual">
      <motion.div
        className={cardClass}
        aria-hidden
        initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
        whileInView={reduced ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.35, margin: "0px 0px -8% 0px" }}
        transition={{
          duration: reduced ? 0 : 0.9,
          ease: [0.22, 1, 0.36, 1],
        }}
        whileHover={reduced ? undefined : { scale: 1.02 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
      >
        {/* Far field: volumetric-style glow blobs */}
        <div className="home-orbit-atmosphere" aria-hidden>
          <div className="home-orbit-atmosphere__blob home-orbit-atmosphere__blob--a" />
          <div className="home-orbit-atmosphere__blob home-orbit-atmosphere__blob--b" />
          <div className="home-orbit-atmosphere__blob home-orbit-atmosphere__blob--c" />
        </div>

        <div className="home-orbit-field" aria-hidden>
          <div className="home-orbit-scene">
            <div className="home-orbit-particles">
              {[...Array(8)].map((_, i) => (
                <span key={i} className="home-orbit-particle" />
              ))}
            </div>
            {/* Distant orbit plane — faint, slow */}
            <div className="home-orbit-ring home-orbit-ring--deep" />
            <div className="home-orbit-ring-echo home-orbit-ring-echo--outer" />
            <div className="home-orbit-ring home-orbit-ring--outer" />
            <div className="home-orbit-sweep" />
            <div className="home-orbit-ring home-orbit-ring--inner" />
            <div className="home-orbit-ring-echo home-orbit-ring-echo--inner" />
            <div className="home-orbit-ring home-orbit-ring--accent" />

            <div className="home-orbit-arm home-orbit-arm--a">
              <div className="home-orbit-satellite">
                <span className="home-orbit-satellite__corona" />
                <span className="home-orbit-satellite__halo" />
                <span className="home-orbit-satellite__body" />
              </div>
            </div>

            <div className="home-orbit-arm home-orbit-arm--b">
              <div className="home-orbit-satellite">
                <span className="home-orbit-satellite__corona" />
                <span className="home-orbit-satellite__halo" />
                <span className="home-orbit-satellite__body" />
              </div>
            </div>

            <div className="home-orbit-core-stack">
              <div className="home-orbit-core-corona" />
              <div className="home-orbit-core-rim" />
              <div className="home-orbit-core" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
