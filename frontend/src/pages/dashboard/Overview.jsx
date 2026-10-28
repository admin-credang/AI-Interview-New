import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import InterviewCard from "../../components/dashboard/InterviewCard";
import StatCard from "../../components/dashboard/StatCard";
import CandidateHome from "./CandidateHome";
import { DecisionBadge, scoreText } from "../../components/dashboard/hiring";
import {
  IconAward,
  IconHourglass,
  IconLayers,
  IconTrendingUp,
  IconZap,
} from "../../components/dashboard/icons";
import {
  formatDate,
  getSessionState,
  useDashboard,
} from "../../context/DashboardContext";

export default function Overview() {
  const { isCandidate } = useDashboard();

  // Candidates get a separate home: job details + interview process only.
  return isCandidate ? <CandidateHome /> : <InterviewerOverview />;
}

function InterviewerOverview() {
  const navigate = useNavigate();

  const { t, userName, isCandidate, isInterviewer, interviews, stats, getScore, hiring: hiringData } =
    useDashboard();

  const hiring = hiringData?.summary || null;
  const allCandidates = hiringData?.candidates || [];

  const [reviewQuery, setReviewQuery] = useState("");
  const rq = reviewQuery.trim().toLowerCase();

  const needsReview = allCandidates
    .filter(
      (c) =>
        c.session_status === "completed" &&
        (c.decision === "pending" || c.decision === "on_hold")
    )
    .filter(
      (c) =>
        !rq ||
        c.candidate.name?.toLowerCase().includes(rq) ||
        c.candidate.email?.toLowerCase().includes(rq) ||
        c.interview_title?.toLowerCase().includes(rq)
    )
    .slice(0, 5);

  const topCandidates = [...allCandidates]
    .filter((c) => c.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const pending = interviews.filter(
    (i) => getSessionState(i.session) !== "completed"
  );

  // in-progress first, then not started
  pending.sort((a, b) => {
    const rank = { in_progress: 0, not_started: 1 };
    return rank[getSessionState(a.session)] - rank[getSessionState(b.session)];
  });

  const recentlyCompleted = interviews
    .filter((i) => getSessionState(i.session) === "completed")
    .sort(
      (a, b) =>
        new Date(b.session?.ended_at || 0) - new Date(a.session?.ended_at || 0)
    )
    .slice(0, 4);

  return (
    <div className="space-y-8 p-3">
      {/* Welcome banner with deep 3D shadow */}
      <header className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(8_11_20_0.25)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-violet-100/80 via-purple-100/50 to-transparent rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-3 tracking-tight">
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                {userName}
              </span>
            </h1>
            <p className="text-slate-600 text-base md:text-lg max-w-2xl leading-relaxed font-normal">
              {isCandidate
                ? "Your high-performance AI interview modules are ready. Take your time, maintain focus, and begin whenever you're prepared."
                : "Manage active candidate pipelines, evaluate automated AI grading metrics, and provision new technical assessments."}
            </p>
          </div>
        </div>
      </header>

      {/* Stats Section with Ultra Bright Backgrounds & Deep 3D Dark Hover Shadows */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Assessments Card */}
        <div className="bg-gradient-to-br from-purple-100/90 via-white to-purple-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(147,51,235,0.18)] hover:shadow-[0_25px_50px_rgba(147,51,235,0.35)] hover:-translate-y-2.5 transition-all duration-300 border-2 border-purple-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-purple-800 uppercase">Total Assessments</span>
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
              <IconLayers className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{stats.total}</div>
            <p className="text-xs text-purple-900 font-bold">{isCandidate ? "Assigned to you" : "Created by you"}</p>
          </div>
        </div>

        {/* Completed Card */}
        <div className="bg-gradient-to-br from-emerald-100/90 via-white to-emerald-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(16,185,129,0.18)] hover:shadow-[0_25px_50px_rgba(16,185,129,0.35)] hover:-translate-y-2.5 transition-all duration-300 border-2 border-emerald-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-emerald-800 uppercase">Completed</span>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
              <IconAward className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{stats.completed}</div>
            <p className="text-xs text-emerald-900 font-bold">{`${stats.inProgress} in progress · ${stats.notStarted} not started`}</p>
          </div>
        </div>

        {/* Avg. Score Card */}
        <div className="bg-gradient-to-br from-amber-100/90 via-white to-amber-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(245,158,11,0.18)] hover:shadow-[0_25px_50px_rgba(245,158,11,0.35)] hover:-translate-y-2.5 transition-all duration-300 border-2 border-amber-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-amber-800 uppercase">Avg. Score</span>
            <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
              <IconTrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{stats.averageScore !== null ? `${stats.averageScore}%` : "—"}</div>
            <p className="text-xs text-amber-900 font-bold truncate">
              {stats.averageScore !== null
                ? `Across ${stats.scoredCount || stats.completed} evaluated assessment${(stats.scoredCount || stats.completed) === 1 ? "" : "s"}`
                : "No evaluated assessments yet"}
            </p>
          </div>
        </div>

        {/* Avg. Duration Card */}
        <div className="bg-gradient-to-br from-cyan-100/90 via-white to-cyan-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(6,182,212,0.18)] hover:shadow-[0_25px_50px_rgba(6,182,212,0.35)] hover:-translate-y-2.5 transition-all duration-300 border-2 border-cyan-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-cyan-800 uppercase">Avg. Duration</span>
            <div className="w-12 h-12 rounded-2xl bg-cyan-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
              <IconHourglass className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{stats.averageDuration ? `${stats.averageDuration}m` : "—"}</div>
            <p className="text-xs text-cyan-900 font-bold">Per assessment session</p>
          </div>
        </div>
      </section>

      {/* Candidates waiting for the interviewer */}
      {isInterviewer && hiring && (
        <section className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(8_11_20_0.25)] transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">
              {hiring.pending_review > 0
                ? `${hiring.pending_review} candidate${hiring.pending_review === 1 ? "" : "s"} waiting for your decision`
                : "No candidates waiting"}
            </h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              {hiring.total} attended · {hiring.selected} selected · {hiring.rejected} rejected
              {hiring.flagged > 0 ? ` · ${hiring.flagged} monitoring flag${hiring.flagged === 1 ? "" : "s"}` : ""}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/dashboard/controls")}
              className="px-6 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
            >
              Review candidates
            </button>
            <button
              onClick={() => navigate("/dashboard/controls")}
              className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold active:scale-95 transition-all shadow-sm"
            >
              Interview controls
            </button>
          </div>
        </section>
      )}

      {/* Needs review + top candidates */}
      {isInterviewer && allCandidates.length > 0 && (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 p-8 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)] transition-all duration-300">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black tracking-tight text-slate-900">Needs your review</h2>
              <Link to="/dashboard/controls" className="text-xs font-black text-violet-600 hover:text-violet-800 hover:underline">
                See all
              </Link>
            </div>

            <input
              type="text"
              value={reviewQuery}
              onChange={(e) => setReviewQuery(e.target.value)}
              placeholder="Search name, email or interview..."
              className="w-full mb-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium text-xs outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition shadow-inner"
            />

            {needsReview.length === 0 ? (
              <p className="text-sm opacity-70 font-medium">{rq ? "No match." : "You are all caught up."}</p>
            ) : (
              <ul className="space-y-2">
                {needsReview.map((c) => (
                  <li key={c.session_id}>
                    <button data-plain
                      onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                      className="w-full flex items-center gap-3 py-3.5 px-4 text-left rounded-2xl border border-transparent hover:border-violet-300 bg-slate-50/80 hover:bg-gradient-to-r hover:from-violet-100 hover:to-indigo-50 hover:shadow-lg hover:shadow-violet-500/10 hover:scale-[1.01] transition-all duration-200"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-slate-900 text-sm truncate">{c.candidate.name}</span>
                        <span className="block text-xs font-bold text-slate-500 truncate">{c.interview_title}</span>
                      </span>
                      {c.proctoring.flagged && (
                        <span className="text-[10px] font-black tracking-wider text-rose-700 bg-rose-100 border border-rose-300 px-2.5 py-1 rounded-full shadow-sm">FLAGGED</span>
                      )}
                      <span className={`text-xl font-black ${scoreText(c.score)}`}>
                        {c.score === null ? "—" : Math.round(c.score)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 p-8 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)] transition-all duration-300">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black tracking-tight text-slate-900">Top candidates</h2>
              <Link to="/dashboard/analytics" className="text-xs font-black text-violet-600 hover:text-violet-800 hover:underline">
                Analytics
              </Link>
            </div>

            {topCandidates.length === 0 ? (
              <p className="text-sm opacity-70 font-medium">Scores appear once candidates finish.</p>
            ) : (
              <ul className="space-y-2">
                {topCandidates.map((c, i) => (
                  <li key={c.session_id}>
                    <button data-plain
                      onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                      className="w-full flex items-center gap-3 py-3.5 px-4 text-left rounded-2xl border border-transparent hover:border-indigo-300 bg-slate-50/80 hover:bg-gradient-to-r hover:from-indigo-100 hover:to-purple-50 hover:shadow-lg hover:shadow-indigo-500/10 hover:scale-[1.01] transition-all duration-200"
                    >
                      <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-slate-900 text-sm truncate">{c.candidate.name}</span>
                        <span className="block text-xs font-bold text-slate-500 truncate">{c.interview_title}</span>
                      </span>
                      <DecisionBadge value={c.decision} />
                      <span className={`text-xl font-black ${scoreText(c.score)}`}>
                        {Math.round(c.score)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Needs attention (Candidate Assessment Cards with Bright 3D Styled Wrapper) */}
      {isCandidate && (
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xl font-bold text-slate-800">Continue where you left off</h2>
            <Link to="/dashboard/assessments" className="text-sm font-bold text-violet-600 hover:underline">
              View all assessments
            </Link>
          </div>

          {pending.length === 0 ? (
            <div className="p-10 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 text-center">
              <p className="font-bold mb-1 text-slate-800">Nothing pending</p>
              <p className="text-sm text-slate-500">
                {stats.total === 0
                  ? "No assessments have been assigned to you yet."
                  : "You've completed every assigned assessment."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 [&>*]:rounded-[2.5rem] [&>*]:bg-gradient-to-br [&>*]:from-white [&>*]:via-slate-50/50 [&>*]:to-indigo-50/20 [&>*]:shadow-[0_20px_50px_rgba(8_11_20_0.15)] [&>*]:border [&>*]:border-slate-200/80 [&>*]:hover:-translate-y-2 [&>*]:hover:shadow-[0_30px_70px_rgba(8_11_20_0.28)] [&>*]:transition-all [&>*]:duration-300">
              {pending.slice(0, 3).map((i) => (
                <InterviewCard key={i.id} interview={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Interviewer: latest created (Interviewer Assessment Cards with Bright 3D Styled Wrapper & Automatic Role Icons) */}
      {isInterviewer && (
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xl font-bold text-slate-800">Your latest assessments</h2>
            <Link to="/dashboard/assessments" className="text-sm font-bold text-violet-600 hover:underline">
              Manage all
            </Link>
          </div>

          {interviews.length === 0 ? (
            <div className="p-10 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 text-center">
              <p className="font-bold mb-1 text-slate-800">No assessments yet</p>
              <p className="text-sm text-slate-500">Create your first assessment to start evaluating candidates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 [&>*]:rounded-[2.5rem] [&>*]:bg-gradient-to-br [&>*]:from-white [&>*]:via-slate-50/50 [&>*]:to-violet-50/20 [&>*]:shadow-[0_20px_50px_rgba(8_11_20_0.15)] [&>*]:border [&>*]:border-slate-200/80 [&>*]:hover:-translate-y-2 [&>*]:hover:shadow-[0_30px_70px_rgba(8_11_20_0.28)] [&>*]:transition-all [&>*]:duration-300">
              {interviews.slice(0, 3).map((i) => (
                <InterviewCard key={i.id} interview={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recent results */}
      {isCandidate && (
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xl font-bold text-slate-800">Recent results</h2>
            <Link to="/dashboard/analytics" className="text-sm font-bold text-violet-600 hover:underline">
              Full analytics
            </Link>
          </div>

          {recentlyCompleted.length === 0 ? (
            <div className="p-10 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 text-center text-sm text-slate-500">
              Completed assessments and their scores will appear here.
            </div>
          ) : (
            <div className="rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {recentlyCompleted.map((i) => {
                const score = getScore(i);

                return (
                  <button data-plain
                    key={i.id}
                    onClick={() =>
                      navigate(`/interviews/${i.id}/sessions/${i.session.id}/report`)
                    }
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{i.title || i.name}</p>
                      <p className="text-xs text-slate-400">
                        Completed {formatDate(i.session?.ended_at)}
                      </p>
                    </div>
                    <span className="text-lg font-black text-emerald-600 shrink-0">
                      {score !== null ? `${Math.round(score)}%` : "Report"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}