import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "./DashboardComponents.css";

const COLORS = {
  high: "#f87171",
  low: "#4ade80",
};

/**
 * @param {object} props
 * @param {{ name: string, value: number, pct: number }[]} props.data
 * @param {string} [props.className]
 */
export default function RiskDistributionChart({ data, className = "" }) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className={`dash-chart-card ${className}`.trim()}>
      <div className="dash-chart-header">
        <h2 className="dash-chart-title">Risk distribution</h2>
      </div>
      <div className="dash-chart-body dash-chart-body--pie">
        {!hasData ? (
          <p className="dash-empty">No events in range for distribution.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={2}
                isAnimationActive
                animationDuration={500}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${entry.name}-${index}`}
                    fill={
                      entry.name.includes("High")
                        ? COLORS.high
                        : COLORS.low
                    }
                    stroke="rgba(15,23,42,0.9)"
                    strokeWidth={1}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => [
                  `${value} CDMs (${item?.payload?.pct ?? 0}%)`,
                  "Count",
                ]}
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                }}
              />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
