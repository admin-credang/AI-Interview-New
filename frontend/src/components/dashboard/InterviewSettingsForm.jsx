import { useState } from "react";

import api from "../../services/api";
import { Toggle } from "./hiring";
import CompanyIntroEditor from "./CompanyIntroEditor";
import { IconEye, IconShield } from "./icons";

// Works inside AND outside the dashboard theme provider.
const DEFAULT_T = {
  input:
    "bg-white/5 border-white/10 text-white placeholder:text-slate-500",
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
}) {
  const inputCls = `w-full px-4 py-3 rounded-xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm`;

  const [proctoring, setProctoring] = useState({
    enabled: Boolean(initialProctoring?.enabled),
    face: initialProctoring?.enabled ? Boolean(initialProctoring?.face) : true,
    eye: initialProctoring?.enabled ? Boolean(initialProctoring?.eye) : true,
    phone: initialProctoring?.enabled ? Boolean(initialProctoring?.phone) : true,
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
    employment_type: initialJob?.employment_type || "",
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
        proctoring: {
          enabled: proctoring.enabled,
          face: proctoring.enabled && proctoring.face,
          eye: proctoring.enabled && proctoring.face && proctoring.eye,
          phone: proctoring.enabled && proctoring.phone,
        },
        follow_ups: {
          enabled: followUps.enabled,
          count: Math.min(5, Math.max(1, Number(followUps.count) || 2)),
        },
        resume_questions: resumeQuestions,
        job: {
          role: job.role,
          company: job.company,
          location: job.location,
          employment_type: job.employment_type,
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
      {/* MONITORING */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
            <IconShield />
          </span>
          <div>
            <h3 className="font-bold">Eye &amp; face monitoring</h3>
            <p className="text-xs opacity-60">
              You decide. When it is off, the interview runs normally with no camera.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 divide-y divide-white/10">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-semibold text-sm">Require monitoring</p>
              <p className="text-xs opacity-60">
                Camera turns on automatically and the candidate cannot switch it off.
              </p>
            </div>
            <Toggle
              label="Require monitoring"
              checked={proctoring.enabled}
              onChange={(v) => setProctoring((p) => ({ ...p, enabled: v }))}
            />
          </div>

          <div
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              proctoring.enabled ? "" : "opacity-40"
            }`}
          >
            <div>
              <p className="font-semibold text-sm">Face detection</p>
              <p className="text-xs opacity-60">
                Ends the interview if no face, or more than one face, stays in view.
              </p>
            </div>
            <Toggle
              label="Face detection"
              disabled={!proctoring.enabled}
              checked={proctoring.enabled && proctoring.face}
              onChange={(v) =>
                setProctoring((p) => ({ ...p, face: v, eye: v ? p.eye : false }))
              }
            />
          </div>

          <div
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              proctoring.enabled && proctoring.face ? "" : "opacity-40"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 opacity-70">
                <IconEye />
              </span>
              <div>
                <p className="font-semibold text-sm">Eye / gaze detection</p>
                <p className="text-xs opacity-60">
                  Watches closed eyes, looking sideways and repeatedly looking down
                  (for example at a phone on the desk). Needs face detection.
                </p>
              </div>
            </div>
            <Toggle
              label="Eye and gaze detection"
              disabled={!proctoring.enabled || !proctoring.face}
              checked={proctoring.enabled && proctoring.face && proctoring.eye}
              onChange={(v) => setProctoring((p) => ({ ...p, eye: v }))}
            />
          </div>

          <div
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              proctoring.enabled ? "" : "opacity-40"
            }`}
          >
            <div>
              <p className="font-semibold text-sm">Phone detection</p>
              <p className="text-xs opacity-60">
                Ends the interview if a mobile phone stays visible on the camera.
              </p>
            </div>
            <Toggle
              label="Phone detection"
              disabled={!proctoring.enabled}
              checked={proctoring.enabled && proctoring.phone}
              onChange={(v) => setProctoring((p) => ({ ...p, phone: v }))}
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

        <div className="rounded-2xl border border-white/10 divide-y divide-white/10">
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
              className={`px-3 py-2 rounded-xl border ${t.input} text-sm outline-none focus:ring-2 focus:ring-fuchsia-500 disabled:cursor-not-allowed`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="bg-slate-900 text-white">
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

        <div className="rounded-2xl border border-white/10">
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

      {/* JOB DETAILS */}
      <div className="space-y-4">
        <div>
          <h3 className="font-bold">Job details shown to the candidate</h3>
          <p className="text-xs opacity-60">Optional, but candidates see these before they start.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className={inputCls} placeholder="Job role (e.g. Full Stack Developer)" value={job.role} onChange={setField("role")} />
          <input className={inputCls} placeholder="Company" value={job.company} onChange={setField("company")} />
          <input className={inputCls} placeholder="Location (e.g. Remote, Chennai)" value={job.location} onChange={setField("location")} />
          <input className={inputCls} placeholder="Type (Full-time, Internship...)" value={job.employment_type} onChange={setField("employment_type")} />
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
        t={t}
      />

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">
          {error}
        </div>
      )}
      {message && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300">
          {message}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="px-8 py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition disabled:opacity-50"
      >
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}
