// --- Stat cards: 3D tilt card with a glossy icon tile ---
// Same props as before: { title, value, icon, change, variant }
const VARIANTS = {
  purple: { box: "from-brand-400 to-brand-600", glow: "bg-brand-400/25", bar: "from-brand-400 to-brand-600" },
  teal: { box: "from-brand-400 to-brand-600", glow: "bg-brand-400/25", bar: "from-brand-400 to-brand-600" },
  emerald: { box: "from-fuchsia-400 to-fuchsia-600", glow: "bg-fuchsia-400/25", bar: "from-fuchsia-400 to-fuchsia-600" },
  amber: { box: "from-amber-300 to-amber-500", glow: "bg-amber-300/30", bar: "from-amber-300 to-amber-500" },
  cyan: { box: "from-navy-500 to-navy-800", glow: "bg-navy-400/25", bar: "from-navy-400 to-navy-700" },
  navy: { box: "from-navy-500 to-navy-800", glow: "bg-navy-400/25", bar: "from-navy-400 to-navy-700" },
};

export default function StatCard({ title, value, icon: Icon, change, variant }) {
  const v = VARIANTS[variant] || VARIANTS.purple;

  return (
    <div data-tilt className="ui-card group relative p-5">
      {/* soft coloured light behind the icon */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl ${v.glow}`} />
      </div>
      <div className={`absolute inset-x-4 top-0 h-[3px] rounded-b-full bg-gradient-to-r ${v.bar} opacity-70`} />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{title}</p>
        {Icon && (
          <div
            data-depth="2"
            className={`ui-icon-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white [&_svg]:h-5 [&_svg]:w-5 ${v.box}`}
          >
            <Icon />
          </div>
        )}
      </div>
      <p data-depth="1" className="relative mt-2 font-display text-3xl font-extrabold tracking-tight text-navy-900">
        {value}
      </p>
      {change && <p className="relative mt-1.5 truncate text-xs font-medium text-slate-500">{change}</p>}
    </div>
  );
}
