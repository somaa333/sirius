import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Profile from "./pages/Profile.jsx";
import CdmUpload from "./pages/CdmUpload.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AnalysisPage from "./pages/AnalysisPage.jsx";
import AnalysisDetailsPage from "./pages/AnalysisDetailsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import CdmEventDetail from "./pages/CdmEventDetail.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { ToastProvider } from "./components/toast/ToastProvider.jsx";
import AppShell from "./components/AppShell.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/cdm-upload" element={<CdmUpload />} />
              <Route path="/analysis/:assessmentId" element={<AnalysisDetailsPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/dashboard/events/:eventId" element={<CdmEventDetail />} />
              <Route path="/dashboard/cdm-events/:eventId" element={<CdmEventDetail />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/login" element={<App />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
);
