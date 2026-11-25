import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { IconLogOut, IconMail, IconSettings, IconShield, IconUserCircle } from "../../components/dashboard/icons";
import { Avatar, Card, Orbs } from "../../components/ui";

export default function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { userName, userEmail, role, stats, isInterviewer, hiring } = useDashboard();

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  const summary = hiring?.summary;

  const tiles = isInterviewer
    ? [
        ["Interviews created", stats.total],
        ["Completed sessions", stats.completed],
        ["Candidates attended", summary?.total ?? "—"],
        ["Selected", summary?.selected ?? "—"],
      ]
    : [
        ["Interviews assigned", stats.total],
        ["Completed", stats.completed],
        ["In progress", stats.inProgress],
        ["Not started", stats.notStarted],
      ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Cover + identity */}
      <section className="ui-card overflow-hidden">
        <div className="relative h-28 bg-gradient-to-r from-[#3b0d7a] via-[#5b21b6] to-[#86198f]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
          <Orbs preset="small" />
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="-mt-10 shrink-0 rounded-full ring-4 ring-white shadow-[0_14px_30px_-10px_rgba(124,58,237,0.6)]">
              <Avatar name={userName} size="xl" tone="brand" />
            </div>
            <div className="pt-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{userName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="ui-pill bg-brand-50 text-brand-700 ring-1 ring-brand-100">{roleLabel}</span>
                {userEmail && (
                  <span className="flex items-center gap-1.5">
                    <IconMail /> {userEmail}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button data-plain onClick={() => navigate("/dashboard/configuration")} className="ui-btn-ghost">
            <IconSettings /> Settings
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} data-tilt className="ui-card p-4">
            <p className="text-xs font-medium text-slate-500">{k}</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-navy-900">{v}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card icon={IconUserCircle} title="Profile details">
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              ["Full name", userName],
              ["Email address", userEmail || "—"],
              ["Role", roleLabel],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate text-right font-semibold text-navy-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card icon={IconShield} title="Security">
          <div className="flex items-start gap-3 rounded-xl bg-brand-50/60 p-4 text-sm text-brand-900">
            <span className="text-brand-600"><IconShield /></span>
            <p>Your session is protected with a sign-in token. Sign out on shared computers when you're done.</p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
            className="ui-btn mt-4 bg-rose-600 text-white hover:bg-rose-700"
          >
            <IconLogOut /> Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}
