import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";

export default function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t, userName, userEmail, role, stats } = useDashboard();

  const rows = [
    ["Name", userName],
    ["Email", userEmail || "—"],
    ["Role", role ? role.charAt(0).toUpperCase() + role.slice(1) : "—"],
    ["Assessments", stats.total],
    ["Completed", stats.completed],
  ];

  return (
    <div className="space-y-10 max-w-3xl">
      <header className="flex items-center gap-5 px-1">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center text-white font-black text-3xl shadow-lg">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight">{userName}</h1>
          <p className="opacity-60 text-sm capitalize">{role}</p>
        </div>
      </header>

      <section className={`rounded-[2rem] border ${t.card} divide-y divide-white/10`}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6 px-8 py-5 text-sm">
            <span className="opacity-60">{k}</span>
            <span className="font-semibold text-right break-all">{v}</span>
          </div>
        ))}
      </section>

      <button
        onClick={() => {
          logout();
          navigate("/login", { replace: true });
        }}
        className="px-6 py-3 rounded-xl bg-red-500/15 text-red-400 font-bold hover:bg-red-500/25 transition"
      >
        Secure Logout
      </button>
    </div>
  );
}
