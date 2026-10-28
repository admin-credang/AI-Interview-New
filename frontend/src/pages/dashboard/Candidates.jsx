import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import {
  loadCandidateDetailPage,
  prefetchCandidate,
} from "../../services/prefetch";
import StatCard from "../../components/dashboard/StatCard";
import {
  DecisionBadge,
  StatusBadge,
  downloadCsv,
  fmtDuration,
  recommendation,
  scoreText,
} from "../../components/dashboard/hiring";
import {
  IconAlert,
  IconAward,
  IconHourglass,
  IconLayers,
  IconSearch,
  IconShield,
} from "../../components/dashboard/icons";
import { formatDate, useDashboard } from "../../context/DashboardContext";

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending review" },
  { id: "selected", label: "Selected" },
  { id: "rejected", label: "Rejected" },
  { id: "on_hold", label: "On hold" },
];

export function useReviewState(embeddedInterviewId = "", enabled = true) {
  const embedded = Boolean(embeddedInterviewId);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // "View candidates" on an interview opens  /dashboard/candidates?interview=<id>
  // -> only the candidates of THAT interview are loaded and shown.
  const scopeId = embeddedInterviewId || searchParams.get("interview") || "";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("all");
  const [interviewId, setInterviewId] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [openId, setOpenId] = useState("");
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    setLoading(true);
    setError("");
    setInterviewId("all");

    api
      .get("/hiring/candidates", {
        params: scopeId ? { interview_id: scopeId } : undefined,
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Could not load candidates.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeId, enabled, nonce]);

  // download the candidate page code in the background, so the
  // first click on a candidate does not wait for it
  useEffect(() => {
    const id = window.setTimeout(() => {
      loadCandidateDetailPage().catch(() => {});
    }, 300);

    return () => window.clearTimeout(id);
  }, []);

  const candidates = data?.candidates || [];
  const summary = data?.summary || {};
  const scope = data?.interview || null;

  const openCandidate = (sessionId) =>
    navigate(`/dashboard/candidates/${sessionId}`, {
      state: {
        back: embedded
          ? `/dashboard/controls?interview=${embeddedInterviewId}`
          : `${location.pathname}${location.search}`,
      },
    });

  const interviewOptions = useMemo(() => {
    const map = new Map();
    candidates.forEach((c) => map.set(c.interview_id, c.interview_title));
    return [...map.entries()];
  }, [candidates]);

  // rank among everyone with a score (1 = best)
  const rankMap = useMemo(() => {
    const scored = candidates
      .filter((c) => c.score !== null)
      .sort((a, b) => b.score - a.score);

    const map = {};
    scored.forEach((c, i) => {
      map[c.session_id] = i + 1;
    });
    return map;
  }, [candidates]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = candidates.filter((c) => {
      if (tab !== "all" && c.decision !== tab) return false;
      if (interviewId !== "all" && c.interview_id !== interviewId) return false;
      if (!q) return true;

      return (
        c.candidate.name?.toLowerCase().includes(q) ||
        c.candidate.email?.toLowerCase().includes(q) ||
        c.interview_title?.toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];

    if (sort === "score_desc") {
      sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else if (sort === "score_asc") {
      sorted.sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
    }

    return sorted;
  }, [candidates, tab, interviewId, query, sort]);

  const exportCsv = () => {
    downloadCsv("candidates.csv", [
      ["Name", "Email", "Interview", "Status", "Score", "Rank", "Decision", "Monitoring", "Date", "Duration (s)"],
      ...list.map((c) => [
        c.candidate.name,
        c.candidate.email,
        c.interview_title,
        c.session_status,
        c.score === null ? "" : Math.round(c.score),
        rankMap[c.session_id] || "",
        c.decision,
        !c.proctoring.required ? "not required" : c.proctoring.flagged ? "flagged" : "clean",
        c.ended_at || c.started_at || "",
        c.duration_seconds ?? "",
      ]),
    ]);
  };

  return {
    openId,
    setOpenId,
    reload,
    embedded,
    scopeId,
    scope,
    loading,
    error,
    candidates,
    summary,
    tab,
    setTab,
    interviewId,
    setInterviewId,
    query,
    setQuery,
    sort,
    setSort,
    list,
    rankMap,
    interviewOptions,
    exportCsv,
    openCandidate,
    navigate,
    setSearchParams,
  };
}

export function ReviewTop({ r, t }) {
  const {
    embedded,
    scopeId,
    scope,
    loading,
    error,
    candidates,
    summary,
    tab,
    setTab,
    interviewId,
    setInterviewId,
    query,
    setQuery,
    sort,
    setSort,
    list,
    rankMap,
    interviewOptions,
    exportCsv,
    openCandidate,
    navigate,
    setSearchParams,
  } = r;

  return (
    <div className={embedded ? "space-y-6" : "space-y-10"}>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          title="Attended"
          value={summary.total ?? "—"}
          icon={IconLayers}
          change={`${summary.completed ?? 0} completed`}
          variant="purple"
        />
        <StatCard
          title="Pending review"
          value={summary.pending_review ?? "—"}
          icon={IconHourglass}
          change="Waiting for your decision"
          variant="amber"
        />
        <StatCard
          title="Selected"
          value={summary.selected ?? "—"}
          icon={IconAward}
          change={`${summary.rejected ?? 0} rejected`}
          variant="emerald"
        />
        <StatCard
          title="Monitoring flags"
          value={summary.flagged ?? "—"}
          icon={IconShield}
          change="Ended early or flagged"
          variant="cyan"
        />
      </section>

      {embedded ? (
        <div className="flex justify-end">
          <button
            onClick={exportCsv}
            disabled={list.length === 0}
            className="px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-100 text-sm font-bold whitespace-nowrap transition disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      ) : (
      <section
        className={`p-5 rounded-[2rem] border ${t.card} flex flex-col gap-4 backdrop-blur-2xl`}
      >
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="relative w-full md:max-w-sm">
            <span className="absolute left-4 top-1/2 -translate-y-1/2">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search name, email or interview..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full pl-12 pr-4 py-3 rounded-2xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400`}
            />
          </div>

          <div className="flex gap-3 w-full md:w-auto">
          {!scopeId && (
            <select
              value={interviewId}
              onChange={(e) => setInterviewId(e.target.value)}
              className={`px-4 py-3 rounded-2xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400 md:max-w-xs w-full`}
            >
              <option value="all" className="bg-white text-slate-900">
                All interviews
              </option>
              {interviewOptions.map(([id, title]) => (
                <option key={id} value={id} className="bg-white text-slate-900">
                  {title}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={exportCsv}
            disabled={list.length === 0}
            className="px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-100 text-sm font-bold whitespace-nowrap transition disabled:opacity-40"
          >
            Export CSV
          </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200 w-full md:w-auto shadow-inner overflow-x-auto self-start">
          {TABS.map((x) => (
            <button data-plain
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                tab === x.id
 ? "bg-violet-600 text-white shadow-md"
                  : "hover:bg-slate-50 opacity-75 hover:opacity-100"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}

export function ReviewTable({ r, t }) {
  const {
    embedded,
    scopeId,
    scope,
    loading,
    error,
    candidates,
    summary,
    tab,
    setTab,
    interviewId,
    setInterviewId,
    query,
    setQuery,
    sort,
    setSort,
    list,
    rankMap,
    interviewOptions,
    exportCsv,
    openCandidate,
    navigate,
    setSearchParams,
  } = r;

  return (
    <>
      {loading ? (
        <p className="text-sm opacity-70 animate-pulse px-2">Loading candidates...</p>
      ) : error ? (
        <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-700">
          {error}
        </div>
      ) : list.length === 0 ? (
        <div className={`text-center py-24 px-6 rounded-[3rem] border ${t.card}`}>
          <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150">
            <IconAlert />
          </div>
          <h3 className="text-2xl font-bold mb-2">No candidates found</h3>
          <p className="opacity-60 max-w-md mx-auto text-sm leading-relaxed">
            {candidates.length === 0
              ? scopeId
                ? "Nobody has attended this interview yet. Invited candidates appear here as soon as they start."
                : "Nobody has attended your interviews yet. Candidates appear here as soon as they start."
              : "No candidates match these filters."}
          </p>
        </div>
      ) : (
        <section className={`rounded-[2rem] border ${t.card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider opacity-60 border-b border-slate-200">
                  <th className="px-6 py-4 font-bold">Candidate</th>
                  <th className="px-4 py-4 font-bold">Interview</th>
                  <th className="px-4 py-4 font-bold">Status</th>
                  <th className="px-4 py-4 font-bold">Score</th>
                  <th className="px-4 py-4 font-bold">Monitoring</th>
                  <th className="px-4 py-4 font-bold">Decision</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {list.map((c) => (
                  <tr
                    key={c.session_id}
                    onClick={() => openCandidate(c.session_id)}
                    onMouseEnter={() => prefetchCandidate(c.session_id)}
                    onFocus={() => prefetchCandidate(c.session_id)}
                    className="hover:bg-slate-50 cursor-pointer transition"
                  >
                    <td className="px-6 py-4">
                      <p className="font-bold">{c.candidate.name}</p>
                      <p className="text-xs opacity-60">{c.candidate.email}</p>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-semibold">{c.interview_title}</p>
                      <p className="text-xs opacity-60">
                        {formatDate(c.ended_at || c.started_at)} ·{" "}
                        {fmtDuration(c.duration_seconds)}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <StatusBadge status={c.session_status} />
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${scoreText(c.score)}`}>
                          {c.score === null ? "—" : `${Math.round(c.score)}%`}
                        </span>
                        {rankMap[c.session_id] && (
                          <span className="text-[10px] font-bold opacity-60">
                            #{rankMap[c.session_id]}
                          </span>
                        )}
                      </div>
                      {recommendation(c.score) && (
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${recommendation(c.score).cls}`}
                        >
                          {recommendation(c.score).label}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-xs">
                      {!c.proctoring.required ? (
                        <span className="opacity-50">Not required</span>
                      ) : c.proctoring.flagged ? (
                        <span className="text-rose-700 font-bold">Flagged</span>
                      ) : (
                        <span className="text-emerald-700 font-bold">Clean</span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <DecisionBadge value={c.decision} />
                    </td>

                    <td className="px-6 py-4 text-right">
                      <span className="text-slate-700 font-bold text-xs">Review →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function Candidates() {
  const { t } = useDashboard();
  const r = useReviewState("");
  const { scopeId, scope, navigate, setSearchParams } = r;

  return (
    <div className="space-y-10">
      <header className="px-1">
        {scopeId && (
          <button data-plain
            onClick={() => navigate("/dashboard/controls")}
            className="text-sm font-bold text-slate-700 hover:underline mb-3"
          >
            ← Back to interview controls
          </button>
        )}

        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {scopeId ? scope?.title || "Candidates" : "Candidates"}
        </h1>

        {scopeId ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="px-3 py-1 rounded-full border border-slate-300 bg-slate-100 text-slate-700 text-xs font-bold">
              {scope?.role || "This interview"}
            </span>
            <span className="opacity-70">
              {scope ? `${scope.invited} invited · ` : ""}
              only candidates of this interview
            </span>
            <button data-plain
              onClick={() => setSearchParams({})}
              className="text-xs font-bold underline opacity-80 hover:opacity-100"
            >
              Show all interviews
            </button>
          </div>
        ) : (
          <p className="opacity-70 mt-2 text-sm">
            Everyone who attended your interviews. Open a candidate to read the AI
            analysis, check monitoring and select or reject.
          </p>
        )}
      </header>

      <ReviewTop r={r} t={t} />
      <ReviewTable r={r} t={t} />
    </div>
  );
}
