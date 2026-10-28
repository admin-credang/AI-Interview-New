import { useEffect, useMemo, useState } from "react";

import api from "../../../services/api";
import { Toggle } from "../hiring";
import { EMAIL_RE } from "./shared";

/* ------------------------------------------------------------------
 * Module list: every ON / OFF module of ONE interview, grouped.
 * ------------------------------------------------------------------ */
function ModuleList({ catalog, groups, state, busyKey, onToggle, extras }) {
  const childrenOf = (key) => catalog.filter((m) => m.parent === key);
  const stateOf = (m) => state[m.key] || { on: m.default, active: m.default };

  const renderChild = (m) => {
    const st = stateOf(m);
    const parentActive = !m.parent || state[m.parent]?.active !== false;

    return (
      <div key={m.key} className="pl-3 border-l border-slate-200 my-2">
        <div className="flex items-center justify-between py-1.5" title={m.description}>
          <span className="text-xs text-slate-700">{m.label}</span>
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {g.label}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              {tops.map((m) => {
                const st = stateOf(m);
                const kids = childrenOf(m.key);

                return (
                  <div
                    key={m.key}
                    className="p-5 bg-white rounded-2xl border border-slate-200 flex flex-col justify-between hover:border-slate-200 transition shadow-lg"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-800">{m.label}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>

                      <div className="flex items-center justify-between mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-xs font-medium text-slate-600">
                          {st.on ? "Enabled" : "Disabled"}
                        </span>
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
                        <div className="mt-3 pt-3 border-t border-slate-200">{kids.map(renderChild)}</div>
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

function InterviewerBox({ item, t, onSaved }) {
  const [name, setName] = useState(item.interviewer?.name || "");
  const [email, setEmail] = useState(item.interviewer?.email || "");
  const [connected, setConnected] = useState(Boolean(item.interviewer?.mailbox_connected));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputCls = `mt-1.5 w-full px-3.5 py-2.5 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400 text-xs bg-white text-slate-900`;

  const save = async () => {
    setMessage("");
    setError("");

    if (!name.trim()) return setError("Enter the interviewer's name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid interviewer email.");

    setBusy(true);
    try {
      const res = await api.put(
        `/hiring/interviews/${item.id}/settings`,
        {
          interviewer: {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            disconnect_mailbox: false,
          },
        },
        { timeout: 60000 }
      );
      const nowConnected = Boolean(res.data?.interviewer?.mailbox_connected);
      setConnected(nowConnected);
      setMessage(
        nowConnected
          ? "Saved. Candidate mails are sent from your connected Gmail."
          : "Interviewer saved successfully."
      );
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save the interviewer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <p className="font-bold text-sm text-slate-800">Interviewer</p>
      <p className="text-xs text-slate-500 mt-1">
        Candidates see this name in the invitation email, replies go to this email, and reports are sent here.
      </p>

      <label className="block mt-3">
        <span className="text-[11px] font-bold text-slate-600">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Interviewer name"
          maxLength={100}
          className={inputCls}
        />
      </label>

      <label className="block mt-3">
        <span className="text-[11px] font-bold text-slate-600">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Interviewer email"
          maxLength={254}
          className={inputCls}
        />
      </label>

      <p className={`text-[11px] font-bold mt-4 ${connected ? "text-emerald-600" : "text-amber-700"}`}>
        {connected
          ? "Gmail connected - candidate mails are sent from your login Gmail"
          : "Gmail not connected - use the Connect Gmail button at the top of this page"}
      </p>

      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      {message && <p className="text-xs text-emerald-600 mt-2">{message}</p>}

      <button
        type="button"
        onClick={() => save()}
        disabled={busy}
        className="mt-4 w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save interviewer"}
      </button>

    </div>
  );
}

/* ------------------------------------------------------------------
 * Compulsory questions: the client writes up to 5 questions. Every
 * candidate gets them, word for word, at the END of the interview
 * (after company intro, resume questions and follow-ups).
 * ------------------------------------------------------------------ */
const MAX_COMPULSORY = 5;
const MAX_COMPULSORY_LENGTH = 500;

function CompulsoryBox({ item, t }) {
  const [list, setList] = useState(
    item.compulsory_questions?.length ? item.compulsory_questions : [""]
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputCls = `w-full px-3.5 py-2.5 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400 text-xs bg-white text-slate-900 resize-none`;

  const change = (index, value) => {
    setMessage("");
    setList((prev) => prev.map((q, i) => (i === index ? value : q)));
  };

  const add = () => {
    setMessage("");
    setList((prev) => (prev.length < MAX_COMPULSORY ? [...prev, ""] : prev));
  };

  const remove = (index) => {
    setMessage("");
    setList((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  };

  const save = async () => {
    setMessage("");
    setError("");

    const clean = list.map((q) => q.trim()).filter(Boolean);
    const unique = new Set(clean.map((q) => q.toLowerCase()));

    if (unique.size !== clean.length) {
      return setError("The same question is added twice. Remove the duplicate.");
    }

    setBusy(true);
    try {
      const res = await api.put(`/hiring/interviews/${item.id}/settings`, {
        compulsory_questions: clean,
      });
      const saved = res.data.compulsory_questions || [];
      setList(saved.length ? saved : [""]);
      setMessage(
        saved.length
          ? `${saved.length} compulsory question${saved.length > 1 ? "s" : ""} saved. They apply to candidates who have not started yet.`
          : "No compulsory questions."
      );
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save the questions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {list.map((q, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2.5 text-[11px] font-bold text-slate-500 w-4 shrink-0">{i + 1}.</span>
          <textarea
            value={q}
            rows={2}
            maxLength={MAX_COMPULSORY_LENGTH}
            onChange={(e) => change(i, e.target.value)}
            placeholder={`Compulsory question ${i + 1}`}
            className={inputCls}
          />
          <button data-plain
            type="button"
            onClick={() => remove(i)}
            className="mt-1.5 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-500/40 text-xs transition"
            title="Remove this question"
            aria-label={`Remove question ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}

      {list.length < MAX_COMPULSORY && (
        <button
          type="button"
          onClick={add}
          className="w-full py-2 rounded-xl border border-dashed border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition"
        >
          + Add question ({list.length}/{MAX_COMPULSORY})
        </button>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save compulsory questions"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------
 * The "Features" tab of one interview.
 *
 * "Resume questions" is ONE common switch for the whole interview:
 *   ON  -> every candidate who has a resume gets questions from it
 *   OFF -> no resume questions for anyone
 * ------------------------------------------------------------------ */
/* Features are shown on 2 pages. */
const PAGE_ONE = ["interview", "monitoring"];
const PAGE_LABELS = ["Interview & detection", "E-mails & access"];

const TEXT_OVERRIDE = {
  compulsory_questions: "Add up to 5 fixed questions of your own. Every candidate is asked the same questions, word for word, at the end of the interview, so answers are easy to compare. These are not AI-generated - ideal for notice period, expected salary, location or availability.",
  monitoring: "AI proctoring for the whole interview. The camera starts automatically and the candidate cannot turn it off. It detects cheating signs: no face or more than one face, eyes looking away from the screen, and mobile phone use. Findings appear in the gaze report in each candidate's results.",
};

/* Compulsory questions are listed above Resume questions. */
function arrange(catalog) {
  const list = catalog.map((m) =>
    TEXT_OVERRIDE[m.key] ? { ...m, description: TEXT_OVERRIDE[m.key] } : m
  ).map((m) => (m.key === "monitoring" ? { ...m, label: "Cheating detection" } : m));
  const ci = list.findIndex((m) => m.key === "compulsory_questions");
  const ri = list.findIndex((m) => m.key === "resume_questions");
  if (ci > ri && ri >= 0) {
    const [c] = list.splice(ci, 1);
    list.splice(ri, 0, c);
  }
  return list;
}

export default function FeaturesPanel({
  item,
  t,
  catalog,
  groups,
  featureState,
  followCount,
  onFeatureState,
  onFollowCount,
  onInterviewerSaved,
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const view = useMemo(() => arrange(catalog), [catalog]);
  const [page, setPage] = useState(0);

  const pageGroups = useMemo(() => {
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    return page === 0
      ? PAGE_ONE.map((k) => byKey[k]).filter(Boolean)
      : groups.filter((g) => !PAGE_ONE.includes(g.key));
  }, [groups, page]);

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
      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
        <span className="text-xs text-slate-600">How many follow-ups</span>
        <select
          value={followCount}
          disabled={busy === "follow_count"}
          onChange={(e) => saveFollowCount(Number(e.target.value))}
          className={`px-3 py-1.5 rounded-lg border ${t.input} text-xs outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    ),
    compulsory_questions: <CompulsoryBox key={item.id} item={item} t={t} />,
    custom_interviewer: <InterviewerBox key={item.id} item={item} t={t} onSaved={onInterviewerSaved} />,
  };

  return (
    <div>
      {catalog.length === 0 && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 mb-4">
          Modules did not load from the server. Check backend connection and refresh.
        </div>
      )}

      <ModuleList
        catalog={view}
        groups={pageGroups}
        state={featureState}
        busyKey={busy}
        onToggle={toggleModule}
        extras={extras}
      />

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setPage(0)}
          disabled={page === 0}
          className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-30 transition"
        >
          ‹ Previous
        </button>

        <div className="flex items-center gap-2">
          {PAGE_LABELS.map((label, n) => (
            <button data-plain
              key={label}
              type="button"
              onClick={() => setPage(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                page === n
 ? "bg-violet-600 text-white"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {n + 1}. {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-30 transition"
        >
          Next ›
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 mt-3 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
          {error}
        </p>
      )}
    </div>
  );
}
