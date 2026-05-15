import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext.jsx";
import { NAV_SECTION_LINKS } from "../constants/navSectionConfig.js";
import HeaderNavBranch from "./HeaderNavBranch.jsx";
import { getSignedAvatarUrl } from "../pages/profileAvatar";
import "./Header.css";

export default function Header() {
  const [open, setOpen] = useState(false);
  const { session, role, authError, clearAuthError, logoutToHome } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarInitial, setAvatarInitial] = useState("U");
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const readInitialFromName = (name) => {
      const s = String(name ?? "").trim();
      return s ? s[0].toUpperCase() : "U";
    };

    const loadHeaderAvatar = async () => {
      if (!session?.user?.id) {
        setAvatarUrl(null);
        setAvatarInitial("U");
        return;
      }

      const userFallbackName =
        session.user.user_metadata?.full_name ?? session.user.email ?? "User";
      setAvatarInitial(readInitialFromName(userFallbackName));

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", session.user.id)
        .single();

      if (cancelled || error) return;

      setAvatarInitial(readInitialFromName(data?.full_name ?? userFallbackName));

      if (data?.avatar_url) {
        const url = await getSignedAvatarUrl(data.avatar_url);
        if (!cancelled) setAvatarUrl(url);
      } else {
        setAvatarUrl(null);
      }
    };

    void loadHeaderAvatar();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, session?.user?.email, session?.user?.user_metadata?.full_name]);

  const toggleMenu = () => {
    setOpen((prev) => !prev);
  };

  const goToProfile = () => {
    setOpen(false);
    navigate("/profile");
  };

  const handleLogout = async () => {
    setOpen(false);
    await logoutToHome();
    navigate("/");
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      const node = menuRef.current;
      if (!node) return;
      if (!node.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isActive = (path) => location.pathname === path;

  const sectionsByPath = useMemo(() => {
    const filtered = NAV_SECTION_LINKS.filter(
      (item) => item.path !== "/admin" || role === "admin",
    );
    return Object.fromEntries(filtered.map((item) => [item.path, item.sections]));
  }, [role]);

  useEffect(() => {
    const onDocKey = (event) => {
      if (event.key !== "Escape") return;
      const nav = document.querySelector(".header-nav");
      if (!nav?.contains(document.activeElement)) return;
      const ae = document.activeElement;
      if (ae instanceof HTMLElement) ae.blur();
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, []);

  return (
    <header className="header">
      {authError ? (
        <div
          className="header-auth-error"
          role="alert"
          style={{
            padding: "8px 16px",
            background: "rgba(220, 38, 38, 0.15)",
            borderBottom: "1px solid rgba(248, 113, 113, 0.35)",
            fontSize: "0.875rem",
            color: "#fecaca",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span>{authError}</span>
          <button
            type="button"
            onClick={() => {
              clearAuthError();
              navigate("/");
            }}
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(248, 113, 113, 0.5)",
              background: "transparent",
              color: "#fecaca",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Sign in
          </button>
        </div>
      ) : null}
      <div className="header-inner">
        <div className="header-left">
          <Link to="/" className="header-title">
            SIRIUS
          </Link>

          <nav className="header-nav">
            <HeaderNavBranch
              to="/"
              label="Home"
              active={isActive("/")}
              sections={sectionsByPath["/"] ?? []}
            />
            {session && (
              <>
                {role === "admin" || role === "operator" ? (
                  <HeaderNavBranch
                    to="/cdm-upload"
                    label="Upload CDM"
                    active={isActive("/cdm-upload")}
                    sections={sectionsByPath["/cdm-upload"] ?? []}
                  />
                ) : null}
                <HeaderNavBranch
                  to="/dashboard"
                  label="Dashboard"
                  active={location.pathname.startsWith("/dashboard")}
                  sections={sectionsByPath["/dashboard"] ?? []}
                />
                <HeaderNavBranch
                  to="/analysis"
                  label="Analysis"
                  active={location.pathname.startsWith("/analysis")}
                  sections={sectionsByPath["/analysis"] ?? []}
                />
                <HeaderNavBranch
                  to="/reports"
                  label="Reports"
                  active={location.pathname.startsWith("/reports")}
                  sections={sectionsByPath["/reports"] ?? []}
                />
                {role === "admin" ? (
                  <HeaderNavBranch
                    to="/admin"
                    label="Admin Panel"
                    active={isActive("/admin")}
                    sections={sectionsByPath["/admin"] ?? []}
                  />
                ) : null}
              </>
            )}
          </nav>
        </div>

        <div className="header-right">
          {session ? (
            <div ref={menuRef}>
              <button
                type="button"
                className="header-avatar-button"
                onClick={toggleMenu}
                aria-haspopup="true"
                aria-expanded={open}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="User profile"
                    className="header-avatar-image"
                  />
                ) : (
                  <span className="header-avatar-fallback" aria-hidden="true">
                    {avatarInitial}
                  </span>
                )}
              </button>

              {open && (
                <div className="header-menu">
                  <button
                    type="button"
                    className="header-menu-item"
                    onClick={goToProfile}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className="header-menu-item header-menu-item-danger"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className={`header-nav-link ${isActive("/login") ? "header-nav-link-active" : ""}`}
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

