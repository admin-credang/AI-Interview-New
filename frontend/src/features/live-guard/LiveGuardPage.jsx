import { useCallback, useEffect, useRef, useState } from "react";

import { IconCheck, IconEye, IconFileText, IconMic, IconPhone, IconRefresh, IconShield, IconUsers, IconVideo } from "../../components/dashboard/icons";
import "./liveGuardPage.css";

// ============================================================
// LIVE INTERVIEW GUARD  (separate feature - src/features/live-guard)
// Shows the guard tool (frontend/public/live-guard/app.html, built from
// Interview_Proctor_v51) directly inside the dashboard.
// The tool runs fully in this browser: camera / screen-share / microphone
// permissions are passed to the frame below.
// ============================================================

const TOOL_URL = "/live-guard/app.html";
const MIN_HEIGHT = 900;

const PLATFORMS = [
  ["Google Meet", "from-emerald-400 to-teal-600"],
  ["Zoom", "from-sky-400 to-blue-600"],
  ["Microsoft Teams", "from-indigo-400 to-violet-600"],
];
const STEPS = [
  ["Join", "Open your Meet, Zoom or Teams call in Chrome."],
  ["Share", "Button 1 — pick the meeting tab, keep tab audio on."],
  ["Start", "Button 2 — the candidate's face is found automatically."],
  ["Report", "End & generate report — the PDF downloads."],
];
const WATCH = [
  [IconEye, "Eyes"],
  [IconPhone, "Phone"],
  [IconUsers, "Extra person"],
  [IconMic, "Voice"],
  [IconFileText, "Q&A notes"],
];

export default function LiveGuardPage() {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [key, setKey] = useState(0);

  // the tool is on the same site, so the frame can grow to the tool's full height
  const fit = useCallback(() => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (!doc?.body) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (h) setHeight(Math.max(MIN_HEIGHT, h + 8));
    } catch {
      /* not same origin - keep the fixed height */
    }
  }, []);

  const onLoad = () => {
    setLoaded(true);
    try {
      const doc = frameRef.current?.contentDocument;
      // Vite answers unknown files with the React app - then the tool folder is missing
      setMissing(!doc || !doc.getElementById("start"));
      if (doc?.body && "ResizeObserver" in window) {
        const ro = new ResizeObserver(fit);
        ro.observe(doc.body);
        frameRef.current._ro = ro;
      }
    } catch {
      setMissing(false);
    }
    fit();
  };

  useEffect(() => {
    const id = window.setInterval(fit, 1500);
    const frame = frameRef.current;
    return () => {
      window.clearInterval(id);
      try {
        frame?._ro?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [fit, key]);

  const reload = () => {
    setLoaded(false);
    setMissing(false);
    setHeight(MIN_HEIGHT);
    setKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* ---------- hero ---------- */}
      <section className="lgp-hero relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="lgp-dots pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal-400/25 blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-teal-100 ring-1 ring-white/20 backdrop-blur">
              <span className="lgp-blink h-2 w-2 rounded-full bg-emerald-300" /> Live Interviews
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-[2rem]">
              Live Interview <span className="bg-gradient-to-r from-teal-200 to-violet-200 bg-clip-text text-transparent">Guard</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
              AI watch-guard for the interviews you take yourself. Runs right here in Chrome — nothing for the candidate to install.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {PLATFORMS.map(([n, tint]) => (
                <span key={n} className="inline-flex items-center gap-2 rounded-xl bg-white/10 py-1.5 pl-1.5 pr-3.5 text-sm font-semibold ring-1 ring-white/15 backdrop-blur">
                  <span className={`ui-icon-3d flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${tint}`}>
                    <IconVideo className="h-3.5 w-3.5" />
                  </span>
                  {n}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {WATCH.map(([Icon, t]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-xs font-medium text-white/85 ring-1 ring-white/10">
                  <Icon className="h-3.5 w-3.5 text-teal-200" /> {t}
                </span>
              ))}
            </div>
          </div>

          <div className="lgp-radar relative mx-auto hidden h-44 w-44 shrink-0 sm:block" aria-hidden="true">
            <span className="lgp-ring" />
            <span className="lgp-ring r2" />
            <span className="lgp-ring r3" />
            <span className="lgp-sweep" />
            <span className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 to-violet-600 shadow-[0_14px_30px_-10px_rgba(45,212,191,0.8)]">
              <IconShield className="h-8 w-8 text-white" />
            </span>
            <span className="lgp-tag" style={{ left: -14, top: 18 }}>Face ✓</span>
            <span className="lgp-tag" style={{ right: -20, top: 64, animationDelay: "-1.3s" }}>Eyes ✓</span>
            <span className="lgp-tag" style={{ left: 2, bottom: 6, animationDelay: "-2.4s" }}>Voice ✓</span>
          </div>
        </div>

        {/* steps */}
        <ol className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="lgp-step flex items-start gap-3 rounded-2xl bg-white/[0.08] p-3.5 ring-1 ring-white/12 backdrop-blur">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-indigo-700">{i + 1}</span>
              <div>
                <p className="text-sm font-bold">{t}</p>
                <p className="text-xs leading-relaxed text-white/65">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {missing && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          The guard tool files were not found. Copy the <b>live-guard</b> folder into <code>frontend\public\</code> (so that{" "}
          <code>frontend\public\live-guard\app.html</code> exists) and restart <code>npm run dev</code>.
        </div>
      )}

      {/* ---------- the tool ---------- */}
      <div className="lgp-frame overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-navy-900">
            <IconShield className="h-4 w-4 text-indigo-600" /> Guard console
          </span>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex">
            <IconCheck className="h-3 w-3" /> Runs in your browser
          </span>
          <span className="ml-auto flex gap-2">
            <button data-plain type="button" onClick={reload} className="ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <IconRefresh className="h-3.5 w-3.5" /> Reload
            </button>
            <a href={TOOL_URL} target="_blank" rel="noopener" className="ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <IconEye className="h-3.5 w-3.5" /> New tab
            </a>
          </span>
        </div>
        <div className="relative bg-[#f6f5fb]">
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
            </div>
          )}
          <iframe
            key={key}
            ref={frameRef}
            title="Live Interview Guard"
            src={TOOL_URL}
            onLoad={onLoad}
            allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-read; clipboard-write"
            allowFullScreen
            className="block w-full border-0"
            style={{ height }}
          />
        </div>
      </div>
    </div>
  );
}
