import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import InfoTooltip from "./InfoTooltip.jsx";
import "./DashboardComponents.css";

/**
 * @param {object} props
 * @param {{ date: string, label: string, events: number }[]} props.data
 * @param {string} [props.className]
 */
export default function EventsOverTimeChart({ data, className = "" }) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className={`dash-chart-card ${className}`.trim()}>
      <div className="dash-chart-header">
        <div className="dash-chart-title-row">
          <h2 className="dash-chart-title">Events Over Time</h2>
          <InfoTooltip
            label="Events Over Time"
            text="Shows how the number of CDM events changes over time based on their creation date."
          />
        </div>
      </div>
      <div className="dash-chart-body">
        {!hasData ? (
          <p className="dash-empty">No events in current range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value) => [`${value} events`, "Count"]}
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.date ?? ""}
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                }}
              />
              <Line
                type="monotone"
                dataKey="events"
                name="Events"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive
                animationDuration={600}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

