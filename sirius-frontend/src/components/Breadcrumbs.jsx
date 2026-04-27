import { Link, useLocation } from "react-router-dom";
import "./Breadcrumbs.css";

function buildCrumbs(pathname) {
  if (pathname === "/") {
    return [{ label: "Home" }];
  }

  if (pathname.startsWith("/login")) {
    return [
      { label: "Home", to: "/" },
      { label: "Login" },
    ];
  }

  if (
    pathname.startsWith("/dashboard/events/") ||
    pathname.startsWith("/dashboard/cdm-events/")
  ) {
    const raw = pathname.startsWith("/dashboard/cdm-events/")
      ? pathname.replace("/dashboard/cdm-events/", "")
      : pathname.replace("/dashboard/events/", "");
    const id = decodeURIComponent(raw || "");
    return [
      { label: "Home", to: "/" },
      { label: "Dashboard", to: "/dashboard" },
      { label: id ? `Event ${id}` : "Event" },
    ];
  }

  if (pathname.startsWith("/dashboard")) {
    return [
      { label: "Home", to: "/" },
      { label: "Dashboard" },
    ];
  }

  if (pathname.startsWith("/cdm-upload")) {
    return [
      { label: "Home", to: "/" },
      { label: "Upload CDM" },
    ];
  }

  if (pathname.startsWith("/analysis/") && pathname !== "/analysis/") {
    const raw = pathname.replace("/analysis/", "");
    const id = decodeURIComponent(raw || "");
    return [
      { label: "Home", to: "/" },
      { label: "Analysis", to: "/analysis" },
      { label: id ? `Assessment ${id}` : "Details" },
    ];
  }

  if (pathname.startsWith("/analysis")) {
    return [
      { label: "Home", to: "/" },
      { label: "Analysis" },
    ];
  }

  if (pathname.startsWith("/reports")) {
    return [
      { label: "Home", to: "/" },
      { label: "Reports" },
    ];
  }

  if (pathname.startsWith("/admin")) {
    return [
      { label: "Home", to: "/" },
      { label: "Admin Panel" },
    ];
  }

  if (pathname.startsWith("/profile")) {
    return [
      { label: "Home", to: "/" },
      { label: "Profile" },
    ];
  }

  return [];
}

/**
 * @param {{ items?: Array<{ label: string, to?: string }>, variant?: 'default' | 'dashboard' }} [props]
 */
export default function Breadcrumbs({ items, variant = "default" }) {
  const location = useLocation();
  const crumbs = items ?? buildCrumbs(location.pathname);

  if (!crumbs.length) {
    return null;
  }

  const lastIndex = crumbs.length - 1;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol
        className={
          variant === "dashboard"
            ? "breadcrumbs-list breadcrumbs-list--dashboard"
            : "breadcrumbs-list"
        }
      >
        {crumbs.map((crumb, index) => {
          const isLast = index === lastIndex;

          return (
            <li key={`${crumb.label}-${index}`} className="breadcrumbs-item">
              {index > 0 && <span className="breadcrumbs-separator">{">"}</span>}
              {isLast || !crumb.to ? (
                <span className="breadcrumbs-current">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="breadcrumbs-link">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

