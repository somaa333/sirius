import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import AdminOperatorsTable from "../components/admin/AdminOperatorsTable.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import {
  ensureSessionForEdgeFunctionInvoke,
  edgeFunctionInvokeErrorMessage,
  SESSION_INVALID_MSG,
} from "../services/supabaseEdgeSession.js";
import "./AdminPanel.css";

const EDGE_FN = "admin-operators";

async function invokeAdminFunction(body) {
  let session;
  try {
    session = await ensureSessionForEdgeFunctionInvoke();
  } catch (e) {
    const msg = e instanceof Error ? e.message : SESSION_INVALID_MSG;
    return { data: null, error: { message: msg } };
  }

  const { data, error: fnError } = await supabase.functions.invoke(EDGE_FN, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (fnError) {
    const message = edgeFunctionInvokeErrorMessage(
      fnError,
      data,
      "Failed to reach admin service.",
    );
    console.error("[AdminPanel] admin-operators invoke failed:", message);
    return { data, error: { message } };
  }

  return { data, error: null };
}

export default function AdminPanel() {
  const { user, role, loading: authLoading } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selectedOperator, setSelectedOperator] = useState(null);

  const [addForm, setAddForm] = useState({ full_name: "", email: "", organization: "" });
  const [editForm, setEditForm] = useState({ full_name: "", organization: "", role: "" });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    const { data, error: fnError } = await invokeAdminFunction({ action: "list" });
    setLoading(false);

    if (fnError) {
      pushToast(fnError.message || "Failed to load operators.", "error");
      return;
    }
    if (data?.error) {
      pushToast(data.error, "error");
      return;
    }
    const list = Array.isArray(data?.operators) ? data.operators : [];
    setOperators(list);
  }, [pushToast]);

  useEffect(() => {
    if (role !== "admin") return;
    queueMicrotask(() => {
      void fetchOperators();
    });
  }, [role, fetchOperators]);

  const openAddModal = () => {
    setAddForm({ full_name: "", email: "", organization: "" });
    setModal("add");
  };

  const handleCreateOperator = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    const { data, error: fnError } = await invokeAdminFunction({
      action: "create",
      full_name: addForm.full_name,
      email: addForm.email,
      organization: addForm.organization,
    });
    setSubmitLoading(false);
    if (fnError) {
      pushToast(fnError.message || "Failed to create operator.", "error");
      return;
    }
    if (data?.error) {
      pushToast(data.error, "error");
      return;
    }
    setModal(null);
    void fetchOperators();
    pushToast("Invitation email sent successfully.", "success");
  };

  const openViewOperatorProfile = (op) => {
    navigate(`/profile?viewUserId=${encodeURIComponent(String(op.id))}`, {
      state: { viewedOperator: op },
    });
  };

  const openEditModal = (op) => {
    setSelectedOperator(op);
    setEditForm({
      full_name: op.full_name ?? "",
      organization: op.organization ?? "",
      role: op.role ?? "",
    });
    setModal("edit");
  };

  const handleUpdateOperator = async (e) => {
    e.preventDefault();
    if (!selectedOperator?.id) return;
    setSubmitLoading(true);
    const { data, error: fnError } = await invokeAdminFunction({
      action: "update_profile",
      targetUserId: selectedOperator.id,
      full_name: editForm.full_name,
      organization: editForm.organization,
      role: editForm.role,
    });
    setSubmitLoading(false);
    if (fnError) {
      pushToast(fnError.message || "Failed to update operator.", "error");
      return;
    }
    if (data?.error) {
      pushToast(data.error, "error");
      return;
    }
    setModal(null);
    setSelectedOperator(null);
    void fetchOperators();
    pushToast("Operator updated successfully.", "success");
  };

  const openDeleteConfirm = (op) => {
    setDeleteTarget(op);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setSubmitLoading(true);
    const { data, error: fnError } = await invokeAdminFunction({
      action: "delete_operator",
      targetUserId: deleteTarget.id,
    });
    setSubmitLoading(false);
    setDeleteTarget(null);
    if (fnError) {
      pushToast(fnError.message || "Failed to delete operator.", "error");
      return;
    }
    if (data?.error) {
      pushToast(data.error, "error");
      return;
    }
    void fetchOperators();
    pushToast("Operator deleted successfully.", "success");
  };

  if (authLoading) {
    return (
      <DashboardPageLayout title="Admin Panel">
        <p className="dash-empty">Checking access…</p>
      </DashboardPageLayout>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <DashboardPageLayout title="Admin Panel">
        <section className="admin-panel-content" id="operators-management">
          <AdminOperatorsTable
            operators={operators}
            loading={loading}
            onAddOperator={openAddModal}
            onView={openViewOperatorProfile}
            onEdit={openEditModal}
            onDelete={openDeleteConfirm}
          />
        </section>
      </DashboardPageLayout>

      {modal === "add" && (
        <div className="dash-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="dash-modal dash-modal--form" onClick={(e) => e.stopPropagation()}>
            <h3 className="dash-modal-title">Add Operator</h3>
            <form onSubmit={handleCreateOperator}>
              <div className="dash-field">
                <label htmlFor="add-full_name" className="dash-field-label">
                  Full Name
                </label>
                <input
                  id="add-full_name"
                  className="dash-input"
                  type="text"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm((p) => ({ ...p, full_name: e.target.value }))}
                  required
                />
              </div>
              <div className="dash-field">
                <label htmlFor="add-email" className="dash-field-label">
                  Email
                </label>
                <input
                  id="add-email"
                  className="dash-input"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="dash-field">
                <label htmlFor="add-organization" className="dash-field-label">
                  Organization
                </label>
                <input
                  id="add-organization"
                  className="dash-input"
                  type="text"
                  value={addForm.organization}
                  onChange={(e) => setAddForm((p) => ({ ...p, organization: e.target.value }))}
                />
              </div>
              <div className="dash-modal-footer">
                <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="dash-btn dash-btn--primary" disabled={submitLoading}>
                  {submitLoading ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "edit" && selectedOperator && (
        <div className="dash-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="dash-modal dash-modal--form" onClick={(e) => e.stopPropagation()}>
            <h3 className="dash-modal-title">Edit Operator</h3>
            <form onSubmit={handleUpdateOperator}>
              <div className="dash-field">
                <label htmlFor="edit-email" className="dash-field-label">
                  Email
                </label>
                <input
                  id="edit-email"
                  className="dash-input"
                  type="text"
                  value={selectedOperator.email ?? ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="dash-field">
                <label htmlFor="edit-full_name" className="dash-field-label">
                  Full Name
                </label>
                <input
                  id="edit-full_name"
                  className="dash-input"
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="dash-field">
                <label htmlFor="edit-organization" className="dash-field-label">
                  Organization
                </label>
                <input
                  id="edit-organization"
                  className="dash-input"
                  type="text"
                  value={editForm.organization}
                  onChange={(e) => setEditForm((p) => ({ ...p, organization: e.target.value }))}
                />
              </div>
              <div className="dash-field">
                <label htmlFor="edit-role" className="dash-field-label">
                  Role
                </label>
                <select
                  id="edit-role"
                  className="dash-select"
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                >
                  <option value="operator">operator</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="dash-modal-footer">
                <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="dash-btn dash-btn--primary" disabled={submitLoading}>
                  {submitLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="dash-modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div className="dash-modal dash-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <h3 className="dash-modal-title">Delete Operator</h3>
            <p className="dash-modal-body">
              Are you sure you want to delete this operator account?
            </p>
            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--danger"
                onClick={handleConfirmDelete}
                disabled={submitLoading}
              >
                {submitLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
