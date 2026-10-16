import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import InterviewSettingsForm from "../../components/dashboard/InterviewSettingsForm";
import { Toggle } from "../../components/dashboard/hiring";
import { IconAlert, IconMail } from "../../components/dashboard/icons";
import { useDashboard } from "../../context/DashboardContext";

const CUSTOM = "__custom__";

const STATUS_STYLE = {
  sent: ["Sent", "border-slate-500/30 bg-slate-500/10 text-slate-300"],
  opened: ["Opened", "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"],
  started: ["In interview", "border-amber-500/30 bg-amber-500/10 text-amber-300"],
  completed: ["Completed", "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"],
  ended: ["Ended early", "border-rose-500/30 bg-rose-500/10 text-rose-300"],
};

export function RoleResumeDropdown({
  role,
  list,
  t,
  resumeBusy,
  resumeMsg,
  resumeErr,
  clearNotes,
  uploadResume,
  toggleResume,
  removeResume,
  bare = false,
}) {
  const [openState, setOpen] = useState(false);
  const open = bare || openState;
  const [email, setEmail] = useState("");

  const picked = list.find((i) => i.email === email) || null;
  const working = picked && resumeBusy === picked.email;
  const started = picked && ["started", "completed", "ended"].includes(picked.status);
  const withResume = list.filter((i) => i.has_resume && i.resume_questions).length;

  return (
    <div className={bare ? "" : "rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 backdrop-blur-xl shadow-lg"}>
      {!bare && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition rounded-2xl"
        >
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-white truncate">{role}</span>
            <span className="block text-xs text-white/50 mt-0.5">
              {list.length} {list.length === 1 ? "candidate" : "candidates"} ·{" "}
              {withResume} with resume questions ON
            </span>
          </span>
          <span className={`transition-transform duration-300 text-fuchsia-400 font-bold ${open ? "rotate-180" : ""}`}>▼</span>
        </button>
      )}

      {open && (
        <div className={bare ? "space-y-4" : "px-5 pb-5 space-y-4 border-t border-white/10 pt-4"}>
          <select
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearNotes();
            }}
            className={`w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/80 text-white font-medium`}
          >
            <option value="" className="bg-slate-900 text-white">
              Select a candidate...
            </option>
            {list.map((inv) => (
              <option key={inv.email} value={inv.email} className="bg-slate-900 text-white">
                {(inv.name ? `${inv.name} - ` : "") + inv.email}
                {inv.has_resume ? (inv.resume_questions ? " (resume ON)" : " (resume OFF)") : ""}
              </option>
            ))}
          </select>

          {picked && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-white/5">
              {picked.has_resume && (
                <span
                  className="max-w-[220px] truncate text-xs font-semibold text-emerald-400 flex items-center gap-1.5"
                  title={picked.resume_name}
                >
                  ✓ {picked.resume_name || "Resume added"}
                </span>
              )}

              <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-fuchsia-500/30 text-xs font-bold text-fuchsia-400 hover:bg-fuchsia-500/10 transition">
                {working ? "Working..." : picked.has_resume ? "Replace resume" : "Upload resume"}
                <input
                  type="file"
                  className="hidden"
                  disabled={working}
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    uploadResume(picked.email, file);
                  }}
                />
              </label>

              {picked.has_resume && (
                <button
                  type="button"
                  onClick={() => removeResume(picked.email)}
                  disabled={working}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300"
                >
                  Remove
                </button>
              )}

              <div className="flex items-center gap-3">
                <Toggle
                  label="Resume questions"
                  checked={Boolean(picked.has_resume && picked.resume_questions)}
                  disabled={!picked.has_resume || working}
                  onChange={(v) => toggleResume(picked.email, v)}
                />
                <span className="text-xs font-bold text-white/80">
                  Questions {picked.has_resume && picked.resume_questions ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          )}

          {picked && !picked.has_resume && (
            <p className="text-xs text-amber-300/80">Upload a resume first to switch this ON.</p>
          )}
          {started && (
            <p className="text-xs text-amber-300/80">
              This candidate already started, so their questions will not change.
            </p>
          )}
          {picked && resumeMsg && <p className="text-xs text-emerald-400 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">{resumeMsg}</p>}
          {picked && resumeErr && <p className="text-xs text-rose-400 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">{resumeErr}</p>}
        </div>
      )}
    </div>
  );
}

function InviteBox({ item, t, invitations, onInvited }) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeBusy, setResumeBusy] = useState("");
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumeErr, setResumeErr] = useState("");

  const roleOptions = useMemo(() => {
    const list = [item.job?.role, item.title].filter(Boolean);
    return [...new Set(list)];
  }, [item.job?.role, item.title]);

  const [roleChoice, setRoleChoice] = useState(roleOptions[0] || CUSTOM);
  const [customRole, setCustomRole] = useState("");

  const role = (roleChoice === CUSTOM ? customRole : roleChoice).trim();
  const link = `${window.location.origin}/interviews/${item.id}`;

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      window.prompt("Copy this", text);
    }
  };

  const readBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });

  const uploadResume = async (email, file) => {
    if (!file) return;
    setResumeErr("");
    setResumeMsg("");

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setResumeErr("Upload a PDF or Word (.docx) resume.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResumeErr("The resume is too large (maximum 5 MB).");
      return;
    }

    setResumeBusy(email);
    try {
      const res = await api.post(
        `/hiring/interviews/${item.id}/resume`,
        { email, filename: file.name, content_base64: await readBase64(file) },
        { timeout: 60000 }
      );
      onInvited?.(res.data.invitations);
      setResumeMsg(res.data.note || `Resume added for ${email}.`);
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || err?.message || "Could not upload the resume.");
    } finally {
      setResumeBusy("");
    }
  };

  const toggleResume = async (email, enabled) => {
    setResumeBusy(email);
    setResumeErr("");
    setResumeMsg("");

    try {
      const res = await api.patch(`/hiring/interviews/${item.id}/resume`, { email, enabled });
      onInvited?.(res.data.invitations);
      setResumeMsg(res.data.note || (enabled ? `Resume questions ON for ${email}.` : `Resume questions OFF for ${email}.`));
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || "Could not change the resume setting.");
    } finally {
      setResumeBusy("");
    }
  };

  const removeResume = async (email) => {
    setResumeBusy(email);
    setResumeErr("");
    setResumeMsg("");

    try {
      const res = await api.delete(`/hiring/interviews/${item.id}/resume`, { params: { email } });
      onInvited?.(res.data.invitations);
      setResumeMsg(`Resume removed for ${email}.`);
    } catch (err) {
      setResumeErr(err?.response?.data?.detail || "Could not remove the resume.");
    } finally {
      setResumeBusy("");
    }
  };

  const send = async () => {
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

    if (!role) {
      setError("Choose or type the role these candidates are interviewing for.");
      return;
    }
    if (list.length === 0) {
      setError("Enter at least one email address.");
      return;
    }
    if (resumeFile && list.length !== 1) {
      setError("A resume belongs to one candidate. Enter just that candidate's email, or invite everyone first.");
      return;
    }
    if (resumeFile && (!/\.(pdf|docx)$/i.test(resumeFile.name) || resumeFile.size > 5 * 1024 * 1024)) {
      setError("The resume must be a PDF or Word (.docx) file, up to 5 MB.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await api.post(`/hiring/interviews/${item.id}/invite`, { emails: list, role });
      setMessage(
        `Invitation mail sent successfully to ${res.data.queued} ${res.data.queued === 1 ? "person" : "people"}.` +
          (res.data.invalid.length ? ` Skipped invalid: ${res.data.invalid.join(", ")}` : "")
      );
      setEmails("");
      onInvited?.(res.data.invitations);

      if (resumeFile && list.length === 1) {
        await uploadResume(list[0], resumeFile);
        setResumeFile(null);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send invitations.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <span className="p-3 rounded-2xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <IconMail />
        </span>
        <div>
          <h3 className="font-extrabold text-lg text-white">Send Status & Invite Mail</h3>
          <p className="text-xs text-white/50 mt-0.5">
            Enter candidate emails to send status and interview link invitation mails automatically.
            {invitations.length > 0 ? ` ${invitations.length} invited so far.` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-white/60 font-extrabold">
            Role for these candidates
          </span>
          <select
            value={roleChoice}
            onChange={(e) => setRoleChoice(e.target.value)}
            className={`mt-2 w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/80 text-white`}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r} className="bg-slate-900 text-white">
                {r}
              </option>
            ))}
            <option value={CUSTOM} className="bg-slate-900 text-white">
              Another role...
            </option>
          </select>
        </label>

        {roleChoice === CUSTOM && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-white/60 font-extrabold">
              Type the role
            </span>
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="e.g. Python Developer"
              maxLength={120}
              className={`mt-2 w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/80 text-white`}
            />
          </label>
        )}
      </div>

      <textarea
        rows={3}
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="Candidate emails, separated by comma, space or new line..."
        className={`w-full px-4 py-3 rounded-2xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900/50 text-white shadow-inner`}
      />

      <div className="rounded-2xl border border-dashed border-white/20 p-5 space-y-3 bg-slate-900/30">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer px-4 py-2.5 rounded-xl border border-white/15 text-xs font-bold text-white/80 hover:bg-white/10 transition bg-slate-900">
            {resumeFile ? "Change resume" : "Attach resume (optional)"}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setResumeFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
          </label>

          {resumeFile && (
            <>
              <span className="text-xs font-semibold text-emerald-400 break-all">
                ✓ {resumeFile.name}
              </span>
              <button
                type="button"
                onClick={() => setResumeFile(null)}
                className="text-xs font-bold text-rose-400 hover:underline"
              >
                Remove
              </button>
            </>
          )}
        </div>

        <p className="text-[11px] text-white/50 leading-relaxed">
          Optional. Attach a resume for single candidate invitation if needed.
        </p>
      </div>

      {error && <p className="text-xs text-rose-400 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">{error}</p>}
      {message && <p className="text-xs text-emerald-400 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">{message}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={send}
          disabled={busy}
          className="px-6 py-3.5 rounded-2xl font-bold bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white transition disabled:opacity-50 text-xs shadow-lg shadow-fuchsia-600/25"
        >
          {busy ? "Sending Mail..." : "Send Status & Invite Mail"}
        </button>

        <button
          onClick={() => copy(link, "link")}
          className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 transition"
          title="Plain interview link"
        >
          {copied === "link" ? "Copied ✓" : "Copy plain link"}
        </button>
      </div>

      {invitations.length > 0 && (
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/40">
          <p className="px-5 pt-4 text-xs text-white/60">
            Everyone invited for this role. Use the "Resume questions" panel below to manage resumes.
          </p>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-left uppercase tracking-wider text-white/50 border-b border-white/10 bg-white/[0.02]">
                  <th className="px-5 py-3 font-bold">Candidate</th>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-5 py-3 font-bold">Interview ID</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invitations.map((inv) => {
                  const [label, cls] = STATUS_STYLE[inv.status] || STATUS_STYLE.sent;

                  return (
                    <tr key={inv.email} className="hover:bg-white/[0.02] transition">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-white/90 break-all">{inv.name || inv.email}</p>
                        {inv.name && <p className="text-white/50 break-all text-[11px] mt-0.5">{inv.email}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-white/80">{inv.role || "—"}</td>
                      <td className="px-5 py-3.5">
                        {inv.code ? (
                          <button
                            onClick={() => copy(inv.code, inv.email)}
                            className="font-mono font-bold text-fuchsia-400 hover:text-fuchsia-300"
                            title="Click to copy"
                          >
                            {copied === inv.email ? "Copied ✓" : inv.code}
                          </button>
                        ) : (
                          <span className="text-white/40">old invite</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold ${cls}`}>
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div>
            <h4 className="font-bold text-base text-white">Resume questions</h4>
            <p className="text-xs text-white/50 mt-1">
              Open a role, pick a candidate, add the resume and switch it ON to give extra questions.
            </p>
          </div>

          {[...new Set(invitations.map((i) => i.role || "No role"))].map((r) => (
            <RoleResumeDropdown
              key={r}
              role={r}
              t={t}
              list={invitations.filter((i) => (i.role || "No role") === r)}
              resumeBusy={resumeBusy}
              resumeMsg={resumeMsg}
              resumeErr={resumeErr}
              clearNotes={() => {
                setResumeMsg("");
                setResumeErr("");
              }}
              uploadResume={uploadResume}
              toggleResume={toggleResume}
              removeResume={removeResume}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ControlCard({ item, t, defaultOpen = false }) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(item.accepting);
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState(item.invitations || []);
  const [isOpen, setIsOpen] = useState(defaultOpen); // Initial state controlled properly

  const toggleAccepting = async (open) => {
    setBusy(true);
    try {
      const res = await api.post(`/hiring/interviews/${item.id}/status`, { open });
      setAccepting(res.data.accepting);
    } catch (err) {
      window.alert(err?.response?.data?.detail || "Could not change the interview status.");
    } finally {
      setBusy(false);
    }
  };

  const withResume = invitations.filter((i) => i.has_resume && i.resume_questions).length;

  return (
    <section className={`rounded-3xl border ${t.card} bg-slate-950/40 backdrop-blur-xl shadow-2xl transition-all duration-300`}>
      {/* Header with Pink Arrow Dropdown Button */}
      <div className={`p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-white/10 ${
          isOpen ? "border-b" : ""
        }`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black tracking-tight text-white truncate">{item.title}</h2>
          </div>
          <p className="text-xs text-white/50 mt-1">
            {invitations.length} candidates · {withResume} with resume questions ON
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-900/60 px-4 py-2 rounded-2xl border border-white/5">
            <span className={`text-xs font-bold ${accepting ? "text-emerald-400" : "text-rose-400"}`}>
              {accepting ? "Accepting candidates" : "Closed"}
            </span>
            <Toggle
              label="Accepting candidates"
              checked={accepting}
              disabled={busy}
              onChange={toggleAccepting}
            />
          </div>

          <button
            onClick={() => navigate(`/dashboard/candidates?interview=${item.id}`)}
            className="px-4 py-2.5 rounded-xl border border-white/15 hover:bg-white/10 text-xs font-bold text-white transition"
          >
            View candidates
          </button>

          {/* Dropdown Toggle Button (Pink Arrow) */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            className="p-2.5 rounded-xl hover:bg-white/10 transition text-fuchsia-400 font-extrabold text-lg flex items-center justify-center"
            title="Toggle interview details"
          >
            <span className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="p-6 md:p-8 space-y-8 animate-fadeIn">
          {!accepting && (
            <p className="text-xs text-rose-300 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
              New candidates cannot start this interview. People who already started or finished are not affected.
            </p>
          )}

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
            <>
              <InviteBox
                item={item}
                t={t}
                invitations={invitations}
                onInvited={setInvitations}
              />

              <div className="border-t border-white/10 pt-8">
                <InterviewSettingsForm
                  interviewId={item.id}
                  initialProctoring={item.proctoring}
                  initialFollowUps={item.follow_ups}
                  initialResumeQuestions={item.resume_questions_enabled}
                  initialJob={item.job}
                  t={t}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function InterviewControls() {
  const { t } = useDashboard();

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const [picked, setPicked] = useState(searchParams.get("interview") || "");

  useEffect(() => {
    let cancelled = false;

    api
      .get("/hiring/interviews")
      .then((res) => {
        if (!cancelled) setItems(res.data.interviews);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Could not load interviews.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedId =
    picked === "all" || (picked && items?.some((i) => i.id === picked))
      ? picked
      : items?.[0]?.id || "all";

  const visible =
    selectedId === "all" ? items || [] : (items || []).filter((i) => i.id === selectedId);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header className="bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-bold border border-blue-500/30">
          Management
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white mt-2">Interview Controls</h1>
        <p className="text-white/60 text-sm mt-1 max-w-2xl leading-relaxed">
          Per interview: invite candidates, open or close it, manage monitoring, and edit job details seamlessly.
        </p>
      </header>

      {error ? (
        <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
          {error}
        </div>
      ) : items === null ? (
        <p className="text-sm text-white/50 animate-pulse px-2">Loading interviews...</p>
      ) : items.length === 0 ? (
        <div className={`text-center py-24 px-6 rounded-3xl border ${t.card} bg-slate-900/30`}>
          <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150">
            <IconAlert />
          </div>
          <h3 className="text-2xl font-bold mb-2 text-white">No interviews yet</h3>
          <p className="text-white/50 text-sm">Create an assessment first, then control it here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className={`rounded-2xl border ${t.card} p-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900/40 backdrop-blur-xl shadow-lg`}>
            <label
              htmlFor="interview-picker"
              className="text-[11px] uppercase tracking-wider text-white/60 font-bold"
            >
              Select Interview
            </label>
            <select
              id="interview-picker"
              value={selectedId}
              onChange={(e) => setPicked(e.target.value)}
              className={`px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-xs bg-slate-900 text-white font-medium w-full sm:max-w-xs`}
            >
              <option value="all" className="bg-slate-900 text-white">
                All interviews
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id} className="bg-slate-900 text-white">
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {visible.map((item) => (
              <ControlCard 
                key={item.id} 
                item={item} 
                t={t} 
                defaultOpen={selectedId !== "all"} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}