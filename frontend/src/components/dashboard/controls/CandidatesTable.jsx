import { useMemo, useState } from "react";

import { IconUsers } from "../icons";
import { DecisionBadge } from "../hiring";

const PAGE_SIZE = 3;

const MAIL_BADGE = {
  draft: ["Pending", "bg-orange-500/15 text-orange-600 border-orange-500/30"],
  sent: ["Mail Sent", "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"],
  pending: ["Mail Pending", "bg-amber-500/15 text-amber-600 border-amber-500/30"],
  failed: ["Mail Failed", "bg-rose-500/15 text-rose-600 border-rose-500/30"],
  manual: ["Link Only", "bg-slate-500/15 text-slate-600 border-slate-500/30"],
};

const PROGRESS_BADGE = {
  sent: ["Sent", "border-slate-500/30 bg-slate-500/10 text-slate-600"],
  opened: ["Opened", "border-slate-300 bg-slate-100 text-slate-700"],
  started: ["In interview", "border-amber-500/30 bg-amber-500/10 text-amber-700"],
  completed: ["Completed", "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"],
  ended: ["Ended early", "border-rose-500/30 bg-rose-500/10 text-rose-700"],
};

const FILTERS = [
  { key: "all", label: "All", on: "bg-violet-600", off: "text-slate-500 hover:text-slate-900" },
  { key: "sent", label: "Sent", on: "bg-emerald-600", off: "text-emerald-600/70 hover:text-emerald-600" },
  { key: "pending", label: "Pending", on: "bg-amber-600", off: "text-amber-600/70 hover:text-amber-600" },
  { key: "failed", label: "Failed", on: "bg-rose-600", off: "text-rose-600/70 hover:text-rose-600" },
];

const iconBtn =
  "w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-sm hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Candidates of ONE interview, as a table:
 *   # | Candidate Name | Contact Info | Role | Interview ID | Mail Status | Interview Progress | Actions
 */
export default function CandidatesTable({
  invitations,
  t,
  emailOn,
  resending,
  busyEmail,
  notice,
  onResend,
  onDelete,
  onUploadResume,
  review,
}) {
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState("");

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
    } catch {
      window.prompt("Copy this", text || "");
    }
    setCopied(key);
    setTimeout(() => setCopied(""), 1800);
  };

  // review / monitoring rows of the people who attended, by e-mail
  const reviewByEmail = useMemo(() => {
    const map = {};
    (review?.candidates || []).forEach((c) => {
      map[(c.candidate?.email || "").toLowerCase()] = c;
    });
    return map;
  }, [review?.candidates]);

  const reviewTab = review?.tab || "all";
  const query = review?.query || "";
  const sort = review?.sort || "recent";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matched = invitations.filter((inv) => {
      const okFilter =
        filterType === "all" ||
        (filterType === "sent" && inv.mail_status === "sent") ||
        (filterType === "pending" && ["pending", "draft"].includes(inv.mail_status)) ||
        (filterType === "failed" && inv.mail_status === "failed");

      const okSearch =
        !q ||
        (inv.name || "").toLowerCase().includes(q) ||
        (inv.email || "").toLowerCase().includes(q) ||
        (inv.code || "").toLowerCase().includes(q);

      const rv = reviewByEmail[(inv.email || "").toLowerCase()];
      const okDecision = reviewTab === "all" || rv?.decision === reviewTab;

      return okFilter && okSearch && okDecision;
    });

    const scoreOf = (inv) => reviewByEmail[(inv.email || "").toLowerCase()]?.score;
    const list = [...matched];

    if (sort === "score_desc") list.sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
    if (sort === "score_asc") list.sort((a, b) => (scoreOf(a) ?? 101) - (scoreOf(b) ?? 101));

    return list;
  }, [invitations, filterType, query, reviewTab, sort, reviewByEmail]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-100 text-slate-700 border border-slate-300">
            <IconUsers />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Candidates</h3>
            <p className="text-xs text-slate-500">
              {filtered.length} {filtered.length === 1 ? "candidate" : "candidates"} found
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
          {FILTERS.map((f) => (
            <button data-plain
              key={f.key}
              type="button"
              onClick={() => {
                setFilterType(f.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterType === f.key ? `${f.on} text-white shadow-sm` : f.off
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {notice?.msg && (
        <p className="text-xs text-emerald-600 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          {notice.msg}
        </p>
      )}
      {notice?.err && (
        <p className="text-xs text-rose-600 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
          {notice.err}
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead>
              <tr className="text-left uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-bold w-10">#</th>
                <th className="px-4 py-3 font-bold">Candidate Name</th>
                <th className="px-4 py-3 font-bold">Contact Info</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Interview ID</th>
                <th className="px-4 py-3 font-bold">Mail Status</th>
                <th className="px-4 py-3 font-bold">Interview Progress</th>
                <th className="px-4 py-3 font-bold">Monitoring</th>
                <th className="px-4 py-3 font-bold">Decision</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No candidates found matching your criteria.
                  </td>
                </tr>
              )}

              {rows.map((inv, i) => {
                const [mailLabel, mailCls] = MAIL_BADGE[inv.mail_status] || MAIL_BADGE.sent;
                const [progLabel, progCls] = PROGRESS_BADGE[inv.status] || PROGRESS_BADGE.sent;
                const sending = resending === inv.email || inv.mail_status === "pending";
                const working = busyEmail === inv.email;
                const rv = reviewByEmail[(inv.email || "").toLowerCase()];

                return (
                  <tr key={inv.email} className="hover:bg-slate-50 transition align-top">
                    <td className="px-4 py-3.5 text-slate-500">{start + i + 1}</td>

                    <td className="px-4 py-3.5 font-semibold text-slate-800 break-words max-w-[160px]">
                      {inv.name || "—"}
                    </td>

                    <td className="px-4 py-3.5 max-w-[240px]">
                      <a
                        href={`mailto:${inv.email}`}
                        className="text-slate-700 hover:underline break-all"
                      >
                        {inv.email}
                      </a>
                      {inv.phone && <p className="text-slate-500 mt-0.5">{inv.phone}</p>}
                    </td>

                    <td className="px-4 py-3.5 text-slate-700">{inv.role || "—"}</td>

                    <td className="px-4 py-3.5">
                      {inv.code ? (
                        <button data-plain
                          type="button"
                          onClick={() => copy(inv.code, `${inv.email}:id`)}
                          className="font-mono font-bold text-slate-700 hover:text-slate-900"
                          title="Click to copy"
                        >
                          {copied === `${inv.email}:id` ? "Copied ✓" : inv.code}
                        </button>
                      ) : (
                        <span className="text-slate-400">old invite</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-extrabold whitespace-nowrap ${mailCls}`}
                      >
                        {mailLabel}
                      </span>
                      {inv.mail_status === "failed" && inv.mail_error && (
                        <p className="text-[11px] text-rose-600 mt-1.5 max-w-[200px] break-words">
                          {inv.mail_error}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-extrabold whitespace-nowrap ${progCls}`}
                      >
                        {progLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      {!rv ? (
                        <span className="text-slate-400">—</span>
                      ) : !rv.proctoring?.required ? (
                        <span className="text-slate-500">Not required</span>
                      ) : rv.proctoring.flagged ? (
                        <span className="text-rose-700 font-bold">Flagged</span>
                      ) : (
                        <span className="text-emerald-700 font-bold">Clean</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {rv ? <DecisionBadge value={rv.decision} /> : <span className="text-slate-400">—</span>}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {rv && (
                          <button
                            type="button"
                            onClick={() => review.openCandidate(rv.session_id)}
                            className="px-3 h-8 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition whitespace-nowrap"
                          >
                            Review →
                          </button>
                        )}
                        {emailOn && (
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => onResend(inv)}
                            className="px-3 h-8 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition disabled:opacity-50 whitespace-nowrap"
                          >
                            {sending
                              ? "Sending..."
                              : inv.mail_status === "failed"
                              ? "Retry"
                              : inv.mail_status === "draft"
                              ? "Send"
                              : "Resend"}
                          </button>
                        )}

                        {inv.link && (
                          <button data-plain
                            type="button"
                            onClick={() => copy(inv.link, `${inv.email}:link`)}
                            className={iconBtn}
                            title="Copy interview link"
                            aria-label="Copy interview link"
                          >
                            {copied === `${inv.email}:link` ? "✓" : "🔗"}
                          </button>
                        )}

                          <label
                            className={`${iconBtn} cursor-pointer ${working ? "opacity-40 pointer-events-none" : ""}`}
                            title={inv.has_resume ? "Replace resume" : "Upload resume"}
                          >
                            {working ? "…" : "📎"}
                            <input
                              type="file"
                              className="hidden"
                              disabled={working}
                              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                onUploadResume(inv.email, file);
                              }}
                            />
                          </label>

                        <button data-plain
                          type="button"
                          disabled={working}
                          onClick={() => onDelete(inv)}
                          className={`${iconBtn} hover:border-rose-500/40 hover:bg-rose-500/10`}
                          title="Delete candidate"
                          aria-label="Delete candidate"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            aria-label="Previous page"
            className="px-3 py-2 bg-slate-50 rounded-xl disabled:opacity-30 hover:bg-slate-100 transition"
          >
            ‹ Prev
          </button>
          <span className="flex gap-2 font-medium">
            {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
              <button data-plain
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={n === current ? "font-black text-slate-700" : "opacity-60 hover:opacity-100"}
              >
                {n}
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pages, current + 1))}
            disabled={current === pages}
            aria-label="Next page"
            className="px-3 py-2 bg-slate-50 rounded-xl disabled:opacity-30 hover:bg-slate-100 transition"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
