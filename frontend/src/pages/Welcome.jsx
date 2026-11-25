import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import BrandMark from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import { Orbs } from "../components/ui";
import NeonHero, { AIInterviewerSection } from "../components/welcome/NeonHero";
import { WelcomeFooter, WelcomeHeader } from "../components/welcome/SiteChrome";
import { HowItWorks, MiniFaq, SectionHead } from "../components/welcome/Sections";
import LiveGuardSection from "../components/welcome/LiveGuardSection";
import {
  IconArrowRight,
  IconBarChart,
  IconCalendar,
  IconFileText,
  IconHelp,
  IconLayers,
  IconMic,
  IconPlus,
  IconSettings,
  IconShield,
  IconSparkles,
} from "../components/dashboard/icons";

// ============================================================
// WELCOME  ( /welcome )
// First page an interviewer / admin sees after signing in
// (Supabase-style product page). Every card opens an existing
// part of the application. No data is loaded here.
// ============================================================

const PRODUCTS = [
  {
    to: "/dashboard/scheduling",
    title: "Interview Scheduling",
    desc: "Invite candidates with a secure link, see invitations on a calendar, resend or cancel.",
    icon: IconCalendar,
    art: "calendar",
  },
  {
    to: "/dashboard/transcripts",
    title: "Answers & Transcripts",
    desc: "Every spoken answer, transcribed and kept with its question.",
    icon: IconMic,
    art: "wave",
  },
  {
    to: "/dashboard/reports",
    title: "Reports",
    desc: "AI scores, recommendation and decision — download any report as a PDF.",
    icon: IconFileText,
    art: "report",
  },
  {
    to: "/dashboard/analytics",
    title: "Analytics",
    desc: "Hiring funnel, score distribution and results per interview.",
    icon: IconBarChart,
    art: "bars",
  },
  {
    to: "/dashboard/configuration",
    title: "Settings & Gmail",
    desc: "Connect Gmail for invitations, interview settings, account and security.",
    icon: IconSettings,
    art: "toggles",
  },
];

// ---------- small decorative illustrations for the cards ----------
function Art({ kind }) {
  const box = "pointer-events-none mt-6 h-24 w-full";
  switch (kind) {
    case "calendar":
      return (
        <div className={`${box} grid grid-cols-7 gap-1`} data-depth="1">
          {Array.from({ length: 21 }, (_, i) => (
            <span
              key={i}
              className={`rounded-md ${[3, 9, 10, 16].includes(i) ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_4px_10px_-3px_rgba(124,58,237,0.6)]" : i === 12 ? "bg-fuchsia-400/80" : "bg-slate-100"}`}
            />
          ))}
        </div>
      );
    case "toggles":
      return (
        <div className={`${box} space-y-2.5`} data-depth="1">
          {[true, true, false].map((on, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <span className="h-2 w-24 rounded-full bg-slate-200" />
              <span className={`relative h-4 w-8 rounded-full ${on ? "bg-brand-500" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
              </span>
            </div>
          ))}
        </div>
      );
    case "wave":
      return (
        <div className={`${box} flex items-center gap-1`} data-depth="1">
          {[30, 55, 40, 80, 60, 95, 45, 70, 35, 85, 50, 65, 30, 75, 45, 60, 25, 50].map((h, i) => (
            <span key={i} className="flex-1 rounded-full bg-gradient-to-t from-brand-600 to-fuchsia-400" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    case "report":
      return (
        <div className={`${box} flex items-center gap-4`} data-depth="1">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#ede8ff" strokeWidth="5" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="url(#wg)" strokeWidth="5" strokeLinecap="round" strokeDasharray="80 100" />
              <defs>
                <linearGradient id="wg" x1="0" x2="1">
                  <stop offset="0" stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#d946ef" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-navy-900">86</span>
          </div>
          <div className="flex-1 space-y-2">
            <span className="block h-2 w-full rounded-full bg-slate-100"><span className="block h-full w-4/5 rounded-full bg-brand-500" /></span>
            <span className="block h-2 w-full rounded-full bg-slate-100"><span className="block h-full w-3/5 rounded-full bg-brand-400" /></span>
            <span className="block h-2 w-full rounded-full bg-slate-100"><span className="block h-full w-2/3 rounded-full bg-fuchsia-400" /></span>
          </div>
        </div>
      );
    case "bars":
      return (
        <div className={`${box} flex items-end gap-2`} data-depth="1">
          {[35, 55, 45, 70, 60, 85, 75, 95].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 shadow-[0_6px_12px_-6px_rgba(124,58,237,0.7)]" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    default:
      return (
        <div className={`${box} relative`} data-depth="1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-x-0 h-12 rounded-xl border border-slate-200 bg-white shadow-[0_10px_20px_-12px_rgba(46,16,101,0.35)]"
              style={{ top: `${i * 18}px`, left: `${i * 14}px`, right: `${(2 - i) * 14}px` }}
            >
              <span className="absolute left-3 top-3 h-2 w-20 rounded-full bg-slate-200" />
              <span className="absolute left-3 top-6 h-2 w-12 rounded-full bg-brand-200" />
            </span>
          ))}
        </div>
      );
  }
}

// big hero card illustration: a live AI interview window
function InterviewArt() {
  return (
    <div className="relative mt-8 rounded-2xl bg-gradient-to-br from-white to-brand-50 p-4 shadow-[0_30px_60px_-25px_rgba(76,29,149,0.45)] ring-1 ring-brand-100" data-depth="2">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">● REC</span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3 flex aspect-video items-end justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-200 via-brand-100 to-fuchsia-100">
          <svg viewBox="0 0 120 70" className="h-full w-full">
            <circle cx="60" cy="30" r="12" fill="#a78bfa" />
            <path d="M34 70c4-16 14-24 26-24s22 8 26 24" fill="#8b5cf6" />
            <path d="M44 14v-6h6M76 14v-6h-6M44 48v6h6M76 48v6h-6" stroke="#7c3aed" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <div className="col-span-2 flex flex-col gap-2">
          <div className="rounded-lg bg-white p-2 ring-1 ring-brand-100">
            <span className="block h-1.5 w-10 rounded-full bg-brand-300" />
            <span className="mt-1.5 block h-1.5 w-full rounded-full bg-slate-200" />
            <span className="mt-1 block h-1.5 w-3/4 rounded-full bg-slate-200" />
          </div>
          <div className="flex flex-1 items-center gap-0.5 rounded-lg bg-white px-2 ring-1 ring-brand-100">
            {[40, 70, 50, 90, 60, 80, 45, 65].map((h, i) => (
              <span key={i} className="flex-1 rounded-full bg-brand-400" style={{ height: `${h / 3}px` }} />
            ))}
          </div>
          <div className="flex gap-1">
            {["Face ✓", "Eyes ✓"].map((t) => (
              <span key={t} className="flex-1 rounded-md bg-emerald-50 py-1 text-center text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-100">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [faqOpen, setFaqOpen] = useState(0);

  // Fade/slide sections in as they scroll into view.
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // The Welcome page is the public start page of the application.
  // Opening it ends any saved login, so the dashboard and the interview
  // pages always need a fresh Log in (top bar / hero buttons).
  useEffect(() => {
    if (user) logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = false;
  const name = user?.name || "there";
  const roleLabel = user?.role === "admin" ? "Admin" : "Interviewer";
  // Signed-out visitors are sent to Register / Log in instead of app pages.
  const go = (to) => (signedIn ? navigate(to) : navigate("/login", { state: { from: to } }));

  return (
    <div className="min-h-screen bg-[#fbfaff] text-navy-900">
      {/* ================= NEON HERO (nav + hero + strip) ================= */}
      <WelcomeHeader signedIn={signedIn} name={name} />
      <NeonHero name={name} roleLabel={roleLabel} signedIn={signedIn} />
      <AIInterviewerSection />

      {/* ================= PRODUCT BENTO ================= */}
      <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <SectionHead eyebrow="Features" title="Everything your hiring team needs" desc="Log in and every card opens that part of the application." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* large hero card */}
          <button
            data-plain
            data-tilt="0.5"
            onClick={() => go("/create-interview")}
            className="ui-card group p-7 text-left md:col-span-2 lg:row-span-2"
          >
            <div className="flex items-center gap-3">
              <span data-depth="1" className="ui-title-icon ui-icon-3d h-11 w-11 [&_svg]:h-5 [&_svg]:w-5"><IconSparkles /></span>
              <h2 className="text-xl font-bold">AI Interviews</h2>
            </div>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-500">
              Give it a job role and the <span className="font-semibold text-navy-900">AI interviewer</span> runs
              the whole first round for you.
            </p>
            <InterviewArt />
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
              Create an interview <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </button>

          {PRODUCTS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                data-plain
                data-tilt
                key={p.to}
                onClick={() => go(p.to)}
                className="ui-card group flex flex-col p-6 text-left"
              >
                <div className="flex items-center gap-3">
                  <span data-depth="1" className="ui-title-icon ui-icon-3d h-10 w-10 [&_svg]:h-5 [&_svg]:w-5"><Icon /></span>
                  <h3 className="text-base font-bold">{p.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{p.desc}</p>
                <Art kind={p.art} />
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-brand-700">
                  Open <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <LiveGuardSection onOpen={() => go("/dashboard/live-guard")} />

      <HowItWorks />
      <MiniFaq open={faqOpen} setOpen={setFaqOpen} />

      {/* ================= CTA ================= */}
      <section className="px-5 pb-16 sm:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-fuchsia-600 px-8 py-12 text-white shadow-[0_40px_80px_-30px_rgba(124,58,237,0.7)] sm:px-14">
          <Orbs preset="hero" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">
                {signedIn ? "Your workspace is ready" : "Let your AI interviewer take the first round"}
              </h2>
              <p className="mt-2 max-w-xl text-brand-100">
                {signedIn
                  ? "Jump into the dashboard to see pending reviews, recent interviews and quick actions."
                  : "Create an interviewer or admin account, set up your first interview and invite candidates."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {signedIn ? (
                <>
                  <button onClick={() => navigate("/dashboard")} className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    Go to dashboard
                  </button>
                  <button data-plain onClick={() => navigate("/dashboard/help")} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">
                    <IconHelp /> FAQ
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => navigate("/register")} className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    Create account
                  </button>
                  <button data-plain onClick={() => navigate("/login")} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20">
                    Log in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <WelcomeFooter
        signedIn={signedIn}
        name={name}
        roleLabel={roleLabel}
        onSignOut={() => {
          logout();
          navigate("/", { replace: true });
        }}
      />
    </div>
  );
}
