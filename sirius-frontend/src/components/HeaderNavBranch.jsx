import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

/** @typedef {{ label: string, hash: string }} NavSection */

/**
 * Main nav entry with optional section submenu (desktop hover/focus; mobile chevron).
 * @param {object} props
 * @param {string} props.to
 * @param {string} props.label
 * @param {boolean} props.active
 * @param {NavSection[]} [props.sections]
 */
export default function HeaderNavBranch({ to, label, active, sections = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuId = useId();
  const wrapRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasSections = sections.length > 0;

  const navigateToHash = (hash) => {
    const slug = hash.startsWith("#") ? hash.slice(1) : hash;
    navigate(`${to}#${slug}`);
    setMobileOpen(false);
  };

  const currentHash = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
  const onSectionBasePath = location.pathname === to;

  const isSectionActive = (hash) => {
    const slug = String(hash || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    return onSectionBasePath && slug !== "" && currentHash === slug;
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onDoc = (e) => {
      const root = wrapRef.current;
      if (root && !root.contains(/** @type {Node} */ (e.target))) {
        setMobileOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <div
      ref={wrapRef}
      className={`header-nav-item ${mobileOpen ? "header-nav-item--sections-open" : ""}`}
    >
      <div className="header-nav-item-inner">
        <Link
          to={to}
          className={`header-nav-link ${active ? "header-nav-link-active" : ""}`}
        >
          {label}
        </Link>
        {hasSections ? (
          <button
            type="button"
            className="header-nav-sections-trigger"
            aria-label={`${label} — page sections`}
            aria-expanded={mobileOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            onClick={(e) => {
              e.preventDefault();
              setMobileOpen((v) => !v);
            }}
          >
            <span className="header-nav-sections-trigger-icon" aria-hidden>
              ▾
            </span>
          </button>
        ) : null}
      </div>

      {hasSections ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`${label} sections`}
          className="header-nav-dropdown"
          onKeyDown={(e) => {
            if (e.key === "Escape") setMobileOpen(false);
          }}
        >
          {sections.map((s) => (
            <button
              key={s.hash}
              type="button"
              role="menuitem"
              aria-current={isSectionActive(s.hash) ? "location" : undefined}
              className={
                isSectionActive(s.hash)
                  ? "header-nav-dropdown-item header-nav-dropdown-item--active"
                  : "header-nav-dropdown-item"
              }
              onClick={() => navigateToHash(s.hash)}
            >
              <span className="header-nav-dropdown-label">{s.label}</span>
              <span className="header-nav-dropdown-arrow" aria-hidden>
                →
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
