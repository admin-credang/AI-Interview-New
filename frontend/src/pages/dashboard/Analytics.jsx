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
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="opacity-80">{label}</span>
        <span className="font-black">{value}</span>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
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
      <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
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
    <div className="space-y-10">
      <header className="px-1">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Analytics & Reports</h1>
        <p className="opacity-70 mt-2 text-sm">
          How your hiring pipeline is doing across all your interviews.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="Attended" value={f.attended} icon={IconLayers} change={`${f.completed} completed`} variant="purple" />
        <StatCard
          title="Avg. score"
          value={data.avg_score !== null ? `${data.avg_score}%` : "—"}
          icon={IconTrendingUp}
          change="Across scored interviews"
          variant="emerald"
        />
        <StatCard
          title="Avg. time"
          value={fmtDuration(data.avg_duration_seconds)}
          icon={IconHourglass}
          change="Per completed interview"
          variant="amber"
        />
        <StatCard title="Monitoring flags" value={data.flagged} icon={IconShield} change="Ended early or flagged" variant="cyan" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className={`rounded-[2rem] border ${t.card} p-8`}>
          <h2 className="font-bold text-lg mb-6">Hiring funnel</h2>
          <div className="space-y-5">
            <Bar label="Attended" value={f.attended} max={maxFunnel} tone="bg-fuchsia-500" />
            <Bar label="Completed" value={f.completed} max={maxFunnel} tone="bg-purple-500" />
            <Bar label="Reviewed by you" value={f.reviewed} max={maxFunnel} tone="bg-sky-500" />
            <Bar label="Selected" value={f.selected} max={maxFunnel} tone="bg-emerald-500" />
            <Bar label="Rejected" value={f.rejected} max={maxFunnel} tone="bg-rose-500" />
          </div>
          {data.pending_review > 0 && (
            <button
              onClick={() => navigate("/dashboard/candidates")}
              className="mt-6 text-xs font-bold text-fuchsia-400 hover:underline"
            >
              {data.pending_review} waiting for your decision →
            </button>
          )}
        </section>

        <section className={`rounded-[2rem] border ${t.card} p-8`}>
          <h2 className="font-bold text-lg mb-6">Score distribution</h2>
          <div className="space-y-5">
            {data.score_buckets.map((b, i) => (
              <Bar
                key={b.label}
                label={b.label}
                value={b.count}
                max={maxBucket}
                tone={["bg-amber-500", "bg-amber-400", "bg-sky-500", "bg-emerald-500"][i]}
              />
            ))}
          </div>
        </section>
      </div>

      <section className={`rounded-[2rem] border ${t.card} p-8`}>
        <h2 className="font-bold text-lg mb-6">Top candidates</h2>

        {data.top_candidates.length === 0 ? (
          <p className="text-sm opacity-70">Scores appear after candidates finish an interview.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {data.top_candidates.map((c, i) => (
              <li key={c.session_id}>
                <button
                  onClick={() => navigate(`/dashboard/candidates/${c.session_id}`)}
                  className="w-full flex items-center gap-4 py-4 text-left hover:bg-white/5 transition rounded-xl px-2"
                >
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold truncate">{c.name}</span>
                    <span className="block text-xs opacity-60 truncate">{c.interview_title}</span>
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

      <section className={`rounded-[2rem] border ${t.card} overflow-hidden`}>
        <div className="p-8 pb-4">
          <h2 className="font-bold text-lg">By interview</h2>
        </div>

        {data.per_interview.length === 0 ? (
          <p className="text-sm opacity-70 px-8 pb-8">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider opacity-60 border-y border-white/10">
                  <th className="px-8 py-3 font-bold">Interview</th>
                  <th className="px-4 py-3 font-bold">Attended</th>
                  <th className="px-4 py-3 font-bold">Completed</th>
                  <th className="px-4 py-3 font-bold">Avg. score</th>
                  <th className="px-4 py-3 font-bold">Selected</th>
                  <th className="px-4 py-3 font-bold">Rejected</th>
                  <th className="px-4 py-3 font-bold">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.per_interview.map((r) => (
                  <tr key={r.id}>
                    <td className="px-8 py-4 font-semibold">{r.title}</td>
                    <td className="px-4 py-4">{r.attended}</td>
                    <td className="px-4 py-4">{r.completed}</td>
                    <td className={`px-4 py-4 font-black ${scoreText(r.avg_score)}`}>
                      {r.avg_score === null ? "—" : r.avg_score}
                    </td>
                    <td className="px-4 py-4 text-emerald-300 font-bold">{r.selected}</td>
                    <td className="px-4 py-4 text-rose-300 font-bold">{r.rejected}</td>
                    <td className="px-4 py-4">{r.flagged}</td>
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
