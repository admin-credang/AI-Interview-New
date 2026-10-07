import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import InterviewSettingsForm from "../../components/dashboard/InterviewSettingsForm";
import { Toggle } from "../../components/dashboard/hiring";
import { IconAlert, IconMail } from "../../components/dashboard/icons";
import { useDashboard } from "../../context/DashboardContext";

const CUSTOM = "__custom__";

const STATUS_STYLE = {
  sent: ["Sent", "border-slate-400/30 bg-slate-400/10 text-slate-300"],
  opened: ["Opened", "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"],
  started: ["In interview", "border-amber-400/30 bg-amber-400/10 text-amber-300"],
  completed: ["Completed", "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"],
  ended: ["Ended early", "border-rose-400/30 bg-rose-400/10 text-rose-300"],
};

function InviteBox({ item, t, invitations, onInvited }) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  // ---- the role the interviewer fixes for the candidates ----
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

  const send = async () => {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (!role) {
      setError("Choose or type the role these candidates are interviewing for.");
      return;
    }

    if (list.length === 0) {
      setError("Enter at least one email address.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await api.post(`/hiring/interviews/${item.id}/invite`, {
        emails: list,
        role,
      });

      setMessage(
        `Invitation for "${res.data.role}" sent to ${res.data.queued} ${
          res.data.queued === 1 ? "person" : "people"
        }. Each one gets a personal Interview ID by email.` +
          (res.data.invalid.length ? ` Skipped invalid: ${res.data.invalid.join(", ")}` : "")
      );
      setEmails("");
      onInvited?.(res.data.invitations);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send invitations.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-300">
          <IconMail />
        </span>
        <div>
          <h3 className="font-bold">Invite candidates</h3>
          <p className="text-xs opacity-60">
            Pick the role, enter emails. Every candidate gets their own email with a
            personal Interview ID and can open only this role.
            {invitations.length > 0 ? ` ${invitations.length} invited so far.` : ""}
          </p>
        </div>
      </div>

      {/* ROLE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider opacity-50 font-bold">
            Role for these candidates
          </span>
          <select
            value={roleChoice}
            onChange={(e) => setRoleChoice(e.target.value)}
            className={`mt-1 w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r} className="text-black">
                {r}
              </option>
            ))}
            <option value={CUSTOM} className="text-black">
              Another role...
            </option>
          </select>
        </label>

        {roleChoice === CUSTOM && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider opacity-50 font-bold">
              Type the role
            </span>
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="e.g. Python Developer"
              maxLength={120}
              className={`mt-1 w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`}
            />
          </label>
        )}
      </div>

      <textarea
        rows={2}
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="Candidate emails, separated by comma, space or new line"
        className={`w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`}
      />

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {message && <p className="text-xs text-emerald-300">{message}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={send}
          disabled={busy}
          className="px-6 py-3 rounded-2xl font-bold border border-white/15 hover:bg-white/10 transition disabled:opacity-50 text-sm"
        >
          {busy ? "Sending..." : "Send invitations"}
        </button>

        <button
          onClick={() => copy(link, "link")}
          className="text-xs font-bold text-fuchsia-400 whitespace-nowrap"
          title="Plain interview link - candidates still need an invitation to open it"
        >
          {copied === "link" ? "Copied ✓" : "Copy plain link"}
        </button>
      </div>

      {/* WHO WAS INVITED */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-left uppercase tracking-wider opacity-50 border-b border-white/10">
                  <th className="px-4 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Interview ID</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {invitations.map((inv) => {
                  const [label, cls] = STATUS_STYLE[inv.status] || STATUS_STYLE.sent;

                  return (
                    <tr key={inv.email}>
                      <td className="px-4 py-3">
                        <p className="font-semibold break-all">{inv.name || inv.email}</p>
                        {inv.name && <p className="opacity-60 break-all">{inv.email}</p>}
                      </td>
                      <td className="px-4 py-3">{inv.role || "—"}</td>
                      <td className="px-4 py-3">
                        {inv.code ? (
                          <button
                            onClick={() => copy(inv.code, inv.email)}
                            className="font-mono font-bold hover:text-fuchsia-300"
                            title="Click to copy"
                          >
                            {copied === inv.email ? "Copied ✓" : inv.code}
                          </button>
                        ) : (
                          <span className="opacity-50">old invite</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${cls}`}>
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
    </div>
  );
}

function ControlCard({ item, t }) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(item.accepting);
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState(item.invitations || []);

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

  return (
    <section className={`rounded-[2rem] border ${t.card} p-6 md:p-8 space-y-8`}>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight truncate">{item.title}</h2>
          <p className="text-xs opacity-60 mt-1">
            {item.candidates_total} attended · {item.candidates_completed} completed ·{" "}
            {item.pending_review} pending review
          </p>
        </div>

        <div className="flex items-center gap-4 self-start">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${accepting ? "text-emerald-300" : "text-rose-300"}`}>
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
            className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold transition"
          >
            View candidates
          </button>
        </div>
      </div>

      {!accepting && (
        <p className="text-xs text-rose-200/80 -mt-4">
          New candidates cannot start this interview. People who already started or finished are not affected.
        </p>
      )}

      {!item.has_configuration ? (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-300 flex items-center justify-between gap-4">
          <span>This interview has no configuration yet.</span>
          <button
            onClick={() => navigate(`/interviews/${item.id}/configuration`)}
            className="font-bold underline whitespace-nowrap"
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
              initialJob={item.job}
              t={t}
            />
          </div>
        </>
      )}
    </section>
  );
}

export default function InterviewControls() {
  const { t } = useDashboard();

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-10">
      <header className="px-1">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Interview Controls</h1>
        <p className="opacity-70 mt-2 text-sm max-w-2xl">
          Per interview: invite candidates, open or close it, choose whether eye and face
          monitoring is required, and edit the job details candidates see. Candidates only
          see the job details and the interview process, never scores or analysis.
        </p>
      </header>

      {error ? (
        <div className="p-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
          {error}
        </div>
      ) : items === null ? (
        <p className="text-sm opacity-70 animate-pulse px-2">Loading interviews...</p>
      ) : items.length === 0 ? (
        <div className={`text-center py-24 px-6 rounded-[3rem] border ${t.card}`}>
          <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150">
            <IconAlert />
          </div>
          <h3 className="text-2xl font-bold mb-2">No interviews yet</h3>
          <p className="opacity-60 text-sm">Create an assessment first, then control it here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {items.map((item) => (
            <ControlCard key={item.id} item={item} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
