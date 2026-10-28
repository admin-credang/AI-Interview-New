import { useState } from "react";

import api from "../../services/api";
import { Toggle } from "./hiring";
import CompanyIntroEditor from "./CompanyIntroEditor";
import { IconShield } from "./icons";

// Works inside AND outside the dashboard theme provider.
const DEFAULT_T = {
  input:
    "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500",
};

/**
 * Monitoring setup + job details for ONE interview.
 * Used by the "Monitoring Setup" step and by Interview Controls.
 */
export default function InterviewSettingsForm({
  interviewId,
  initialProctoring,
  initialJob,
  initialFollowUps,
  initialResumeQuestions,
  t = DEFAULT_T,
  saveLabel = "Save settings",
  onSaved,
  // true = only job details + company intro (monitoring, follow-ups and
  // resume questions are switched in Interview Controls > Features)
  jobOnly = false,
}) {
  const inputCls = `w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-slate-400 text-sm`;

  // ONE switch: face, eye / gaze and phone detection (and the gaze report)
  // all follow it - they are not separate options.
  const [proctoring, setProctoring] = useState({
    enabled: Boolean(initialProctoring?.enabled),
  });

  // Follow-up questions: the interviewer decides (default = on, 2).
  const [followUps, setFollowUps] = useState({
    enabled: initialFollowUps ? Boolean(initialFollowUps.enabled) : true,
    count: Number(initialFollowUps?.count) || 2,
  });

  // Resume questions: 2 extra questions from the candidate's resume (default on).
  const [resumeQuestions, setResumeQuestions] = useState(
    initialResumeQuestions !== false
  );

  const [job, setJob] = useState({
    role: initialJob?.role || "",
    company: initialJob?.company || "",
    location: initialJob?.location || "",
    experience: initialJob?.experience || "",
    responsibilities: initialJob?.responsibilities || "",
    skillsText: (initialJob?.skills || []).join(", "),
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const setField = (key) => (e) =>
    setJob((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.put(`/hiring/interviews/${interviewId}/settings`, {
        ...(jobOnly
          ? {}
          : {
              proctoring: {
                enabled: proctoring.enabled,
                face: proctoring.enabled,
                eye: proctoring.enabled,
                phone: proctoring.enabled,
              },
              follow_ups: {
                enabled: followUps.enabled,
                count: Math.min(5, Math.max(1, Number(followUps.count) || 2)),
              },
              resume_questions: resumeQuestions,
            }),
        job: {
          role: job.role,
          company: job.company,
          location: job.location,
          experience: job.experience,
          responsibilities: job.responsibilities,
          skills: job.skillsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });

      setMessage("Saved.");
      onSaved?.({
        resumeQuestions,
        followUps: {
          enabled: followUps.enabled,
          count: Math.min(5, Math.max(1, Number(followUps.count) || 2)),
        },
      });
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {!jobOnly && (
        <>
      {/* MONITORING */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
            <IconShield />
          </span>
          <div>
            <h3 className="font-bold">Eye &amp; face monitoring</h3>
            <p className="text-xs opacity-60">
              You decide. When it is off, the interview runs normally with no camera.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-200">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-semibold text-sm">Require monitoring</p>
              <p className="text-xs opacity-60">
                Camera turns on automatically and the candidate cannot switch it off.
                Includes face detection, eye / gaze detection and phone detection,
                and the gaze report.
              </p>
            </div>
            <Toggle
              label="Require monitoring"
              checked={proctoring.enabled}
              onChange={(v) => setProctoring((p) => ({ ...p, enabled: v }))}
            />
          </div>

        </div>

        {proctoring.enabled && (
          <p className="text-xs opacity-70 leading-relaxed">
            Candidates are told about this before they start and must allow their camera.
            Everything flagged during the interview shows up on the candidate's page.
          </p>
        )}
      </div>

      {/* FOLLOW-UP QUESTIONS */}
      <div className="space-y-4">
        <div>
          <h3 className="font-bold">Follow-up questions</h3>
          <p className="text-xs opacity-60">
            You decide whether the AI may ask a follow-up after some answers.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-200">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-semibold text-sm">Ask follow-up questions</p>
              <p className="text-xs opacity-60">
                Off = every candidate gets only the main questions, nothing extra.
              </p>
            </div>
            <Toggle
              label="Ask follow-up questions"
              checked={followUps.enabled}
              onChange={(v) => setFollowUps((p) => ({ ...p, enabled: v }))}
            />
          </div>

          <div
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              followUps.enabled ? "" : "opacity-40"
            }`}
          >
            <div>
              <p className="font-semibold text-sm">How many follow-ups</p>
              <p className="text-xs opacity-60">
                Spread over different main questions (1 to 5).
              </p>
            </div>
            <select
              disabled={!followUps.enabled}
              value={followUps.count}
              onChange={(e) =>
                setFollowUps((p) => ({ ...p, count: Number(e.target.value) }))
              }
              className={`px-3 py-2 rounded-xl border ${t.input} text-sm outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="bg-white text-slate-900">
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RESUME QUESTIONS */}
      <div className="space-y-4">
        <div>
          <h3 className="font-bold">Resume questions</h3>
          <p className="text-xs opacity-60">
            Extra questions taken from a candidate's resume, asked after the normal ones.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-semibold text-sm">Ask resume questions</p>
              <p className="text-xs opacity-60">
                On = candidates who have a resume get 2 extra questions from it. Off =
                nobody gets resume questions. Candidates without a resume only get the
                normal questions.
              </p>
            </div>
            <Toggle
              label="Ask resume questions"
              checked={resumeQuestions}
              onChange={setResumeQuestions}
            />
          </div>
        </div>
      </div>
        </>
      )}

      {/* JOB DETAILS */}
      <div className="space-y-4">
        <div>
          <h3 className="font-bold">Job details</h3>
          <p className="text-xs opacity-60">
            The AI uses all of these (role, location, experience, skills, responsibilities) to write
            the company introduction. Candidates themselves only see the role.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className={inputCls} placeholder="Job role (e.g. Full Stack Developer)" value={job.role} onChange={setField("role")} />
          <input className={inputCls} placeholder="Company" value={job.company} onChange={setField("company")} />
          <input className={inputCls} placeholder="Location (e.g. Remote, Chennai)" value={job.location} onChange={setField("location")} />
          <input className={inputCls} placeholder="Experience (e.g. 0-2 years)" value={job.experience} onChange={setField("experience")} />
          <input className={inputCls} placeholder="Skills, comma separated" value={job.skillsText} onChange={setField("skillsText")} />
        </div>

        <textarea
          rows={4}
          className={inputCls}
          placeholder="Responsibilities / what the candidate will do"
          value={job.responsibilities}
          onChange={setField("responsibilities")}
        />
      </div>

      {/* COMPANY INTRODUCTION (own approve/save buttons) */}
      <CompanyIntroEditor
        interviewId={interviewId}
        role={job.role}
        company={job.company}
        location={job.location}
        experience={job.experience}
        skills={job.skillsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)}
        responsibilities={job.responsibilities}
        t={t}
      />

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
 className="px-8 py-3.5 bg-slate-800 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition disabled:opacity-50"
      >
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}
