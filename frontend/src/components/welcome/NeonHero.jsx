import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import BrandMark from "../BrandMark";
import { IconArrowRight, IconSettings, IconSparkles } from "../dashboard/icons";

import aiInterviewerImg from "../../assets/ai-interviewer.webp";
import LiveAndroid from "./LiveAndroid";

// ============================================================
// Welcome hero - white & purple "AI Interviewer" scene
//  - soft purple network mesh (canvas)
//  - original AI-interviewer robot (SVG drawn for this app)
//  - orbit rings, hologram pedestal, light beam, sparkles
//  - floating hologram cards: resume, live question, proctoring, score
// Pure presentation, no API calls.
// ============================================================

// ---------- animated wave of connected points ----------
function NetworkMesh() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("reduce-motion");

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const COLS = 34;
    const ROWS = 16;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const project = (x, y, z) => {
      const fov = 520;
      const tilt = 1.0;
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
      const zz = y * Math.sin(tilt) + z * Math.cos(tilt) + 420;
      const s = fov / zz;
      return [w * 0.6 + x * s, h * 0.7 + yy * s, s];
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const pts = [];
      for (let r = 0; r < ROWS; r += 1) {
        const row = [];
        for (let c = 0; c < COLS; c += 1) {
          const x = (c - COLS / 2) * 38;
          const y = (r - ROWS / 2) * 38;
          const z =
            Math.sin(c * 0.35 + t * 0.0009) * 34 +
            Math.cos(r * 0.45 + t * 0.0007) * 26 +
            Math.sin((c + r) * 0.18 + t * 0.0005) * 22;
          row.push(project(x, y, z));
        }
        pts.push(row);
      }
      ctx.lineWidth = 0.8;
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const [x, y, s] = pts[r][c];
          const a = Math.max(0.04, Math.min(0.4, s * 0.38));
          if (c + 1 < COLS) {
            const [x2, y2] = pts[r][c + 1];
            ctx.strokeStyle = `rgba(124, 58, 237, ${a * 0.55})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          if (r + 1 < ROWS) {
            const [x3, y3] = pts[r + 1][c];
            ctx.strokeStyle = `rgba(217, 70, 239, ${a * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x3, y3);
            ctx.stroke();
          }
          if ((r * 7 + c * 3) % 5 === 0) {
            ctx.fillStyle = `rgba(139, 92, 246, ${Math.min(0.9, a * 1.8)})`;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.8, s * 1.8), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    const loop = (t) => {
      if (visible) draw(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// ---------- small reusable graphics ----------
function Sparkle({ className = "", delay = "0s", size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`ai-twinkle absolute ${className}`} style={{ animationDelay: delay }} aria-hidden="true">
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill="url(#ai-spark)" />
      <defs>
        <linearGradient id="ai-spark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Holo({ className = "", delay = "0s", children }) {
  return (
    <div
      data-tilt="0.6"
      className={`rb-chip absolute z-20 hidden rounded-2xl border border-white/80 bg-white/75 p-3.5 text-navy-900 shadow-[0_24px_50px_-20px_rgba(76,29,149,0.45),inset_0_1px_0_#fff] ring-1 ring-brand-200/70 backdrop-blur-xl sm:block ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function AIPortrait() {
  return (
    <div className="absolute inset-0 flex items-end justify-center">
      {/* glowing orb + rings behind the android */}
      <div className="pointer-events-none absolute left-1/2 top-[44%] h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(168,85,247,0.38),rgba(217,70,239,0.16)_45%,transparent_70%)] blur-xl" />
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-[70%] w-[70%] animate-[spin_40s_linear_infinite] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300/60" />
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-[56%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-fuchsia-300/50" />
      {/* floor shadow */}
      <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-10 w-[60%] -translate-x-1/2 rounded-[50%] bg-brand-700/25 blur-2xl" />
      <div className="relative mb-[1%] aspect-[952/1078] h-[88%] max-w-full [filter:drop-shadow(0_30px_40px_rgba(76,29,149,0.35))]">
        <LiveAndroid />
      </div>
    </div>
  );
}

function RobotStage() {
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[520px] sm:h-[520px] lg:h-[580px]">
      <AIPortrait />

      <Sparkle className="left-[14%] top-[12%]" size={22} />
      <Sparkle className="right-[10%] top-[6%]" delay="-1.2s" size={16} />
      <Sparkle className="right-[4%] top-[52%]" delay="-2.4s" size={20} />
      <Sparkle className="left-[4%] top-[58%]" delay="-0.6s" size={14} />

      {/* speech bubble */}
      <Holo className="left-[-4%] top-[4%] max-w-[220px] rounded-br-md lg:left-[-10%]" delay="0s">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" /> AI Interviewer
        </p>
        <p className="text-xs leading-relaxed text-slate-700">Hi, welcome to your interview! How has your day been so far?</p>
      </Holo>

      {/* live question */}
      <Holo className="right-[-4%] top-[16%] w-48 lg:right-[-12%]" delay="-1s">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-600">Question 3 of 7</p>
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">● REC</span>
        </div>
        <p className="mt-1.5 text-xs font-semibold leading-snug">How did you clean the data before analysis?</p>
        <div className="mt-2 flex h-6 items-center gap-[3px]">
          {[40, 75, 55, 95, 65, 85, 45, 70, 50, 90, 60, 35].map((h, i) => (
            <span key={i} className="rb-voice w-1 rounded-full bg-gradient-to-t from-brand-600 to-fuchsia-400" style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      </Holo>

      {/* proctoring */}
      <Holo className="bottom-[2%] left-[-4%] w-44 lg:left-[-6%]" delay="-3s">
        <div className="relative mx-auto flex h-16 items-end justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brand-100 to-fuchsia-100">
          <svg viewBox="0 0 80 50" className="h-full">
            <circle cx="40" cy="20" r="9" fill="#a78bfa" />
            <path d="M22 50c3-11 10-16 18-16s15 5 18 16" fill="#8b5cf6" />
            <path d="M26 8v-5h5M54 8v-5h-5M26 34v5h5M54 34v5h-5" stroke="#7c3aed" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-semibold">
          {["Face", "Eyes", "Phone"].map((t) => (
            <span key={t} className="text-emerald-600">{t} ✓</span>
          ))}
        </div>
      </Holo>

      {/* score */}
      <Holo className="bottom-[8%] right-[-4%] w-44 lg:right-[-12%]" delay="-4s">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#ede8ff" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="url(#ai-sg)" strokeWidth="4" strokeLinecap="round" strokeDasharray="81 100" />
              <defs>
                <linearGradient id="ai-sg" x1="0" x2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold">86</span>
          </div>
          <div className="flex-1 space-y-1">
            {[90, 76, 84, 70].map((v, i) => (
              <span key={i} className="block h-1.5 rounded-full bg-brand-50">
                <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500" style={{ width: `${v}%` }} />
              </span>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-slate-500">AI score · report ready</p>
      </Holo>
    </div>
  );
}

export default function NeonHero({ name, roleLabel, signedIn = false }) {
  const navigate = useNavigate();
  const [role, setRole] = useState("");

  const start = (e) => {
    e.preventDefault();
    // Signed-out visitors register first.
    if (!signedIn) {
      navigate("/register");
      return;
    }
    navigate("/create-interview", { state: { title: role.trim() } });
  };

  return (
    <div className="relative -mt-20 overflow-hidden bg-white pt-20 text-navy-900">
      {/* soft purple light + grid + mesh */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_600px_at_75%_35%,rgba(196,181,253,0.55),transparent_60%),radial-gradient(600px_500px_at_5%_0%,rgba(240,171,252,0.35),transparent_60%),radial-gradient(700px_400px_at_50%_110%,rgba(167,139,250,0.35),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(#ede8ff_1px,transparent_1px),linear-gradient(90deg,#ede8ff_1px,transparent_1px)] [background-size:52px_52px] [mask-image:radial-gradient(ellipse_at_30%_20%,black_15%,transparent_70%)]" />
      <NetworkMesh />

      {/* ---------- hero ---------- */}
      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-4 px-5 pb-12 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-16 lg:pt-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100 backdrop-blur">
            <IconSparkles className="h-3.5 w-3.5" />
            {signedIn ? `Welcome back, ${name} · ${roleLabel}` : "AI-powered interview platform"}
          </span>

          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl xl:text-[4.4rem]">
            Meet Your
            <span className="ui-gradient-text block bg-gradient-to-r from-brand-700 via-fuchsia-500 to-brand-600 bg-clip-text pb-2 text-transparent">
              AI Interviewer.
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            It greets every candidate, asks questions from the job and their resume, listens, follows up, keeps an eye
            on the camera and scores every answer — so your team only meets the right people.
          </p>

          {signedIn ? (
            <>
            <form onSubmit={start} className="mt-8 flex max-w-xl flex-col gap-3 rounded-2xl bg-white/80 p-2 shadow-[0_20px_50px_-24px_rgba(76,29,149,0.45)] ring-1 ring-brand-100 backdrop-blur sm:flex-row">
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Give it a job role, e.g. Data Analyst"
                aria-label="Job role"
                className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-4 py-3 text-sm text-navy-900 outline-none placeholder:text-slate-400 focus:!shadow-none"
              />
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold">
                Create interview
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
                  <IconArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            </form>
              <p className="mt-3 text-xs text-slate-500">
                Opens the interview set-up with the role filled in — the AI interviewer does the rest.
              </p>
            </>
          ) : (
            <>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold"
                >
                  Log in
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                >
                  Register — it&apos;s free
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Log in to open your dashboard, create interviews and see reports. New here? Register as an interviewer or admin.
              </p>
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-slate-600">
            {["Resume-aware", "Live proctoring", "Auto transcripts"].map((t) => (
              <span key={t} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] text-white shadow">✓</span>
                {t}
              </span>
            ))}
          </div>
        </div>

        <RobotStage />
      </section>

    </div>
  );
}

// ============================================================
// "Your AI interviewer" profile + example conversation
// (the first AI line is the real warm-welcome wording)
// ============================================================
const ABILITIES = [
  { k: "Speaks", d: "Reads every question aloud in the interviewer voice you choose.", i: "🔊" },
  { k: "Listens", d: "Records and transcribes each spoken answer automatically.", i: "🎙️" },
  { k: "Reads the resume", d: "Asks about the candidate's own projects and skills.", i: "📄" },
  { k: "Follows up", d: "Asks a follow-up question when an answer needs more depth.", i: "↪️" },
  { k: "Watches", d: "Face, eye-gaze, phone and multiple-face checks on camera.", i: "👁️" },
  { k: "Scores", d: "Five skill scores and a short summary for every candidate.", i: "⭐" },
];

const CHAT = [
  ["ai", "Hi, welcome to your interview! How has your day been so far?"],
  ["me", "Pretty good, thank you — a little nervous!"],
  ["ai", "That's completely normal. Let's begin: could you briefly introduce yourself and what you've worked on recently?"],
  ["me", "Sure! I'm a data analyst. Recently I built a dashboard that…"],
  ["ai", "Nice. How did you clean the data before building that dashboard?"],
];

export function AIInterviewerSection() {
  return (
    <section id="ai" className="scroll-mt-24 relative overflow-hidden bg-gradient-to-b from-white via-[#f6f1ff] to-[#fbfaff] py-20">
      <div className="pointer-events-none absolute left-1/4 top-10 h-96 w-96 rounded-full bg-brand-300/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-10 h-80 w-80 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <Sparkle className="left-[6%] top-24" size={20} />
      <Sparkle className="right-[8%] top-40" delay="-1.5s" size={16} />

      <div className="relative mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
        {/* profile card */}
        <div data-reveal className="ui-card relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-brand-200/70 to-fuchsia-200/60 blur-2xl" />
          <div className="relative flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 via-white to-fuchsia-100 shadow-[0_14px_30px_-12px_rgba(76,29,149,0.5)] ring-1 ring-brand-200">
              <img src={aiInterviewerImg} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_25%]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Your AI Interviewer</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">Takes the first round for you</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" /> Ready for your next candidate
              </p>
            </div>
          </div>

          <div className="relative mt-7 grid gap-3 sm:grid-cols-2">
            {ABILITIES.map((a) => (
              <div key={a.k} data-tilt="0.5" className="rounded-2xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/60 p-4 shadow-[0_12px_24px_-18px_rgba(76,29,149,0.5)]">
                <div className="flex items-center gap-2.5">
                  <span data-depth="1" className="ui-icon-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-500 text-base">{a.i}</span>
                  <p className="font-semibold text-navy-900">{a.k}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{a.d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* example conversation */}
        <div data-reveal className="ui-card relative overflow-hidden p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-600">How it sounds</p>
              <h3 className="mt-1 text-xl font-bold text-navy-900">A real conversation, not a form</h3>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-100">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> REC
            </span>
          </div>

          <ol className="mt-6 space-y-3">
            {CHAT.map(([who, text], i) => (
              <li key={i} className={`flex items-end gap-2.5 ${who === "me" ? "flex-row-reverse" : ""}`}>
                {who === "ai" ? (
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-100 to-fuchsia-100 ring-2 ring-white shadow">
                    <img src={aiInterviewerImg} alt="" className="h-full w-full scale-150 object-cover object-[50%_30%]" />
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">C</span>
                )}
                <p
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    who === "ai"
                      ? "rounded-bl-sm bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-[0_12px_24px_-12px_rgba(124,58,237,0.7)]"
                      : "rounded-br-sm bg-slate-100 text-navy-900"
                  }`}
                >
                  {text}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px]">
            {[
              ["Warm welcome", "3 easy questions"],
              ["Main interview", "job + resume"],
              ["After", "scores & report"],
            ].map(([t, d], i) => (
              <div key={t} className="relative rounded-xl bg-brand-50 px-2 py-2.5 ring-1 ring-brand-100">
                <span className="absolute -top-2 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">{i + 1}</span>
                <p className="font-semibold text-navy-900">{t}</p>
                <p className="text-slate-500">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Example conversation. Questions are generated for each interview.</p>
        </div>
      </div>
    </section>
  );
}
