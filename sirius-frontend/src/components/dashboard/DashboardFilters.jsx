import "./DashboardComponents.css";

/**
 * @param {object} props
 * @param {string} props.dateStart
 * @param {string} props.dateEnd
 * @param {(v: string) => void} props.onDateStartChange
 * @param {(v: string) => void} props.onDateEndChange
 */
export default function DashboardFilters({
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
}) {
  return (
    <div className="dash-toolbar">
      <div className="dash-toolbar-row dash-toolbar-row--main">
        <div className="dash-toolbar-dates">
          <label className="dash-field">
            <span className="dash-field-label">Range start</span>
            <input
              type="date"
              className="dash-input"
              value={dateStart}
              onChange={(e) => onDateStartChange(e.target.value)}
            />
          </label>
          <label className="dash-field">
            <span className="dash-field-label">Range end</span>
            <input
              type="date"
              className="dash-input"
              value={dateEnd}
              onChange={(e) => onDateEndChange(e.target.value)}
            />
          </label>
        </div>

      </div>
    </div>
  );
}
