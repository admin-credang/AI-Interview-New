// Small shared UI kit for the redesigned pages (presentation only)

export function TitleIcon({ icon: Icon, size = "md" }) {
  if (!Icon) return null;
  const box = size === "lg" ? "h-12 w-12 [&_svg]:h-6 [&_svg]:w-6" : "h-9 w-9 [&_svg]:h-[18px] [&_svg]:w-[18px]";
  return (
    <span className={`ui-title-icon ui-icon-3d ${box}`}>
      <Icon />
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow, icon }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <TitleIcon icon={icon} size="lg" />
        <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, action, children, className = "", padded = true, icon }) {
  return (
    <section className={`ui-card ${padded ? "p-5 sm:p-6" : "overflow-hidden"} ${className}`}>
      {(title || action) && (
        <div className={`flex items-start justify-between gap-3 ${padded ? "mb-4" : "border-b border-slate-100 px-5 py-4 sm:px-6"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <TitleIcon icon={icon} />
            <div className="min-w-0">
              {title && <h2 className="ui-section-title">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
          {icon}
        </div>
      )}
      {title && <p className="text-sm font-semibold text-navy-900">{title}</p>}
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Pill-style segmented tabs
export function SegTabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            data-plain
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              active ? "bg-white text-navy-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-navy-900"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] ${active ? "bg-brand-50 text-brand-700" : "bg-slate-200/70 text-slate-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Underline tabs (page-level sections)
export function LineTabs({ tabs, value, onChange }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            data-plain
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              active ? "border-brand-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
            }`}
          >
            {Icon && <span className={active ? "text-brand-600" : "text-slate-400"}><Icon /></span>}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ name = "?", size = "md", tone = "navy" }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-20 w-20 text-2xl" };
  const tones = {
    navy: "bg-navy-50 text-navy-700",
    brand: "bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white",
    dark: "bg-gradient-to-br from-navy-700 to-navy-900 text-white",
  };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ${sizes[size]} ${tones[tone]}`}>
      {String(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// Simple table wrapper with consistent header style
export function Table({ head, children, minWidth = 720 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {head.map((h, i) => (
              <th key={i} className={`px-5 py-3 ${h.right ? "text-right" : ""}`}>
                {h.label ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function LiveDot({ tone = "emerald" }) {
  const c = tone === "rose" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${c}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${c}`} />
    </span>
  );
}

// Floating 3D spheres for hero banners (decorative only)
export function Orbs({ preset = "hero" }) {
  const sets = {
    hero: [
      ["ui-orb ui-orb--teal", "right-[18%] top-6 h-16 w-16", "0s"],
      ["ui-orb ui-orb--green", "right-[6%] bottom-6 h-10 w-10", "-2s"],
      ["ui-orb ui-orb--glass", "right-[30%] bottom-8 h-8 w-8", "-4s"],
      ["ui-ring", "-right-10 -top-10 h-40 w-40", "-1s"],
    ],
    small: [
      ["ui-orb ui-orb--teal", "right-8 top-6 h-10 w-10", "0s"],
      ["ui-orb ui-orb--glass", "right-24 bottom-5 h-6 w-6", "-3s"],
      ["ui-ring", "-right-8 -bottom-12 h-28 w-28", "-1s"],
    ],
    light: [
      ["ui-orb ui-orb--teal", "left-[8%] top-24 h-14 w-14", "0s"],
      ["ui-orb ui-orb--navy", "right-[10%] top-40 h-10 w-10", "-2.5s"],
      ["ui-orb ui-orb--green", "left-[16%] bottom-32 h-8 w-8", "-4s"],
      ["ui-orb ui-orb--glass", "right-[18%] bottom-40 h-12 w-12", "-1.5s"],
    ],
  };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {(sets[preset] || sets.hero).map(([cls, pos, delay], i) => (
        <span key={i} className={`${cls} ${pos}`} style={{ animationDelay: delay }} />
      ))}
    </div>
  );
}
