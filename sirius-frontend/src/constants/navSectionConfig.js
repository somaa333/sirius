/**
 * Primary routes and in-page section anchors for header mega-navigation.
 * Paths must match `main.jsx` routes; hashes match element `id`s on each page.
 */

/** @typedef {{ label: string, hash: string }} NavSection */

/** @typedef {{ path: string, sections: NavSection[] }} NavSectionLinkConfig */

/** @type {NavSectionLinkConfig[]} */
export const NAV_SECTION_LINKS = [
  {
    path: "/",
    sections: [
      { label: "SIRIUS Overview", hash: "sirius-overview" },
      { label: "Why It Matters", hash: "why-it-matters" },
      { label: "Capabilities", hash: "capabilities" },
      { label: "Space Context", hash: "space-context" },
      { label: "Pipeline", hash: "pipeline" },
      { label: "Collaboration", hash: "collaboration" },
    ],
  },
  {
    path: "/cdm-upload",
    sections: [
      { label: "Upload CDM", hash: "upload-area" },
      { label: "CDM Upload History", hash: "upload-history" },
    ],
  },
  {
    path: "/dashboard",
    sections: [
      { label: "CDMs Overview", hash: "dashboard-overview" },
      { label: "CDM Events", hash: "cdm-events-table" },
    ],
  },
  {
    path: "/analysis",
    sections: [
      { label: "Analysis Paths", hash: "analysis-paths" },
      { label: "Analysis Overview", hash: "analysis-overview" },
      { label: "Risk Assessments", hash: "risk-assessments-table" },
    ],
  },
  {
    path: "/reports",
    sections: [
      { label: "Generate Report", hash: "generate-report" },
      { label: "Report History", hash: "report-history" },
    ],
  },
  {
    path: "/admin",
    sections: [{ label: "Operators Management", hash: "operators-management" }],
  },
];
