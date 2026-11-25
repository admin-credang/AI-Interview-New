import { Link, useNavigate } from "react-router-dom";

import BrandMark from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import { Orbs } from "../components/ui";

// ============================================================
// LANDING PAGE  ( / )
// Pure marketing page – the only actions are links to the
// existing /login, /register and /dashboard routes.
// ============================================================

const FEATURES = [
  {
    title: "AI Monitoring",
    desc: "Face detection, eye-gaze tracking, phone and multiple-person detection while the candidate answers.",
    icon: (
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    ),
  },
  {
    title: "Auto Transcription",
    desc: "Every spoken answer is recorded and transcribed automatically, ready to review and download.",
    icon: <path d="M9 3h6v11a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />,
  },
  {
    title: "Detailed Reports",
    desc: "Overall score, technical skills, communication and monitoring events — exported as a PDF.",
    icon: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  },
  {
    title: "Secure & Reliable",
    desc: "Invite-only interview links, Google sign-in and Gmail invitations sent from your own account.",
    icon: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6zM9 12l2 2 4-4" />,
  },
];

const STEPS = [
  { n: "01", title: "Create an interview", desc: "Pick the role, questions, duration and monitoring rules." },
  { n: "02", title: "Invite candidates", desc: "Send invitations by e-mail with a secure, single-use link." },
  { n: "03", title: "AI runs the interview", desc: "Questions, follow-ups, recording and live proctoring." },
  { n: "04", title: "Review & decide", desc: "Read the report, watch flags and select or reject." },
];

function FeatureIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function ProductPreview() {
  const bars = [38, 52, 44, 66, 58, 74, 62, 81, 70, 88];
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[3rem] bg-gradient-to-b from-brand-300/30 to-transparent blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_40px_100px_-40px_rgba(13,31,60,0.45)]">
        {/* window bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200">app / dashboard</span>
        </div>
        <div className="flex">
          {/* mini sidebar */}
          <div className="hidden w-44 shrink-0 bg-navy-950 p-3 sm:block">
            <div className="mb-4 h-6 w-24 rounded-md bg-white/10" />
            {["Dashboard", "Scheduling", "Controls", "Reports", "Analytics", "Settings"].map((l, i) => (
              <div
                key={l}
                className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? "bg-white/10 text-white" : "text-slate-400"}`}
              >
                <span className={`h-2 w-2 rounded-sm ${i === 0 ? "bg-brand-400" : "bg-slate-600"}`} />
                {l}
              </div>
            ))}
          </div>
          {/* content */}
          <div className="flex-1 bg-[#f5f7fa] p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Total Candidates", "bg-brand-50 text-brand-600"],
                ["Interviews Scheduled", "bg-navy-50 text-navy-600"],
                ["Completed", "bg-emerald-50 text-emerald-600"],
                ["Pending Review", "bg-amber-50 text-amber-600"],
              ].map(([l, c]) => (
                <div key={l} className="rounded-xl border border-slate-200/80 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{l}</span>
                    <span className={`h-5 w-5 rounded-md ${c}`} />
                  </div>
                  <div className="mt-2 h-4 w-10 rounded bg-slate-200" />
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 md:col-span-2">
                <p className="mb-3 text-[10px] font-semibold text-navy-900">Interview performance</p>
                <div className="flex h-24 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[3px] bg-brand-500" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                <p className="mb-3 text-[10px] font-semibold text-navy-900">Proctoring checks</p>
                {["Face detected", "Eye gaze OK", "No phone", "Single person"].map((l) => (
                  <div key={l} className="mb-1.5 flex items-center gap-2 text-[10px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white text-navy-900">
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/">
            <BrandMark dark={false} />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-navy-900">Features</a>
            <a href="#how" className="hover:text-navy-900">How it works</a>
            <a href="#about" className="hover:text-navy-900">About</a>
            <a href="#contact" className="hover:text-navy-900">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <button onClick={() => navigate("/dashboard")} className="rounded-xl px-4 py-2 text-sm font-semibold">
                Go to dashboard
              </button>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 sm:block">
                  Sign in
                </Link>
                <button onClick={() => navigate("/register")} className="rounded-xl px-4 py-2 text-sm font-semibold">
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <Orbs preset="light" />
        <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 text-center sm:px-8 sm:pt-24">
          <span className="ui-pill bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI-powered interview platform
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            Smarter hiring with{" "}
            <span className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text text-transparent">
              AI interviews
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-500 sm:text-lg">
            Let an AI interviewer ask the questions, monitor the session and transcribe every answer —
            then review scored reports and make faster, fairer hiring decisions.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate(user ? "/dashboard" : "/register")}
              className="rounded-xl px-6 py-3 text-sm font-semibold shadow-lg shadow-brand-600/25"
            >
              {user ? "Open dashboard" : "Get started free"}
            </button>
            <a href="#how" className="ui-btn-ghost px-6 py-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M8 5.5v13l10-6.5z" /></svg>
              Watch how it works
            </a>
          </div>

          <div className="ui-perspective mt-16">
            <div className="ui-tilted">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="border-t border-slate-100 bg-[#f5f7fa] py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-brand-600">Features</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Everything you need to interview at scale</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} data-tilt className="ui-card p-6">
                <div data-depth="2" className="ui-icon-3d flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white">
                  <FeatureIcon>{f.icon}</FeatureIcon>
                </div>
                <h3 className="mt-5 text-base font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-brand-600">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">From invitation to decision in four steps</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} data-tilt className="ui-card p-6">
                <span data-depth="2" className="inline-block font-display text-4xl font-extrabold bg-gradient-to-br from-brand-300 to-navy-400 bg-clip-text text-transparent [filter:drop-shadow(0_6px_8px_rgba(124,58,237,0.25))]">{s.n}</span>
                <h3 className="mt-3 text-base font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA / ABOUT ================= */}
      <section id="about" className="px-5 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-brand-900 px-8 py-14 text-center text-white sm:px-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-400/25 blur-3xl" />
          <Orbs preset="hero" />
          <h2 className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to run your next interview with AI?</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-slate-300">
            Create an interview, invite your candidates and get structured, comparable reports for every session.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => navigate(user ? "/dashboard" : "/register")} className="rounded-xl px-6 py-3 text-sm font-semibold">
              {user ? "Open dashboard" : "Create free account"}
            </button>
            {!user && (
              <Link to="/login" className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer id="contact" className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:px-8">
          <BrandMark dark={false} />
          <p>&copy; {new Date().getFullYear()} AI Interview & Assessment Platform</p>
        </div>
      </footer>
    </div>
  );
}
