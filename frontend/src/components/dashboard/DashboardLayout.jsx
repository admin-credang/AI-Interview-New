import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import {
  IconAlert,
  IconBarChart,
  IconBell,
  IconBriefcase,
  IconChevronDown,
  IconDashboard,
  IconHelp,
  IconLogOut,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShield,
  IconSun,
  IconUserCircle,
  IconUsers,
  IconZap,
} from "./icons";

// ============================================================
// SIDEBAR ITEMS  ->  each one has its OWN page / route
// ============================================================

const INTERVIEWER_NAV = [
  { to: "/dashboard", label: "Overview Dashboard", icon: IconDashboard, end: true },
  { to: "/dashboard/candidates", label: "Candidates", icon: IconUsers },
  { to: "/dashboard/controls", label: "Interview Controls", icon: IconShield },
  { to: "/dashboard/assessments", label: "My Assessments", icon: IconBriefcase },
  { to: "/dashboard/analytics", label: "Analytics & Reports", icon: IconBarChart },
  { to: "/dashboard/configuration", label: "Configuration", icon: IconSettings },
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
          ? "bg-fuchsia-500/15 text-fuchsia-400 shadow-inner border border-fuchsia-500/20"
          : "text-slate-400 hover:bg-white/5 hover:text-current border border-transparent"
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
    theme,
    setTheme,
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
        <div className="text-fuchsia-500 animate-bounce mb-6">
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
          <p className="font-semibold text-red-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reload}
              className="px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-xl font-bold hover:opacity-90 shadow-lg"
            >
              Retry Connection
            </button>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="px-6 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20"
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
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-fuchsia-600 via-purple-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 text-white">
              <IconZap />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tight bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
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
                className={`w-full pl-12 pr-4 py-3.5 rounded-2xl border ${t.input} focus:ring-2 focus:ring-fuchsia-500 outline-none transition shadow-inner`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Theme switch */}
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-black/20 border border-white/10 shadow-inner">
              {[
                { icon: IconMoon, id: "dark", label: "Dark theme" },
                { icon: IconSun, id: "light", label: "Light theme" },
                { icon: IconBriefcase, id: "vivid", label: "Vivid theme" },
              ].map((item) => (
                <button
                  key={item.id}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => setTheme(item.id)}
                  className={`p-2.5 rounded-full transition-all flex items-center justify-center ${
                    theme === item.id
                      ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105"
                      : "hover:bg-white/10 opacity-70 hover:opacity-100"
                  }`}
                >
                  <item.icon />
                </button>
              ))}
            </div>

            {/* Notifications (real, generated from your assessments) */}
            <div className="relative" ref={notifRef}>
              <button
                aria-label="Notifications"
                onClick={() => setShowNotifications((v) => !v)}
                className="p-3.5 rounded-2xl hover:bg-white/10 relative transition-colors border border-white/5"
              >
                <IconBell />
                {notifications.length > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-fuchsia-500 rounded-full border-2 border-[#06040C]" />
                )}
              </button>

              {showNotifications && (
                <div className={`absolute right-0 mt-3 w-80 p-5 rounded-[2rem] border ${t.card} ${theme === "light" ? "" : "bg-[#0d0a18]"} shadow-2xl z-50`}>
                  <h4 className="font-bold text-base mb-3">Notifications</h4>

                  {notifications.length === 0 ? (
                    <p className="text-xs opacity-70 p-3">You're all caught up.</p>
                  ) : (
                    <div className="space-y-2.5 text-xs max-h-72 overflow-y-auto">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => navigate(n.to)}
                          className="block w-full text-left p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition"
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
              <button
                onClick={() => setShowProfileMenu((v) => !v)}
                className="flex items-center gap-3 pl-3 pr-4 py-2 rounded-2xl hover:bg-white/10 transition-colors border border-white/5"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center text-white font-black text-sm shadow-md">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="font-bold text-sm leading-tight">{userName}</p>
                  <p className="text-[11px] opacity-60 capitalize font-medium">{role}</p>
                </div>
                <IconChevronDown />
              </button>

              {showProfileMenu && (
                <div className={`absolute right-0 mt-3 w-56 p-2 rounded-[2rem] border ${t.card} ${theme === "light" ? "" : "bg-[#0d0a18]"} shadow-2xl z-50`}>
                  <SideLink to="/dashboard/profile" label="My Profile" icon={IconUserCircle} />
                  <SideLink to="/dashboard/configuration" label="Platform Settings" icon={IconSettings} />
                  <SideLink to="/dashboard/help" label="Help Center" icon={IconHelp} />
                  <div className="h-px bg-white/10 my-2" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/15 transition-all"
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
                    ? "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30"
                    : "border-white/10 opacity-70"
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
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-fuchsia-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="text-fuchsia-400 mb-3 flex justify-center">
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
              className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition shadow-md border border-white/10"
            >
              Help Center
            </button>
          </div>
        </aside>

        {/* ================= PAGE CONTENT ================= */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-12">
          <Outlet />

          <footer className="mt-20 pt-8 border-t border-white/10 text-center text-xs opacity-50 font-medium">
            <p>&copy; 2026 AI Interview & Assessment Platform. All rights reserved.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
