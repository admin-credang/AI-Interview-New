import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import { formatDate, useDashboard } from "../../context/DashboardContext";
import { prefetchCandidate } from "../../services/prefetch";
import { DecisionBadge, downloadCsv, recommendation, scoreBar, scoreText } from "../../components/dashboard/hiring";
import { IconBarChart, IconFileText, IconSearch } from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, PageHeader, SegTabs, Table } from "../../components/ui";

// ============================================================
// INTERVIEW REPORTS
// List : GET /hiring/candidates
// PDF  : GET /hiring/candidates/{id}/report.pdf   (existing report generator)
// ============================================================

export default function Reports() {
  const navigate = useNavigate();
  const { hiring } = useDashboard();

  const reports = useMemo(
    () =>
      (hiring?.candidates || [])
        .filter((c) => c.session_status === "completed" || c.session_status === "terminated")
        .sort((a, b) => new Date(b.ended_at || 0) - new Date(a.ended_at || 0)),
    [hiring]
  );

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const s = q.trim().toLowerCase();
  const rows = reports
    .filter((c) => tab === "all" || c.decision === tab || (tab === "flagged" && c.proctoring?.flagged))
    .filter((c) => !s || c.candidate.name?.toLowerCase().includes(s) || c.interview_title?.toLowerCase().includes(s));

  const scored = reports.filter((c) => c.score !== null && c.score !== undefined);
  const avg = scored.length ? Math.round(scored.reduce((a, c) => a + Number(c.score), 0) / scored.length) : null;
  const best = scored.length ? Math.round(Math.max(...scored.map((c) => Number(c.score)))) : null;

  const downloadPdf = async (c) => {
    setBusy(c.session_id);
    setError("");
    try {
      const res = await api.get(`/hiring/candidates/${c.session_id}/report.pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `interview_report_${c.candidate?.name || "candidate"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError(`Could not download the PDF report for ${c.candidate?.name || "this candidate"}.`);
    } finally {
      setBusy("");
    }
  };

  const exportCsv = () =>
    downloadCsv("interview_reports.csv", [
      ["Candidate", "Email", "Interview", "Finished", "Score", "Recommendation", "Decision", "Monitoring events"],
      ...rows.map((c) => [
        c.candidate.name,
        c.candidate.email,
        c.interview_title,
        c.ended_at || "",
        c.score ?? "",
        recommendation(c.score)?.label || "",
        c.decision,
        c.proctoring?.event_count ?? 0,
      ]),
    ]);

  return (
    <div>
      <PageHeader
        icon={IconFileText}
        title="Interview Reports"
        description="AI-scored reports for every finished interview. Open the full analysis or download the PDF."
        actions={
          <>
            <button data-plain onClick={() => navigate("/dashboard/analytics")} className="ui-btn-ghost">
              <IconBarChart /> Analytics
            </button>
            <button onClick={exportCsv} disabled={!rows.length} className="ui-btn">Export CSV</button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Reports ready", reports.length],
          ["Average score", avg !== null ? `${avg}%` : "—"],
          ["Best score", best !== null ? `${best}%` : "—"],
          ["With monitoring flags", reports.filter((c) => c.proctoring?.flagged).length],
        ].map(([k, v]) => (
          <div key={k} data-tilt className="ui-card p-4">
            <p className="text-xs font-medium text-slate-500">{k}</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-navy-900">{v}</p>
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <SegTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "all", label: "All" },
              { id: "pending", label: "Pending review" },
              { id: "selected", label: "Selected" },
              { id: "rejected", label: "Rejected" },
              { id: "flagged", label: "Flagged" },
            ]}
          />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" className="ui-input py-2 pl-10 lg:w-64" />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<IconFileText />} title="No reports">
              {reports.length ? "No report matches this filter." : "Reports are created when candidates finish their interviews."}
            </EmptyState>
          </div>
        ) : (
          <Table head={["Candidate", "Interview", "Finished", "Overall score", "Recommendation", "Decision", { label: "Actions", right: true }]} minWidth={980}>
            {rows.map((c) => {
              const rec = recommendation(c.score);
              const score = c.score === null || c.score === undefined ? null : Math.round(c.score);
              return (
                <tr key={c.session_id} onMouseEnter={() => prefetchCandidate(c.session_id)} className="transition hover:bg-slate-50/70">
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
                  <td className="px-5 py-3.5 text-slate-600">{formatDate(c.ended_at)}</td>
                  <td className="px-5 py-3.5">
                    {score === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`w-10 font-bold ${scoreText(score)}`}>{score}%</span>
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <span className={`block h-full rounded-full ${scoreBar(score)}`} style={{ width: `${score}%` }} />
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {rec ? <span className={`ui-pill border ${rec.cls}`}>{rec.label}</span> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-3.5"><DecisionBadge value={c.decision} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button
                        data-plain
                        onClick={() => navigate(`/dashboard/candidates/${c.session_id}`, { state: { back: "/dashboard/reports" } })}
                        className="ui-btn-ghost px-3 py-1.5 text-xs"
                      >
                        View
                      </button>
                      <button
                        disabled={busy === c.session_id}
                        onClick={() => downloadPdf(c)}
                        className="ui-btn px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {busy === c.session_id ? "Preparing…" : "PDF"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
