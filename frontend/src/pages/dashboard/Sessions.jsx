import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatDate, useDashboard } from "../../context/DashboardContext";
import { prefetchCandidate } from "../../services/prefetch";
import { DecisionBadge, StatusBadge, downloadCsv, fmtDuration, scoreText } from "../../components/dashboard/hiring";
import { IconSearch, IconVideo } from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, PageHeader, SegTabs, Table } from "../../components/ui";

// ============================================================
// INTERVIEW SESSIONS – every session the candidates started.
// Data: GET /hiring/candidates (already loaded by DashboardContext)
// ============================================================

export default function Sessions() {
  const navigate = useNavigate();
  const { hiring, reloadHiring } = useDashboard();
  const all = hiring?.candidates || [];

  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [interview, setInterview] = useState("all");

  const interviews = useMemo(() => {
    const m = new Map();
    all.forEach((c) => m.set(c.interview_id, c.interview_title));
    return [...m.entries()];
  }, [all]);

  const counts = {
    all: all.length,
    in_progress: all.filter((c) => c.session_status === "in_progress").length,
    completed: all.filter((c) => c.session_status === "completed").length,
    terminated: all.filter((c) => c.session_status === "terminated").length,
  };

  const s = q.trim().toLowerCase();
  const rows = all
    .filter((c) => tab === "all" || c.session_status === tab)
    .filter((c) => interview === "all" || c.interview_id === interview)
    .filter(
      (c) =>
        !s ||
        c.candidate.name?.toLowerCase().includes(s) ||
        c.candidate.email?.toLowerCase().includes(s) ||
        c.interview_title?.toLowerCase().includes(s)
    )
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));

  const exportCsv = () =>
    downloadCsv("interview_sessions.csv", [
      ["Candidate", "Email", "Interview", "Status", "Started", "Ended", "Duration (s)", "Score", "Decision", "Monitoring flagged"],
      ...rows.map((c) => [
        c.candidate.name,
        c.candidate.email,
        c.interview_title,
        c.session_status,
        c.started_at || "",
        c.ended_at || "",
        c.duration_seconds ?? "",
        c.score ?? "",
        c.decision,
        c.proctoring?.flagged ? "yes" : "no",
      ]),
    ]);

  return (
    <div>
      <PageHeader
        title="Interview Sessions"
        description="Every interview session your candidates started — live, finished or ended early."
        actions={
          <>
            <button data-plain onClick={() => reloadHiring?.()} className="ui-btn-ghost">Refresh</button>
            <button onClick={exportCsv} className="ui-btn" disabled={!rows.length}>Export CSV</button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total sessions", counts.all, "bg-navy-500"],
          ["Live now", counts.in_progress, "bg-brand-500"],
          ["Completed", counts.completed, "bg-emerald-500"],
          ["Ended early", counts.terminated, "bg-rose-500"],
        ].map(([l, v, dot]) => (
          <div key={l} data-tilt className="ui-card p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className={`h-2 w-2 rounded-full ${dot}`} /> {l}
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-navy-900">{v}</p>
          </div>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <SegTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "all", label: "All", count: counts.all },
              { id: "in_progress", label: "In progress", count: counts.in_progress },
              { id: "completed", label: "Completed", count: counts.completed },
              { id: "terminated", label: "Ended early", count: counts.terminated },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidate or interview…" className="ui-input py-2 pl-10 sm:w-64" />
            </div>
            <select value={interview} onChange={(e) => setInterview(e.target.value)} className="ui-input py-2 sm:w-48">
              <option value="all">All interviews</option>
              {interviews.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<IconVideo />} title="No sessions found">
              {all.length ? "Try another filter." : "Sessions appear here once candidates start their interviews."}
            </EmptyState>
          </div>
        ) : (
          <Table head={["Candidate", "Interview", "Started", "Duration", "Status", "Score", "Decision", { label: "", right: true }]} minWidth={900}>
            {rows.map((c) => (
              <tr
                key={c.session_id}
                onMouseEnter={() => prefetchCandidate(c.session_id)}
                onClick={() => navigate(`/dashboard/candidates/${c.session_id}`, { state: { back: "/dashboard/sessions" } })}
                className="cursor-pointer transition hover:bg-brand-50/40"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.candidate.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">{c.candidate.name}</p>
                      <p className="truncate text-xs text-slate-500">{c.candidate.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{c.interview_title}</td>
                <td className="px-5 py-3.5 text-slate-600">{formatDate(c.started_at)}</td>
                <td className="px-5 py-3.5 text-slate-600">{fmtDuration(c.duration_seconds)}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={c.session_status} />
                    {c.proctoring?.flagged && <span className="ui-pill bg-rose-50 text-rose-700" title="Monitoring flag">⚑</span>}
                  </div>
                </td>
                <td className={`px-5 py-3.5 font-bold ${scoreText(c.score)}`}>{c.score === null || c.score === undefined ? "—" : `${Math.round(c.score)}%`}</td>
                <td className="px-5 py-3.5"><DecisionBadge value={c.decision} /></td>
                <td className="px-5 py-3.5 text-right text-xs font-semibold text-brand-600">Open →</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
