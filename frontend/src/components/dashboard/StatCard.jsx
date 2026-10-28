// --- Stat cards ---
export default function StatCard({ title, value, icon: Icon, change, variant }) {
  // Flat, calm cards: white card, one blue icon box (no bright colours)
  const base = {
    card: "bg-white border-slate-200 shadow-sm hover:border-slate-300",
    iconBox: "bg-slate-800 text-white",
    textColor: "text-slate-500",
    valueColor: "text-slate-900",
  };
  const variants = { purple: base, emerald: base, amber: base, cyan: base };

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
