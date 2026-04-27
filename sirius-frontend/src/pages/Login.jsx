import { useState } from "react";
import "./Login.css";

export default function Login({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onForgotPassword,
  forgotBusy = false,
}) {
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event) => {
    if (onSubmit) {
      onSubmit(event);
    }
  };

  const passwordType = showPassword ? "text" : "password";

  const handleForgotPassword = () => {
    if (onForgotPassword) {
      onForgotPassword();
    }
  };

  return (
    <div className="login-page">
      <div className="login-card-wrapper">
        <div className="login-card" role="main">
          <h1 className="login-title">SIRIUS</h1>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <div className="input-wrapper">
                <input
                  id="login-email"
                  type="email"
                  className="input-field"
                  placeholder="operator@sirius.space"
                  value={email}
                  onChange={onEmailChange}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <div className="input-wrapper">
                <input
                  id="login-password"
                  type={passwordType}
                  className="input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={onPasswordChange}
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="password-toggle-icon" aria-hidden="true" />
                </button>
              </div>
            </div>

            <button type="submit" className="primary-button">
              Login to SIRIUS
            </button>

            <div className="forgot-row">
              <button
                type="button"
                className="forgot-link"
                onClick={handleForgotPassword}
                disabled={forgotBusy}
              >
                {forgotBusy ? "Sending reset link..." : "Forgot Password?"}
              </button>
            </div>

          </form>
        </div>

        <p className="login-footer" role="note">
          © 2025 SIRIUS System - Secure Space Operations
        </p>
      </div>
    </div>
  );
}
