import InfoTooltip from "./InfoTooltip.jsx";
import "./DashboardComponents.css";

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.value Main display (formatted string)
 * @param {string} [props.infoText] Shown in tooltip next to title info icon
 * @param {{ line: string, tone: 'positive' | 'negative' | 'muted', arrow: 'up' | 'down' | null } | null | undefined} [props.trend]
 * @param {boolean} [props.trendLoading]
 */
export default function KpiCard({ title, value, infoText, trend, trendLoading = false }) {
  return (
    <article className="dash-kpi-card">
      <div className="dash-kpi-title-row">
        <h3 className="dash-kpi-title">{title}</h3>
        {infoText ? <InfoTooltip text={infoText} label={title} /> : null}
      </div>
      <p className="dash-kpi-value">{value}</p>
      {trendLoading ? (
        <p className="dash-kpi-trend dash-kpi-trend--muted dash-kpi-trend--pending" aria-busy="true">
          …
        </p>
      ) : trend ? (
        <p className={`dash-kpi-trend dash-kpi-trend--${trend.tone}`}>
          {trend.arrow === "up" ? (
            <span className="dash-kpi-trend-arrow" aria-hidden="true">
              ↑{" "}
            </span>
          ) : null}
          {trend.arrow === "down" ? (
            <span className="dash-kpi-trend-arrow" aria-hidden="true">
              ↓{" "}
            </span>
          ) : null}
          {trend.line}
        </p>
      ) : (
        <p className="dash-kpi-trend dash-kpi-trend--muted" aria-hidden="true">
          —
        </p>
      )}
    </article>
  );
}
