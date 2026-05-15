import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

function authDevLog(...args) {
  if (import.meta.env.DEV) {
    console.info("[auth]", ...args);
  }
}

/**
 * Normalize role values from metadata / DB into expected app roles.
 * @param {unknown} raw
 * @returns {'admin' | 'operator' | null}
 */
function normalizeRole(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "admin" || v === "operator") return v;
  return null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  /** Shown when stored session fails server validation (e.g. revoked refresh token). */
  const [authError, setAuthError] = useState(/** @type {string | null} */ (null));

  const clearAuthError = useCallback(() => setAuthError(null), []);
  const logoutToHome = useCallback(async () => {
    setAuthError(null);
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRole = async (userId) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();
        if (!isMounted) return;
        if (error) {
          console.error("[auth] Role fetch error:", error.message);
          setRole(null);
          return;
        }
        setRole(data?.role ?? null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        console.error("[auth] Role fetch unexpected error:", msg);
        if (isMounted) setRole(null);
      }
    };

    /**
     * Keep the listener callback synchronous — Supabase warns that async work inside
     * onAuthStateChange can deadlock with the auth lock. Defer async work with queueMicrotask.
     */
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;

      authDevLog("onAuthStateChange:", event, {
        userId: newSession?.user?.id ?? null,
      });

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession?.user) {
        setRole(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      // Show role-gated navigation immediately after login/session restore.
      const hintedRole =
        normalizeRole(newSession.user.user_metadata?.role) ??
        normalizeRole(newSession.user.app_metadata?.role);
      if (hintedRole) setRole(hintedRole);

      if (event === "TOKEN_REFRESHED") {
        authDevLog("access token refreshed for user", newSession.user.id);
        setLoading(false);
        return;
      }

      queueMicrotask(async () => {
        if (!isMounted) return;
        try {
          if (event === "INITIAL_SESSION") {
            const {
              data: { user: verifiedUser },
              error: userError,
            } = await supabase.auth.getUser();
            if (!isMounted) return;

            if (userError || !verifiedUser) {
              authDevLog("getUser failed after INITIAL_SESSION — clearing session", userError?.message);
              setAuthError(
                userError?.message ??
                  "Your session is invalid or expired. Please sign in again.",
              );
              await supabase.auth.signOut();
              return;
            }

            setUser(verifiedUser);
            const verifiedHintedRole =
              normalizeRole(verifiedUser.user_metadata?.role) ??
              normalizeRole(verifiedUser.app_metadata?.role);
            if (verifiedHintedRole) setRole(verifiedHintedRole);
            await loadRole(verifiedUser.id);
          } else {
            await loadRole(newSession.user.id);
          }
        } catch (e) {
          authDevLog("post-auth handler error", e);
          if (isMounted) {
            setAuthError(
              e instanceof Error ? e.message : "Authentication error. Please sign in again.",
            );
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      });
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    role,
    loading,
    authError,
    clearAuthError,
    logoutToHome,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- companion hook for AuthProvider
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
