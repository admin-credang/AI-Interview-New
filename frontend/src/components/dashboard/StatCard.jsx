// --- Highly Unique Distinct Stat Cards with Custom Gradients & Icons ---
export default function StatCard({ title, value, icon: Icon, change, variant }) {
  const variants = {
    purple: {
      card: "bg-gradient-to-br from-purple-900/30 via-fuchsia-950/20 to-indigo-950/40 border-fuchsia-500/30 shadow-[0_15px_35px_rgba(217,70,239,0.1)] hover:border-fuchsia-500/60",
      iconBox: "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-lg shadow-fuchsia-500/40",
      textColor: "text-fuchsia-300",
      valueColor: ""
    },
    emerald: {
      card: "bg-gradient-to-br from-emerald-900/30 via-teal-950/20 to-slate-950/40 border-emerald-500/30 shadow-[0_15px_35px_rgba(16,185,129,0.1)] hover:border-emerald-500/60",
      iconBox: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/40",
      textColor: "text-emerald-300",
      valueColor: ""
    },
    amber: {
      card: "bg-gradient-to-br from-amber-900/30 via-orange-950/20 to-yellow-950/40 border-amber-500/30 shadow-[0_15px_35px_rgba(245,158,11,0.1)] hover:border-amber-500/60",
      iconBox: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/40",
      textColor: "text-amber-300",
      valueColor: ""
    },
    cyan: {
      card: "bg-gradient-to-br from-cyan-900/30 via-blue-950/20 to-indigo-950/40 border-cyan-500/30 shadow-[0_15px_35px_rgba(6,182,212,0.1)] hover:border-cyan-500/60",
      iconBox: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40",
      textColor: "text-cyan-300",
      valueColor: ""
    }
  };

  const currentVariant = variants[variant] || variants.purple;

  return (
    <div className={`p-7 rounded-[2.5rem] border backdrop-blur-xl transition-all duration-300 hover:scale-[1.03] group ${currentVariant.card}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold tracking-wide opacity-80 uppercase">{title}</span>
        <div className={`p-3.5 rounded-2xl transition-transform duration-300 group-hover:rotate-12 ${currentVariant.iconBox}`}>
          <Icon />
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className={`text-4xl font-black tracking-tight ${currentVariant.valueColor}`}>{value}</p>
      </div>
      {change && <p className={`text-xs font-semibold ${currentVariant.textColor} opacity-90`}>{change}</p>}
    </div>
  );
}
