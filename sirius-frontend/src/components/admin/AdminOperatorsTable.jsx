import { useEffect, useRef, useState } from "react";

/**
 * @param {object} props
 * @param {Array<Record<string, unknown>>} props.operators
 * @param {boolean} props.loading
 * @param {() => void} props.onAddOperator
 * @param {(op: Record<string, unknown>) => void} props.onView
 * @param {(op: Record<string, unknown>) => void} props.onEdit
 * @param {(op: Record<string, unknown>) => void} props.onDelete
 */
export default function AdminOperatorsTable({
  operators,
  loading,
  onAddOperator,
  onView,
  onEdit,
  onDelete,
}) {
  const [openMenuOperatorId, setOpenMenuOperatorId] = useState(
    /** @type {string | null} */ (null),
  );
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!openMenuOperatorId) return;
    const onDocMouseDown = (e) => {
      const root = menuRef.current;
      if (root && !root.contains(/** @type {Node} */ (e.target))) {
        setOpenMenuOperatorId(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenuOperatorId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuOperatorId]);

  return (
    <section
      className="dash-table-section dash-table-section--admin-operators"
      aria-labelledby="admin-operators-heading"
    >
      <div className="dash-table-head">
        <div>
          <h2 id="admin-operators-heading" className="dash-table-title">
            Operators
            <span className="dash-table-count"> ({operators.length})</span>
          </h2>
        </div>
        <div className="dash-table-controls">
          <button type="button" className="dash-btn dash-btn--primary" onClick={onAddOperator}>
            Add Operator
          </button>
        </div>
      </div>

      {loading ? (
        <p className="dash-empty">Loading operators…</p>
      ) : (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th scope="col" className="dash-table-cell--center">
                  Full name
                </th>
                <th scope="col" className="dash-table-cell--center">
                  Email
                </th>
                <th scope="col" className="dash-table-cell--center">
                  Organization
                </th>
                <th scope="col" className="dash-table-cell--center">
                  Public ID
                </th>
                <th scope="col" className="dash-table-cell--center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {operators.length === 0 ? (
                <tr>
                  <td colSpan={5} className="dash-table-empty">
                    No operators yet.
                  </td>
                </tr>
              ) : (
                operators.map((op) => {
                  const rowId = String(op.id);
                  return (
                    <tr key={rowId} className="dash-table-row">
                      <td className="dash-table-cell--center">{op.full_name ?? "—"}</td>
                      <td className="dash-table-cell--center">{op.email ?? "—"}</td>
                      <td className="dash-table-cell--center">{op.organization ?? "—"}</td>
                      <td className="dash-mono dash-table-cell--center">{op.public_id ?? "—"}</td>
                      <td className="dash-table-td--actions dash-table-cell--center">
                        <div
                          className="dash-row-menu-wrap"
                          ref={openMenuOperatorId === rowId ? menuRef : null}
                        >
                          <button
                            type="button"
                            className="dash-row-menu-trigger"
                            aria-haspopup="menu"
                            aria-expanded={openMenuOperatorId === rowId}
                            aria-label={`Actions for ${op.full_name ?? op.email ?? "operator"}`}
                            onClick={() =>
                              setOpenMenuOperatorId((cur) => (cur === rowId ? null : rowId))
                            }
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                          {openMenuOperatorId === rowId ? (
                            <ul
                              className="dash-row-menu"
                              role="menu"
                              aria-label={`Actions for ${op.full_name ?? op.email ?? "operator"}`}
                            >
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuOperatorId(null);
                                    onView(op);
                                  }}
                                >
                                  View profile
                                </button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuOperatorId(null);
                                    onEdit(op);
                                  }}
                                >
                                  Edit
                                </button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuOperatorId(null);
                                    onDelete(op);
                                  }}
                                >
                                  Delete
                                </button>
                              </li>
                            </ul>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
