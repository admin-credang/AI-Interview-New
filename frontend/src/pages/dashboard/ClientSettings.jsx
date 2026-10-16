import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import { Toggle } from "../../components/dashboard/hiring";
import { IconSettings, IconUsers } from "../../components/dashboard/icons";
import { RoleResumeDropdown } from "./InterviewControls";
import { useDashboard } from "../../context/DashboardContext";

const PAGE_SIZE = 6;

const TABS = [
  { key: "settings", label: "Settings" },
  { key: "features", label: "Features" },
  { key: "candidates", label: "Candidates" },
  { key: "add", label: "Add Candidate" },
];

const MAIL_BADGE = {
  draft: ["Pending", "bg-orange-500/15 text-orange-400 border border-orange-500/30"],
  sent: ["Mail Sent", "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"],
  pending: ["Mail Pending", "bg-amber-500/15 text-amber-400 border border-amber-500/30"],
  failed: ["Mail Failed", "bg-rose-500/15 text-rose-400 border border-rose-500/30"],
  manual: ["Link Only", "bg-slate-500/15 text-slate-400 border border-slate-500/30"],
};

const PROGRESS = {
  opened: "Opened the link",
  started: "In interview",
  completed: "Interview completed",
  ended: "Ended early",
};

const IconPersonPlus = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m14-12h6m-3-3v6M9 11a4 4 0 100-8 4 4 0 000 8z" />
  </svg>
);

const IconUpload = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });

function ToggleRow({ title, hint, checked, onChange, disabled, label, children }) {
  return (
    <div className="py-4 first:pt-0">
      <p className="font-bold text-sm text-white/90">{title}</p>
      {hint && <p className="text-xs text-white/50 mt-1">{hint}</p>}
      <div className="flex items-center justify-between mt-3 bg-slate-900/40 p-4 rounded-xl border border-white/5">
        <span className="text-xs font-medium text-white/70">{checked ? "Enabled" : "Disabled"}</span>
        <Toggle label={label} checked={checked} disabled={disabled} onChange={onChange} />
      </div>
      {children}
    </div>
  );
}

function ModuleList({ catalog, groups, state, busyKey, onToggle, extras }) {
  const childrenOf = (key) => catalog.filter((m) => m.parent === key);
  const stateOf = (m) => state[m.key] || { on: m.default, active: m.default };

  const renderChild = (m) => {
    const st = stateOf(m);
    const parentActive = !m.parent || state[m.parent]?.active !== false;

    return (
      <div key={m.key} className="pl-3 border-l border-white/10 my-2">
        <div className="flex items-center justify-between py-1.5" title={m.description}>
          <span className="text-xs text-white/80">{m.label}</span>
          <Toggle
            label={m.label}
            checked={st.on && parentActive}
            disabled={busyKey === m.key || !parentActive}
            onChange={(v) => onToggle(m.key, v)}
          />
        </div>
        {st.active && extras[m.key] ? <div className="mt-2 mb-2">{extras[m.key]}</div> : null}
        {st.on && childrenOf(m.key).map(renderChild)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const tops = catalog.filter((m) => m.group === g.key && !m.parent);
        if (tops.length === 0) return null;

        return (
          <div key={g.key} className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-400">
              {g.label}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              {tops.map((m) => {
                const st = stateOf(m);
                const kids = childrenOf(m.key);

                return (
                  <div key={m.key} className="p-5 bg-slate-900/40 rounded-2xl border border-white/5 flex flex-col justify-between hover:border-white/10 transition shadow-lg">
                    <div>
                      <p className="font-bold text-sm text-white/90">{m.label}</p>
                      <p className="text-xs text-white/50 mt-1 leading-relaxed">{m.description}</p>

                      <div className="flex items-center justify-between mt-4 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                        <span className="text-xs font-medium text-white/70">{st.on ? "Enabled" : "Disabled"}</span>
                        <Toggle
                          label={m.label}
                          checked={st.on}
                          disabled={busyKey === m.key}
                          onChange={(v) => onToggle(m.key, v)}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      {st.active && extras[m.key] ? <div className="mt-2">{extras[m.key]}</div> : null}

                      {st.on && kids.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5">{kids.map(renderChild)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsColumn({
  item,
  t,
  catalog,
  groups,
  featureState,
  onFeatureState,
  followCount,
  onFollowCount,
  onInterviewerSaved,
  resume,
  tab,
}) {
  const [accepting, setAccepting] = useState(Boolean(item.accepting));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const toggleInterview = async (open) => {
    setBusy("interview");
    setError("");
    try {
      const res = await api.post(`/hiring/interviews/${item.id}/status`, { open });
      setAccepting(res.data.accepting);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not change the interview toggle.");
    } finally {
      setBusy("");
    }
  };

  const toggleModule = async (key, value) => {
    setBusy(key);
    setError("");
    try {
      const res = await api.put(`/hiring/interviews/${item.id}/features`, {
        features: { [key]: value },
      });
      onFeatureState(res.data.features);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not change this module.");
    } finally {
      setBusy("");
    }
  };

  const saveFollowCount = async (count) => {
    setBusy("follow_count");
    setError("");
    try {
      await api.put(`/hiring/interviews/${item.id}/settings`, {
        follow_ups: { enabled: true, count },
      });
      onFollowCount(count);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not change the follow-up count.");
    } finally {
      setBusy("");
    }
  };

  const extras = {
    follow_ups: (
      <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
        <span className="text-xs text-white/70">How many follow-ups</span>
        <select
          value={followCount}
          disabled={busy === "follow_count"}
          onChange={(e) => saveFollowCount(Number(e.target.value))}
          className={`px-3 py-1.5 rounded-lg border ${t.input} text-xs outline-none focus:ring-2 focus:ring-fuchsia-500 bg-slate-900 text-white`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    ),
    resume_questions:
      resume && resume.list.length > 0 ? (
        <RoleResumeDropdown
          role={item.title}
          t={t}
          list={resume.list}
          resumeBusy={resume.resumeBusy}
          resumeMsg={resume.resumeMsg}
          resumeErr={resume.resumeErr}
          clearNotes={resume.clearNotes}
          uploadResume={resume.uploadResume}
          toggleResume={resume.toggleResume}
          removeResume={resume.removeResume}
        />
      ) : null,
    email_enabled: <EmailStatusBox />,
    custom_interviewer: <InterviewerBox key={item.id} item={item} t={t} onSaved={onInterviewerSaved} />,
  };

  return (
    <>
      <div className={tab === "settings" ? "" : "hidden"}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
            <IconSettings />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Settings</h3>
            <p className="text-xs text-white/50">Open or close this interview for new candidates.</p>
          </div>
        </div>

        <div className="mt-4 bg-slate-900/40 p-6 rounded-2xl border border-white/5 max-w-xl">
          <ToggleRow
            title="Interview Toggle"
            hint="Off = new candidates cannot start"
            checked={accepting}
            disabled={busy === "interview"}
            onChange={toggleInterview}
            label="Interview toggle"
          />
        </div>
      </div>

      <div className={tab === "features" ? "" : "hidden"}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
            <IconSettings />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Features</h3>
            <p className="text-xs text-white/50">Switch interview modules on or off. Changes save immediately.</p>
          </div>
        </div>

        <div>
          {catalog.length === 0 && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 mb-4">
              Modules did not load from the server. Check backend connection and refresh.
            </div>
          )}

          <ModuleList
            catalog={catalog}
            groups={groups}
            state={featureState}
            busyKey={busy}
            onToggle={toggleModule}
            extras={extras}
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-400 mt-3 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">{error}</p>}
    </>
  );
}

function EmailStatusBox() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;

    api
      .get("/hiring/email-status")
      .then((res) => alive && setStatus(res.data))
      .catch(() => alive && setStatus({ mode: "unknown", label: "Could not read the mail setup", ready: false }));

    return () => {
      alive = false;
    };
  }, []);

  const sendTest = async () => {
    setBusy(true);
    setResult(null);

    try {
      const res = await api.post("/hiring/email-test", null, { timeout: 90000 });
      setResult(res.data);
      setStatus(res.data.status || status);
    } catch (err) {
      setResult({ sent: false, info: err?.response?.data?.detail || "Test mail failed." });
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <p className="text-xs text-white/50 animate-pulse">Checking mail setup...</p>;
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Mail delivery</p>
          <p className="text-xs text-white/80 break-words mt-0.5">{status.label}</p>
          {status.from && <p className="text-[11px] text-white/50 break-all mt-0.5">From: {status.from}</p>}
        </div>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
            status.ready
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
          }`}
        >
          {status.ready ? "Ready" : "Not ready"}
        </span>
      </div>

      {status.problem && <p className="text-[11px] text-amber-400 leading-relaxed">{status.problem}</p>}

      <button
        type="button"
        onClick={sendTest}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs font-bold transition disabled:opacity-50"
      >
        {busy ? "Sending test mail..." : "Send a test mail to me"}
      </button>

      {result && (
        <p className={`text-[11px] break-words ${result.sent ? "text-emerald-400" : "text-rose-400"}`}>
          {result.sent ? "Test mail sent - check your inbox (and spam)." : result.info}
        </p>
      )}
    </div>
  );
}

function InterviewerBox({ item, t, onSaved }) {
  const [name, setName] = useState(item.interviewer?.name || "");
  const [email, setEmail] = useState(item.interviewer?.email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputCls = `mt-1.5 w-full px-3.5 py-2.5 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/50 text-white`;

  const save = async () => {
    setMessage("");
    setError("");

    if (!name.trim()) return setError("Enter the interviewer's name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid interviewer email.");

    setBusy(true);
    try {
      await api.put(`/hiring/interviews/${item.id}/settings`, {
        interviewer: { name: name.trim(), email: email.trim().toLowerCase() },
      });
      setMessage("Interviewer saved successfully.");
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save the interviewer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <p className="font-bold text-sm text-white/90">Interviewer</p>
      <p className="text-xs text-white/50 mt-1">
        Candidates see this name in the invitation email, replies go to this email, and reports are sent here.
      </p>

      <label className="block mt-3">
        <span className="text-[11px] font-bold text-white/70">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Interviewer name"
          maxLength={100}
          className={inputCls}
        />
      </label>

      <label className="block mt-3">
        <span className="text-[11px] font-bold text-white/70">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Interviewer email"
          maxLength={254}
          className={inputCls}
        />
      </label>

      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      {message && <p className="text-xs text-emerald-400 mt-2">{message}</p>}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 w-full py-2.5 rounded-xl border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs font-bold transition disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save interviewer"}
      </button>
    </div>
  );
}

function CandidatesColumn({ invitations, t, onResend, resending, emailOn, resume }) {
  const [copied, setCopied] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const copyLink = async (inv) => {
    try {
      await navigator.clipboard.writeText(inv.link || "");
    } catch {
      window.prompt("Copy this link", inv.link || "");
    }
    setCopied(inv.email);
    setTimeout(() => setCopied(""), 1800);
  };

  const filteredInvitations = useMemo(() => {
    return invitations.filter((inv) => {
      const matchesFilter =
        filterType === "all" ||
        (filterType === "sent" && inv.mail_status === "sent") ||
        (filterType === "pending" && (inv.mail_status === "pending" || inv.mail_status === "draft")) ||
        (filterType === "failed" && inv.mail_status === "failed");

      const matchesSearch =
        !searchQuery ||
        (inv.name && inv.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.email && inv.email.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesFilter && matchesSearch;
    });
  }, [invitations, filterType, searchQuery]);

  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(filteredInvitations.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filteredInvitations.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
            <IconUsers />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Candidates</h3>
            <p className="text-xs text-white/50">{filteredInvitations.length} {filteredInvitations.length === 1 ? "candidate" : "candidates"} found</p>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => { setFilterType("all"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filterType === "all" ? "bg-fuchsia-600 text-white shadow-sm" : "text-white/60 hover:text-white"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => { setFilterType("sent"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filterType === "sent" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-400/70 hover:text-emerald-400"}`}
          >
            Sent
          </button>
          <button
            type="button"
            onClick={() => { setFilterType("pending"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filterType === "pending" ? "bg-amber-600 text-white shadow-sm" : "text-amber-400/70 hover:text-amber-400"}`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => { setFilterType("failed"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filterType === "failed" ? "bg-rose-600 text-white shadow-sm" : "text-rose-400/70 hover:text-rose-400"}`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="w-full">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          placeholder="Search by candidate name or email address..."
          className={`w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/50 text-white`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.length === 0 && (
          <div className="col-span-full py-12 text-xs text-white/50 text-center bg-slate-900/20 rounded-2xl border border-white/5">
            No candidates found matching your criteria.
          </div>
        )}

        {rows.map((inv, i) => {
          const [label, cls] = MAIL_BADGE[inv.mail_status] || MAIL_BADGE.sent;

          return (
            <div key={inv.email} className="p-5 bg-slate-900/40 rounded-2xl border border-white/5 flex flex-col justify-between hover:border-white/10 transition shadow-lg">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-sm text-white/90 break-words">
                    {start + i + 1}. {inv.name || inv.email}
                  </p>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold shrink-0 ${cls}`}>
                    {label}
                  </span>
                </div>

                {inv.name && <p className="text-xs text-white/60 break-all mt-1">{inv.email}</p>}
                {inv.phone && <p className="text-xs text-white/60 mt-0.5">{inv.phone}</p>}
                {inv.code && (
                  <p className="text-[11px] text-white/40 font-mono mt-1">{inv.code}</p>
                )}

                {PROGRESS[inv.status] && (
                  <div className="mt-3">
                    <span className="text-[11px] text-fuchsia-400 font-medium bg-fuchsia-500/10 px-2.5 py-1 rounded-lg border border-fuchsia-500/20">
                      {PROGRESS[inv.status]}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {emailOn && (
                    <button
                      type="button"
                      disabled={resending === inv.email || inv.mail_status === "pending"}
                      onClick={() => onResend(inv)}
                      className="flex-1 py-2 px-3 rounded-xl border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs font-bold transition disabled:opacity-50"
                    >
                      {resending === inv.email || inv.mail_status === "pending"
                        ? "Sending..."
                        : inv.mail_status === "failed"
                        ? "Retry Email"
                        : inv.mail_status === "sent"
                        ? "Resend Email"
                        : "Send Email"}
                    </button>
                  )}

                  {inv.link && (
                    <button
                      type="button"
                      onClick={() => copyLink(inv)}
                      className="flex-1 py-2 px-3 rounded-xl border border-fuchsia-500/40 text-fuchsia-400 hover:bg-fuchsia-500/10 text-xs font-bold transition"
                    >
                      {copied === inv.email ? "Copied ✓" : "Copy Link"}
                    </button>
                  )}
                </div>

                {resume && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={resume.resumeBusy === inv.email}
                      onClick={() => resume.removeResume(inv.email)}
                      className="text-[11px] text-rose-400 hover:underline font-bold disabled:opacity-50"
                    >
                      {resume.resumeBusy === inv.email ? "Removing..." : "🗑️ Remove Resume/Data"}
                    </button>
                  </div>
                )}

                {emailOn && inv.mail_status === "failed" && inv.mail_error && (
                  <p className="text-[11px] text-rose-400 mt-1 break-words bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                    {inv.mail_error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/10 text-xs text-white/70">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            aria-label="Previous page"
            className="px-3 py-2 bg-white/5 rounded-xl disabled:opacity-30 hover:bg-white/10 transition"
          >
            ‹ Prev
          </button>
          <span className="flex gap-2 font-medium">
            {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={n === current ? "font-black text-fuchsia-400" : "opacity-60 hover:opacity-100"}
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
            className="px-3 py-2 bg-white/5 rounded-xl disabled:opacity-30 hover:bg-white/10 transition"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

function AddCandidateColumn({ interviewId, t, onAdded, emailOn, cvOn }) {
  const [cv, setCv] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const inputCls = `mt-1.5 w-full px-4 py-3.5 rounded-2xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm bg-slate-900/60 text-white transition-all shadow-inner`;

  const submit = async () => {
    setError("");
    setMessage("");

    const address = email.trim().toLowerCase();
    const digits = phone.replace(/[\s().-]/g, "");

    if (!name.trim()) return setError("Enter the candidate's full name.");
    if (!EMAIL_RE.test(address)) return setError("Enter a valid email address.");
    if (!/^\+?\d{7,15}$/.test(digits)) {
      return setError("Enter a valid phone number (7-15 digits, e.g. +919876543210).");
    }
    if (cv && (!/\.(pdf|docx)$/i.test(cv.name) || cv.size > 5 * 1024 * 1024)) {
      return setError("The CV must be a PDF or DOCX file, up to 5 MB.");
    }

    setBusy(true);

    try {
      const res = await api.post(`/hiring/interviews/${interviewId}/invite`, {
        candidates: [{ name: name.trim(), email: address, phone: digits }],
        send_email: emailOn,
      });

      let rows = res.data.invitations;
      let note = emailOn
        ? `${name.trim()} added successfully. The invitation has been sent to ${address}.`
        : `${name.trim()} added successfully. Email module is OFF - copy the link from candidates tab.`;

      if (cv && cvOn) {
        try {
          const up = await api.post(
            `/hiring/interviews/${interviewId}/resume`,
            {
              email: address,
              filename: cv.name,
              content_base64: await readBase64(cv),
            },
            { timeout: 60000 }
          );
          rows = up.data.invitations;
          note += " CV uploaded successfully.";
        } catch (err) {
          note += ` (CV upload failed: ${err?.response?.data?.detail || "error"})`;
        }
      }

      onAdded(rows);
      setMessage(note);
      setName("");
      setEmail("");
      setPhone("");
      setCv(null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not add the candidate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl bg-slate-950/40 p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-white/10">
        <div className="p-3 rounded-2xl bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30 shadow-md">
          <IconPersonPlus />
        </div>
        <div>
          <h3 className="font-extrabold text-xl text-white tracking-wide">Register New Candidate</h3>
          <p className="text-xs text-white/50 mt-0.5">Fill in the candidate profile and upload resume if needed.</p>
        </div>
      </div>

      <div className="space-y-5">
        {cvOn && (
          <div>
            <label className="block text-xs font-bold text-white/70 mb-2">Candidate Resume (Optional)</label>
            <label className="flex flex-col items-center justify-center cursor-pointer rounded-2xl border-2 border-dashed border-white/20 py-8 px-6 text-center hover:bg-fuchsia-500/5 hover:border-fuchsia-500/40 transition bg-slate-900/50 shadow-inner group">
              <span className="p-3 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 mb-2 group-hover:scale-110 transition-transform">
                <IconUpload />
              </span>
              <span className="block font-bold text-sm text-white/90 break-all">
                {cv ? cv.name : "Click to upload CV or drag and drop"}
              </span>
              <span className="block text-xs text-white/40 mt-1">PDF or DOCX (Max size: 5MB)</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  setCv(e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="block md:col-span-2">
            <span className="text-xs font-bold text-white/70">Full Name <span className="text-fuchsia-400">*</span></span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              maxLength={120}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-white/70">Email Address <span className="text-fuchsia-400">*</span></span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. john@example.com"
              maxLength={254}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-white/70">Phone Number <span className="text-fuchsia-400">*</span></span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 9876543210"
              maxLength={20}
              className={inputCls}
            />
          </label>
        </div>

        {error && (
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center gap-2 animate-shake">
            <span>⚠️</span> {error}
          </div>
        )}
        
        {message && (
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center gap-2">
            <span>✅</span> {message}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full mt-4 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-black text-sm tracking-wide transition-all disabled:opacity-50 shadow-xl shadow-fuchsia-600/25 active:scale-[0.99]"
        >
          {busy ? "Registering Candidate..." : "+ Add & Invite Candidate"}
        </button>
      </div>
    </div>
  );
}

export default function ClientSettings() {
  const { t } = useDashboard();
  const navigate = useNavigate();

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [tab, setTab] = useState("settings");
  const [invitations, setInvitations] = useState([]);
  const [resending, setResending] = useState("");
  const pollRef = useRef(null);

  const [featureState, setFeatureState] = useState({});
  const [followCount, setFollowCount] = useState(2);
  const [catalog, setCatalog] = useState([]);
  const [groups, setGroups] = useState([]);

  const [resumeBusy, setResumeBusy] = useState("");
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumeErr, setResumeErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/hiring/interviews");
      setCatalog(res.data.feature_catalog || []);
      setGroups(res.data.feature_groups || []);
      setItems(res.data.interviews);
      return res.data.interviews;
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load interviews.");
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const item = useMemo(
    () => (items || []).find((i) => i.id === pickedId) || items?.[0] || null,
    [items, pickedId]
  );

  useEffect(() => {
    setInvitations(item?.invitations || []);
    setFeatureState(item?.features || {});
    setFollowCount(Number(item?.follow_ups?.count) || 2);
  }, [item?.id]);

  const hasPending = invitations.some((i) => i.mail_status === "pending");

  useEffect(() => {
    if (!hasPending || !item) return undefined;
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      const list = await load();
      const fresh = list?.find((i) => i.id === item.id);
      if (fresh) setInvitations(fresh.invitations || []);
      if (tries >= 20) clearInterval(pollRef.current);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [hasPending, item?.id, load]);

  const resend = async (inv) => {
    setResending(inv.email);
    try {
      const res = await api.post(`/hiring/interviews/${item.id}/invite`, {
        candidates: [{ name: inv.name, email: inv.email, phone: inv.phone }],
        role: inv.role || undefined,
      });
      setInvitations(res.data.invitations);
    } catch (err) {
      window.alert(err?.response?.data?.detail || "Could not resend the email.");
    } finally {
      setResending("");
    }
  };

  const readFile = (file) => readBase64(file);

  const clearNotes = () => {
    setResumeMsg("");
    setResumeErr("");
  };

  const uploadResume = async (email, file) => {
    if (!file) return;
    clearNotes();
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setResumeErr("Upload a PDF or DOCX resume, up to 5 MB.");
      return;
    }
    setResumeBusy(email);
    try {
      const res = await api.post(
        `/hiring/interviews/${item.id}/resume`,
        { email, filename: file.name, content_base64: await readFile(file) },
        { timeout: 60000 }
      );
      setInvitations(res.data.invitations);
      setResumeMsg(res.data.note || `Resume added for ${email}.`);
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || "Could not upload the resume.");
    } finally {
      setResumeBusy("");
    }
  };

  const toggleResume = async (email, enabled) => {
    setResumeBusy(email);
    clearNotes();
    try {
      const res = await api.patch(`/hiring/interviews/${item.id}/resume`, { email, enabled });
      setInvitations(res.data.invitations);
      setResumeMsg(res.data.note || `Resume questions ${enabled ? "ON" : "OFF"} for ${email}.`);
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || "Could not change the resume setting.");
    } finally {
      setResumeBusy("");
    }
  };

  const removeResume = async (email) => {
    setResumeBusy(email);
    clearNotes();
    try {
      const res = await api.delete(`/hiring/interviews/${item.id}/resume`, {
        params: { email },
      });
      setInvitations(res.data.invitations);
      setResumeMsg(`Resume removed for ${email}.`);
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || "Could not remove the resume.");
    } finally {
      setResumeBusy("");
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        <div>
          <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-bold border border-blue-500/30">
            Admin Panel
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white mt-2">Client Settings</h1>
          <p className="text-white/60 text-sm mt-1">Manage interview settings, configurations and candidates smoothly.</p>
        </div>

        {items && items.length > 1 && (
          <select
            value={item?.id || ""}
            onChange={(e) => setPickedId(e.target.value)}
            aria-label="Interview"
            className={`px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900 text-white font-medium`}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
        )}
      </header>

      {error ? (
        <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
          {error}
        </div>
      ) : items === null ? (
        <p className="text-sm text-white/50 animate-pulse px-2">Loading...</p>
      ) : !item ? (
        <div className={`p-8 rounded-2xl border ${t.card} text-sm text-white/80 bg-slate-900/40`}>
          No interviews yet. Create an assessment first.
        </div>
      ) : (
        <>
          {!item.has_configuration ? (
            <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-300 flex items-center justify-between gap-4">
              <span>This interview has no configuration yet.</span>
              <button
                onClick={() => navigate(`/interviews/${item.id}/configuration`)}
                className="font-bold underline whitespace-nowrap hover:text-amber-200"
              >
                Configure now
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tab Bar Container (Aligned Left) */}
              <div className="flex justify-start">
                <div
                  role="tablist"
                  aria-label="Client settings sections"
                  className="inline-flex max-w-full justify-start gap-1.5 p-1.5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-lg"
                >
                  {TABS.map((tb) => {
                    const active = tab === tb.key;
                    const count = tb.key === "candidates" ? invitations.length : null;
                    return (
                      <button
                        key={tb.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setTab(tb.key)}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                          active
                            ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-md shadow-fuchsia-500/20"
                            : "text-white/70 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {tb.label}
                        {count !== null && (
                          <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/20 text-white">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Panel Content */}
              <section role="tabpanel" className={`rounded-3xl border ${t.card} p-6 md:p-8 bg-slate-900/40 backdrop-blur-xl shadow-2xl`}>
                <SettingsColumn
                  key={item.id}
                  tab={tab}
                  item={item}
                  t={t}
                  catalog={catalog}
                  groups={groups}
                  featureState={featureState}
                  onFeatureState={(map) => {
                    setFeatureState(map);
                    load();
                  }}
                  followCount={followCount}
                  onFollowCount={(n) => {
                    setFollowCount(n);
                    load();
                  }}
                  onInterviewerSaved={load}
                  resume={{
                    list: invitations,
                    resumeBusy,
                    resumeMsg,
                    resumeErr,
                    clearNotes,
                    uploadResume,
                    toggleResume,
                    removeResume,
                  }}
                />

                <div className={tab === "candidates" ? "" : "hidden"}>
                  <CandidatesColumn
                    invitations={invitations}
                    t={t}
                    onResend={resend}
                    resending={resending}
                    emailOn={featureState.email_invite?.active !== false}
                    resume={{
                      resumeBusy,
                      removeResume,
                    }}
                  />
                </div>

                <div className={tab === "add" ? "" : "hidden"}>
                  <AddCandidateColumn
                    interviewId={item.id}
                    t={t}
                    onAdded={setInvitations}
                    emailOn={featureState.email_invite?.active !== false}
                    cvOn={featureState.cv_upload?.active !== false}
                  />
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}