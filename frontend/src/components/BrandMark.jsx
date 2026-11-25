// Shared logo used by the sidebar, landing page and auth pages
// ------------------------------------------------------------
// Brand mark
// ------------------------------------------------------------
export default function BrandMark({ dark = true, compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="ui-icon-3d relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-500 text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12a8 8 0 0 1 16 0" />
          <path d="M8 12a4 4 0 0 1 8 0" />
          <circle cx="12" cy="16" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className={`font-display text-[15px] font-extrabold tracking-tight ${dark ? "text-white" : "text-navy-900"}`}>
            AI Interview
          </p>
          <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-brand-300/80" : "text-brand-600"}`}>
            Hiring Platform
          </p>
        </div>
      )}
    </div>
  );
}

