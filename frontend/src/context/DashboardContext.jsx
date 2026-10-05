import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../services/api";
import { useAuth } from "./AuthContext";

const DashboardContext = createContext(null);

// ============================================================
// HELPERS
// ============================================================

const normalizeTitle = (title) =>
  String(title || "").trim().toLowerCase().replace(/\s+/g, " ");

export const getSessionState = (session) => {
  const status = String(session?.status || "").trim().toLowerCase();

  if (status === "completed" || Boolean(session?.ended_at)) return "completed";
  if (status === "in_progress" || status === "started") return "in_progress";

  return "not_started";
};

const PRIORITY = { completed: 3, in_progress: 2, not_started: 1 };

/**
 * Removes duplicates.
 *  1) same interview id  -> keep one
 *  2) same title         -> keep the one with the most progress
 */
export function dedupeInterviews(list = []) {
  const byId = new Map();

  list.forEach((item) => {
    if (!item?.id) return;
    if (!byId.has(String(item.id))) byId.set(String(item.id), item);
  });

  const byTitle = new Map();

  Array.from(byId.values()).forEach((item) => {
    const key =
      normalizeTitle(item.title || item.name) || `id-${item.id}`;
    const existing = byTitle.get(key);

    if (!existing) {
      byTitle.set(key, item);
      return;
    }

    const a = PRIORITY[getSessionState(existing.session)];
    const b = PRIORITY[getSessionState(item.session)];

    if (b > a) byTitle.set(key, item);
  });

  return Array.from(byTitle.values());
}

export const matchesSearch = (item, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;

  return (
    String(item.title || item.name || "").toLowerCase().includes(q) ||
    String(item.description || "").toLowerCase().includes(q) ||
    String(item.type || "").toLowerCase().includes(q)
  );
};

export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// ============================================================
// THEMES (shared by every dashboard page)
// ============================================================

export const THEMES = {
  dark: {
    bg: "bg-[#06040C]",
    text: "text-white",
    nav: "bg-[#06040C]/90 border-white/10 shadow-2xl",
    card: "bg-white/[0.03] border-white/10 hover:border-fuchsia-500/40 shadow-xl",
    input: "bg-white/5 border-white/10 text-white placeholder:text-slate-500",
    welcome:
      "bg-gradient-to-r from-fuchsia-950/50 via-purple-950/40 to-slate-950 border-fuchsia-500/20 shadow-2xl",
  },
  light: {
    bg: "bg-slate-50",
    text: "text-slate-900",
    nav: "bg-white/90 border-slate-200 shadow-md",
    card: "bg-white border-slate-200 hover:border-purple-300 shadow-md hover:shadow-xl",
    input: "bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400",
    welcome:
      "bg-gradient-to-r from-purple-100/70 via-fuchsia-50 to-indigo-100/50 border-purple-200 shadow-sm",
  },
  vivid: {
    bg: "bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950",
    text: "text-white",
    nav: "bg-gray-900/90 border-cyan-500/30 shadow-2xl",
    card: "bg-gray-900/60 border-cyan-500/30 hover:border-cyan-400 shadow-2xl backdrop-blur-xl",
    input: "bg-gray-900 border-cyan-500/40 text-white placeholder:text-gray-500",
    welcome:
      "bg-gradient-to-r from-indigo-950 via-purple-950 to-cyan-950 border-cyan-500/30 shadow-2xl",
  },
};

const THEME_KEY = "dashboard_theme";

// ============================================================
// PROVIDER
// ============================================================

export function DashboardProvider({ children }) {
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // sessionId -> report returned by /sessions/{id}/report
  const [reports, setReports] = useState({});

  // interviewer: candidates summary (waiting for decision, flags ...)
  const [hiring, setHiring] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return THEMES[saved] ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  const setTheme = useCallback((value) => {
    setThemeState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  // ----------------------------------------------------------
  // LOAD DASHBOARD (once for all pages)
  // ----------------------------------------------------------
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/dashboard");
      setDashboard(response.data);
    } catch (err) {
      console.error("Dashboard loading failed:", err);

      setError(
        err.response?.status === 401
          ? "Your session has expired. Please login again."
          : err.response?.data?.detail || "Unable to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ----------------------------------------------------------
  // DERIVED DATA
  // ----------------------------------------------------------
  const role = String(dashboard?.role || user?.role || "")
    .trim()
    .toLowerCase();

  const isCandidate = role === "candidate";
  const isInterviewer = role === "interviewer";

  // ----------------------------------------------------------
  // INTERVIEWER: candidates + summary (one shared load)
  // ----------------------------------------------------------
  const loadHiring = useCallback(async () => {
    try {
      const res = await api.get("/hiring/candidates");
      setHiring(res.data);
    } catch (err) {
      console.warn("Hiring data could not be loaded:", err);
    }
  }, []);

  useEffect(() => {
    if (role === "interviewer" || role === "admin") {
      loadHiring();
    }
  }, [role, loadHiring]);

  const candidateInterviews = useMemo(
    () => dedupeInterviews(dashboard?.available_interviews),
    [dashboard]
  );

  const interviewerInterviews = useMemo(
    () => dedupeInterviews(dashboard?.interviews),
    [dashboard]
  );

  const interviews = isCandidate ? candidateInterviews : interviewerInterviews;

  // ----------------------------------------------------------
  // Candidates never receive reports or scores. The hiring team
  // reviews the analysis and tells the candidate by call / email.
  // ----------------------------------------------------------

  const getScore = useCallback(
    (interview) => {
      const sessionId = interview?.session?.id;
      const fromReport = reports[sessionId]?.overall_score;
      const fromSession =
        interview?.session?.overall_score ?? interview?.session?.score;

      const value = fromReport ?? fromSession;
      return value === undefined || value === null ? null : Number(value);
    },
    [reports]
  );

  // Stats are computed from the same de-duplicated list the cards use,
  // so the numbers always match what the user sees.
  const stats = useMemo(() => {
    const backend = dashboard?.stats || {};
    const total = interviews.length;

    const completed = interviews.filter(
      (i) => getSessionState(i.session) === "completed"
    ).length;

    const inProgress = interviews.filter(
      (i) => getSessionState(i.session) === "in_progress"
    ).length;

    const notStarted = total - completed - inProgress;

    const scores = interviews
      .filter((i) => getSessionState(i.session) === "completed")
      .map(getScore)
      .filter((s) => s !== null && !Number.isNaN(s));

    const computedAvg = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    const rawAvg = computedAvg ?? backend.average_score ?? null;

    const averageScore =
      rawAvg === null || rawAvg === undefined || Number.isNaN(Number(rawAvg))
        ? null
        : Math.round(Number(rawAvg) * 10) / 10;

    const configuredDurations = interviews
      .map((i) => Number(i.duration_minutes))
      .filter((n) => n > 0);

    const averageDuration =
      backend.average_time_minutes ??
      (configuredDurations.length
        ? Math.round(
            configuredDurations.reduce((a, b) => a + b, 0) /
              configuredDurations.length
          )
        : null);

    return {
      total,
      completed,
      inProgress,
      notStarted,
      averageScore,
      averageDuration,
      bestScore: scores.length ? Math.max(...scores) : null,
      scoredCount: scores.length,
    };
  }, [dashboard, interviews, getScore]);

  // Notifications are generated from real assessment state only.
  const notifications = useMemo(() => {
    if (!isCandidate) {
      const alerts = [];
      const s = hiring?.summary;

      if (s?.pending_review > 0) {
        alerts.push({
          id: "pending-review",
          text: `${s.pending_review} candidate${s.pending_review === 1 ? " is" : "s are"} waiting for your decision.`,
          to: "/dashboard/candidates",
        });
      }

      if (s?.flagged > 0) {
        alerts.push({
          id: "monitoring-flags",
          text: `${s.flagged} interview${s.flagged === 1 ? " has" : "s have"} monitoring flags to check.`,
          to: "/dashboard/candidates",
        });
      }

      return alerts;
    }

    const list = [];

    interviews
      .filter((i) => getSessionState(i.session) === "in_progress")
      .forEach((i) =>
        list.push({
          id: `p-${i.id}`,
          text: `"${i.title || i.name}" is in progress. Resume when you're ready.`,
          to: `/interviews/${i.id}`,
        })
      );

    interviews
      .filter((i) => getSessionState(i.session) === "not_started")
      .slice(0, 3)
      .forEach((i) =>
        list.push({
          id: `n-${i.id}`,
          text: `"${i.title || i.name}" is assigned to you and not started yet.`,
          to: `/interviews/${i.id}`,
        })
      );

    interviews
      .filter(
        (i) => getSessionState(i.session) === "completed" && i.session?.id
      )
      .slice(0, 2)
      .forEach((i) =>
        list.push({
          id: `c-${i.id}`,
          text: `"${i.title || i.name}" was submitted. We will contact you if you are selected, otherwise you will get an email.`,
          to: "/dashboard",
        })
      );

    return list;
  }, [interviews, isCandidate, hiring]);

  const value = useMemo(
    () => ({
    user,
    dashboard,
    loading,
    error,
    reload: loadDashboard,

    role,
    isCandidate,
    isInterviewer,
    userName: dashboard?.user?.name || user?.name || "User",
    userEmail: dashboard?.user?.email || user?.email || "",

    interviews,
    stats,
    notifications,

    hiring,
    reloadHiring: loadHiring,

    reports,
    reportsLoading,
    getScore,

    searchQuery,
    setSearchQuery,

    theme,
    setTheme,
    t: THEMES[theme],
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      dashboard,
      loading,
      error,
      loadDashboard,
      role,
      interviews,
      stats,
      notifications,
      hiring,
      loadHiring,
      reports,
      reportsLoading,
      getScore,
      searchQuery,
      theme,
      setTheme,
    ]
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
