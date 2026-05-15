import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./components/toast/ToastProvider.jsx";
import { userHasAnyVisibleCdmRecords } from "./data/cdmEventData.js";
import Login from "./pages/Login";

export default function App() {
  const { user, loading } = useAuth();
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  /** Resolved destination after checking whether the user has any visible CDMs (null = still resolving). */
  const [postLoginPath, setPostLoginPath] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!user?.id) {
      setPostLoginPath(null);
      return;
    }

    let cancelled = false;
    setPostLoginPath(null);

    (async () => {
      try {
        const hasCdms = await userHasAnyVisibleCdmRecords(user.id);
        if (!cancelled) setPostLoginPath(hasCdms ? "/dashboard" : "/cdm-upload");
      } catch {
        if (!cancelled) setPostLoginPath("/dashboard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const login = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      pushToast(error.message, "error");
      return;
    }

    setEmail("");
    setPassword("");
  };

  const handleForgotPassword = async () => {
    if (!email) {
      pushToast("Please enter your email address first.", "info");
      return;
    }
    setForgotBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);

    if (error) {
      pushToast(`Reset error: ${error.message}`, "error");
      return;
    }

    pushToast("Password reset email sent. Check your inbox.", "success");
  };

  if (loading) {
    return null;
  }

  if (user) {
    if (postLoginPath == null) {
      return null;
    }
    return <Navigate to={postLoginPath} replace />;
  }

  // Logged-out view (login only)
  return (
    <Login
      email={email}
      password={password}
      onEmailChange={(e) => setEmail(e.target.value)}
      onPasswordChange={(e) => setPassword(e.target.value)}
      onSubmit={login}
      onForgotPassword={handleForgotPassword}
      forgotBusy={forgotBusy}
    />
  );
}