import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import InfoTooltip from "./InfoTooltip.jsx";
import "./DashboardComponents.css";

const BAR_COLORS = ["#60a5fa", "#7c3aed", "#a78bfa", "#22d3ee"];

/**
 * @param {object} props
 * @param {{ bucket: string, events: number, pct: number }[]} props.data
 * @param {string} [props.className]
 */
export default function EventSizeDistributionChart({ data, className = "" }) {
  const hasData = Array.isArray(data) && data.some((d) => d.events > 0);

  return (
    <div className={`dash-chart-card ${className}`.trim()}>
      <div className="dash-chart-header">
        <div className="dash-chart-title-row">
          <h2 className="dash-chart-title">Event Size Distribution</h2>
          <InfoTooltip
            label="Event Size Distribution"
            text="Distribution of events based on how many CDMs each event contains."
          />
        </div>
      </div>
      <div className="dash-chart-body">
        {!hasData ? (
          <p className="dash-empty">No events in current range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="bucket"
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
                cursor={{ fill: "rgba(124,58,237,0.12)" }}
                formatter={(value, _name, item) => [
                  `${value} events (${item?.payload?.pct ?? 0}%)`,
                  "Count",
                ]}
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                }}
                itemStyle={{ color: "#93c5fd" }}
                labelStyle={{ color: "#cbd5e1" }}
              />
              <Bar dataKey="events" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={600}>
                {data.map((entry, index) => (
                  <Cell
                    key={`${entry.bucket}-${index}`}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

