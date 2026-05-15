import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import {
  PersonIcon,
  EnvelopeIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  RoleIcon,
  CancelIcon,
  SaveIcon,
  AtSignIcon,
} from "../components/ProfileIcons";
import {
  getSignedAvatarUrl,
  uploadAvatarFile,
  validateAvatarFile,
} from "./profileAvatar";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import { countReportsForUser } from "../data/reportsData.js";
import { getPasswordUpdateErrorMessage } from "../utils/passwordErrors.js";
import "./Profile.css";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Profile() {
  const { session, user, role: globalRole, loading: authLoading } = useAuth();
  const { pushToast } = useToast();
  const userId = user?.id ?? null;
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [reportsGenerated, setReportsGenerated] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [avatarImageUrl, setAvatarImageUrl] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [viewedEmail, setViewedEmail] = useState("");
  const [viewedCreatedAt, setViewedCreatedAt] = useState(null);
  const [viewedLastLoginAt, setViewedLastLoginAt] = useState(null);
  const fileInputRef = useRef(null);

  const navigate = useNavigate();
  const requestedViewUserId = searchParams.get("viewUserId");
  const isAdminViewer = globalRole === "admin";
  const isViewingOtherProfile = Boolean(
    isAdminViewer &&
      requestedViewUserId &&
      userId &&
      requestedViewUserId !== userId,
  );
  const effectiveProfileUserId = isViewingOtherProfile ? requestedViewUserId : userId;
  const viewedOperatorFromState =
    location.state &&
    typeof location.state === "object" &&
    "viewedOperator" in location.state
      ? /** @type {{ viewedOperator?: { email?: string } }} */ (location.state).viewedOperator
      : null;
  const profileCrumbs = isViewingOtherProfile
    ? [
        { label: "Home", to: "/" },
        { label: "Admin Panel", to: "/admin" },
        { label: `${username || "User"} Profile` },
      ]
    : undefined;

  /** Load profile from DB when the signed-in user id changes (not on JWT refresh). */
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      navigate("/");
      return;
    }
    if (requestedViewUserId && !isAdminViewer) {
      navigate("/profile", { replace: true });
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", effectiveProfileUserId)
        .single();

      if (cancelled) return;

      if (error) {
        pushToast(`Error loading profile: ${error.message}`, "error");
        setLoading(false);
        return;
      }

      setFullName(data.full_name ?? "");
      setUsername(data.public_id ?? "");
      setOrganization(data.organization ?? "");
      setRole(data.role ?? "");
      let reportCount = 0;
      try {
        reportCount = await countReportsForUser(effectiveProfileUserId);
      } catch {
        reportCount = Number(data.reports_generated ?? data.reports ?? 0) || 0;
      }
      setReportsGenerated(reportCount);
      setViewedEmail(
        String(data.email ?? viewedOperatorFromState?.email ?? ""),
      );
      setViewedCreatedAt(
        data.created_at ? String(data.created_at) : null,
      );
      setViewedLastLoginAt(
        data.last_login_at ? String(data.last_login_at) : null,
      );

      if (data.avatar_url) {
        const url = await getSignedAvatarUrl(data.avatar_url);
        if (!cancelled) setAvatarImageUrl(url);
      } else {
        setAvatarImageUrl(null);
      }

      setLoading(false);
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    userId,
    requestedViewUserId,
    isAdminViewer,
    effectiveProfileUserId,
    viewedOperatorFromState?.email,
    navigate,
    pushToast,
  ]);

  /** Always derived from current Supabase session (updates on refresh without re-fetching profile). */
  const emailDisplay = isViewingOtherProfile
    ? viewedEmail || "—"
    : session?.user?.email ?? "";
  const memberSinceDisplay = useMemo(() => {
    if (isViewingOtherProfile) {
      return viewedCreatedAt ? formatDate(viewedCreatedAt) : "—";
    }
    const u = session?.user;
    if (!u) return "—";
    const created = u.created_at ?? u.user_metadata?.created_at;
    return created ? formatDate(created) : "—";
  }, [isViewingOtherProfile, viewedCreatedAt, session?.user]);
  const lastLoginDisplay = isViewingOtherProfile
    ? viewedLastLoginAt
      ? formatDateTime(viewedLastLoginAt)
      : "—"
    : session?.user?.last_sign_in_at
      ? formatDateTime(session.user.last_sign_in_at)
      : "—";

  const isAdmin = (globalRole ?? role) === "admin";

  const handleAvatarChange = async (event) => {
    if (isViewingOtherProfile) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      pushToast(validation.error, "error");
      return;
    }

    if (!user) return;

    setAvatarUploading(true);

    const result = await uploadAvatarFile(user.id, file);
    if (result.error) {
      pushToast(`Upload failed: ${result.error}`, "error");
      setAvatarUploading(false);
      event.target.value = "";
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: result.path })
      .eq("id", user.id);

    if (error) {
      pushToast(`Could not save avatar: ${error.message}`, "error");
      setAvatarUploading(false);
      event.target.value = "";
      return;
    }

    const url = await getSignedAvatarUrl(result.path);
    setAvatarImageUrl(url);
    setAvatarUploading(false);
    pushToast("Profile picture updated.", "success");
    event.target.value = "";
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (isViewingOtherProfile) {
      pushToast("This profile is read-only in view mode.", "info");
      return;
    }
    setSaving(true);

    if (!user) {
      pushToast("Your session has expired. Please log in again.", "error");
      setSaving(false);
      return;
    }

    const hasPasswordChange =
      currentPassword || newPassword || confirmPassword;

    if (hasPasswordChange) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        pushToast("Fill all password fields to change your password.", "info");
        setSaving(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        pushToast("New password and confirmation do not match.", "error");
        setSaving(false);
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signError) {
        pushToast("Current password is incorrect.", "error");
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        pushToast(getPasswordUpdateErrorMessage(updateError), "error");
        setSaving(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      pushToast("Username is required.", "info");
      setSaving(false);
      return;
    }

    const updates = {
      full_name: fullName,
      organization,
      public_id: trimmedUsername,
    };

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (error) {
      if (error.code === "23505") {
        pushToast("This username is already taken. Choose a different one.", "error");
      } else {
        pushToast(`Error saving profile: ${error.message}`, "error");
      }
      setSaving(false);
      return;
    }

    pushToast(
      hasPasswordChange ? "Profile and password updated." : "Profile updated successfully.",
      "success",
    );
    setSaving(false);
  };

  return (
    <div className="profile-page">
      <main className="profile-main">
        <Breadcrumbs items={profileCrumbs} />
        {isViewingOtherProfile ? (
          <div className="profile-back-wrap">
            <Link to="/admin" className="profile-back-link">
              ← Back to admin panel
            </Link>
          </div>
        ) : null}
        <h1 className="profile-page-title">
          {isViewingOtherProfile ? "Operator Profile" : "My Profile"}
        </h1>
        <div className="profile-layout">
          <section className="profile-card-left">
            <div className="profile-avatar-wrap">
              <label
                className="profile-avatar-label"
                htmlFor={isViewingOtherProfile ? undefined : "avatar-upload"}
              >
                <div className="profile-avatar-circle">
                  {avatarImageUrl ? (
                    <img
                      src={avatarImageUrl}
                      alt="Profile"
                      className="profile-avatar-img"
                    />
                  ) : (
                    <span className="profile-avatar-initial">
                      {fullName?.[0]?.toUpperCase() ?? "U"}
                    </span>
                  )}
                </div>
                {!isViewingOtherProfile ? (
                  <span className="profile-avatar-change">Change Photo</span>
                ) : null}
              </label>
              {!isViewingOtherProfile ? (
                <input
                  ref={fileInputRef}
                  id="avatar-upload"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="profile-avatar-input"
                  onChange={handleAvatarChange}
                  disabled={avatarUploading}
                  aria-label="Upload profile picture"
                />
              ) : null}
              {avatarUploading && !isViewingOtherProfile && (
                <div className="profile-avatar-loading" aria-hidden="true">
                  Uploading…
                </div>
              )}
            </div>

            <div className="profile-user-text">
              <h2 className="profile-name">{fullName || "—"}</h2>
              <p className="profile-email">{emailDisplay}</p>
              {username && (
                <p className="profile-username-display">@{username}</p>
              )}
              <span className="profile-role-pill">{role || "—"}</span>
            </div>

            <dl className="profile-account-details">
              <div className="profile-detail-row">
                <dt>Account Status</dt>
                <dd className="profile-detail-value profile-detail-active">Active</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Member Since</dt>
                <dd className="profile-detail-value">{memberSinceDisplay}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Last Login</dt>
                <dd className="profile-detail-value">{lastLoginDisplay}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Reports Generated</dt>
                <dd className="profile-detail-value profile-detail-purple">{reportsGenerated}</dd>
              </div>
            </dl>
          </section>

          <section className="profile-card-right">
            {loading ? (
              <p className="profile-status-text">Loading profile...</p>
            ) : (
              <form className="profile-form" onSubmit={handleSave}>
                <div className="profile-section">
                  <header className="profile-section-header">
                    <span className="profile-section-accent" />
                    <h2>Personal Information</h2>
                  </header>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="full-name">Full Name</label>
                    <div className="profile-input-wrap">
                      <span className="profile-input-icon" aria-hidden="true">
                        <PersonIcon />
                      </span>
                      <input
                        id="full-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                        readOnly={isViewingOtherProfile}
                        disabled={isViewingOtherProfile}
                      />
                    </div>
                  </div>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="username">Username</label>
                    <div className="profile-input-wrap">
                      <span className="profile-input-icon" aria-hidden="true">
                        <AtSignIcon />
                      </span>
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. jane.doe"
                        autoComplete="username"
                        readOnly={isViewingOtherProfile}
                        disabled={isViewingOtherProfile}
                      />
                    </div>
                  </div>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="email-display">Email Address</label>
                    <div className="profile-input-wrap">
                      <span className="profile-input-icon" aria-hidden="true">
                        <EnvelopeIcon />
                      </span>
                      <input
                        id="email-display"
                        type="text"
                        value={emailDisplay}
                        readOnly
                        disabled
                        aria-readonly="true"
                      />
                    </div>
                  </div>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="role">Role</label>
                    <div className="profile-input-wrap">
                      <span className="profile-input-icon" aria-hidden="true">
                        <RoleIcon />
                      </span>
                      <input
                        id="role"
                        type="text"
                        value={role}
                        readOnly
                        disabled
                      />
                    </div>
                    {!isAdmin ? (
                      <p className="profile-help-text">
                        Role is managed by administrators.
                      </p>
                    ) : null}
                  </div>

                  <div className="profile-field-group">
                    <label htmlFor="organization">Organization</label>
                    <div className="profile-input-wrap">
                      <input
                        id="organization"
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="Enter your organization"
                        readOnly={isViewingOtherProfile}
                        disabled={isViewingOtherProfile}
                      />
                    </div>
                  </div>
                </div>

                {!isViewingOtherProfile ? (
                  <div className="profile-section">
                  <header className="profile-section-header">
                    <span className="profile-section-accent" />
                    <h2>Change Password</h2>
                  </header>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="current-password">Current Password</label>
                    <div className="profile-input-wrap profile-input-password">
                      <span className="profile-input-icon" aria-hidden="true">
                        <LockIcon />
                      </span>
                      <input
                        id="current-password"
                        type={showCurrentPw ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="profile-password-toggle"
                        onClick={() => setShowCurrentPw((p) => !p)}
                        aria-label={showCurrentPw ? "Hide password" : "Show password"}
                      >
                        {showCurrentPw ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="new-password">New Password</label>
                    <div className="profile-input-wrap profile-input-password">
                      <span className="profile-input-icon" aria-hidden="true">
                        <LockIcon />
                      </span>
                      <input
                        id="new-password"
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="profile-password-toggle"
                        onClick={() => setShowNewPw((p) => !p)}
                        aria-label={showNewPw ? "Hide password" : "Show password"}
                      >
                        {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <div className="profile-field-group profile-field-with-icon">
                    <label htmlFor="confirm-password">Confirm New Password</label>
                    <div className="profile-input-wrap profile-input-password">
                      <span className="profile-input-icon" aria-hidden="true">
                        <LockIcon />
                      </span>
                      <input
                        id="confirm-password"
                        type={showConfirmPw ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="profile-password-toggle"
                        onClick={() => setShowConfirmPw((p) => !p)}
                        aria-label={showConfirmPw ? "Hide password" : "Show password"}
                      >
                        {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                </div>
                ) : null}

                {!isViewingOtherProfile ? (
                  <div className="profile-actions">
                    <button
                      type="button"
                      className="profile-button-secondary"
                      onClick={() => navigate(-1)}
                    >
                      <CancelIcon /> Cancel
                    </button>
                    <button
                      type="submit"
                      className="profile-button-primary"
                      disabled={saving}
                    >
                      <SaveIcon /> {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                ) : null}

              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

