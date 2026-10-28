import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import api from "../../services/api";
import { takePrefetchedCandidate } from "../../services/prefetch";
import {
  DecisionBadge,
  SkillBar,
  StatusBadge,
  fmtDuration,
  prettyReason,
  recommendation,
  scoreBar,
  scoreText,
} from "../../components/dashboard/hiring";
import { formatDate, useDashboard } from "../../context/DashboardContext";
import GazeReport from "../../components/dashboard/GazeReport";

const SKILL_LABELS = {
  relevance: "Relevance",
  accuracy: "Accuracy",
  technical_knowledge: "Technical knowledge",
  completeness: "Completeness",
  communication: "Communication",
};

const dateTime = (v) => (v ? new Date(v).toLocaleString() : "—");

function Card({ t, title, children, right }) {
  return (
    <section className={`rounded-[2rem] border ${t.card} p-6 md:p-8`}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className="font-black text-lg tracking-tight">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-1">{label}</p>
      <div className="text-sm font-semibold break-words">{children || "—"}</div>
    </div>
  );
}

export default function CandidateDetail({ sessionId: propId, onClose, onSwitch, onChanged } = {}) {
  const params = useParams();
  const sessionId = propId || params.sessionId;
  const navigate = useNavigate();
  const location = useLocation();
  const { t, reloadHiring } = useDashboard();

  // back to the list the interviewer came from (same interview filter)
  const backTo = location.state?.back || "/dashboard/candidates";

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [openQ, setOpenQ] = useState(null);

  const load = useCallback(async () => {
    try {
      // first open: use the request that started when the row was hovered
      const res = await (takePrefetchedCandidate(sessionId) ||
        api.get(`/hiring/candidates/${sessionId}`));
      setData(res.data);
      setNote((prev) => prev || res.data.review?.note || "");
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load this candidate.");
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (decision) => {
    if (
      decision === "rejected" &&
      !window.confirm("Reject this candidate? They will receive a rejection email.")
    ) {
      return;
    }

    setBusy(decision);
    setFeedback("");

    try {
      const res = await api.post(`/hiring/candidates/${sessionId}/decision`, {
        decision,
        note,
        send_email: sendEmail,
      });

      const email = res.data.email;
      setFeedback(
        email === "queued"
          ? "Saved. The email to the candidate is being sent."
          : email === "already_sent"
          ? "Saved. The candidate was already emailed for this decision."
          : "Saved."
      );

      await load();
      reloadHiring?.();
      onChanged?.();
    } catch (err) {
      setFeedback(err?.response?.data?.detail || "Could not save the decision.");
    } finally {
      setBusy("");
    }
  };

  // download the bullet-point PDF report (same file the interviewer is e-mailed)
  const downloadPdf = async () => {
    setBusy("pdf");

    try {
      const res = await api.get(
        `/hiring/candidates/${sessionId}/report.pdf`,
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );

      const link = document.createElement("a");
      link.href = url;
      link.download = `interview_report_${data?.candidate?.name || "candidate"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setFeedback("Could not download the PDF report.");
    } finally {
      setBusy("");
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <button data-plain onClick={() => (onClose ? onClose() : navigate(backTo))} className="text-sm font-bold text-slate-700">
          ← Back to candidates
        </button>
        <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm opacity-70 animate-pulse">Loading candidate...</p>;
  }

  const { candidate, interview, session, analysis, monitoring, review, history } = data;
  const job = interview.job || {};
  const score = analysis.overall_score;
  const finished = session.status === "completed";
  const answeredCount = analysis.questions.filter((q) => q.answer).length;
  const rec = recommendation(score);

  const skillEntries = Object.entries(analysis.skills || {}).filter(
    ([, v]) => v !== null && v !== undefined
  );
  const strongest = skillEntries.length
    ? skillEntries.reduce((a, b) => (b[1] > a[1] ? b : a))
    : null;
  const weakest = skillEntries.length
    ? skillEntries.reduce((a, b) => (b[1] < a[1] ? b : a))
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <button data-plain
          onClick={() => (onClose ? onClose() : navigate(backTo))}
          className="text-sm font-bold text-slate-700 hover:underline"
        >
          {onClose ? "✕ Close" : "← Back to candidates"}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            disabled={busy === "pdf"}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-xs font-bold transition"
          >
            {busy === "pdf" ? "Preparing PDF..." : "Download PDF report"}
          </button>

          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold transition"
          >
            Print
          </button>
        </div>
      </div>

      {/* HEADER */}
      <header className={`p-8 md:p-10 rounded-[3rem] border ${t.welcome} relative overflow-hidden`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <StatusBadge status={session.status} />
              <DecisionBadge value={review.decision} />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">{candidate.name}</h1>
            <p className="opacity-75 mt-1 text-sm break-all">
              {candidate.email}
            </p>
            <p className="opacity-60 mt-1 text-xs">
              Applied for {interview.assigned_role || interview.title}
              {interview.assigned_role && interview.assigned_role !== interview.title
                ? ` · ${interview.title}`
                : ""}
            </p>
            {rec && (
              <span className={`inline-block mt-3 px-3 py-1 rounded-full border text-[11px] font-bold ${rec.cls}`}>
                {rec.label} · based on AI score
              </span>
            )}
          </div>

          <div className="text-center shrink-0">
            <p className={`text-6xl font-black ${scoreText(score)}`}>
              {score === null ? "—" : Math.round(score)}
            </p>
            <p className="text-[11px] uppercase tracking-wider opacity-60 font-bold mt-1">Overall score</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* LEFT / MAIN */}
        <div className="xl:col-span-2 space-y-8">
          {/* AI ANALYSIS */}
          <Card t={t} title="AI analysis">
            {analysis.summary ? (
              <p className="text-sm leading-relaxed opacity-90 mb-6">{analysis.summary}</p>
            ) : (
              <p className="text-sm opacity-60 mb-6">
                {finished
                  ? "No summary was generated for this interview."
                  : "The analysis appears once the candidate has answered."}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {Object.entries(SKILL_LABELS).map(([key, label]) => (
                <SkillBar key={key} label={label} value={analysis.skills[key]} />
              ))}
            </div>

            {strongest && weakest && strongest[0] !== weakest[0] && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-1">Strongest area</p>
                  <p className="text-sm font-semibold">
                    {SKILL_LABELS[strongest[0]]} · {Math.round(strongest[1])}
                  </p>
                </div>
                <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700 mb-1">Needs work</p>
                  <p className="text-sm font-semibold">
                    {SKILL_LABELS[weakest[0]]} · {Math.round(weakest[1])}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* FEEDBACK THE CANDIDATE RECEIVES */}
          {data.candidate_feedback?.available && (
            <Card t={t} title="Feedback for the candidate">
              <p className="text-xs opacity-60 mb-5">
                This is sent to the candidate in the result e-mail (no scores).
              </p>

              {[
                ["Strengths", "strengths", "text-emerald-600"],
                ["Weak points", "weaknesses", "text-amber-600"],
                ["How to improve", "improvements", "text-slate-700"],
              ].map(([title, key, color]) =>
                (data.candidate_feedback[key] || []).length > 0 ? (
                  <div key={key} className="mb-5">
                    <h4 className={`text-xs font-black uppercase tracking-wider mb-2 ${color}`}>
                      {title}
                    </h4>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed opacity-90">
                      {data.candidate_feedback[key].map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}

              {(data.candidate_feedback.answer_notes || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider mb-2 text-slate-700">
                    Comments on the answers
                  </h4>
                  <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed opacity-90">
                    {data.candidate_feedback.answer_notes.map((n, i) => (
                      <li key={i}>
                        <span className="opacity-70">{n.question}</span>
                        <br />
                        {n.feedback}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </Card>
          )}

          {/* Q&A */}
          <Card
            t={t}
            title="Questions & answers"
            right={
              <span className="text-xs opacity-60 font-semibold">
                {answeredCount}/{analysis.questions.length} answered
              </span>
            }
          >
            {analysis.questions.length === 0 ? (
              <p className="text-sm opacity-60">No questions were generated for this session.</p>
            ) : (
              <div className="space-y-3">
                {analysis.questions.map((q) => {
                  const open = openQ === q.question_id;
                  const overall = q.scores?.overall ?? null;

                  return (
                    <div key={q.question_id} className="rounded-2xl border border-slate-200 overflow-hidden">
                      <button data-plain
                        onClick={() => setOpenQ(open ? null : q.question_id)}
                        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-1">
                            {q.is_follow_up ? "Follow-up" : `Question ${q.order}`}
                            {q.category ? ` · ${String(q.category).replace(/_/g, " ")}` : ""}
                          </p>
                          <p className="text-sm font-semibold">{q.question}</p>
                        </div>
                        <span className={`text-lg font-black shrink-0 ${scoreText(overall)}`}>
                          {overall === null ? "—" : Math.round(overall)}
                        </span>
                      </button>

                      {open && (
                        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-200">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-1">Answer</p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {q.answer || <span className="opacity-50">Not answered</span>}
                            </p>
                          </div>

                          {q.scores && (
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              {Object.entries(SKILL_LABELS).map(([key, label]) => (
                                <div key={key} className="rounded-xl bg-slate-100 px-3 py-2">
                                  <p className="text-[10px] opacity-60">{label}</p>
                                  <p className="font-black">{q.scores[key] === null ? "—" : Math.round(q.scores[key])}</p>
                                  <div className="h-1 rounded-full bg-slate-100 mt-1">
                                    <div
                                      className={`h-full rounded-full ${scoreBar(q.scores[key] || 0)}`}
                                      style={{ width: `${Math.min(100, q.scores[key] || 0)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {q.feedback && (
                            <div>
                              <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-1">AI feedback</p>
                              <p className="text-sm leading-relaxed opacity-90">{q.feedback}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* MONITORING */}
          <Card t={t} title="Eye & face monitoring">
            {!monitoring.required ? (
              <p className="text-sm opacity-70">
                Monitoring was not required for this interview. The candidate attended without a camera.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                    Camera required
                  </span>
                  {monitoring.face && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50">
                      Face detection
                    </span>
                  )}
                  {monitoring.eye && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50">
                      Eye / gaze detection
                    </span>
                  )}
                  {monitoring.phone && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50">
                      Phone detection
                    </span>
                  )}
                </div>

                {monitoring.terminated_reason ? (
                  <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-700">
                    Interview ended early: <b>{prettyReason(monitoring.terminated_reason)}</b>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-700">
                    The interview was not ended by monitoring.
                  </div>
                )}

                {monitoring.events.length > 0 && (
                  <ul className="space-y-2">
                    {monitoring.events.map((e, i) => (
                      <li
                        key={`${e.at}-${i}`}
                        className="flex items-center justify-between gap-4 text-sm px-4 py-2.5 rounded-xl bg-slate-100"
                      >
                        <span>{prettyReason(e.type)}</span>
                        <span className="text-xs opacity-50">{dateTime(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          {/* EYE MOVEMENT (AI-ASSISTED ANSWER CHECK) - interviewer only */}
          {monitoring.required && monitoring.eye && (
            <Card t={t} title="Answer check">
              <GazeReport gaze={monitoring.gaze} eyeRequired={monitoring.eye} />
            </Card>
          )}
        </div>

        {/* RIGHT / SIDE */}
        <div className="space-y-8">
          {/* DECISION */}
          <section className={`rounded-[2rem] border ${t.card} p-6 md:p-8 xl:sticky xl:top-28 print:hidden`}>
            <h2 className="font-black text-lg tracking-tight mb-1">Your decision</h2>
            <p className="text-xs opacity-60 mb-5">
              The candidate is emailed the result with feedback (strengths, weak points, how to improve). They never see scores.
            </p>

            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note, or message for the candidate if selected..."
              className={`w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400 text-sm mb-4`}
            />

            <label className="flex items-start gap-3 text-sm mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="mt-1 accent-slate-700"
              />
              <span>Email the candidate about this decision</span>
            </label>

            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={Boolean(busy)}
                onClick={() => decide("selected")}
 className="py-3.5 rounded-2xl font-bold text-white bg-slate-800 hover:opacity-90 transition disabled:opacity-50"
              >
                {busy === "selected" ? "Saving..." : "Select candidate"}
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => decide("on_hold")}
                className="py-3.5 rounded-2xl font-bold border border-slate-200 hover:bg-slate-100 transition disabled:opacity-50"
              >
                {busy === "on_hold" ? "Saving..." : "Put on hold"}
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => decide("rejected")}
                className="py-3.5 rounded-2xl font-bold text-rose-700 border border-rose-500/30 hover:bg-rose-500/10 transition disabled:opacity-50"
              >
                {busy === "rejected" ? "Saving..." : "Reject candidate"}
              </button>
            </div>

            {feedback && <p className="mt-4 text-xs font-semibold opacity-80">{feedback}</p>}

            <div className="mt-6 pt-5 border-t border-slate-200 space-y-2 text-xs opacity-70">
              <p>Decision: <b>{review.decision.replace("_", " ")}</b> {review.decided_at ? `· ${dateTime(review.decided_at)}` : ""}</p>
              <p>
                Thank-you email:{" "}
                <b>{review.ack_sent_at ? `sent ${dateTime(review.ack_sent_at)}` : "not sent"}</b>
              </p>
              <p>
                Result email:{" "}
                <b>{review.notification_status || "not sent"}</b>
              </p>
            </div>
          </section>

          {/* CANDIDATE */}
          <Card t={t} title="Candidate details">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Name">{candidate.name}</Field>
              <Field label="Email">{candidate.email}</Field>
              <Field label="Joined">{formatDate(candidate.joined_at)}</Field>
            </div>
          </Card>

          {/* INTERVIEW */}
          <Card t={t} title="Interview details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Interview">{interview.title}</Field>
              <Field label="Duration">{interview.duration ? `${interview.duration} min` : ""}</Field>
              <Field label="Difficulty">{interview.difficulty}</Field>
              <Field label="Level">{interview.knowledge_expectation}</Field>
              <Field label="Questions">{interview.question_count}</Field>
              <Field label="Took">{fmtDuration(session.duration_seconds)}</Field>
              <Field label="Started">{dateTime(session.started_at)}</Field>
              <Field label="Ended">{dateTime(session.ended_at)}</Field>
            </div>

            {interview.categories?.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {interview.categories.map((c) => (
                  <span key={c} className="px-3 py-1 rounded-full text-[11px] font-bold capitalize border border-slate-200 bg-slate-50">
                    {String(c).replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            {(job.role || job.company || job.location) && (
              <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-2 gap-4">
                <Field label="Role">{job.role}</Field>
                <Field label="Company">{job.company}</Field>
                <Field label="Location">{job.location}</Field>
              </div>
            )}
          </Card>

          {/* HISTORY */}
          {history.length > 0 && (
            <Card t={t} title="Other interviews">
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.session_id}>
                    <button data-plain
                      onClick={() =>
                        onSwitch ? onSwitch(h.session_id) : navigate(`/dashboard/candidates/${h.session_id}`)
                      }
                      className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-100 transition"
                    >
                      <span className="text-sm font-semibold truncate">{h.interview_title}</span>
                      <DecisionBadge value={h.decision} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}