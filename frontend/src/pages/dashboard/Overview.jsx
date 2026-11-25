import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import InterviewCard from "../../components/dashboard/InterviewCard";
import StatCard from "../../components/dashboard/StatCard";
import CandidateHome from "./CandidateHome";
import { DecisionBadge, scoreText } from "../../components/dashboard/hiring";
import {
  IconActivity,
  IconArrowRight,
  IconAward,
  IconBarChart,
  IconCalendar,
  IconFileText,
  IconHourglass,
  IconLayers,
  IconPlus,
  IconSearch,
  IconShield,
  IconSparkles,
  IconTrendingUp,
} from "../../components/dashboard/icons";
import { formatDate, useDashboard } from "../../context/DashboardContext";
import { Orbs, TitleIcon } from "../../components/ui";

export default function Overview() {
  const { isCandidate } = useDashboard();

  // Candidates get a separate home: job details + interview process only.
  return isCandidate ? <CandidateHome /> : <InterviewerOverview />;
}

// ============================================================
// Small building blocks
// ============================================================

function Card({ title, action, children, className = "", icon }) {
  return (
    <section className={`ui-card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <div className="flex items-center gap-3">
              <TitleIcon icon={icon} />
              <h2 className="ui-section-title">{title}</h2>
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div className="flex h-full min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (d) =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Interviews finished per day for the last 14 days (real data from /hiring)
function useDailyCompletions(candidates) {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getTime() - (13 - i) * DAY_MS);
      return { date: d, key: dayKey(d), count: 0, scores: [] };
    });
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));

    candidates.forEach((c) => {
      if (!c.ended_at) return;
      const d = new Date(c.ended_at);
      if (Number.isNaN(d.getTime())) return;
      const bucket = byKey[dayKey(d)];
      if (!bucket) return;
      bucket.count += 1;
      if (c.score !== null && c.score !== undefined) bucket.scores.push(Number(c.score));
    });

    return days.map((d) => ({
      ...d,
      avg: d.scores.length
        ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length)
        : null,
    }));
  }, [candidates]);
}

// Single-series bar chart with per-bar hover tooltip
function CompletionsChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <div className="mb-4 flex items-end gap-3">
        <p className="font-display text-3xl font-extrabold tracking-tight text-navy-900">{total}</p>
        <p className="pb-1 text-xs font-medium text-slate-500">interviews completed in the last 14 days</p>
      </div>

      <div className="relative flex h-44 gap-2">
        {/* y axis */}
        <div className="flex w-6 flex-col justify-between pb-6 text-right text-[10px] text-slate-400">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* recessive grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-slate-100" />
            ))}
          </div>

          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]">
            {days.map((d) => {
              const h = (d.count / max) * 100;
              return (
                <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
                  {/* hit target is the full column */}
                  <div
                    className="w-full max-w-7 rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-600"
                    style={{ height: d.count ? `${Math.max(h, 3)}%` : "0%" }}
                  />
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-navy-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
                    <p className="font-semibold">
                      {d.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-slate-300">
                      {d.count} completed{d.avg !== null ? ` · avg ${d.avg}%` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* x labels: first, middle, last */}
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-slate-400">
            {[days[0], days[7], days[13]].map((d) => (
              <span key={d.key}>
                {d.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Score distribution: one hue, horizontal bars
function ScoreDistribution({ candidates }) {
  const buckets = useMemo(() => {
    const b = [
      { label: "80 – 100", min: 80, max: 101, count: 0 },
      { label: "60 – 79", min: 60, max: 80, count: 0 },
      { label: "40 – 59", min: 40, max: 60, count: 0 },
      { label: "0 – 39", min: 0, max: 40, count: 0 },
    ];
    candidates.forEach((c) => {
      if (c.score === null || c.score === undefined) return;
      const s = Number(c.score);
      const hit = b.find((x) => s >= x.min && s < x.max);
      if (hit) hit.count += 1;
    });
    return b;
  }, [candidates]);

  const total = buckets.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  if (!total) return <Empty>Scores appear once candidates finish.</Empty>;

  return (
    <ul className="space-y-3">
      {buckets.map((b) => (
        <li key={b.label} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3 text-xs" title={`${b.count} candidate(s) scored ${b.label}`}>
          <span className="font-medium text-slate-500">{b.label}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-semibold text-navy-900">{b.count}</span>
        </li>
      ))}
    </ul>
  );
}

function QuickAction({ icon: Icon, title, desc, onClick }) {
  return (
    <button
      data-plain
      data-tilt="0.6"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[var(--shadow-card)] transition hover:border-brand-300"
    >
      <span data-depth="1" className="ui-icon-3d flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-navy-900 text-white transition group-hover:from-brand-400 group-hover:to-brand-600">
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-navy-900">{title}</span>
        <span className="block truncate text-xs text-slate-500">{desc}</span>
      </span>
      <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600">
        <IconArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
}

// Decorative illustration for the welcome banner
// Animated graphics layer behind the welcome banner (pure decoration).
function HeroFx() {
  const sparks = [
    [8, 18, 0], [30, 78, 0.8], [52, 12, 1.6], [64, 70, 0.4], [86, 22, 1.2], [94, 80, 2],
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg className="hx-wave absolute inset-x-0 bottom-0 h-32 w-full" viewBox="0 0 1200 160" preserveAspectRatio="none">
        <path d="M0 110 C 200 60, 380 150, 600 100 S 1000 50, 1200 100" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
        <path d="M0 130 C 240 90, 420 170, 640 120 S 1020 80, 1200 125" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
        <path d="M0 90 C 180 40, 400 130, 620 80 S 980 30, 1200 70" fill="none" stroke="rgba(251,207,232,0.35)" strokeWidth="1.5" />
      </svg>
      {sparks.map(([x, y, d], i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="hx-spark absolute h-3.5 w-3.5 text-white"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}
        >
          <path fill="currentColor" d="M12 0c.7 6.3 5.7 11.3 12 12-6.3.7-11.3 5.7-12 12-.7-6.3-5.7-11.3-12-12C6.3 11.3 11.3 6.3 12 0z" />
        </svg>
      ))}
    </div>
  );
}

function HeroIllustration() {
  return (
    <svg viewBox="0 0 220 150" className="h-36 w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="hg1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <rect x="20" y="18" width="150" height="100" rx="14" fill="#ffffff" fillOpacity=".08" stroke="#ffffff" strokeOpacity=".18" />
      <rect x="32" y="30" width="70" height="52" rx="9" fill="#ffffff" fillOpacity=".1" />
      <circle cx="67" cy="50" r="10" fill="url(#hg1)" />
      <path d="M50 76c3-9 10-13 17-13s14 4 17 13" fill="url(#hg1)" opacity=".85" />
      <rect x="110" y="32" width="48" height="6" rx="3" fill="#ffffff" fillOpacity=".35" />
      <rect x="110" y="44" width="36" height="6" rx="3" fill="#ffffff" fillOpacity=".2" />
      <rect x="110" y="56" width="42" height="6" rx="3" fill="#ffffff" fillOpacity=".2" />
      <rect x="32" y="92" width="126" height="14" rx="7" fill="#ffffff" fillOpacity=".08" />
      <rect x="32" y="92" width="84" height="14" rx="7" fill="url(#hg1)" />
      <g transform="translate(150 82)">
        <circle r="30" fill="#0d1f3c" stroke="url(#hg1)" strokeWidth="3" />
        <path d="M-10 1 -3 8 11 -7" fill="none" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="196" cy="26" r="4" fill="#c4b5fd" />
      <circle cx="12" cy="110" r="3" fill="#d946ef" />
    </svg>
  );
}

// ============================================================
// INTERVIEWER DASHBOARD
// ============================================================

function InterviewerOverview() {
  const navigate = useNavigate();

  const { userName, interviews, stats, hiring: hiringData } = useDashboard();

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
    .slice(0, 4);

  const recentActivity = [...allCandidates]
    .filter((c) => c.ended_at || c.started_at)
    .sort(
      (a, b) =>
        new Date(b.ended_at || b.started_at) - new Date(a.ended_at || a.started_at)
    )
    .slice(0, 6);

  const days = useDailyCompletions(allCandidates);

  const decided = hiring ? hiring.selected + hiring.rejected : 0;
  const successRate = decided ? Math.round((hiring.selected / decided) * 100) : null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const pipeline = [
    { label: "Completed", value: stats.completed, bar: "bg-emerald-500" },
    { label: "In progress", value: stats.inProgress, bar: "bg-brand-400" },
    { label: "Not started", value: stats.notStarted, bar: "bg-slate-300" },
  ];

  return (
    <div className="space-y-6">
      {/* ================= Welcome banner ================= */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3b0d7a] via-[#5b21b6] to-[#86198f] p-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_5px_0_#2e1065,0_30px_60px_-25px_rgba(46,16,101,0.8)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-300/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
        <Orbs preset="hero" />
        <HeroFx />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <span className="ui-pill bg-white/20 text-white ring-1 ring-white/35 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {greeting}
            </span>
            <button
              data-plain
              type="button"
              onClick={() => navigate("/dashboard/live-guard")}
              className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/35 backdrop-blur transition hover:bg-white/30"
            >
              <span className="lm-live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Live Interview Guard · Meet · Zoom · Teams
            </button>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Welcome back, <span className="text-white [text-shadow:0_2px_0_rgba(91,33,182,0.5)]">{userName}</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/90 sm:text-[15px]">
              {hiring && hiring.pending_review > 0
                ? `${hiring.pending_review} candidate${hiring.pending_review === 1 ? " is" : "s are"} waiting for your decision. Review AI scores, transcripts and monitoring flags in one place.`
                : "Manage candidate pipelines, review AI-graded interviews and launch new assessments."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/create-interview")}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-700 shadow-[0_4px_0_#ddd6fe,0_14px_24px_-10px_rgba(46,16,101,0.6)] hover:bg-brand-50"
              >
                <IconPlus className="h-4 w-4" /> Create interview
              </button>
              <button
                data-plain
                onClick={() => navigate("/dashboard/controls")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/45 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
              >
                Review candidates <IconArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative hidden shrink-0 md:block">
            {/* rotating dashed ring + mini live chart around the illustration */}
            <svg className="hx-ring absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)]" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeDasharray="4 7" />
              <circle cx="100" cy="8" r="4" fill="#fff" />
            </svg>
            <div className="[filter:drop-shadow(0_24px_30px_rgba(46,16,101,0.4))] [animation:ui-float_8s_ease-in-out_infinite]">
              <HeroIllustration />
            </div>
            <div className="absolute -bottom-4 -left-10 flex h-12 items-end gap-1 rounded-xl bg-white/20 px-3 py-2 ring-1 ring-white/35 backdrop-blur" aria-hidden="true">
              {[0.5, 0.8, 0.4, 1, 0.7, 0.9].map((h, i) => (
                <span key={i} className="hx-bar w-1.5 rounded-full bg-white" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.25}s` }} />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ================= KPI cards ================= */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total assessments"
          value={stats.total}
          icon={IconLayers}
          variant="teal"
          change="Created by you"
        />
        <StatCard
          title="Completed interviews"
          value={stats.completed}
          icon={IconAward}
          variant="emerald"
          change={`${stats.inProgress} in progress · ${stats.notStarted} not started`}
        />
        <StatCard
          title="Average score"
          value={stats.averageScore !== null ? `${stats.averageScore}%` : "—"}
          icon={IconTrendingUp}
          variant="amber"
          change={
            stats.averageScore !== null
              ? `Across ${stats.scoredCount || stats.completed} evaluated assessment${(stats.scoredCount || stats.completed) === 1 ? "" : "s"}`
              : "No evaluated assessments yet"
          }
        />
        <StatCard
          title="Average duration"
          value={stats.averageDuration ? `${stats.averageDuration}m` : "—"}
          icon={IconHourglass}
          variant="navy"
          change="Per assessment session"
        />
      </section>

      {/* ================= Hiring pipeline strip ================= */}
      {hiring && (
        <section data-tilt="0.3" className="ui-card grid grid-cols-2 divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {[
            { label: "Candidates attended", value: hiring.total, dot: "bg-navy-500" },
            { label: "Pending review", value: hiring.pending_review, dot: "bg-amber-400" },
            { label: "Selected", value: hiring.selected, dot: "bg-emerald-500" },
            { label: "Rejected", value: hiring.rejected, dot: "bg-rose-400" },
            { label: "Monitoring flags", value: hiring.flagged, dot: "bg-orange-500" },
          ].map((k) => (
            <div key={k.label} className="px-5 py-4">
              <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className={`h-2 w-2 rounded-full ${k.dot}`} />
                {k.label}
              </p>
              <p className="mt-1 text-xl font-bold text-navy-900">{k.value}</p>
            </div>
          ))}
        </section>
      )}

      {/* ================= Charts row ================= */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          icon={IconBarChart}
          title="Interview performance"
          className="xl:col-span-2"
          action={
            <Link to="/dashboard/analytics" className="ui-link">
              View analytics
            </Link>
          }
        >
          <CompletionsChart days={days} />
        </Card>

        <Card icon={IconTrendingUp} title="Success rate">
          <div className="flex items-end gap-2">
            <p className="font-display text-4xl font-extrabold tracking-tight text-navy-900">
              {successRate !== null ? `${successRate}%` : "—"}
            </p>
            <p className="pb-1.5 text-xs text-slate-500">
              {decided ? `${hiring.selected} of ${decided} decisions` : "No decisions yet"}
            </p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-fuchsia-500"
              style={{ width: `${successRate || 0}%` }}
            />
          </div>

          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Score distribution
            </p>
            <ScoreDistribution candidates={allCandidates} />
          </div>
        </Card>
      </section>

      {/* ================= Review + top candidates ================= */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          icon={IconHourglass}
          title="Needs your review"
          action={
            <Link to="/dashboard/controls" className="ui-link">
              See all
            </Link>
          }
        >
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch />
            </span>
            <input
              type="text"
              value={reviewQuery}
              onChange={(e) => setReviewQuery(e.target.value)}
              placeholder="Search name, email or interview…"
              className="ui-input pl-10"
            />
          </div>

          {needsReview.length === 0 ? (
            <Empty>{rq ? "No match." : "You are all caught up. 🎉"}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {needsReview.map((c) => (
                <li key={c.session_id}>
                  <button
                    data-plain
                    onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-700">
                      {(c.candidate.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">{c.candidate.name}</span>
                      <span className="block truncate text-xs text-slate-500">{c.interview_title}</span>
                    </span>
                    {c.proctoring.flagged && (
                      <span className="ui-pill bg-rose-50 text-rose-700 ring-1 ring-rose-200">Flagged</span>
                    )}
                    <span className={`w-10 text-right text-lg font-bold ${scoreText(c.score)}`}>
                      {c.score === null ? "—" : Math.round(c.score)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={IconAward}
          title="Top candidates"
          action={
            <Link to="/dashboard/analytics" className="ui-link">
              Analytics
            </Link>
          }
        >
          {topCandidates.length === 0 ? (
            <Empty>Scores appear once candidates finish.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topCandidates.map((c, i) => (
                <li key={c.session_id}>
                  <button
                    data-plain
                    onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        i === 0
                          ? "bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      #{i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">{c.candidate.name}</span>
                      <span className="block truncate text-xs text-slate-500">{c.interview_title}</span>
                    </span>
                    <DecisionBadge value={c.decision} />
                    <span className={`w-10 text-right text-lg font-bold ${scoreText(c.score)}`}>
                      {Math.round(c.score)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ================= Activity + pipeline + quick actions ================= */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card icon={IconActivity} title="Recent activity" className="xl:col-span-2">
          {recentActivity.length === 0 ? (
            <Empty>Interview activity will appear here.</Empty>
          ) : (
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
              {recentActivity.map((c) => {
                const done = c.session_status === "completed";
                const terminated = c.session_status === "terminated";
                return (
                  <li key={c.session_id} className="relative flex items-start gap-4 pl-0">
                    <span
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                        terminated
                          ? "bg-rose-50 text-rose-600"
                          : done
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      <IconActivity className="h-4 w-4" />
                    </span>
                    <button
                      data-plain
                      onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm text-navy-900">
                        <span className="font-semibold">{c.candidate.name}</span>{" "}
                        <span className="text-slate-500">
                          {terminated ? "was stopped in" : done ? "completed" : "started"}
                        </span>{" "}
                        <span className="font-medium">{c.interview_title}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(c.ended_at || c.started_at)}
                        {c.score !== null && c.score !== undefined ? ` · Score ${Math.round(c.score)}` : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card icon={IconLayers} title="Interview pipeline">
            <div className="space-y-3">
              {pipeline.map((p) => (
                <div key={p.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-600">{p.label}</span>
                    <span className="font-semibold text-navy-900">{p.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${p.bar}`}
                      style={{ width: `${stats.total ? (p.value / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card icon={IconSparkles} title="Quick actions">
            <div className="space-y-2">
              <QuickAction icon={IconPlus} title="Create interview" desc="Set up questions & invite candidates" onClick={() => navigate("/create-interview")} />
              <QuickAction icon={IconCalendar} title="Send invitation" desc="Schedule a candidate interview" onClick={() => navigate("/dashboard/scheduling")} />
              <QuickAction icon={IconShield} title="Interview controls" desc="Monitoring, invitations, decisions" onClick={() => navigate("/dashboard/controls")} />
              <QuickAction icon={IconFileText} title="Reports" desc="Scored reports and PDF downloads" onClick={() => navigate("/dashboard/reports")} />
              
            </div>
          </Card>
        </div>
      </section>

      {/* ================= Latest assessments ================= */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="ui-section-title text-lg">Your latest assessments</h2>
          <Link to="/dashboard/assessments" className="ui-link">
            Manage all
          </Link>
        </div>

        {interviews.length === 0 ? (
          <Card>
            <Empty>Create your first assessment to start evaluating candidates.</Empty>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 [&>*]:ui-card [&>*]:ui-card-hover">
            {interviews.slice(0, 3).map((i) => (
              <InterviewCard key={i.id} interview={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
