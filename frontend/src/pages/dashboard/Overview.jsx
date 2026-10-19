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
    <div className="space-y-12">
      {/* Welcome banner */}
      <header className={`p-10 rounded-[3rem] border ${t.welcome} relative overflow-hidden`}>
        <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                {userName}
              </span>
            </h1>
            <p className="text-base md:text-lg opacity-85 max-w-2xl leading-relaxed">
              {isCandidate
                ? "Your high-performance AI interview modules are ready. Take your time, maintain focus, and begin whenever you're prepared."
                : "Manage active candidate pipelines, evaluate automated AI grading metrics, and provision new technical assessments."}
            </p>
          </div>

        </div>
      </header>

      {/* Stats (all computed from the same de-duplicated list) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Assessments"
          value={stats.total}
          icon={IconLayers}
          change={isCandidate ? "Assigned to you" : "Created by you"}
          variant="purple"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={IconAward}
          change={`${stats.inProgress} in progress · ${stats.notStarted} not started`}
          variant="emerald"
        />
        <StatCard
          title="Avg. Score"
          value={stats.averageScore !== null ? `${stats.averageScore}%` : "—"}
          icon={IconTrendingUp}
          change={
            stats.averageScore !== null
              ? `Across ${stats.scoredCount || stats.completed} evaluated assessment${(stats.scoredCount || stats.completed) === 1 ? "" : "s"}`
              : "No evaluated assessments yet"
          }
          variant="amber"
        />
        <StatCard
          title="Avg. Duration"
          value={stats.averageDuration ? `${stats.averageDuration}m` : "—"}
          icon={IconHourglass}
          change="Per assessment session"
          variant="cyan"
        />
      </section>

      {/* Candidates waiting for the interviewer */}
      {isInterviewer && hiring && (
        <section
          className={`p-8 rounded-[2.5rem] border ${t.card} flex flex-col md:flex-row md:items-center justify-between gap-6`}
        >
          <div>
            <h2 className="text-xl font-black tracking-tight">
              {hiring.pending_review > 0
                ? `${hiring.pending_review} candidate${hiring.pending_review === 1 ? "" : "s"} waiting for your decision`
                : "No candidates waiting"}
            </h2>
            <p className="text-sm opacity-70 mt-1">
              {hiring.total} attended · {hiring.selected} selected · {hiring.rejected} rejected
              {hiring.flagged > 0 ? ` · ${hiring.flagged} monitoring flag${hiring.flagged === 1 ? "" : "s"}` : ""}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/dashboard/controls")}
              className="px-6 py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
            >
              Review candidates
            </button>
            <button
              onClick={() => navigate("/dashboard/controls")}
              className="px-6 py-3.5 border border-white/15 hover:bg-white/10 rounded-2xl font-bold transition"
            >
              Interview controls
            </button>
          </div>
        </section>
      )}

      {/* Needs review + top candidates */}
      {isInterviewer && allCandidates.length > 0 && (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className={`rounded-[2rem] border ${t.card} p-8`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black tracking-tight">Needs your review</h2>
              <Link to="/dashboard/controls" className="text-xs font-bold text-fuchsia-400 hover:underline">
                See all
              </Link>
            </div>

            <input
              type="text"
              value={reviewQuery}
              onChange={(e) => setReviewQuery(e.target.value)}
              placeholder="Search name, email or interview..."
              className={`w-full mb-4 px-4 py-2.5 rounded-xl border ${t.input} text-xs outline-none focus:ring-2 focus:ring-fuchsia-500`}
            />

            {needsReview.length === 0 ? (
              <p className="text-sm opacity-70">{rq ? "No match." : "You are all caught up."}</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {needsReview.map((c) => (
                  <li key={c.session_id}>
                    <button
                      onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                      className="w-full flex items-center gap-3 py-3 text-left hover:bg-white/5 transition rounded-lg px-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold truncate">{c.candidate.name}</span>
                        <span className="block text-xs opacity-60 truncate">{c.interview_title}</span>
                      </span>
                      {c.proctoring.flagged && (
                        <span className="text-[10px] font-bold text-rose-300">FLAGGED</span>
                      )}
                      <span className={`text-lg font-black ${scoreText(c.score)}`}>
                        {c.score === null ? "—" : Math.round(c.score)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`rounded-[2rem] border ${t.card} p-8`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black tracking-tight">Top candidates</h2>
              <Link to="/dashboard/analytics" className="text-xs font-bold text-fuchsia-400 hover:underline">
                Analytics
              </Link>
            </div>

            {topCandidates.length === 0 ? (
              <p className="text-sm opacity-70">Scores appear once candidates finish.</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {topCandidates.map((c, i) => (
                  <li key={c.session_id}>
                    <button
                      onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                      className="w-full flex items-center gap-3 py-3 text-left hover:bg-white/5 transition rounded-lg px-2"
                    >
                      <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold truncate">{c.candidate.name}</span>
                        <span className="block text-xs opacity-60 truncate">{c.interview_title}</span>
                      </span>
                      <DecisionBadge value={c.decision} />
                      <span className={`text-lg font-black ${scoreText(c.score)}`}>
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

      {/* Needs attention */}
      {isCandidate && (
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xl font-bold">Continue where you left off</h2>
            <Link to="/dashboard/assessments" className="text-sm font-bold text-fuchsia-400 hover:underline">
              View all assessments
            </Link>
          </div>

          {pending.length === 0 ? (
            <div className={`p-10 rounded-[2rem] border ${t.card} text-center`}>
              <p className="font-bold mb-1">Nothing pending</p>
              <p className="text-sm opacity-70">
                {stats.total === 0
                  ? "No assessments have been assigned to you yet."
                  : "You've completed every assigned assessment."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {pending.slice(0, 3).map((i) => (
                <InterviewCard key={i.id} interview={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Interviewer: latest created */}
      {isInterviewer && (
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xl font-bold">Your latest assessments</h2>
            <Link to="/dashboard/assessments" className="text-sm font-bold text-fuchsia-400 hover:underline">
              Manage all
            </Link>
          </div>

          {interviews.length === 0 ? (
            <div className={`p-10 rounded-[2rem] border ${t.card} text-center`}>
              <p className="font-bold mb-1">No assessments yet</p>
              <p className="text-sm opacity-70">Create your first assessment to start evaluating candidates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
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
            <h2 className="text-xl font-bold">Recent results</h2>
            <Link to="/dashboard/analytics" className="text-sm font-bold text-fuchsia-400 hover:underline">
              Full analytics
            </Link>
          </div>

          {recentlyCompleted.length === 0 ? (
            <div className={`p-10 rounded-[2rem] border ${t.card} text-center text-sm opacity-80`}>
              Completed assessments and their scores will appear here.
            </div>
          ) : (
            <div className={`rounded-[2rem] border ${t.card} divide-y divide-white/10 overflow-hidden`}>
              {recentlyCompleted.map((i) => {
                const score = getScore(i);

                return (
                  <button
                    key={i.id}
                    onClick={() =>
                      navigate(`/interviews/${i.id}/sessions/${i.session.id}/report`)
                    }
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/5 transition"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{i.title || i.name}</p>
                      <p className="text-xs opacity-60">
                        Completed {formatDate(i.session?.ended_at)}
                      </p>
                    </div>
                    <span className="text-lg font-black text-emerald-400 shrink-0">
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
