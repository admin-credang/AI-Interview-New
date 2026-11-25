import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import {
  IconAlert,
  IconBarChart,
  IconBell,
  IconCalendar,
  IconFileText,
  IconMic,
  IconChevronDown,
  IconDashboard,
  IconEye,
  IconHelp,
  IconLayers,
  IconLogOut,
  IconMenu,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconSparkles,
  IconUserCircle,
  IconUsers,
  IconX,
} from "./icons";
import BrandMark from "../BrandMark";

// ============================================================
// SIDEBAR ITEMS  ->  each one points to an EXISTING route
// (no route / page logic was changed in the redesign)
// ============================================================

const INTERVIEWER_NAV = [
  {
    section: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: IconDashboard, end: true },
      { to: "/dashboard/scheduling", label: "Interview Scheduling", icon: IconCalendar },
    ],
  },
  {
    section: "Interviews",
    items: [
      { to: "/dashboard/controls", label: "Interview Controls", icon: IconShield },
      { to: "/dashboard/assessments", label: "Assessments", icon: IconLayers },
    ],
  },
  {
    section: "Live Interviews",
    items: [{ to: "/dashboard/live-guard", label: "Live Interview Guard", icon: IconEye, badge: "New" }],
  },
  {
    section: "Insights",
    items: [
      { to: "/dashboard/transcripts", label: "Answers & Transcripts", icon: IconMic },
      { to: "/dashboard/reports", label: "Reports", icon: IconFileText },
      { to: "/dashboard/analytics", label: "Analytics", icon: IconBarChart },
    ],
  },
  {
    section: "Account",
    items: [
      { to: "/dashboard/configuration", label: "Settings", icon: IconSettings },
      { to: "/dashboard/profile", label: "Profile", icon: IconUserCircle },
      { to: "/dashboard/help", label: "FAQ", icon: IconHelp },
    ],
  },
];

// Candidates only see their interviews and the process. No scores, no reports.
const CANDIDATE_NAV = [
  {
    section: "Interviews",
    items: [{ to: "/dashboard", label: "My Interviews", icon: IconDashboard, end: true }],
  },
  {
    section: "Account",
    items: [
      { to: "/dashboard/profile", label: "Profile", icon: IconUserCircle },
      { to: "/dashboard/help", label: "FAQ", icon: IconHelp },
    ],
  },
];

const PAGE_TITLES = [
  ["/dashboard/candidates/", "Candidate Profile"],
  ["/dashboard/live-guard", "Live Interview Guard"],
  ["/dashboard/controls", "Interview Controls"],
  ["/dashboard/assessments", "Assessments"],
  ["/dashboard/analytics", "Analytics"],
  ["/dashboard/scheduling", "Interview Scheduling"],
  ["/dashboard/transcripts", "Answers & Transcripts"],
  ["/dashboard/reports", "Reports"],
  ["/dashboard/configuration", "Settings"],
  ["/dashboard/profile", "Profile"],
  ["/dashboard/help", "FAQ"],
];

function pageTitle(pathname, isCandidate) {
  const hit = PAGE_TITLES.find(([p]) => pathname.startsWith(p));
  if (hit) return hit[1];
  return isCandidate ? "My Interviews" : "Dashboard";
}

const SideLink = ({ to, label, icon: Icon, end, onClick, badge }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-[13.5px] font-medium transition-all ${
        isActive
          ? "bg-white font-semibold text-brand-800 shadow-[inset_0_-2px_0_#ddd6fe,0_10px_22px_-10px_rgba(30,8,70,0.7)]"
          : "text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-0.5"
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-fuchsia-300 to-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
        )}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition [&_svg]:h-[18px] [&_svg]:w-[18px] ${
            isActive
              ? "ui-icon-3d bg-gradient-to-br from-brand-400 to-brand-700 text-white"
              : "bg-white/10 text-white ring-1 ring-white/15 group-hover:bg-white/20"
          }`}
        >
          <Icon />
        </span>
        {label}
        {badge && (
          <span className="ml-auto rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 px-1.5 py-px text-[9.5px] font-extrabold uppercase tracking-wide text-emerald-950">
            {badge}
          </span>
        )}
      </>
    )}
  </NavLink>
);

const MenuLink = ({ to, label, icon: Icon }) => (
  <NavLink
    to={to}
    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-navy-900"
  >
    <span className="text-slate-400"><Icon /></span>
    {label}
  </NavLink>
);

function Sidebar({ nav, isInterviewer, onNavigate, onHelp, userName, role }) {
  return (
    <div className="dash-side relative flex h-full flex-col overflow-hidden text-white/80 shadow-[10px_0_34px_-14px_rgba(46,16,101,0.65)]">
      <span className="dash-side-glow" aria-hidden="true" />
      <div className="relative flex h-16 items-center px-5 border-b border-white/10">
        <NavLink to="/dashboard" onClick={onNavigate}>
          <BrandMark />
        </NavLink>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 py-5">
        {nav.map((group) => (
          <div key={group.section} className="mb-6">
            <p className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/50">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SideLink key={item.to} {...item} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative px-3 pb-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-2 py-2 backdrop-blur">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-500 text-xs font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{userName}</p>
            <p className="text-[11px] capitalize text-white/60">{role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    loading,
    error,
    reload,
    searchQuery,
    setSearchQuery,
    notifications,
    userName,
    userEmail,
    role,
    isInterviewer,
    isCandidate,
  } = useDashboard();

  const NAV = isInterviewer ? INTERVIEWER_NAV : CANDIDATE_NAV;

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

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
      <div className="min-h-screen bg-[#f5f7fa] flex flex-col items-center justify-center gap-5">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-2xl bg-brand-500/20 animate-ping" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white shadow-xl shadow-brand-500/30">
            <IconSparkles />
          </div>
        </div>
        <p className="text-sm font-semibold tracking-wide text-navy-700">
          Preparing your workspace…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-6">
        <div className="ui-card max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <IconAlert />
          </div>
          <h2 className="text-lg font-bold text-navy-900">Couldn't load your dashboard</h2>
          <p className="mt-2 mb-6 text-sm text-slate-500">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={reload} className="ui-btn">
              Retry connection
            </button>
            <button
              data-plain
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="ui-btn-ghost"
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
    navigate("/", { replace: true });
  };

  const sidebarProps = {
    nav: NAV,
    isInterviewer,
    userName,
    role,
    onNavigate: () => setMobileOpen(false),
    onHelp: () => navigate("/dashboard/help"),
  };

  return (
    <div className="min-h-screen bg-[#f7f5fd] text-navy-900">
      {/* ================= SIDEBAR (desktop) ================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* ================= SIDEBAR (mobile drawer) ================= */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-navy-950/50 backdrop-blur-sm transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 shadow-2xl transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <Sidebar {...sidebarProps} />
          <button
            data-plain
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-4 z-10 rounded-lg bg-white/15 p-1.5 text-white hover:bg-white/25"
          >
            <IconX />
          </button>
        </aside>
      </div>

      <div className="lg:pl-64">
        {/* ================= TOP NAVBAR ================= */}
        <header
          data-topbar
          className="dash-top sticky top-0 z-30 border-b border-white/10 text-white backdrop-blur-xl"
        >
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              data-plain
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <IconMenu />
            </button>

            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold text-fuchsia-200 sm:block">
                {isInterviewer ? "Workspace" : "Candidate"} <span className="mx-1">/</span>
              </p>
              <h1 className="truncate text-[15px] font-bold leading-tight text-white">
                {pageTitle(location.pathname, isCandidate)}
              </h1>
            </div>

            <div className="ml-auto hidden w-full max-w-sm md:block">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60">
                  <IconSearch />
                </span>
                <input
                  type="text"
                  placeholder="Search assessments…"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/10 py-2 pl-10 pr-4 text-sm text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)] outline-none transition placeholder:text-white/50 focus:border-white/40 focus:bg-white/15 focus:ring-4 focus:ring-white/10"
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-3">
              {isInterviewer && (
                <button
                  onClick={() => navigate("/create-interview")}
                  className="hidden items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-brand-700 shadow-[0_3px_0_#c4b5fd,0_10px_20px_-10px_rgba(0,0,0,0.5)] hover:bg-brand-50 sm:inline-flex"
                >
                  <IconPlus className="h-4 w-4" />
                  New Interview
                </button>
              )}

              {/* Notifications (real, generated from your assessments) */}
              <div className="relative" ref={notifRef}>
                <button
                  data-plain
                  aria-label="Notifications"
                  onClick={() => setShowNotifications((v) => !v)}
                  className="relative rounded-xl border border-white/15 bg-white/10 p-2 text-white shadow-[0_3px_0_rgba(0,0,0,0.25)] transition hover:bg-white/20"
                >
                  <IconBell />
                  {notifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="ui-card ui-fade-up absolute right-0 z-50 mt-2 w-80 overflow-hidden p-0 text-navy-900">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <h4 className="text-sm font-bold">Notifications</h4>
                      <span className="ui-pill bg-brand-50 text-brand-700">{notifications.length} new</span>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-slate-500">You're all caught up.</p>
                    ) : (
                      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                        {notifications.map((n) => (
                          <button
                            data-plain
                            key={n.id}
                            onClick={() => navigate(n.to)}
                            className="flex w-full gap-3 px-4 py-3 text-left text-xs leading-relaxed text-slate-600 transition hover:bg-brand-50/60"
                          >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
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
                  data-plain
                  onClick={() => setShowProfileMenu((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 py-1 pl-1 pr-2 text-white shadow-[0_3px_0_rgba(0,0,0,0.25)] transition hover:bg-white/20"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-fuchsia-500 text-xs font-bold text-white">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden text-left sm:block">
                    <span className="block text-[13px] font-semibold leading-tight">{userName}</span>
                    <span className="block text-[11px] capitalize leading-tight text-white/60">{role}</span>
                  </span>
                  <IconChevronDown />
                </button>

                {showProfileMenu && (
                  <div className="ui-card ui-fade-up absolute right-0 z-50 mt-2 w-60 p-1.5 text-navy-900">
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-semibold">{userName}</p>
                      {userEmail && <p className="truncate text-xs text-slate-400">{userEmail}</p>}
                    </div>
                    <div className="my-1 h-px bg-slate-100" />
                    <MenuLink to="/dashboard/profile" label="My Profile" icon={IconUserCircle} />
                    <MenuLink to="/dashboard/configuration" label="Platform Settings" icon={IconSettings} />
                    <MenuLink to="/dashboard/help" label="FAQ" icon={IconHelp} />
                    <div className="my-1 h-px bg-slate-100" />
                    <button
                      data-plain
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <IconLogOut />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ================= PAGE CONTENT ================= */}
        <main className="mx-auto w-full max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Suspense here: opening a page that is still loading only
              shows a small loader inside the content area, the sidebar
              and header stay on screen. */}
          <Suspense
            fallback={
              <div className="py-24 flex justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
              </div>
            }
          >
            <div key={location.pathname} className="ui-fade-up">
              <Outlet />
            </div>
          </Suspense>

          <footer className="mt-16 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} AI Interview & Assessment Platform</p>
            <p>Secure AI-proctored interviews</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
