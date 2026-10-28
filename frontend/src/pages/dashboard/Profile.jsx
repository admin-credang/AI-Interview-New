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
    <div className="space-y-10 max-w-3xl p-3">
      {/* Profile Header with Modern Gradient & 3D Shadow */}
      <header className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)]">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-violet-100/80 via-purple-100/50 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="relative z-10 w-24 h-24 rounded-3xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white font-black text-4xl shadow-xl shadow-indigo-500/40 shrink-0">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{userName}</h1>
          <p className="text-violet-600 font-bold text-sm capitalize mt-1 tracking-wide bg-violet-50 inline-block px-3 py-1 rounded-full border border-violet-200">
            {role || "User"}
          </p>
        </div>
      </header>

      {/* Details Section with Deep 3D Card Styling */}
      <section className={`rounded-[2.5rem] border border-slate-100 bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] divide-y divide-slate-100 overflow-hidden`}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-center gap-6 px-8 py-5 text-sm hover:bg-slate-50/80 transition">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">{k}</span>
            <span className="font-black text-slate-900 text-base text-right break-all">{v}</span>
          </div>
        ))}
      </section>

      {/* Secure Logout Button */}
      <div>
        <button
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-extrabold text-sm shadow-xl shadow-rose-500/25 active:scale-95 transition-all duration-200 flex items-center gap-3"
        >
          <span>Secure Logout</span>
        </button>
      </div>
    </div>
  );
}