import Breadcrumbs from "../Breadcrumbs";
import "../../pages/Dashboard.css";
import "./DashboardComponents.css";

/**
 * Shared shell for Dashboard and Admin (same background, shell width, breadcrumbs alignment).
 *
 * @param {{
 *   title: string,
 *   ledeText?: string,
 *   breadcrumbItems?: Array<{ label: string, to?: string }>,
 *   children: import("react").ReactNode
 * }} props
 */
export default function DashboardPageLayout({
  title,
  ledeText,
  breadcrumbItems,
  children,
}) {
  return (
    <div className="dashboard-page">
      <main className="dashboard-main">
        <div className="dashboard-shell">
          <Breadcrumbs items={breadcrumbItems} variant="dashboard" />
          <header className="dashboard-lede">
            <h1 className="dashboard-lede-title">{title}</h1>
            {ledeText ? <p className="dashboard-lede-text">{ledeText}</p> : null}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
