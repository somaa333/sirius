import { useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { Link } from "react-router-dom";
import Breadcrumbs from "../components/Breadcrumbs";
import APODCard from "../components/space/APODCard";
import HeroOrbitVisual from "../components/home/HeroOrbitVisual.jsx";
import { useAuth } from "../AuthContext.jsx";
import { initHomeGsap } from "./homeGsapInit";
import "./Home.css";

export default function Home() {
  const rootRef = useRef(null);
  const { user } = useAuth();

  const authCta = useMemo(
    () =>
      user
        ? { to: "/dashboard", label: "Go to Dashboard" }
        : { to: "/login", label: "Login" },
    [user],
  );

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    return initHomeGsap(root);
  }, []);

  const onContactClick = (e) => {
    const btn = e.currentTarget;
    const ink = btn.querySelector(".home-btn-ripple");
    if (!ink) return;
    gsap.killTweensOf(ink);
    gsap.fromTo(
      ink,
      { scale: 0, opacity: 0.45 },
      { scale: 2.2, opacity: 0, duration: 0.55, ease: "power2.out" }
    );
  };

  return (
    <div className="home-page" ref={rootRef}>
      <div className="home-scroll-progress" aria-hidden />
      <div className="home-cursor-glow" aria-hidden />
      <div className="home-page-bg" aria-hidden />
      <div className="home-grain" aria-hidden />
      <main className="home-main">
        <Breadcrumbs />

        {/* Hero */}
        <section className="home-section home-hero home-animate-section" id="hero">
          <div className="home-hero-mesh" aria-hidden />
          <div className="home-shell home-hero-shell">
            <div className="home-hero-text">
              <p className="home-hero-eyebrow home-animate-item">Collision avoidance</p>
              <h1 className="home-hero-title home-animate-item home-animate-delay-1" aria-label="SIRIUS">
                {"SIRIUS".split("").map((ch, i) => (
                  <span className="home-hero-char" key={i}>
                    {ch}
                  </span>
                ))}
              </h1>
              <p className="home-hero-acronym home-animate-item home-animate-delay-2">
                Space Intelligence for Risk Identification &amp; Uncertainty Scenarios
              </p>
              <h2 className="home-hero-subtitle home-animate-item home-animate-delay-3">
                Smarter decisions for a crowded orbit
              </h2>
              <p className="home-hero-body home-animate-item home-animate-delay-4">
                AI-assisted risk assessment from CDMs—so operators can prioritize conjunctions and
                act with confidence.
              </p>
              <div className="home-hero-actions home-animate-item home-animate-delay-5">
                <button
                  type="button"
                  className="home-btn home-btn-primary"
                  onClick={() => scrollToSection("about")}
                >
                  Explore the platform
                </button>
                <Link to={authCta.to} className="home-btn home-btn-secondary">
                  {authCta.label}
                </Link>
              </div>
            </div>

            <HeroOrbitVisual />
          </div>
        </section>

        {/* About */}
        <section className="home-section home-band home-about home-animate-section" id="about">
          <div className="home-shell home-about-shell">
            <div className="home-about-text">
              <p className="home-section-eyebrow home-animate-item">Why it matters</p>
              <h2 className="home-section-title home-animate-item home-animate-delay-1">
                Built for LEO traffic reality
              </h2>
              <p className="home-body home-animate-item home-animate-delay-2">
                More objects in orbit means more close approaches. SIRIUS helps teams monitor
                conjunctions and quantify risk with models tuned to CDM data—not spreadsheets.
              </p>
              <p className="home-body home-animate-item home-animate-delay-3">
                You get <span className="home-highlight">clear risk classes</span> and{" "}
                <span className="home-highlight">confidence signals</span> to support defensible
                maneuver calls.
              </p>
            </div>

            <div className="home-about-side">
              <div className="home-about-stat home-animate-item home-animate-delay-2">
                <span className="home-about-stat-label">Scope</span>
                <span className="home-about-stat-value">LEO operations</span>
              </div>
              <div className="home-about-stat home-animate-item home-animate-delay-3">
                <span className="home-about-stat-label">Engine</span>
                <span className="home-about-stat-value">CDMs + AI analytics</span>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section
          className="home-section home-capabilities home-animate-section"
          id="capabilities"
        >
          <div className="home-shell">
            <p className="home-section-eyebrow home-animate-item">Capabilities</p>
            <h2 className="home-section-title home-animate-item home-animate-delay-1">
              Everything in one workflow
            </h2>
            <p className="home-section-intro home-animate-item home-animate-delay-2">
              From ingestion to prediction—aligned with how operators actually work.
            </p>
            <div className="home-grid home-grid-4">
              <article className="home-card home-animate-item home-animate-delay-1">
                <span className="home-card-index" aria-hidden>
                  01
                </span>
                <h3 className="home-card-title">CDM monitoring</h3>
                <p className="home-card-body">
                  Surface high-risk events from incoming conjunction messages—focus where it
                  counts.
                </p>
              </article>
              <article className="home-card home-animate-item home-animate-delay-2">
                <span className="home-card-index" aria-hidden>
                  02
                </span>
                <h3 className="home-card-title">AI risk scoring</h3>
                <p className="home-card-body">
                  ML models use CDM parameters and history to rank probability and urgency.
                </p>
              </article>
              <article className="home-card home-animate-item home-animate-delay-3">
                <span className="home-card-index" aria-hidden>
                  03
                </span>
                <h3 className="home-card-title">Predictive outlook</h3>
                <p className="home-card-body">
                  Anticipate upcoming conjunctions and watch risk evolve across planning windows.
                </p>
              </article>
              <article className="home-card home-animate-item home-animate-delay-4">
                <span className="home-card-index" aria-hidden>
                  04
                </span>
                <h3 className="home-card-title">Trajectory insight</h3>
                <p className="home-card-body">
                  Visualize orbits and scenarios to support maneuvers and what-if review.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Environment — NASA APOD */}
        <section className="home-section home-band home-environment home-animate-section" id="environment">
          <div className="home-shell">
            <p className="home-section-eyebrow home-animate-item">Space context</p>
            <h2 className="home-section-title home-animate-item home-animate-delay-1">
              Astronomy picture of the day
            </h2>
            <APODCard className="home-animate-item home-animate-delay-2" />
          </div>
        </section>

        {/* Flow */}
        <section className="home-section home-flow-section home-animate-section" id="flow">
          <div className="home-shell home-flow-shell">
            <div className="home-flow-header">
              <p className="home-section-eyebrow home-animate-item">Pipeline</p>
              <h2 className="home-section-title home-animate-item home-animate-delay-1">
                From CDM to decision
              </h2>
              <p className="home-section-intro home-animate-item home-animate-delay-2">
                A straight path from raw messages to risk-ranked output.
              </p>
            </div>
            <ol className="home-flow">
              <li className="home-flow-step home-flow-step--odd home-animate-item home-animate-delay-1">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">1</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Upload CDMs</h3>
                    <p className="home-flow-step-body">
                      Upload Conjunction Data Messages from trusted sources or mission datasets.
                    </p>
                  </div>
                </div>
              </li>
              <li className="home-flow-step home-flow-step--even home-animate-item home-animate-delay-2">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">2</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Parse &amp; validate</h3>
                    <p className="home-flow-step-body">
                      Extract orbital parameters and verify data accuracy across events.
                    </p>
                  </div>
                </div>
              </li>
              <li className="home-flow-step home-flow-step--odd home-animate-item home-animate-delay-3">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">3</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Predict conjunctions</h3>
                    <p className="home-flow-step-body">
                      Estimate upcoming CDM parameters and potential close approaches.
                    </p>
                  </div>
                </div>
              </li>
              <li className="home-flow-step home-flow-step--even home-animate-item home-animate-delay-4">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">4</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Classify risk</h3>
                    <p className="home-flow-step-body">
                      Determine collision risk levels with confidence-based assessment.
                    </p>
                  </div>
                </div>
              </li>
              <li className="home-flow-step home-flow-step--odd home-animate-item home-animate-delay-5">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">5</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Recommend maneuvers</h3>
                    <p className="home-flow-step-body">
                      Support decision-making with maneuver or wait recommendations.
                    </p>
                  </div>
                </div>
              </li>
              <li className="home-flow-step home-flow-step--even home-animate-item home-animate-delay-6">
                <div className="home-flow-step-inner">
                  <span className="home-flow-step-index">6</span>
                  <div className="home-flow-step-text">
                    <h3 className="home-flow-step-title">Simulate trajectories</h3>
                    <p className="home-flow-step-body">
                      Visualize satellite motion and compare predicted vs actual scenarios.
                    </p>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Contact */}
        <section className="home-section home-contact home-animate-section" id="contact">
          <div className="home-shell home-contact-inner">
            <div className="home-contact-panel">
              <p className="home-section-eyebrow home-animate-item">Collaborate</p>
              <h2 className="home-section-title home-animate-item home-animate-delay-1">
                Get in touch
              </h2>
              <p className="home-body home-muted home-animate-item home-animate-delay-2">
                For access, collaboration, or technical questions, contact the administrators.
              </p>
              <div className="home-contact-actions home-animate-item home-animate-delay-3">
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=siriussolution.ai@gmail.com&su=SIRIUS%20Inquiry&body=Hello%2C%0A%0AI%20would%20like%20to%20ask%20about%20SIRIUS.%0A%0AName%3A%0AOrganization%3A%0AUse%20case%3A%0A%0AThank%20you."
                  className="home-btn home-btn-primary home-btn-contact"
                  onClick={onContactClick}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Opens in Gmail"
                >
                  <span className="home-btn-ripple" aria-hidden />
                  Contact us
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="home-footer">
          <div className="home-shell home-footer-shell">
            <p className="home-footer-brand home-animate-item">SIRIUS</p>
            <p className="home-footer-acronym home-animate-item">
              Space Intelligence for Risk Identification &amp; Uncertainty Scenarios
            </p>
            <p className="home-footer-main home-animate-item">
              AI-assisted collision avoidance for satellite operations
            </p>
            <p className="home-footer-meta home-animate-item">
              Department of Computer Science · King Abdulaziz University
            </p>
            <p className="home-footer-meta home-animate-item">© 2026 SIRIUS</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
