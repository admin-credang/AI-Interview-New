import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import { formatDate, useDashboard } from "../../context/DashboardContext";
import { StatusBadge, fmtDuration } from "../../components/dashboard/hiring";
import { IconFileText, IconMic, IconSearch } from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, PageHeader } from "../../components/ui";

// ============================================================
// TRANSCRIPTS & ANSWER HISTORY
// List   : GET /hiring/candidates
// Detail : GET /hiring/candidates/{id}  -> analysis.questions[]
// The transcript text is what the existing transcription API saved
// as each answer. Download is built in the browser (.txt).
// ============================================================

export default function Transcripts() {
  const navigate = useNavigate();
  const { hiring } = useDashboard();

  const sessions = useMemo(
    () =>
      (hiring?.candidates || [])
        .filter((c) => c.session_status !== "not_started")
        .sort((a, b) => new Date(b.ended_at || b.started_at || 0) - new Date(a.ended_at || a.started_at || 0)),
    [hiring]
  );

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected && sessions[0]) setSelected(sessions[0].session_id);
  }, [sessions, selected]);

  useEffect(() => {
    if (!selected) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get(`/hiring/candidates/${selected}`)
      .then((res) => alive && setDetail(res.data))
      .catch((err) => alive && setError(err?.response?.data?.detail || "Could not load the transcript."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  const s = q.trim().toLowerCase();
  const list = sessions.filter(
    (c) => !s || c.candidate.name?.toLowerCase().includes(s) || c.interview_title?.toLowerCase().includes(s)
  );

  const qa = detail?.analysis?.questions || [];
  const answered = qa.filter((x) => x.answer).length;

  const download = () => {
    if (!detail) return;
    const lines = [
      `Interview transcript`,
      `Candidate: ${detail.candidate?.name || ""} <${detail.candidate?.email || ""}>`,
      `Interview: ${detail.interview?.title || ""}`,
      `Started: ${detail.session?.started_at || ""}`,
      `Ended: ${detail.session?.ended_at || ""}`,
      "",
      ...qa.flatMap((x, i) => [
        `Q${i + 1}${x.is_follow_up ? " (follow-up)" : ""}: ${x.question || ""}`,
        `A: ${x.answer || "(no answer)"}`,
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${(detail.candidate?.name || "candidate").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        icon={IconMic}
        title="Transcripts"
        description="Every recorded answer, transcribed. Pick a session to read the full question-and-answer history."
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card padded={false}>
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions…" className="ui-input py-2 pl-10" />
            </div>
          </div>
          {list.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No sessions yet.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {list.map((c) => (
                <li key={c.session_id}>
                  <button
                    data-plain
                    onClick={() => setSelected(c.session_id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected === c.session_id ? "bg-brand-50/70" : "hover:bg-slate-50"}`}
                  >
                    <Avatar name={c.candidate.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">{c.candidate.name}</span>
                      <span className="block truncate text-xs text-slate-500">{c.interview_title} · {formatDate(c.ended_at || c.started_at)}</span>
                    </span>
                    {selected === c.session_id && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {!selected ? (
            <Card>
              <EmptyState icon={<IconFileText />} title="No transcripts yet">Transcripts appear after candidates answer questions.</EmptyState>
            </Card>
          ) : (
            <>
              <section className="ui-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={detail?.candidate?.name || "?"} size="lg" tone="dark" />
                    <div>
                      <p className="text-lg font-bold text-navy-900">{detail?.candidate?.name || "Loading…"}</p>
                      <p className="text-sm text-slate-500">{detail?.interview?.title}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button data-plain disabled={!detail} onClick={() => navigate(`/dashboard/candidates/${selected}`, { state: { back: "/dashboard/transcripts" } })} className="ui-btn-ghost disabled:opacity-50">
                      Full profile
                    </button>
                    <button disabled={!detail || !qa.length} onClick={download} className="ui-btn disabled:opacity-50">
                      Download transcript
                    </button>
                  </div>
                </div>
                {detail && (
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
                    {[
                      ["Status", <StatusBadge key="s" status={detail.session?.status} />],
                      ["Recording duration", fmtDuration(detail.session?.duration_seconds)],
                      ["Answers recorded", `${answered} / ${qa.length}`],
                      ["Date", formatDate(detail.session?.started_at)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-xs text-slate-500">{k}</p>
                        <div className="mt-1 text-sm font-semibold text-navy-900">{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <Card title="Answer history" icon={IconFileText}>
                {loading ? (
                  <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" /></div>
                ) : error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
                ) : qa.length === 0 ? (
                  <EmptyState icon={<IconMic />} title="No answers recorded">This session has no transcribed answers.</EmptyState>
                ) : (
                  <ol className="space-y-5">
                    {qa.map((x, i) => (
                      <li key={x.question_id || i} className={x.is_follow_up ? "ml-6 border-l-2 border-brand-100 pl-4" : ""}>
                        <div className="flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white">
                            {x.is_follow_up ? "↳" : `Q${x.order ?? i + 1}`}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              {x.is_follow_up ? "Follow-up" : "Question"}{x.category ? ` · ${x.category}` : ""}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-navy-900">{x.question}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <IconMic className="h-4 w-4" />
                          </span>
                          <p className={`min-w-0 flex-1 rounded-xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed ${x.answer ? "bg-slate-50 text-slate-700" : "bg-slate-50 italic text-slate-400"}`}>
                            {x.answer || "No answer recorded."}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
