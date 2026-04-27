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
  return (
    <section className="dash-table-section" aria-labelledby="admin-operators-heading">
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
                <th scope="col">Full name</th>
                <th scope="col">Email</th>
                <th scope="col">Organization</th>
                <th scope="col">Public ID</th>
                <th scope="col">Actions</th>
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
                operators.map((op) => (
                  <tr key={String(op.id)} className="dash-table-row">
                    <td>{op.full_name ?? "—"}</td>
                    <td>{op.email ?? "—"}</td>
                    <td>{op.organization ?? "—"}</td>
                    <td className="dash-mono">{op.public_id ?? "—"}</td>
                    <td>
                      <div className="admin-operator-actions">
                        <button
                          type="button"
                          className="dash-link"
                          onClick={() => onView(op)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="dash-btn dash-btn--ghost dash-btn--sm"
                          onClick={() => onEdit(op)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="dash-btn dash-btn--ghost dash-btn--sm dash-btn--danger-ghost"
                          onClick={() => onDelete(op)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
