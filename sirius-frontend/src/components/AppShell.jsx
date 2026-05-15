import { Outlet } from "react-router-dom";
import Header from "./Header";
import ScrollToTop from "./ScrollToTop.jsx";
import ScrollToHash from "./ScrollToHash.jsx";

export default function AppShell() {
  return (
    <>
      <ScrollToTop />
      <ScrollToHash />
      <Header />
      <Outlet />
    </>
  );
}
