import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import AddCandidateForm from "../../components/dashboard/controls/AddCandidateForm";
import { useDashboard } from "../../context/DashboardContext";
import { IconCalendar, IconMail, IconPlus } from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, PageHeader, SegTabs } from "../../components/ui";

// ============================================================
// INTERVIEW SCHEDULING
// Uses the SAME endpoints as Interview Controls:
//   GET    /hiring/interviews
//   POST   /hiring/interviews/{id}/invite        (send / resend)
//   DELETE /hiring/interviews/{id}/invitations   (cancel)
// ============================================================

const INV_STATUS = {
  sent: ["Invited", "bg-navy-50 text-navy-700 ring-navy-100"],
  opened: ["Link opened", "bg-brand-50 text-brand-700 ring-brand-100"],
  started: ["In interview", "bg-amber-50 text-amber-700 ring-amber-100"],
  completed: ["Completed", "bg-emerald-50 text-emerald-700 ring-emerald-100"],
  ended: ["Ended early", "bg-rose-50 text-rose-700 ring-rose-100"],
};

const MAIL = {
  sent: "Mail sent",
  pending: "Sending…",
  failed: "Mail failed",
  skipped: "Link only",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function MonthCalendar({ month, setMonth, marks, selected, onSelect }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const todayKey = key(new Date());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold text-navy-900">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <div className="flex gap-1">
          {[["‹", -1], ["›", 1]].map(([l, d]) => (
            <button
              data-plain
              key={l}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + d, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-lg leading-none text-slate-500 hover:border-brand-300 hover:text-navy-900"
              aria-label={d < 0 ? "Previous month" : "Next month"}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const k = key(d);
          const m = marks[k];
          const isSel = selected === k;
          return (
            <button
              data-plain
              key={k}
              onClick={() => onSelect(isSel ? null : k)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition ${
                isSel
                  ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_4px_10px_-4px_rgba(109,40,217,0.7)]"
                  : k === todayKey
                  ? "bg-brand-50 font-bold text-brand-700 ring-1 ring-brand-200"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d.getDate()}
              {m && (
                <span className="absolute bottom-1.5 flex gap-0.5">
                  {m.invited > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? "bg-brand-300" : "bg-brand-500"}`} />}
                  {m.interviews > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? "bg-amber-300" : "bg-amber-500"}`} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Invitation sent</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Interview taken</span>
      </div>
    </div>
  );
}

export default function Scheduling() {
  const navigate = useNavigate();
  const { t, hiring, reloadHiring } = useDashboard();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState({ msg: "", err: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/hiring/interviews")
      .then((res) => {
        if (!alive) return;
        const list = res.data.interviews || [];
        setItems(list);
        setPicked((p) => p || list[0]?.id || "");
      })
      .catch((err) => alive && setError(err?.response?.data?.detail || "Could not load interviews."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const item = items.find((i) => i.id === picked);

  const setInvitations = (id, invitations) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, invitations } : i)));

  // every invitation across all interviews
  const allInvites = useMemo(
    () =>
      items.flatMap((i) =>
        (i.invitations || []).map((inv) => ({ ...inv, interview_id: i.id, interview_title: i.title }))
      ),
    [items]
  );

  const marks = useMemo(() => {
    const m = {};
    const add = (iso, field) => {
      if (!iso) return;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      const k = key(d);
      m[k] = m[k] || { invited: 0, interviews: 0 };
      m[k][field] += 1;
    };
    allInvites.forEach((inv) => add(inv.invited_at, "invited"));
    (hiring?.candidates || []).forEach((c) => add(c.started_at, "interviews"));
    return m;
  }, [allInvites, hiring]);

  const list = allInvites
    .filter((inv) =>
      filter === "upcoming"
        ? ["sent", "opened"].includes(inv.status)
        : filter === "done"
        ? ["started", "completed", "ended"].includes(inv.status)
        : true
    )
    .filter((inv) => !day || (inv.invited_at && key(new Date(inv.invited_at)) === day));

  const counts = {
    upcoming: allInvites.filter((i) => ["sent", "opened"].includes(i.status)).length,
    done: allInvites.filter((i) => ["started", "completed", "ended"].includes(i.status)).length,
    all: allInvites.length,
  };

  const resend = async (inv) => {
    setBusy(inv.email + inv.interview_id);
    setNotice({ msg: "", err: "" });
    try {
      const res = await api.post(`/hiring/interviews/${inv.interview_id}/invite`, {
        candidates: [{ name: inv.name, email: inv.email, phone: inv.phone }],
        role: inv.role || undefined,
      });
      setInvitations(inv.interview_id, res.data.invitations);
      setNotice({ msg: `Invitation sent again to ${inv.name || inv.email}.`, err: "" });
    } catch (err) {
      setNotice({ msg: "", err: err?.response?.data?.detail || "Could not resend the invitation." });
    } finally {
      setBusy("");
    }
  };

  const cancel = async (inv) => {
    const ok = window.confirm(
      `Cancel the invitation for ${inv.name || inv.email}?\n\nTheir Interview ID (${inv.code || "old invite"}) will stop working.`
    );
    if (!ok) return;
    setBusy(inv.email + inv.interview_id);
    setNotice({ msg: "", err: "" });
    try {
      const res = await api.delete(`/hiring/interviews/${inv.interview_id}/invitations`, {
        params: { email: inv.email },
      });
      setInvitations(inv.interview_id, res.data.invitations);
      setNotice({ msg: `Invitation for ${inv.name || inv.email} was cancelled.`, err: "" });
    } catch (err) {
      setNotice({ msg: "", err: err?.response?.data?.detail || "Could not cancel the invitation." });
    } finally {
      setBusy("");
    }
  };

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div>
      <PageHeader
        icon={IconCalendar}
        title="Interview Scheduling"
        description="Send interview invitations, see them on the calendar, and resend or cancel them."
        actions={
          <button onClick={() => setShowForm((v) => !v)} className="ui-btn">
            <IconPlus className="h-4 w-4" /> {showForm ? "Close form" : "Send invitation"}
          </button>
        }
      />

      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice.msg && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice.msg}</p>}
      {notice.err && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice.err}</p>}

      {showForm && (
        <Card
          className="mb-6"
          icon={IconMail}
          title="New invitation"
          description="The candidate gets a secure link that opens only this interview."
          action={
            items.length > 0 && (
              <select value={picked} onChange={(e) => setPicked(e.target.value)} className="ui-input w-56 py-2 text-xs">
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </select>
            )
          }
        >
          {item ? (
            !item.has_configuration ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                This interview has no configuration yet.
                <button data-plain onClick={() => navigate(`/interviews/${item.id}/configuration`)} className="font-semibold underline">
                  Configure now
                </button>
              </div>
            ) : (
              <AddCandidateForm
                interviewId={item.id}
                role={item.job?.role || ""}
                t={t}
                emailOn={item.features?.email_invite?.active !== false}
                onAdded={(inv) => {
                  setInvitations(item.id, inv);
                  reloadHiring?.();
                }}
              />
            )
          ) : (
            <EmptyState icon={<IconCalendar />} title="No interviews yet" action={<button onClick={() => navigate("/create-interview")} className="ui-btn">Create interview</button>}>
              Create an interview before sending invitations.
            </EmptyState>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <MonthCalendar month={month} setMonth={setMonth} marks={marks} selected={day} onSelect={setDay} />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Waiting to start</p>
              <p className="text-xl font-bold text-navy-900">{counts.upcoming}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Taken</p>
              <p className="text-xl font-bold text-navy-900">{counts.done}</p>
            </div>
          </div>
        </Card>

        <Card
          padded={false}
          title={day ? `Invitations on ${new Date(day.split("-")[0], day.split("-")[1], day.split("-")[2]).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : "Invitations"}
          description={day ? "Click the day again to clear the filter." : "All invitations across your interviews."}
          action={
            <SegTabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: "upcoming", label: "Waiting", count: counts.upcoming },
                { id: "done", label: "Taken", count: counts.done },
                { id: "all", label: "All", count: counts.all },
              ]}
            />
          }
        >
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
            </div>
          ) : list.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<IconMail />} title="Nothing here">
                {filter === "upcoming" ? "No candidates are waiting to start." : "No invitations match this filter."}
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((inv) => {
                const [label, cls] = INV_STATUS[inv.status] || INV_STATUS.sent;
                const isBusy = busy === inv.email + inv.interview_id;
                const waiting = ["sent", "opened"].includes(inv.status);
                return (
                  <li key={inv.interview_id + inv.email} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={inv.name || inv.email} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-900">{inv.name || inv.email}</p>
                        <p className="truncate text-xs text-slate-500">
                          {inv.interview_title}
                          {inv.role ? ` · ${inv.role}` : ""} · invited {fmt(inv.invited_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`ui-pill ring-1 ${cls}`}>{label}</span>
                      {inv.mail_status && (
                        <span className={`ui-pill ${inv.mail_status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`} title={inv.mail_error || ""}>
                          {MAIL[inv.mail_status] || inv.mail_status}
                        </span>
                      )}
                      {waiting && (
                        <>
                          <button data-plain disabled={isBusy} onClick={() => resend(inv)} className="ui-btn-ghost px-3 py-1.5 text-xs disabled:opacity-50">
                            Resend
                          </button>
                          <button data-plain disabled={isBusy} onClick={() => cancel(inv)} className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
