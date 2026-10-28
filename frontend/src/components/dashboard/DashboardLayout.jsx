import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import {
  IconAlert,
  IconBarChart,
  IconBell,
  IconChevronDown,
  IconDashboard,
  IconHelp,
  IconLogOut,
  IconSearch,
  IconSettings,
  IconShield,
  IconUserCircle,
  IconUsers,
  IconZap,
} from "./icons";

// ============================================================
// SIDEBAR ITEMS  ->  each one has its OWN page / route
// ============================================================

const INTERVIEWER_NAV = [
  { to: "/dashboard", label: "Overview Dashboard", icon: IconDashboard, end: true },
  { to: "/dashboard/controls", label: "Interview Controls", icon: IconShield },
  { to: "/dashboard/analytics", label: "Analytics & Reports", icon: IconBarChart },
];

// Candidates only see their interviews and the process. No scores, no reports.
const CANDIDATE_NAV = [
  { to: "/dashboard", label: "My Interviews", icon: IconDashboard, end: true },
  { to: "/dashboard/help", label: "Help", icon: IconHelp },
];

const SideLink = ({ to, label, icon: Icon, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-slate-100 text-slate-700 shadow-inner border border-slate-300"
          : "text-slate-500 hover:bg-slate-50 hover:text-current border border-transparent"
      }`
    }
  >
    <Icon />
    {label}
  </NavLink>
);

export default function DashboardLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    loading,
    error,
    reload,
    t,
    searchQuery,
    setSearchQuery,
    notifications,
    userName,
    role,
    isInterviewer,
  } = useDashboard();

  const NAV_ITEMS = isInterviewer ? INTERVIEWER_NAV : CANDIDATE_NAV;

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // close popups + scroll to top when the page changes
  useEffect(() => {
    setShowNotifications(false);
    setShowProfileMenu(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Search lives in the top bar, so take the user to the page that lists
  // assessments when they start typing from any other page.
  const handleSearch = (value) => {
    setSearchQuery(value);

    if (value.trim() && location.pathname !== "/dashboard/assessments") {
      navigate("/dashboard/assessments");
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col items-center justify-center`}>
        <div className="text-slate-700 animate-bounce mb-6">
          <IconZap />
        </div>
        <p className="text-lg font-bold tracking-widest animate-pulse">
          SECURING AI ENVIRONMENT...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} flex items-center justify-center p-6`}>
        <div className={`max-w-md w-full p-8 rounded-[2rem] border ${t.card} text-center shadow-2xl`}>
          <div className="text-red-500 mx-auto mb-4 flex justify-center">
            <IconAlert />
          </div>
          <p className="font-semibold text-red-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reload}
 className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold hover:opacity-90 shadow-lg"
            >
              Retry Connection
            </button>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="px-6 py-3 bg-slate-100 rounded-xl font-bold hover:bg-slate-100"
            >
              Login again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans transition-colors duration-500`}>
      {/* ================= TOP NAVBAR ================= */}
      <nav className={`sticky top-0 z-50 border-b backdrop-blur-2xl transition-colors duration-300 ${t.nav}`}>
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <NavLink to="/dashboard" className="flex items-center gap-3">
 <div className="w-11 h-11 rounded-2xl bg-slate-800 flex items-center justify-center shadow-lg text-white">
              <IconZap />
            </div>
            <div className="flex flex-col">
 <span className="text-slate-700 font-black text-xl tracking-tight">
                AI
              </span>
              <span className="text-[10px] tracking-widest uppercase opacity-60 font-bold">
                Platform v3.5
              </span>
            </div>
          </NavLink>

          <div className="flex-1 max-w-xl px-6 lg:px-12 hidden md:block">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <IconSearch />
              </span>
              <input
                type="text"
                placeholder="Search assessments, categories, or keywords..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className={`w-full pl-12 pr-4 py-3.5 rounded-2xl border ${t.input} focus:ring-2 focus:ring-slate-400 outline-none transition shadow-inner`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Notifications (real, generated from your assessments) */}
            <div className="relative" ref={notifRef}>
              <button data-plain
                aria-label="Notifications"
                onClick={() => setShowNotifications((v) => !v)}
                className="p-3.5 rounded-2xl hover:bg-slate-100 relative transition-colors border border-slate-200"
              >
                <IconBell />
                {notifications.length > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-slate-800 rounded-full border-2 border-white" />
                )}
              </button>

              {showNotifications && (
                <div className={`absolute right-0 mt-3 w-80 p-5 rounded-[2rem] border ${t.card} shadow-2xl z-50`}>
                  <h4 className="font-bold text-base mb-3">Notifications</h4>

                  {notifications.length === 0 ? (
                    <p className="text-xs opacity-70 p-3">You're all caught up.</p>
                  ) : (
                    <div className="space-y-2.5 text-xs max-h-72 overflow-y-auto">
                      {notifications.map((n) => (
                        <button data-plain
                          key={n.id}
                          onClick={() => navigate(n.to)}
                          className="block w-full text-left p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition"
                        >
                          {n.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile menu */}
            <div className="relative" ref={profileRef}>
              <button data-plain
                onClick={() => setShowProfileMenu((v) => !v)}
                className="flex items-center gap-3 pl-3 pr-4 py-2 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-200"
              >
 <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-black text-sm shadow-md">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="font-bold text-sm leading-tight">{userName}</p>
                  <p className="text-[11px] opacity-60 capitalize font-medium">{role}</p>
                </div>
                <IconChevronDown />
              </button>

              {showProfileMenu && (
                <div className={`absolute right-0 mt-3 w-56 p-2 rounded-[2rem] border ${t.card} shadow-2xl z-50`}>
                  <SideLink to="/dashboard/profile" label="My Profile" icon={IconUserCircle} />
                  <SideLink to="/dashboard/configuration" label="Platform Settings" icon={IconSettings} />
                  <SideLink to="/dashboard/help" label="Help Center" icon={IconHelp} />
                  <div className="h-px bg-slate-100 my-2" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/15 transition-all"
                  >
                    <IconLogOut />
                    Secure Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile / tablet navigation (sidebar is hidden below lg) */}
        <div className="lg:hidden flex gap-2 overflow-x-auto px-4 pb-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition ${
                  isActive
                    ? "bg-slate-100 text-slate-700 border-slate-300"
                    : "border-slate-200 opacity-70"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="flex">
        {/* ================= SIDEBAR ================= */}
        <aside className={`w-72 shrink-0 p-6 border-r ${t.nav} hidden lg:block sticky top-[81px] h-[calc(100vh-81px)] overflow-y-auto`}>
          <nav className="space-y-2.5">
            {NAV_ITEMS.map((item) => (
              <SideLink key={item.to} {...item} />
            ))}
          </nav>

          <div className={`mt-12 p-6 rounded-[2rem] border ${t.welcome} text-center relative overflow-hidden`}>
            <div className="text-slate-700 mb-3 flex justify-center">
              <IconZap />
            </div>
            <p className="text-sm font-bold mb-1">Need Assistance?</p>
            <p className="text-xs opacity-70 mb-5 leading-relaxed">
              {isInterviewer
                ? "Guides for creating and configuring assessments."
                : "Read how assessments and AI proctoring work."}
            </p>
            <button
              onClick={() => navigate("/dashboard/help")}
              className="w-full py-3 bg-slate-100 hover:bg-slate-100 rounded-xl text-xs font-bold transition shadow-md border border-slate-200"
            >
              Help Center
            </button>
          </div>
        </aside>

        {/* ================= PAGE CONTENT ================= */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-12">
          {/* Suspense here: opening a page that is still loading only
              shows a small loader inside the content area, the sidebar
              and header stay on screen. */}
          <Suspense
            fallback={
              <div className="py-24 flex justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-700 animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>

          <footer className="mt-20 pt-8 border-t border-slate-200 text-center text-xs opacity-50 font-medium">
            <p>&copy; 2026 AI Interview & Assessment Platform. All rights reserved.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
