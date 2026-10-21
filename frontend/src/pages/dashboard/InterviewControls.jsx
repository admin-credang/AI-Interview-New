import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import InterviewSettingsForm from "../../components/dashboard/InterviewSettingsForm";
import AddCandidateForm from "../../components/dashboard/controls/AddCandidateForm";
import CandidatesTable from "../../components/dashboard/controls/CandidatesTable";
import FeaturesPanel from "../../components/dashboard/controls/FeaturesPanel";
import GmailConnectCard from "../../components/dashboard/controls/GmailConnectCard";
import { readBase64, validResume } from "../../components/dashboard/controls/shared";
import { Toggle } from "../../components/dashboard/hiring";
import { IconAlert } from "../../components/dashboard/icons";
import { ReviewTop, useReviewState } from "./Candidates";
import { useDashboard } from "../../context/DashboardContext";

const TABS = [
  { key: "candidates", label: "Candidates" },
  { key: "add", label: "Add Candidate" },
  { key: "features", label: "Features" },
  { key: "job", label: "Job Details" },
];

/* A tab body: mounted the first time it is opened, then only hidden. */
function Panel({ id, tab, seen, children }) {
  if (!seen[id]) return null;
  return <div className={tab === id ? "" : "hidden"}>{children}</div>;
}

/* ------------------------------------------------------------------
 * ONE interview: header + tabs (Candidates, Add Candidate,
 * Features, Job Details).
 * ------------------------------------------------------------------ */
function ControlCard({ item, t, catalog, groups, defaultOpen = false }) {
  const navigate = useNavigate();

  const [accepting, setAccepting] = useState(item.accepting);
  const [busy, setBusy] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const review = useReviewState(item.id, isOpen && item.has_configuration);

  const [tab, setTab] = useState("candidates");
  const [seen, setSeen] = useState({ candidates: true });

  const [invitations, setInvitations] = useState(item.invitations || []);
  const [featureState, setFeatureState] = useState(item.features || {});
  const [followCount, setFollowCount] = useState(Number(item.follow_ups?.count) || 2);

  const [resending, setResending] = useState("");
  const [busyEmail, setBusyEmail] = useState("");
  const [notice, setNotice] = useState({ msg: "", err: "" });

  const emailOn = featureState.email_invite?.active !== false;

  const withResume = invitations.filter((i) => i.has_resume).length;

  const openTab = (key) => {
    setNotice({ msg: "", err: "" });
    setTab(key);
    setSeen((s) => (s[key] ? s : { ...s, [key]: true }));
  };

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

  // while a mail is still being delivered, check again every 3 seconds
  const pollRef = useRef(null);
  const hasPending = invitations.some((i) => i.mail_status === "pending");

  useEffect(() => {
    if (!hasPending) return undefined;

    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      try {
        const res = await api.get("/hiring/interviews");
        const fresh = res.data.interviews.find((i) => i.id === item.id);
        if (fresh) setInvitations(fresh.invitations || []);
      } catch {
        /* try again on the next tick */
      }
      if (tries >= 20) clearInterval(pollRef.current);
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, [hasPending, item.id]);

  const resend = async (inv) => {
    setResending(inv.email);
    setNotice({ msg: "", err: "" });
    try {
      const res = await api.post(`/hiring/interviews/${item.id}/invite`, {
        candidates: [{ name: inv.name, email: inv.email, phone: inv.phone }],
        role: inv.role || undefined,
      });
      setInvitations(res.data.invitations);
    } catch (err) {
      setNotice({ msg: "", err: err?.response?.data?.detail || "Could not resend the email." });
    } finally {
      setResending("");
    }
  };

  const removeCandidate = async (inv) => {
    const taken = ["started", "completed", "ended"].includes(inv.status);
    const ok = window.confirm(
      `Delete ${inv.name || inv.email} from this interview?\n\n` +
        `Their Interview ID (${inv.code || "old invite"}) will stop working.` +
        (taken ? "\nThe interview they already took stays in the Candidates results page." : "")
    );
    if (!ok) return;

    setBusyEmail(inv.email);
    setNotice({ msg: "", err: "" });
    try {
      const res = await api.delete(`/hiring/interviews/${item.id}/invitations`, {
        params: { email: inv.email },
      });
      setInvitations(res.data.invitations);
      setNotice({ msg: `${inv.name || inv.email} was deleted from this interview.`, err: "" });
    } catch (err) {
      setNotice({ msg: "", err: err?.response?.data?.detail || "Could not delete the candidate." });
    } finally {
      setBusyEmail("");
    }
  };

  const uploadResume = async (email, file) => {
    if (!file) return;
    setNotice({ msg: "", err: "" });

    if (!validResume(file)) {
      setNotice({ msg: "", err: "Upload a PDF or DOCX resume, up to 5 MB." });
      return;
    }

    setBusyEmail(email);
    try {
      const res = await api.post(
        `/hiring/interviews/${item.id}/resume`,
        { email, filename: file.name, content_base64: await readBase64(file) },
        { timeout: 60000 }
      );
      setInvitations(res.data.invitations);
      setNotice({ msg: res.data.note || `Resume added for ${email}.`, err: "" });
    } catch (err) {
      setNotice({
        msg: "",
        err: err?.response?.data?.detail || err?.message || "Could not upload the resume.",
      });
    } finally {
      setBusyEmail("");
    }
  };

  return (
    <section className={`rounded-3xl border ${t.card} bg-slate-950/40 backdrop-blur-xl shadow-2xl transition-all duration-300`}>
      <div
        className={`p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-white/10 ${
          isOpen ? "border-b" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-white truncate">{item.title}</h2>
          <p className="text-xs text-white/50 mt-1">
            {invitations.length} {invitations.length === 1 ? "candidate" : "candidates"} · {withResume} with resume
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
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            className="p-2.5 rounded-xl hover:bg-white/10 transition text-fuchsia-400 font-extrabold text-lg flex items-center justify-center"
            title="Toggle interview details"
          >
            <span className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-6 md:p-8 space-y-6 animate-fadeIn">
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
              <ReviewTop r={review} t={t} />

              <div className="flex justify-start">
                <div
                  role="tablist"
                  aria-label="Interview control sections"
                  className="inline-flex max-w-full overflow-x-auto gap-1.5 p-1.5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-lg"
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
                        onClick={() => openTab(tb.key)}
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

              <div role="tabpanel">
                <Panel id="candidates" tab={tab} seen={seen}>
                  <CandidatesTable
                    invitations={invitations}
                    review={review}
                    t={t}
                    emailOn={emailOn}
                    resending={resending}
                    busyEmail={busyEmail}
                    notice={notice}
                    onResend={resend}
                    onDelete={removeCandidate}
                    onUploadResume={uploadResume}
                  />
                </Panel>

                <Panel id="add" tab={tab} seen={seen}>
                  <AddCandidateForm
                    interviewId={item.id}
                    t={t}
                    onAdded={setInvitations}
                    emailOn={emailOn}
                  />
                </Panel>

                <Panel id="features" tab={tab} seen={seen}>
                  <FeaturesPanel
                    item={item}
                    t={t}
                    catalog={catalog}
                    groups={groups}
                    featureState={featureState}
                    followCount={followCount}
                    onFeatureState={setFeatureState}
                    onFollowCount={setFollowCount}
                  />
                </Panel>

                <Panel id="job" tab={tab} seen={seen}>
                  <InterviewSettingsForm
                    interviewId={item.id}
                    initialJob={item.job}
                    t={t}
                    jobOnly
                    saveLabel="Save job details"
                  />
                </Panel>
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
  const navigate = useNavigate();

  const [items, setItems] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const [picked, setPicked] = useState(searchParams.get("interview") || "");

  useEffect(() => {
    let cancelled = false;

    api
      .get("/hiring/interviews")
      .then((res) => {
        if (cancelled) return;
        setCatalog(res.data.feature_catalog || []);
        setGroups(res.data.feature_groups || []);
        setItems(res.data.interviews);
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
      <GmailConnectCard />

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
          <p className="text-white/50 text-sm">
            Interviews are shown only for the account that created them
            {" "}(you are logged in as this account). Create an assessment first, then control it here.
          </p>
          <button
            onClick={() => navigate("/create-interview")}
            className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
          >
            + Create Assessment
          </button>
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

            <button
              onClick={() => navigate("/create-interview")}
              className="sm:ml-auto px-5 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition whitespace-nowrap"
            >
              + Create Assessment
            </button>
          </div>

          <div className="space-y-4">
            {visible.map((item) => (
              <ControlCard
                key={item.id}
                item={item}
                t={t}
                catalog={catalog}
                groups={groups}
                defaultOpen={selectedId !== "all"}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
