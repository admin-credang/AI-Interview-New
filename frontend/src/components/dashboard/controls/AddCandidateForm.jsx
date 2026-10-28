import { useState } from "react";

import api from "../../../services/api";
import { EMAIL_RE, readBase64, validResume } from "./shared";

const IconPersonPlus = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m14-12h6m-3-3v6M9 11a4 4 0 100-8 4 4 0 000 8z"
    />
  </svg>
);

const IconUpload = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12"
    />
  </svg>
);

/** Add ONE candidate (name + email + phone + CV - the CV is required) and invite them. */
export default function AddCandidateForm({ interviewId, role, t, onAdded, emailOn }) {
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
    if (!cv) return setError("Upload the candidate's CV (PDF or DOCX). It is required.");
    if (!validResume(cv)) {
      return setError("The CV must be a non-empty PDF or DOCX file, up to 5 MB.");
    }

    setBusy(true);

    try {
      const res = await api.post(`/hiring/interviews/${interviewId}/invite`, {
        candidates: [{ name: name.trim(), email: address, phone: digits }],
        send_email: emailOn,
        role: role || undefined,
      });

      let rows = res.data.invitations;
      const linkWarning = res.data.link_warning;
      let note = emailOn
        ? `${name.trim()} added successfully. The invitation has been sent to ${address}.`
        : `${name.trim()} added successfully. Invitation e-mail is OFF - copy the link from the Candidates tab.`;

      if (cv) {
        try {
          const up = await api.post(
            `/hiring/interviews/${interviewId}/resume`,
            { email: address, filename: cv.name, content_base64: await readBase64(cv) },
            { timeout: 60000 }
          );
          rows = up.data.invitations;
          note += " CV uploaded successfully.";
        } catch (err) {
          note += ` (CV upload failed: ${err?.response?.data?.detail || "error"})`;
        }
      }

      // the e-mail link points to localhost -> it opens only on this PC
      if (linkWarning) note += ` WARNING: ${linkWarning}`;

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
          <p className="text-xs text-white/50 mt-0.5">
            Fill in the candidate profile and upload the CV (required).
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-white/70 mb-2">
              Candidate CV <span className="text-fuchsia-400">*</span>
            </label>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="block md:col-span-2">
            <span className="text-xs font-bold text-white/70">
              Full Name <span className="text-fuchsia-400">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              maxLength={120}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-white/70">
              Email Address <span className="text-fuchsia-400">*</span>
            </span>
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
            <span className="text-xs font-bold text-white/70">
              Phone Number <span className="text-fuchsia-400">*</span>
            </span>
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
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center gap-2">
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
