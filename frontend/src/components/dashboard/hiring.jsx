// Shared bits for the hiring workflow (interviewer + candidate dashboards)

export const DECISIONS = {
  pending: {
    label: "Pending review",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  on_hold: {
    label: "On hold",
    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  selected: {
    label: "Selected",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
};

export function DecisionBadge({ value }) {
  const d = DECISIONS[value] || DECISIONS.pending;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${d.cls}`}
    >
      {d.label}
    </span>
  );
}

const SESSION_STATUS = {
  completed: ["Completed", "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"],
  in_progress: ["In progress", "bg-amber-500/10 text-amber-300 border-amber-500/30"],
  terminated: ["Ended early", "bg-rose-500/10 text-rose-300 border-rose-500/30"],
  not_started: ["Not started", "bg-slate-500/10 text-slate-300 border-slate-500/30"],
};

export function StatusBadge({ status }) {
  const [label, cls] = SESSION_STATUS[status] || SESSION_STATUS.not_started;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

export function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
        checked ? "bg-emerald-600" : "bg-slate-600"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
          checked ? "left-7" : "left-1"
        }`}
      />
    </button>
  );
}

export const fmtDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const scoreText = (n) =>
  n === null || n === undefined ? "text-slate-400" : n >= 75 ? "text-emerald-400" : n >= 50 ? "text-sky-400" : "text-amber-400";

export const scoreBar = (n) =>
  n >= 75 ? "bg-emerald-500" : n >= 50 ? "bg-sky-500" : "bg-amber-500";

export function SkillBar({ label, value }) {
  const v = value === null || value === undefined ? null : Number(value);

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="opacity-80">{label}</span>
        <span className="font-black">{v === null ? "—" : Math.round(v)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${v === null ? "" : scoreBar(v)}`}
          style={{ width: `${Math.min(100, Math.max(0, v || 0))}%` }}
        />
      </div>
    </div>
  );
}

export const MONITOR_LABELS = {
  camera_denied: "Camera permission denied",
  camera_unavailable: "Camera could not start",
  monitoring_started: "Monitoring started",
  face_not_found: "Face not found",
  multiple_faces: "Multiple faces seen",
  looking_away: "Looking away from screen",
  eyes_closed: "Eyes closed for long",
  looking_down: "Looking down (possible phone or notes)",
  repeated_looking_down: "Repeatedly looking down (possible phone or notes)",
  phone_detected: "Mobile phone detected",
  no_face_detected: "No face in front of the camera",
  multiple_faces_detected: "More than one person in view",
  tab_left: "Left the interview page",
  candidate_left_interview_page: "Left the interview page",
};

export const prettyReason = (reason) =>
  MONITOR_LABELS[reason] ||
  String(reason || "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

// Steps shown to the candidate (dashboard + lobby)
export const processSteps = ({ monitoring, questionCount, followUps = true }) => [
  {
    title: "Read the job details",
    text: "Check the role, skills and responsibilities.",
  },
  {
    title: monitoring ? "Camera check" : "Microphone check",
    text: monitoring
      ? "This interview uses camera monitoring (face, eye and phone detection as set by the interviewer). It switches on automatically. Keep phones and notes out of view."
      : "Allow your microphone so you can answer by voice. No camera monitoring is used.",
  },
  {
    title: `Answer ${questionCount ? questionCount : "the"} questions`,
    text: followUps
      ? "The AI interviewer asks one question at a time. A couple of answers may get a follow-up."
      : "The AI interviewer asks one question at a time. There are no follow-up questions.",
  },
  {
    title: "Submit and relax",
    text: "Your interview is submitted automatically after the last answer.",
  },
  {
    title: "Result",
    text: "If you are selected, our team will contact you. Otherwise you will receive an email.",
  },
];

// ------------------------------------------------------------
// Interviewer flow: Create -> Configuration -> Monitoring Setup
// ------------------------------------------------------------
const FLOW = ["Create interview", "Configuration", "Monitoring setup"];

export function FlowSteps({ current }) {
  return (
    <ol className="mb-10 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
      {FLOW.map((label, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span
              className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black border ${
                done
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : active
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "border-slate-700 text-slate-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`truncate font-semibold ${
                active ? "text-white" : done ? "text-slate-300" : "text-slate-500"
              }`}
            >
              {label}
            </span>
            {i < FLOW.length - 1 && (
              <span className="h-px w-4 sm:w-10 bg-slate-700 shrink-0" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------
// Candidate: application timeline
// ------------------------------------------------------------
export function Timeline({ state, result }) {
  const reached = state === "completed" ? 3 : state === "in_progress" ? 2 : 1;

  const resultLabel =
    result === "selected"
      ? "Selected"
      : result === "not_selected"
      ? "Not selected"
      : "Under review";

  const steps = [
    { label: "Invited", on: reached >= 1 },
    { label: "Interview", on: reached >= 2, current: state === "in_progress" },
    { label: "Submitted", on: reached >= 3 },
    {
      label: state === "completed" ? resultLabel : "Result",
      on: state === "completed" && result && result !== "under_review",
      current: state === "completed" && (!result || result === "under_review"),
      tone:
        result === "selected"
          ? "bg-emerald-500 border-emerald-500"
          : result === "not_selected"
          ? "bg-slate-500 border-slate-500"
          : "",
    },
  ];

  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.label} className="flex-1 min-w-0">
          <div className="flex items-center">
            <span
              className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                s.on
                  ? s.tone || "bg-fuchsia-500 border-fuchsia-500"
                  : s.current
                  ? "border-fuchsia-400 animate-pulse"
                  : "border-white/20"
              }`}
            />
            {i < steps.length - 1 && (
              <span
                className={`h-0.5 flex-1 ${
                  steps[i + 1].on || steps[i + 1].current
                    ? "bg-fuchsia-500/60"
                    : "bg-white/10"
                }`}
              />
            )}
          </div>
          <p className="text-[10px] mt-2 font-semibold opacity-70 truncate pr-1">{s.label}</p>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------
// Interviewer aids
// ------------------------------------------------------------
export const recommendation = (score) => {
  if (score === null || score === undefined) return null;
  if (score >= 75) return { label: "Strong match", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
  if (score >= 55) return { label: "Worth a call", cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" };
  return { label: "Weak match", cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
};

export const downloadCsv = (filename, rows) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
