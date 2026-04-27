import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Header from "../components/Header";
import "./Dashboard.css";

export default function Admin() {
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/", { replace: true });
      }
    };
    check();
  }, [navigate]);

  return (
    <div className="dashboard-page">
      <Header />
      <main className="dashboard-main">
        <div className="dashboard-shell">
          <h1 className="dashboard-title">Admin Panel</h1>
          <p className="dashboard-subtitle">
            Admin controls will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
