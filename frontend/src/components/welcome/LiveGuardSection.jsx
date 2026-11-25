// Welcome page: Live Interview Guard (presentation only).
// Every sentence describes something the Live Interview Guard tool really does.

import { IconArrowRight, IconCheck, IconEye, IconFileText, IconMic, IconPhone, IconShield, IconUsers, IconVideo } from "../dashboard/icons";
import "./liveGuardWelcome.css";

const PLATFORMS = [
  { name: "Google Meet", how: "Runs in Chrome — share the Meet tab.", tint: "from-brand-400 to-brand-700" },
  { name: "Zoom", how: "Join from your browser, or share the Zoom app window.", tint: "from-fuchsia-400 to-brand-600" },
  { name: "Microsoft Teams", how: "“Continue on this browser”, or share the Teams window.", tint: "from-brand-500 to-fuchsia-600" },
];

const CHECKS = [
  [IconEye, "Eye direction", "Left, right, above or below the screen — measured per question."],
  [IconPhone, "Phone in view", "A phone held in the picture, with a snapshot as evidence."],
  [IconUsers, "Extra person", "A second face appearing next to the candidate."],
  [IconMic, "Voice check", "Speech while the candidate's lips do not move."],
  [IconFileText, "Reading pattern", "Steady left-to-right sweeps while answering."],
  [IconShield, "Attention check", "A 1-minute random-number check on demand."],
];

const STEPS = [
  ["Join your meeting", "Open Google Meet, Zoom or Teams in Chrome as usual."],
  ["Share the meeting tab", "One click — pick the meeting tab and keep “Share tab audio” on."],
  ["Press Start", "The candidate's face is found automatically. Questions and answers are captured as you talk."],
  ["Get the report", "End the interview and the PDF report downloads: status, timeline, evidence, answer notes."],
];

function MeetingMock() {
  return (
    <div data-tilt="0.6" className="lgw-window relative mx-auto w-full max-w-[560px]">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-brand-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 truncate text-[11px] font-medium text-slate-500">Interview · Data Analyst · 00:12:48</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
          <span className="lgw-blink h-1.5 w-1.5 rounded-full bg-rose-400" /> REC
        </span>
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-3 p-4">
        {/* candidate tile */}
        <div className="lgw-tile relative aspect-[4/3] overflow-hidden rounded-xl">
          <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <linearGradient id="lgwSkin" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#c4b5fd" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="62" r="26" fill="url(#lgwSkin)" opacity=".9" />
            <path d="M48 150c6-32 28-48 52-48s46 16 52 48z" fill="url(#lgwSkin)" opacity=".75" />
            <circle cx="91" cy="60" r="2.6" fill="#ecfeff" />
            <circle cx="109" cy="60" r="2.6" fill="#ecfeff" />
          </svg>
          {/* face box */}
          <div className="lgw-facebox absolute left-[33%] top-[16%] h-[48%] w-[34%] rounded-lg" />
          <div className="lgw-scan absolute inset-x-0 h-[2px]" />
          <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white">Candidate</span>
          <span className="lgw-chip absolute right-2 top-2">Face ✓</span>
          <span className="lgw-chip absolute right-2 top-9" style={{ animationDelay: "-1.4s" }}>Eyes on screen</span>
        </div>

        {/* side column */}
        <div className="flex flex-col gap-3">
          <div className="lgw-tile flex aspect-square items-center justify-center rounded-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-sm font-bold text-brand-700">You</span>
          </div>
          <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand-100">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-brand-600">Live</p>
            {[
              ["Gaze", "92%", "w-[92%]"],
              ["Voice", "OK", "w-[78%]"],
              ["Phone", "None", "w-[8%]"],
            ].map(([k, v, w]) => (
              <div key={k} className="mt-1.5">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{k}</span>
                  <span className="font-semibold text-navy-900">{v}</span>
                </div>
                <div className="mt-0.5 h-1 rounded-full bg-brand-50">
                  <div className={`h-1 rounded-full bg-gradient-to-r from-brand-400 to-fuchsia-500 ${w}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* question strip */}
      <div className="mx-4 mb-4 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-brand-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600">Q4 · captured automatically</p>
        <p className="mt-0.5 text-[12.5px] text-navy-900">“What is the difference between a list and a tuple?”</p>
      </div>

      {/* floating report card */}
      <div className="lgw-float absolute -bottom-20 -left-5 hidden w-44 rounded-2xl bg-white p-3.5 text-navy-900 shadow-[0_24px_50px_-20px_rgba(109,40,217,0.45)] ring-1 ring-brand-100 sm:block">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report</p>
        <p className="mt-1 text-sm font-extrabold">Clear · no flags</p>
        <div className="mt-2 flex gap-1">
          {[40, 70, 55, 85, 62, 90].map((h, i) => (
            <span key={i} className="w-full rounded-sm bg-gradient-to-t from-brand-400 to-fuchsia-500" style={{ height: h / 3 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LiveGuardSection({ onOpen }) {
  return (
    <section id="live-guard" className="lgw-section relative scroll-mt-24 overflow-hidden py-24 text-navy-900">
      <div className="lgw-dots pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-fuchsia-300/30 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[1fr_1.05fr]">
          <div data-reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
              <span className="lgw-blink h-2 w-2 rounded-full bg-brand-500" /> New · Live Interview Guard
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-4xl">
              Your own live interviews,{" "}
              <span className="bg-gradient-to-r from-brand-600 to-fuchsia-600 bg-clip-text text-transparent">guarded by AI.</span>
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">
              Interviewing a candidate yourself on Google Meet, Zoom or Microsoft Teams? Live Interview Guard watches the candidate's video while
              you talk — and hands you a clear, time-stamped report when you finish. No extension, nothing for the candidate to install.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {PLATFORMS.map((p) => (
                <div key={p.name} data-tilt className="ui-card p-4">
                  <span data-depth="1" className={`ui-icon-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${p.tint} text-white`}>
                    <IconVideo className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-bold text-navy-900">{p.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.how}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
              >
                Open Live Interview Guard <IconArrowRight className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">Works in Google Chrome on a laptop or desktop.</span>
            </div>
          </div>

          <div data-reveal className="pb-16">
            <MeetingMock />
          </div>
        </div>

        {/* what it checks */}
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map(([Icon, t, d], i) => (
            <div
              key={t}
              data-reveal
              style={{ transitionDelay: `${i * 60}ms` }}
              data-tilt
              className="ui-card group flex gap-4 p-5"
            >
              <span className="ui-icon-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-600 text-white transition group-hover:scale-105">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-navy-900">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{d}</p>
              </div>
            </div>
          ))}
        </div>

        {/* four steps */}
        <div className="ui-card relative mt-16 p-6 sm:p-8">
          <p className="text-center text-sm font-semibold text-brand-600">How it works in a live interview</p>
          <ol className="mt-6 grid gap-6 md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} data-reveal style={{ transitionDelay: `${i * 80}ms` }} className="relative">
                {i < STEPS.length - 1 && <span className="lgw-line absolute left-12 right-0 top-5 hidden md:block" />}
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-extrabold text-white shadow-[0_0_0_6px_rgba(167,139,250,0.18)]">
                  {i + 1}
                </span>
                <p className="mt-4 font-bold text-navy-900">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {["Video stays in your browser", "Never sees the candidate's files or tabs", "Flags are for review, not proof"].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-brand-800 shadow-sm ring-1 ring-brand-100">
                <IconCheck className="h-3.5 w-3.5 text-brand-600" /> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
