import { useEffect, useState } from "react";

import api from "../../services/api";

const DEFAULT_T = {
  input:
    "bg-white/5 border-white/10 text-white placeholder:text-slate-500",
};

const MAX_CHARS = 1800;

/**
 * Company introduction (interviewer side).
 *
 *   careers URL -> [Generate] -> editable draft -> [Approve & save]
 *
 * The AI runs ONLY when the interviewer presses Generate. Candidates hear
 * the saved text (voice only) and only after it has been approved here.
 * If the page cannot be read, the interviewer simply types the text.
 */
export default function CompanyIntroEditor({
  interviewId,
  role = "",
  company = "",
  t = DEFAULT_T,
}) {
  const inputCls = `w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`;

  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // what is currently saved (for the status line / dirty check)
  const [saved, setSaved] = useState({ text: "", approved: false });

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    api
      .get(`/interviews/${interviewId}/company-intro`)
      .then((res) => {
        if (cancelled) return;

        const d = res.data || {};

        setText(d.text || "");
        setSourceUrl(d.source_url || "");
        setUrl(d.source_url || "");
        setSaved({ text: d.text || "", approved: Boolean(d.approved) });
      })
      .catch(() => {
        // 404 etc. = nothing saved yet
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  const generate = async () => {
    if (!url.trim()) {
      setError("Enter the company's careers page URL first.");
      return;
    }

    if (
      text.trim() &&
      text.trim() !== saved.text.trim() &&
      !window.confirm("Replace the text you are editing with a new AI draft?")
    ) {
      return;
    }

    setGenerating(true);
    setError("");
    setNotice("");

    try {
      const res = await api.post(
        `/interviews/${interviewId}/company-intro/generate`,
        { url: url.trim(), role, company },
        { timeout: 90000 }
      );

      setText(res.data.text || "");
      setSourceUrl(res.data.source_url || url.trim());
      setNotice(
        "Draft ready. Read it, edit anything you like, then approve it below."
      );
    } catch (err) {
      const detail = err?.response?.data?.detail;

      setError(
        (typeof detail === "object" && detail?.message) ||
          (typeof detail === "string" && detail) ||
          "Could not generate the introduction."
      );

      // manual fallback: the text box below is always usable
      if (typeof detail === "object" && detail?.manual_entry) {
        setNotice(
          "No problem - type or paste the company introduction in the box below instead."
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const persist = async (approved, textOverride) => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const res = await api.put(`/interviews/${interviewId}/company-intro`, {
        text: textOverride !== undefined ? textOverride : text,
        source_url: sourceUrl || url.trim() || null,
        approved,
      });

      setText(res.data.text || "");
      setSaved({
        text: res.data.text || "",
        approved: Boolean(res.data.approved),
      });

      setNotice(
        !res.data.text
          ? "Company introduction removed."
          : res.data.approved
          ? "Approved. Candidates will hear this before the first question."
          : "Saved as a draft. Candidates will NOT hear it until you approve it."
      );
    } catch (err) {
      const detail = err?.response?.data?.detail;

      setError(
        (typeof detail === "string" && detail) ||
          "Could not save the company introduction."
      );
    } finally {
      setSaving(false);
    }
  };

  const dirty = text.trim() !== saved.text.trim();
  const busy = generating || saving;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold">Company introduction</h3>
        <p className="text-xs opacity-60">
          Candidates hear a short spoken introduction before the first
          question. Paste your careers page link and let AI draft it, or write
          it yourself. Nothing is played until you approve it.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className={inputCls}
          type="url"
          inputMode="url"
          placeholder="Careers page URL (e.g. https://company.com/careers)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />

        <button
          type="button"
          onClick={generate}
          disabled={busy || loading}
          className="shrink-0 px-5 py-3 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 text-sm font-semibold hover:bg-fuchsia-500/20 transition disabled:opacity-50"
        >
          {generating ? "Reading page..." : "Generate with AI"}
        </button>
      </div>

      <div className="space-y-2">
        <textarea
          rows={7}
          maxLength={MAX_CHARS}
          className={inputCls}
          placeholder="The company introduction the AI interviewer will speak. You can type it here directly."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />

        <div className="flex items-center justify-between text-xs opacity-60">
          <span>
            {saved.text
              ? saved.approved && !dirty
                ? "Status: approved - candidates will hear it"
                : saved.approved
                ? "Status: you have unsaved edits (the approved version is still used)"
                : "Status: draft - not played to candidates"
              : "Status: not set - the interview starts without an introduction"}
          </span>
          <span>
            {text.length}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => persist(true)}
          disabled={busy || !text.trim() || (saved.approved && !dirty)}
          className="px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Approve & save"}
        </button>

        <button
          type="button"
          onClick={() => persist(false)}
          disabled={busy || !text.trim()}
          className="px-5 py-3 rounded-2xl border border-white/15 text-sm font-semibold hover:bg-white/5 transition disabled:opacity-50"
        >
          Save as draft
        </button>

        {saved.text && (
          <button
            type="button"
            onClick={() => persist(false, "")}
            disabled={busy}
            className="px-5 py-3 rounded-2xl border border-rose-500/30 text-rose-300 text-sm font-semibold hover:bg-rose-500/10 transition disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
