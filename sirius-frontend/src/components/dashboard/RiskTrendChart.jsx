import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./DashboardComponents.css";

const CHART_COLORS = {
  high: "#f87171",
  low: "#4ade80",
};

/**
 * @param {object} props
 * @param {{ date: string, highRisk: number, lowRisk: number }[]} props.data
 * @param {string} [props.title]
 * @param {string} [props.className]
 */
export default function RiskTrendChart({
  data,
  title = "Risk trend — collision event counts",
  className = "",
}) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className={`dash-chart-card ${className}`.trim()}>
      <div className="dash-chart-header">
        <h2 className="dash-chart-title">{title}</h2>
      </div>
      <div className="dash-chart-body">
        {!hasData ? (
          <p className="dash-empty">No trend points in the selected date range.</p>
        ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis
              dataKey="date"
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
              contentStyle={{
                background: "#0f172a",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 10,
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#cbd5e1" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
            />
            <Line
              type="monotone"
              dataKey="highRisk"
              name="High risk"
              stroke={CHART_COLORS.high}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="lowRisk"
              name="Low risk"
              stroke={CHART_COLORS.low}
              strokeWidth={2}
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
