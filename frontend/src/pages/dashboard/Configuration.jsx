import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import GmailConnectCard from "../../components/dashboard/controls/GmailConnectCard";
import { Toggle } from "../../components/dashboard/hiring";
import {
  IconLayers,
  IconLock,
  IconMail,
  IconSettings,
  IconUserCircle,
} from "../../components/dashboard/icons";
import { Avatar, Card, EmptyState, LineTabs, PageHeader } from "../../components/ui";

const PREF_KEY = "dashboard_preferences";

const loadPrefs = () => {
  try {
    return { reduceMotion: false, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) };
  } catch {
    return { reduceMotion: false };
  }
};

function Row({ title, desc, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy-900">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function Configuration() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isInterviewer, interviews, userName, userEmail, role } = useDashboard();

  const [prefs, setPrefs] = useState(loadPrefs);
  const [tab, setTab] = useState("general");

  const toggle = (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("dashboard-preferences"));
  };

  const tabs = [
    { id: "general", label: "General", icon: IconSettings },
    ...(isInterviewer
      ? [
          { id: "assessments", label: "Interview settings", icon: IconLayers },
          { id: "email", label: "Email & Gmail", icon: IconMail },
        ]
      : []),
    { id: "account", label: "Account & security", icon: IconLock },
  ];

  return (
    <div className="max-w-5xl">
      <PageHeader icon={IconSettings} title="Settings" description="Manage your workspace preferences, interview settings, email connection and account." />

      <LineTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "general" && (
        <div className="space-y-6">
          <Card icon={IconSettings} title="Preferences" description="Saved on this device.">
            <div className="divide-y divide-slate-100">
              <Row title="Reduce card animations" desc="Turns off the 3D tilt and floating effects on cards.">
                <Toggle label="Reduce card animations" checked={!!prefs.reduceMotion} onChange={() => toggle("reduceMotion")} />
              </Row>
            </div>
          </Card>

          <Card icon={IconUserCircle} title="Profile" description="How you appear in the workspace.">
            <div className="flex items-center gap-4">
              <Avatar name={userName} size="lg" tone="dark" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900">{userName}</p>
                <p className="truncate text-sm text-slate-500">{userEmail || "—"}</p>
              </div>
              <button data-plain onClick={() => navigate("/dashboard/profile")} className="ui-btn-ghost">
                <IconUserCircle /> View profile
              </button>
            </div>
          </Card>
        </div>
      )}

      {tab === "assessments" && isInterviewer && (
        <Card
          icon={IconLayers}
          title="Interview configuration"
          description="Difficulty, question categories, question count and interviewer voice for each interview."
          action={
            <button onClick={() => navigate("/create-interview")} className="ui-btn px-3 py-2 text-xs">
              + New interview
            </button>
          }
        >
          {interviews.length === 0 ? (
            <EmptyState icon={<IconLayers />} title="No interviews yet">
              Create an interview first, then configure it here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {interviews.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <IconLayers />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">{i.title || i.name}</p>
                      <p className="text-xs text-slate-500">
                        {i.duration_minutes ? `${i.duration_minutes} min` : "Duration not set"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button data-plain onClick={() => navigate(`/interviews/${i.id}/configuration`)} className="ui-btn-ghost px-3 py-2 text-xs">
                      Questions & voice
                    </button>
                    <button data-plain onClick={() => navigate(`/interviews/${i.id}/monitoring`)} className="ui-btn-ghost px-3 py-2 text-xs">
                      Monitoring
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "email" && isInterviewer && (
        <div className="space-y-6">
          <GmailConnectCard />
          <Card icon={IconMail} title="How email works" description="Google OAuth is used only to send mail from your account.">
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />Invitations, selected and rejected emails are sent from the connected Gmail account.</li>
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />When Gmail is not connected, mails go from the system address.</li>
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />Per-interview email switches live in Interview Controls → Features.</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-6">
          <Card icon={IconUserCircle} title="Account">
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                ["Name", userName],
                ["Email", userEmail || "—"],
                ["Role", role ? role.charAt(0).toUpperCase() + role.slice(1) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-4">
                  <dt className="text-xs font-medium text-slate-500">{k}</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card icon={IconLock} title="Security" description="Sign out of this device. Your session token is removed from this browser.">
            <button
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
              className="ui-btn bg-rose-600 text-white hover:bg-rose-700"
            >
              Sign out
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}
