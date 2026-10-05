import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import InterviewSettingsForm from "../../components/dashboard/InterviewSettingsForm";
import { Toggle } from "../../components/dashboard/hiring";
import { IconAlert, IconMail } from "../../components/dashboard/icons";
import { useDashboard } from "../../context/DashboardContext";

function InviteBox({ item, t }) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const link = `${window.location.origin}/interviews/${item.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", link);
    }
  };

  const send = async () => {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

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
      });

      setMessage(
        `Invitation queued for ${res.data.queued} ${res.data.queued === 1 ? "person" : "people"}.` +
          (res.data.invalid.length ? ` Skipped invalid: ${res.data.invalid.join(", ")}` : "")
      );
      setEmails("");
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
            Send the interview link by email, or copy it and share it yourself.
            {item.invited_count > 0 ? ` ${item.invited_count} invited so far.` : ""}
          </p>
        </div>
      </div>

      <div className={`flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs ${t.input}`}>
        <span className="truncate flex-1 opacity-80">{link}</span>
        <button onClick={copy} className="font-bold text-fuchsia-400 whitespace-nowrap">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>

      <textarea
        rows={2}
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="Emails, separated by comma, space or new line"
        className={`w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`}
      />

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {message && <p className="text-xs text-emerald-300">{message}</p>}

      <button
        onClick={send}
        disabled={busy}
        className="px-6 py-3 rounded-2xl font-bold border border-white/15 hover:bg-white/10 transition disabled:opacity-50 text-sm"
      >
        {busy ? "Sending..." : "Send invitations"}
      </button>
    </div>
  );
}

function ControlCard({ item, t }) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(item.accepting);
  const [busy, setBusy] = useState(false);

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
            onClick={() => navigate("/dashboard/candidates")}
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
          <InviteBox item={item} t={t} />

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
