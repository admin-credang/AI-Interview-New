import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import { formatDate, useDashboard } from "../../context/DashboardContext";
import { prettyReason } from "../../components/dashboard/hiring";
import { IconActivity, IconAlertTriangle, IconEye, IconRefresh, IconShield, IconVideo } from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, PageHeader, SegTabs } from "../../components/ui";

// ============================================================
// LIVE MONITORING
// Sessions : GET /hiring/candidates               (refreshed every 15 s)
// Events   : GET /hiring/candidates/{session_id}  (monitoring.events, every 8 s)
// Events are written by the candidate's browser during the interview
// (POST /hiring/sessions/{id}/monitoring-event) - nothing new on the server.
// ============================================================

const SESSIONS_EVERY = 15000;
const EVENTS_EVERY = 8000;
// an "in_progress" session older than this is treated as left unfinished
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const ago = (iso, now) => {
  if (!iso) return "";
  const d = Math.round((now - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${Math.max(d, 0)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return formatDate(iso);
};

const SEVERE = new Set([
  "multiple_faces",
  "multiple_faces_detected",
  "phone_detected",
  "tab_left",
  "candidate_left_interview_page",
  "camera_denied",
]);
const INFO = new Set(["monitoring_started"]);

const tone = (type) =>
  SEVERE.has(type)
    ? { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200", label: "High" }
    : INFO.has(type)
      ? { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Info" }
      : { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-200", label: "Warning" };

// ---------- radar graphic for the header ----------
function Radar({ live }) {
  return (
    <div className="lm-radar relative h-44 w-44 shrink-0" aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-white/40 bg-white/10 shadow-[inset_0_0_40px_rgba(255,255,255,0.25)]" />
      <div className="absolute inset-[18%] rounded-full border border-white/30" />
      <div className="absolute inset-[36%] rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/20" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/20" />
      <div className="lm-sweep absolute inset-0 rounded-full" />
      {[
        [28, 30],
        [66, 24],
        [72, 64],
        [34, 70],
        [52, 46],
      ]
        .slice(0, Math.max(1, Math.min(5, live || 1)))
        .map(([x, y], i) => (
          <span
            key={i}
            className="lm-blip absolute h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(255,255,255,0.7)]"
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.6}s` }}
          />
        ))}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="font-display text-4xl font-extrabold leading-none [text-shadow:0_3px_0_rgba(76,29,149,0.45)]">{live}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">Live now</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <div data-tilt="0.6" className="ui-card ui-card-hover flex items-center gap-4 p-4">
      <span data-depth="2" className={`ui-icon-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="font-display text-2xl font-extrabold tracking-tight text-navy-900">{value}</p>
      </div>
    </div>
  );
}

export default function LiveMonitoring() {
  const navigate = useNavigate();
  const { hiring, reloadHiring } = useDashboard();
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState(null);
  const [detail, setDetail] = useState(null);
  const [eventsError, setEventsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("live");

  // ticking clock for timers
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // keep the session list fresh
  useEffect(() => {
    reloadHiring?.();
    const id = window.setInterval(() => reloadHiring?.(), SESSIONS_EVERY);
    return () => window.clearInterval(id);
  }, [reloadHiring]);

  const all = useMemo(() => hiring?.candidates || [], [hiring]);

  const live = useMemo(
    () =>
      all
        .filter(
          (c) =>
            c.session_status === "in_progress" &&
            c.started_at &&
            Date.now() - new Date(c.started_at).getTime() < LIVE_WINDOW_MS
        )
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at)),
    [all]
  );

  const recent = useMemo(
    () =>
      all
        .filter((c) => c.session_status !== "in_progress" || !live.includes(c))
        .filter((c) => (c.proctoring?.event_count || 0) > 0 || c.proctoring?.flagged || c.session_status === "terminated")
        .sort((a, b) => new Date(b.ended_at || b.started_at || 0) - new Date(a.ended_at || a.started_at || 0))
        .slice(0, 12),
    [all, live]
  );

  const stats = {
    live: live.length,
    flagged: all.filter((c) => c.proctoring?.flagged).length,
    terminated: all.filter((c) => c.session_status === "terminated").length,
    events: all.reduce((n, c) => n + (c.proctoring?.event_count || 0), 0),
  };

  // pick the first live session automatically
  useEffect(() => {
    if (!selected && (live[0] || recent[0])) setSelected((live[0] || recent[0]).session_id);
  }, [live, recent, selected]);

  // events of the selected session
  useEffect(() => {
    if (!selected) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get(`/hiring/candidates/${selected}`);
        if (cancelled) return;
        setDetail(res.data);
        setEvents(res.data?.monitoring?.events || []);
        setEventsError("");
      } catch {
        if (!cancelled) setEventsError("Could not load monitoring events for this session.");
      }
    };
    setEvents(null);
    load();
    const isLive = live.some((c) => c.session_id === selected);
    const id = isLive ? window.setInterval(load, EVENTS_EVERY) : null;
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const refresh = async () => {
    setRefreshing(true);
    await reloadHiring?.();
    setRefreshing(false);
  };

  const current = all.find((c) => c.session_id === selected);
  const list = tab === "live" ? live : recent;
  const feed = [...(events || [])].reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Live Monitoring"
        icon={IconActivity}
        description="Watch interviews that are running right now — face, eye and screen checks update automatically."
        actions={
          <button
            data-plain
            type="button"
            onClick={refresh}
            className="ui-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
          >
            <IconRefresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      {/* ---------- console header with radar graphics ---------- */}
      <section className="lm-hero relative overflow-hidden rounded-2xl p-6 text-white sm:p-8">
        <div className="lm-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-8 md:flex-row md:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold ring-1 ring-white/35 backdrop-blur">
              <span className="lm-live-dot h-2 w-2 rounded-full bg-rose-400" />
              Monitoring console · auto-refresh
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {stats.live ? `${stats.live} interview${stats.live === 1 ? "" : "s"} running now` : "No interviews running right now"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              The AI interviewer checks the candidate&apos;s face, eye-gaze, phone use, extra people and tab switching.
              Alerts appear here a few seconds after they happen.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              {["Face", "Eye-gaze", "Phone", "Multiple people", "Tab switch"].map((t) => (
                <span key={t} className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/30">{t} ✓</span>
              ))}
            </div>
          </div>
          <Radar live={stats.live} />
        </div>
      </section>

      {/* ---------- stats ---------- */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat icon={IconVideo} label="Live now" value={stats.live} tint="from-emerald-400 to-emerald-600" />
        <Stat icon={IconAlertTriangle} label="Flagged sessions" value={stats.flagged} tint="from-amber-400 to-orange-500" />
        <Stat icon={IconShield} label="Stopped by monitoring" value={stats.terminated} tint="from-rose-400 to-rose-600" />
        <Stat icon={IconEye} label="Monitoring alerts" value={stats.events} tint="from-brand-400 to-brand-700" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        {/* ---------- sessions ---------- */}
        <Card
          title={tab === "live" ? "Running interviews" : "Recent sessions with alerts"}
          icon={IconVideo}
          action={
            <SegTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "live", label: `Live (${live.length})` },
                { id: "recent", label: `Alerts (${recent.length})` },
              ]}
            />
          }
        >
          {!hiring ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={IconVideo} title={tab === "live" ? "Nobody is interviewing right now" : "No alerts yet"}>
              {tab === "live"
                ? "When a candidate starts an interview it shows up here automatically."
                : "Sessions with monitoring alerts will be listed here."}
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((c) => {
                const isLive = c.session_status === "in_progress";
                const active = c.session_id === selected;
                const flagged = c.proctoring?.flagged;
                return (
                  <button
                    data-plain
                    key={c.session_id}
                    type="button"
                    onClick={() => setSelected(c.session_id)}
                    className={`lm-session group relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                      active ? "border-brand-400 bg-brand-50/70 ring-4 ring-brand-100" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.candidate?.name || "?"} tone="brand" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy-900">{c.candidate?.name}</p>
                          <p className="truncate text-xs text-slate-500">{c.interview_title}</p>
                        </div>
                      </div>
                      {isLive ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 ring-1 ring-rose-200">
                          <span className="lm-live-dot h-1.5 w-1.5 rounded-full bg-rose-500" /> Live
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {c.session_status === "terminated" ? "Stopped" : c.session_status === "completed" ? "Done" : "Unfinished"}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {isLive ? "Elapsed" : "Ended"}
                        </p>
                        <p className="font-mono text-lg font-bold text-navy-900">
                          {isLive ? clock(now - new Date(c.started_at).getTime()) : ago(c.ended_at || c.started_at, now)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.proctoring?.face && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">Face</span>}
                        {c.proctoring?.eye && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">Eyes</span>}
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            flagged ? "bg-amber-100 text-amber-800" : (c.proctoring?.event_count || 0) > 0 ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {(c.proctoring?.event_count || 0) > 0 ? `${c.proctoring.event_count} alert${c.proctoring.event_count === 1 ? "" : "s"}` : "All clear"}
                        </span>
                      </div>
                    </div>
                    {isLive && <span className="lm-scan pointer-events-none absolute inset-x-0 top-0 h-full" />}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* ---------- event feed ---------- */}
        <Card
          title="Monitoring feed"
          description={current ? `${current.candidate?.name} · ${current.interview_title}` : "Pick a session to see its alerts"}
          icon={IconEye}
          action={
            current && current.session_status !== "in_progress" ? (
              <button
                data-plain
                type="button"
                onClick={() => navigate(`/dashboard/candidates/${current.session_id}`)}
                className="ui-link text-xs font-semibold"
              >
                Open report →
              </button>
            ) : null
          }
        >
          {!selected ? (
            <EmptyState icon={IconEye} title="No session selected">Choose a running interview to watch its alerts.</EmptyState>
          ) : eventsError ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{eventsError}</p>
          ) : events === null ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
            </div>
          ) : (
            <>
              {detail?.monitoring?.terminated_reason && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <IconShield className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <b>Interview stopped:</b> {prettyReason(detail.monitoring.terminated_reason)}
                  </span>
                </div>
              )}
              {feed.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="ui-icon-3d flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-2xl text-white">✓</span>
                  <p className="mt-3 text-sm font-bold text-navy-900">All clear</p>
                  <p className="mt-1 text-xs text-slate-500">No monitoring alerts for this session.</p>
                </div>
              ) : (
                <ol className="relative max-h-[460px] space-y-3 overflow-y-auto pr-1">
                  {feed.map((e, i) => {
                    const t = tone(e.type);
                    return (
                      <li key={`${e.at}-${i}`} className="lm-event flex gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-[0_6px_16px_-14px_rgba(76,29,149,0.6)]">
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.dot} ${i === 0 && current?.session_status === "in_progress" ? "lm-live-dot" : ""}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-navy-900">{prettyReason(e.type)}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${t.chip}`}>{t.label}</span>
                          </div>
                          {e.detail && <p className="mt-0.5 text-xs text-slate-500">{e.detail}</p>}
                          <p className="mt-1 text-[11px] text-slate-400">{ago(e.at, now)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
