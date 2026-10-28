import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import api from "../../services/api";
import StatCard from "../../components/dashboard/StatCard";
import {
  DecisionBadge,
  fmtDuration,
  scoreText,
} from "../../components/dashboard/hiring";
import {
  IconAward,
  IconHourglass,
  IconLayers,
  IconShield,
  IconTrendingUp,
} from "../../components/dashboard/icons";
import { useDashboard } from "../../context/DashboardContext";

function Bar({ label, value, max, tone }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs font-bold mb-2 text-slate-700">
        <span className="tracking-wide uppercase">{label}</span>
        <span className="text-sm font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg">{value}</span>
      </div>
      <div className="h-4 rounded-full bg-slate-100 p-0.5 overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full ${tone} transition-all duration-500 shadow-md`}
          style={{ width: `${Math.max(value > 0 ? 5 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const { isCandidate } = useDashboard();

  // Candidates do not see scores or analysis.
  if (isCandidate) {
    return <Navigate to="/dashboard" replace />;
  }

  return <InterviewerAnalytics />;
}

function InterviewerAnalytics() {
  const navigate = useNavigate();
  const { t } = useDashboard();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api
      .get("/hiring/analytics")
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Could not load analytics.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm opacity-70 animate-pulse">Loading analytics...</p>;
  }

  const f = data.funnel;
  const maxFunnel = Math.max(f.attended, 1);
  const maxBucket = Math.max(...data.score_buckets.map((b) => b.count), 1);

  return (
    <div className="space-y-10 p-2">
      <header className="px-1">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Analytics & Reports</h1>
        <p className="text-slate-600 mt-2 text-sm">
          How your hiring pipeline is doing across all your interviews.
        </p>
      </header>

      {/* Styled Stat Cards with 3D Shadows & Gradient Backgrounds */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Attended Card */}
        <div className="bg-gradient-to-br from-purple-100/90 via-white to-purple-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(147,51,235,0.18)] hover:shadow-[0_25px_50px_rgba(147,51,235,0.35)] hover:-translate-y-2 transition-all duration-300 border-2 border-purple-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-purple-800 uppercase">Attended</span>
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/50 group-hover:scale-110 transition-all duration-300">
              <IconLayers className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{f.attended}</div>
            <p className="text-xs text-purple-900 font-bold">{`${f.completed} completed`}</p>
          </div>
        </div>

        {/* Avg. Score Card */}
        <div className="bg-gradient-to-br from-emerald-100/90 via-white to-emerald-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(16,185,129,0.18)] hover:shadow-[0_25px_50px_rgba(16,185,129,0.35)] hover:-translate-y-2 transition-all duration-300 border-2 border-emerald-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-emerald-800 uppercase">Avg. Score</span>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 group-hover:scale-110 transition-all duration-300">
              <IconTrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {data.avg_score !== null ? `${data.avg_score}%` : "—"}
            </div>
            <p className="text-xs text-emerald-900 font-bold">Across scored interviews</p>
          </div>
        </div>

        {/* Avg. Time Card */}
        <div className="bg-gradient-to-br from-amber-100/90 via-white to-amber-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(245,158,11,0.18)] hover:shadow-[0_25px_50px_rgba(245,158,11,0.35)] hover:-translate-y-2 transition-all duration-300 border-2 border-amber-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-amber-800 uppercase">Avg. Time</span>
            <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/50 group-hover:scale-110 transition-all duration-300">
              <IconHourglass className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {fmtDuration(data.avg_duration_seconds)}
            </div>
            <p className="text-xs text-amber-900 font-bold">Per completed interview</p>
          </div>
        </div>

        {/* Monitoring Flags Card */}
        <div className="bg-gradient-to-br from-rose-100/90 via-white to-rose-50 p-6 rounded-[2rem] shadow-[0_15px_35px_rgba(244,63,94,0.18)] hover:shadow-[0_25px_50px_rgba(244,63,94,0.35)] hover:-translate-y-2 transition-all duration-300 border-2 border-rose-200/80 flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black tracking-wider text-rose-800 uppercase">Monitoring Flags</span>
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/50 group-hover:scale-110 transition-all duration-300">
              <IconShield className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 mb-1">{data.flagged}</div>
            <p className="text-xs text-rose-900 font-bold">Ended early or flagged</p>
          </div>
        </div>
      </section>

      {/* Hiring Funnel & Score Distribution with Enhanced 3D Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className={`rounded-[2.5rem] border ${t.card} bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] p-8 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)] transition-all duration-300`}>
          <h2 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-3">
            <span className="w-3.5 h-3.5 rounded-full bg-violet-600"></span>
            Hiring funnel
          </h2>
          <div className="space-y-6">
            <Bar label="Attended" value={f.attended} max={maxFunnel} tone="bg-gradient-to-r from-slate-700 to-slate-900" />
            <Bar label="Completed" value={f.completed} max={maxFunnel} tone="bg-gradient-to-r from-slate-700 to-slate-900" />
            <Bar label="Reviewed by you" value={f.reviewed} max={maxFunnel} tone="bg-gradient-to-r from-indigo-600 to-violet-600" />
            <Bar label="Selected" value={f.selected} max={maxFunnel} tone="bg-gradient-to-r from-emerald-500 to-teal-600" />
            <Bar label="Rejected" value={f.rejected} max={maxFunnel} tone="bg-gradient-to-r from-rose-500 to-red-600" />
          </div>
        </section>

        <section className={`rounded-[2.5rem] border ${t.card} bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] p-8 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)] transition-all duration-300`}>
          <h2 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-3">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500"></span>
            Score distribution
          </h2>
          <div className="space-y-6">
            {data.score_buckets.map((b, i) => (
              <Bar
                key={b.label}
                label={b.label}
                value={b.count}
                max={maxBucket}
                tone={[
                  "bg-gradient-to-r from-amber-500 to-orange-500",
                  "bg-gradient-to-r from-amber-400 to-yellow-500",
                  "bg-gradient-to-r from-slate-700 to-slate-900",
                  "bg-gradient-to-r from-emerald-500 to-teal-600"
                ][i]}
              />
            ))}
          </div>
        </section>
      </div>

      <section className={`rounded-[2.5rem] border ${t.card} bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] p-8`}>
        <h2 className="font-black text-lg text-slate-900 mb-6">Top candidates</h2>

        {data.top_candidates.length === 0 ? (
          <p className="text-sm opacity-70">Scores appear after candidates finish an interview.</p>
        ) : (
          <ul className="space-y-2">
            {data.top_candidates.map((c, i) => (
              <li key={c.session_id}>
                <button data-plain
                  onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                  className="w-full flex items-center gap-4 py-3.5 px-4 text-left rounded-2xl border border-transparent hover:border-violet-300 bg-slate-50/80 hover:bg-gradient-to-r hover:from-violet-100 hover:to-indigo-50 hover:shadow-lg hover:shadow-violet-500/10 hover:scale-[1.01] transition-all duration-200"
                >
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-black text-slate-900 text-sm truncate">{c.name}</span>
                    <span className="block text-xs font-bold text-slate-500 truncate">{c.interview_title}</span>
                  </span>
                  <DecisionBadge value={c.decision} />
                  <span className={`text-xl font-black ${scoreText(c.score)} w-14 text-right`}>
                    {Math.round(c.score)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`rounded-[2.5rem] border ${t.card} bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] overflow-hidden`}>
        <div className="p-8 pb-4">
          <h2 className="font-black text-lg text-slate-900">By interview</h2>
        </div>

        {data.per_interview.length === 0 ? (
          <p className="text-sm opacity-70 px-8 pb-8">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-y border-slate-200">
                  <th className="px-8 py-3 font-bold">Interview</th>
                  <th className="px-4 py-3 font-bold">Attended</th>
                  <th className="px-4 py-3 font-bold">Completed</th>
                  <th className="px-4 py-3 font-bold">Avg. score</th>
                  <th className="px-4 py-3 font-bold">Selected</th>
                  <th className="px-4 py-3 font-bold">Rejected</th>
                  <th className="px-4 py-3 font-bold">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.per_interview.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-8 py-4 font-bold text-slate-900">{r.title}</td>
                    <td className="px-4 py-4 font-medium">{r.attended}</td>
                    <td className="px-4 py-4 font-medium">{r.completed}</td>
                    <td className={`px-4 py-4 font-black ${scoreText(r.avg_score)}`}>
                      {r.avg_score === null ? "—" : r.avg_score}
                    </td>
                    <td className="px-4 py-4 text-emerald-700 font-bold">{r.selected}</td>
                    <td className="px-4 py-4 text-rose-700 font-bold">{r.rejected}</td>
                    <td className="px-4 py-4 font-medium">{r.flagged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}