// Extra sections for the Welcome page (presentation only).
// Every sentence describes something the application really does.

import {
  IconArrowRight,
  IconAward,
  IconCalendar,
  IconCheck,
  IconEye,
  IconFileText,
  IconLock,
  IconMail,
  IconMic,
  IconPhone,
  IconShield,
  IconSparkles,
  IconUsers,
  IconVideo,
} from "../dashboard/icons";

export function SectionHead({ eyebrow, title, desc, center = true, dark = false }) {
  return (
    <div data-reveal className={`${center ? "mx-auto text-center" : ""} max-w-2xl`}>
      <p className={`text-sm font-semibold ${dark ? "text-brand-300" : "text-brand-600"}`}>{eyebrow}</p>
      <h2 className={`mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-navy-900"}`}>{title}</h2>
      {desc && <p className={`mt-3 text-base leading-relaxed ${dark ? "text-slate-300" : "text-slate-500"}`}>{desc}</p>}
    </div>
  );
}

// ---------------- capability ticker under the hero ----------------
const TICKER = [
  "Resume-based questions",
  "Follow-up questions",
  "Warm welcome",
  "Interviewer voice",
  "Auto transcription",
  "Face detection",
  "Eye-gaze tracking",
  "Phone detection",
  "Multiple-face detection",
  "Tab-leave alerts",
  "AI scoring",
  "PDF reports",
  "Gmail invitations",
  "CSV export",
];

export function Ticker() {
  const row = [...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden border-y border-brand-100/70 bg-white/70 py-4 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#fbfaff] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#fbfaff] to-transparent" />
      <div className="ui-marquee flex w-max gap-3">
        {row.map((t, i) => (
          <span
            key={i}
            className="flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-[0_4px_10px_-6px_rgba(46,16,101,0.25)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-500" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------- how it works ----------------
const STEPS = [
  { icon: IconSparkles, title: "Create the interview", desc: "Role, difficulty, question categories, question count, duration and the interviewer voice." },
  { icon: IconCalendar, title: "Invite candidates", desc: "Each candidate gets a secure Interview ID by e-mail — from your own Gmail if you connect it." },
  { icon: IconVideo, title: "AI runs the interview", desc: "Warm welcome, questions from the job and resume, follow-ups, recording and live proctoring." },
  { icon: IconAward, title: "Review & decide", desc: "Read scores and transcripts, check monitoring flags, then select, hold or reject." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <SectionHead eyebrow="How it works" title="From invitation to decision in four steps" desc="The same flow for every role you hire for — set it up once, then let the AI interviewer do the talking." />
      <div className="relative mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-8 hidden h-0.5 bg-gradient-to-r from-brand-200 via-fuchsia-300 to-brand-200 lg:block" />
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.title} data-reveal style={{ transitionDelay: `${i * 90}ms` }} className="relative text-center">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 rounded-2xl bg-brand-400/30 blur-xl" />
                <span className="ui-title-icon ui-icon-3d relative h-16 w-16 rounded-2xl [&_svg]:h-7 [&_svg]:w-7">
                  <Icon />
                </span>
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white ring-4 ring-[#fbfaff]">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-base font-bold text-navy-900">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{s.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- proctoring checks ----------------
const CHECKS = [
  { icon: IconUsers, title: "Face detection", desc: "Notices when no face is in view." },
  { icon: IconEye, title: "Eye-gaze tracking", desc: "Looking away, eyes closed or looking down." },
  { icon: IconPhone, title: "Phone detection", desc: "Flags a phone held up to the camera." },
  { icon: IconUsers, title: "Multiple faces", desc: "Someone else joining the candidate." },
  { icon: IconVideo, title: "Tab & page leave", desc: "Leaving the interview page is recorded." },
  { icon: IconLock, title: "Secure entry", desc: "Invite-only Interview ID for each candidate." },
];

export function ProctoringSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-fuchsia-50 py-20 text-navy-900">
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-fuchsia-300/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(#ddd3ff_1px,transparent_1px)] [background-size:22px_22px]" />
      <span className="ui-orb ui-orb--teal left-[6%] top-16 h-12 w-12" />
      <span className="ui-orb ui-orb--green right-[8%] bottom-16 h-10 w-10" style={{ animationDelay: "-3s" }} />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <SectionHead
            center={false}
            eyebrow="Live proctoring"
            title="The AI keeps an eye on every session"
            desc="When monitoring is on, the candidate's camera is checked during the whole interview. Every event is time-stamped and shows on the candidate profile and in the PDF report."
          />
          <div data-reveal className="mt-8 flex flex-wrap gap-3">
            {["Camera required", "Events time-stamped", "Included in the PDF"].map((t) => (
              <span key={t} className="flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-brand-800 shadow-sm ring-1 ring-brand-100">
                <IconCheck className="h-4 w-4 text-brand-600" /> {t}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CHECKS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                data-tilt
                data-reveal
                style={{ transitionDelay: `${i * 70}ms` }}
                className="ui-card p-5"
              >
                <span data-depth="1" className="ui-icon-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-600 text-white [&_svg]:h-5 [&_svg]:w-5">
                  <Icon />
                </span>
                <p className="mt-4 font-semibold text-navy-900">{c.title}</p>
                <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------- report preview ----------------
const SKILLS = [
  ["Relevance", 84],
  ["Accuracy", 79],
  ["Technical knowledge", 86],
  ["Completeness", 72],
  ["Communication", 91],
];

export function ReportSection({ onOpen }) {
  return (
    <section id="reports" className="scroll-mt-24 mx-auto grid max-w-7xl gap-14 overflow-x-clip px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center">
      <div className="ui-perspective order-2 lg:order-1" data-reveal>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-200/60 via-fuchsia-100/50 to-transparent blur-2xl" />
          <div data-tilt="0.6" className="ui-card relative p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-500 font-bold text-white shadow-lg">S</span>
                <div>
                  <p className="font-bold text-navy-900">Sample candidate</p>
                  <p className="text-xs text-slate-500">Data Analyst · example report</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Strong match</span>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <div data-depth="2" className="relative mx-auto h-32 w-32">
                <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#ede8ff" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="url(#rg)" strokeWidth="4" strokeLinecap="round" strokeDasharray="81 100" />
                  <defs>
                    <linearGradient id="rg" x1="0" x2="1">
                      <stop offset="0" stopColor="#8b5cf6" />
                      <stop offset="1" stopColor="#d946ef" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-navy-900">82</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Overall</span>
                </span>
              </div>
              <ul className="space-y-2.5">
                {SKILLS.map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-xs">
                    <span className="font-medium text-slate-600">{k}</span>
                    <span className="h-2 rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500" style={{ width: `${v}%` }} />
                    </span>
                    <span className="text-right font-bold text-navy-900">{v}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-100">
              <span className="font-semibold text-navy-900">AI summary · </span>
              Clear explanations with relevant examples; strong on data cleaning and SQL.
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow">Select</span>
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Hold</span>
              <span className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">Reject</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white">
                <IconFileText className="h-3.5 w-3.5" /> PDF
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="order-1 lg:order-2">
        <SectionHead
          center={false}
          eyebrow="AI reports"
          title="Every answer scored. Every decision in one click."
          desc="When an interview ends, the AI evaluates each answer on five skills and writes a short summary. You review it, then select, hold or reject — the candidate gets the matching e-mail."
        />
        <ul data-reveal className="mt-8 space-y-4">
          {[
            ["Five skill scores", "Relevance, accuracy, technical knowledge, completeness and communication."],
            ["Full transcript", "Every question and transcribed answer, follow-ups included."],
            ["Monitoring events", "Proctoring flags with the time they happened."],
            ["Export", "Download the PDF report or the whole list as CSV."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-4">
              <span className="ui-icon-3d mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                <IconCheck className="h-4 w-4" />
              </span>
              <span>
                <span className="block font-semibold text-navy-900">{t}</span>
                <span className="block text-sm text-slate-500">{d}</span>
              </span>
            </li>
          ))}
        </ul>
        <button data-reveal onClick={onOpen} className="mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
          View reports <IconArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

// ---------------- candidate journey ----------------
const JOURNEY = [
  { icon: IconMail, title: "Invitation e-mail", desc: "Interview ID and a secure link." },
  { icon: IconShield, title: "Lobby & checks", desc: "Camera and microphone set-up." },
  { icon: IconSparkles, title: "Warm welcome", desc: "Three easy questions to settle in." },
  { icon: IconMic, title: "Interview", desc: "Speak naturally — answers are transcribed." },
  { icon: IconCheck, title: "Thank-you mail", desc: "Sent right after the interview." },
];

export function CandidateJourney() {
  return (
    <section id="journey" className="scroll-mt-24 border-y border-slate-100 bg-white py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead eyebrow="Candidate experience" title="A calm, guided interview for every candidate" desc="Candidates never see scores or reports — only clear steps from the invitation to the thank-you e-mail." />
        <ol className="relative mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {JOURNEY.map((j, i) => {
            const Icon = j.icon;
            return (
              <li
                key={j.title}
                data-tilt
                data-reveal
                style={{ transitionDelay: `${i * 80}ms` }}
                className="ui-card relative p-5"
              >
                <div className="flex items-center justify-between">
                  <span data-depth="1" className="ui-title-icon ui-icon-3d h-10 w-10 [&_svg]:h-5 [&_svg]:w-5">
                    <Icon />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-brand-100">0{i + 1}</span>
                </div>
                <p className="mt-4 font-semibold text-navy-900">{j.title}</p>
                <p className="mt-1 text-sm text-slate-500">{j.desc}</p>
                {i < JOURNEY.length - 1 && (
                  <span className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 shadow ring-1 ring-slate-200 lg:flex">
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------- FAQ ----------------
const FAQ = [
  ["Do candidates need an account?", "They join with the Interview ID from their invitation e-mail. Only interviewers and admins register here."],
  ["Can invitations come from my Gmail?", "Yes. Connect Google in Settings → Email & Gmail. Otherwise mails are sent from the system address."],
  ["Can I use it for my own Zoom, Google Meet or Teams interviews?", "Yes. Open Live Interview Guard, share the meeting tab in Chrome and press Start. It watches the candidate's video and gives you a PDF report when you finish."],
  ["What does an admin see?", "Admins use the same workspace as interviewers, but see every interview on the platform."],
  ["Where do I change questions or the voice?", "Settings → Interview settings, or Assessments → Configure interview."],
];

export function MiniFaq({ open, setOpen }) {
  return (
    <section id="faq" className="scroll-mt-24 mx-auto max-w-4xl px-5 py-20 sm:px-8">
      <SectionHead eyebrow="Good to know" title="Quick answers" />
      <div data-reveal className="ui-card mt-10 divide-y divide-slate-100 overflow-hidden">
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button
              data-plain
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-navy-900 hover:bg-slate-50"
            >
              {q}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg transition ${open === i ? "rotate-45 bg-brand-600 text-white" : "bg-brand-50 text-brand-600"}`}>+</span>
            </button>
            {open === i && <p className="px-6 pb-5 text-sm leading-relaxed text-slate-600">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
