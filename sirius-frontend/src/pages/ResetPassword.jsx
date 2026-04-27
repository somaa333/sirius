import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";

export default function ResetPassword() {
  const { session, loading: authLoading } = useAuth();
  const { pushToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.DEV && !authLoading) {
      console.info("[auth] ResetPassword: auth ready, hasSession=", !!session);
    }
  }, [authLoading, session]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!newPassword || !confirmPassword) {
      pushToast("Please fill out both password fields.", "info");
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast("Passwords do not match.", "error");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      pushToast(`Error updating password: ${error.message}`, "error");
      return;
    }

    pushToast("Password updated successfully. Redirecting to login...", "success");
    setNewPassword("");
    setConfirmPassword("");

    setTimeout(() => {
      navigate("/");
    }, 1500);
  };

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    backgroundColor: "#050013",
    color: "#f9fafb",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  const cardStyle = {
    maxWidth: "420px",
    width: "100%",
    backgroundColor: "#020617",
    borderRadius: "16px",
    padding: "28px 24px 24px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "0.9rem",
    color: "#e5e7eb",
  };

  const inputStyle = {
    width: "100%",
    padding: "0.7rem 0.85rem",
    borderRadius: "8px",
    border: "1px solid #4b5563",
    backgroundColor: "#020617",
    color: "#f9fafb",
    outline: "none",
    fontSize: "0.95rem",
    marginBottom: "12px",
  };

  const buttonStyle = {
    marginTop: "8px",
    width: "100%",
    padding: "0.8rem 1rem",
    borderRadius: "999px",
    border: "none",
    background:
      "linear-gradient(90deg, #2563eb 0%, #4f46e5 50%, #8b5cf6 100%)",
    color: "#f9fafb",
    fontWeight: 600,
    cursor: "pointer",
  };

  if (authLoading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Resetting password</h2>
          <p>Checking your reset link...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>
            Reset link invalid or expired
          </h2>
          <p>
            This password reset link is not valid anymore. Please return to the
            login page and request a new password reset email.
          </p>
          <p style={{ marginTop: 16 }}>
            <a href="/login" style={{ color: "#60a5fa" }}>
              Back to login
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Choose a new password</h2>
        <p style={{ marginTop: 0, marginBottom: 18, fontSize: "0.9rem" }}>
          Enter and confirm a new password for your SIRIUS account.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="new-password" style={labelStyle}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />

          <label htmlFor="confirm-password" style={labelStyle}>
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />

          <button type="submit" style={buttonStyle}>
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
