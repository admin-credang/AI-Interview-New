import { useMemo, useState } from "react";

import { useDashboard } from "../../context/DashboardContext";
import { IconHelp, IconSearch } from "../../components/dashboard/icons";
import { EmptyState, Orbs, PageHeader } from "../../components/ui";

const CANDIDATE_FAQ = [
  ["Getting started", "How do I start an assessment?", "Open My Interviews, read the job details and press Start interview. You will pass through a lobby where you can check your setup before the live session begins."],
  ["During the interview", "What happens if I leave the interview page?", "The interview is monitored. Switching tabs or leaving the interview page can end your session, so stay on the page until you finish."],
  ["During the interview", "Can I resume an assessment?", "Yes. Interviews marked In progress show a Resume interview button."],
  ["Results", "How will I know the result?", "Right after you finish, you get a thank-you email. If you are selected, our team will contact you. If you are not selected, you will receive an email. Scores and analysis are only seen by the hiring team."],
  ["Camera & privacy", "Is my camera used?", "Only if the recruiter turned monitoring on for that interview. The interview page tells you before you start. If it is off, no camera is used."],
];

const INTERVIEWER_FAQ = [
  ["Getting started", "How do I create an assessment?", "Press New Interview in the top bar (or Create interview on the dashboard). Give it a title and duration, then configure difficulty, categories, question count and the interviewer voice."],
  ["Getting started", "How do I change an assessment's configuration?", "Go to Settings → Interview settings, or open Assessments and press Configure interview."],
  ["Candidates", "How do I invite a candidate?", "Open Interview Controls, pick the interview and use the Add Candidate tab. The candidate receives an invitation link that opens only that interview."],
  ["Monitoring", "What does monitoring check?", "When monitoring is on, the candidate's camera is used for face detection, eye-gaze tracking, phone and multiple-person detection. Events appear on the candidate's profile and in the PDF report."],
  ["Reports", "Where do I find the report?", "Open a candidate from Reports. You can read the AI analysis, every answer's transcript and download the PDF report."],
  ["Email", "Can invitations come from my Gmail?", "Yes. Connect your Google account in Settings → Email & Gmail (or Interview Controls). Otherwise mails are sent from the system address."],
  ["Live Interview Guard", "What is Live Interview Guard?", "An AI watch-guard for interviews you take yourself on Google Meet, Zoom or Microsoft Teams. It watches the candidate's video in the meeting and reports eye direction, phone use, extra people, reading patterns and voice issues. Open it from the sidebar → Live Interviews → Live Interview Guard."],
  ["Live Interview Guard", "How do I start it for a live interview?", "1) Join the meeting in Chrome. 2) In Live Interview Guard tick the consent box and press “1. Share meeting window / tab” — pick the meeting tab and keep “Share tab audio” on. 3) Press “2. Start automatic analysis”. The candidate's face is found automatically. 4) When the interview ends press “End & generate report”."],
  ["Live Interview Guard", "Does it work with Zoom, Google Meet and Teams?", "Yes. Google Meet runs in Chrome. For Zoom use “Join from your browser”, for Teams choose “Continue on this browser”, so the meeting is a Chrome tab you can share. With the desktop apps, share the app window and use “1b. Share system audio” for the voice."],
  ["Live Interview Guard", "What are the gaze calibration and attention check?", "Button 3 asks the candidate to look at the numbers 1–9 on their screen so the tool learns where their screen is; after that every look away is reported as left, right, above or below. Button 4 is a 1-minute random-number check that proves the candidate is really looking at the screen."],
  ["Live Interview Guard", "Where is the report?", "“End & generate report” downloads a PDF (and a JSON file) with the final review status, a timeline of every flag with timestamps and evidence snapshots. Speech in Tamil or other scripts is also saved in a *_full_text.html file."],
  ["Live Interview Guard", "Is a flag proof of cheating?", "No. Flags are webcam estimates that a person must review. A quick look away while thinking is normal and scores low. Ask the candidate to sit so their face, hands and desk are visible and to avoid virtual backgrounds."],
  ["Live Interview Guard", "What do I need for it to work?", "Google Chrome on a laptop or desktop, an internet connection (the speech model loads once, about 1 minute the first time) and permission for the microphone and screen sharing. The candidate must be told the interview is monitored."],
  ["Live Interview Guard", "Can the tool see the candidate's files or tabs?", "No. It only sees the meeting tab you share. Video stays in your browser and is not uploaded."],
];

export default function Help() {
  const { isCandidate } = useDashboard();
  const faq = isCandidate ? CANDIDATE_FAQ : INTERVIEWER_FAQ;
  const [open, setOpen] = useState(0);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return faq
      .map((f, idx) => ({ cat: f[0], q: f[1], a: f[2], idx }))
      .filter((f) => !s || f.q.toLowerCase().includes(s) || f.a.toLowerCase().includes(s));
  }, [faq, q]);

  const categories = [...new Set(filtered.map((f) => f.cat))];

  return (
    <div className="max-w-5xl">
      {/* hero */}
      <section className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3b0d7a] via-[#5b21b6] to-[#86198f] px-6 py-10 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_5px_0_#6d28d9,0_30px_60px_-25px_rgba(109,40,217,0.7)] sm:px-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl" />
        <Orbs preset="small" />
        <h1 className="relative text-2xl font-extrabold tracking-tight sm:text-3xl">Frequently asked questions</h1>
        <p className="relative mt-2 text-sm text-white/85">Answers to common questions about the platform.</p>
        <div className="relative mx-auto mt-6 max-w-lg">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search questions…"
            className="w-full rounded-xl border-0 bg-white py-3 pl-11 pr-4 text-sm text-navy-900 shadow-xl outline-none ring-4 ring-white/10 placeholder:text-slate-400"
          />
        </div>
      </section>

      <div>
        <div className="space-y-6">
          {filtered.length === 0 && (
            <EmptyState icon={<IconHelp />} title="No answers found">Try a different word.</EmptyState>
          )}
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{cat}</p>
              <div className="ui-card divide-y divide-slate-100 overflow-hidden">
                {filtered
                  .filter((f) => f.cat === cat)
                  .map((f) => (
                    <div key={f.q}>
                      <button
                        data-plain
                        onClick={() => setOpen(open === f.idx ? -1 : f.idx)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-navy-900 hover:bg-slate-50"
                        aria-expanded={open === f.idx}
                      >
                        {f.q}
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base transition ${open === f.idx ? "rotate-45 bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
                          +
                        </span>
                      </button>
                      {open === f.idx && <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{f.a}</p>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
