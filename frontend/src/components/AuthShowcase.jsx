// Navy / teal brand panel used on the Login and Register pages.
// Pure presentation – no auth logic lives here.

export const SHOWCASE_FEATURES = [
  { title: "AI Monitoring", desc: "Face, eye-gaze & multi-person detection" },
  { title: "Auto Transcription", desc: "Every answer recorded and transcribed" },
  { title: "Detailed Reports", desc: "Scores, skills & PDF export" },
  { title: "Secure & Reliable", desc: "Invite-only sessions, Google sign-in" },
];

export function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function InterviewIllustration() {
  return (
    <svg viewBox="0 0 360 230" className="w-full max-w-[380px]" aria-hidden="true">
      <defs>
        <linearGradient id="as-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>

      {/* main video window */}
      <rect x="10" y="10" width="250" height="170" rx="16" fill="#ffffff" fillOpacity=".06" stroke="#ffffff" strokeOpacity=".14" />
      <rect x="10" y="10" width="250" height="28" rx="16" fill="#ffffff" fillOpacity=".05" />
      <circle cx="28" cy="24" r="4" fill="#f87171" />
      <circle cx="42" cy="24" r="4" fill="#fbbf24" />
      <circle cx="56" cy="24" r="4" fill="#34d399" />
      <rect x="196" y="18" width="52" height="12" rx="6" fill="#ef4444" fillOpacity=".2" />
      <circle cx="205" cy="24" r="3" fill="#ef4444" />
      <rect x="212" y="21.5" width="28" height="5" rx="2.5" fill="#fecaca" fillOpacity=".8" />

      {/* candidate silhouette */}
      <circle cx="135" cy="92" r="24" fill="url(#as-g)" />
      <path d="M90 162c6-26 24-40 45-40s39 14 45 40" fill="url(#as-g)" opacity=".85" />
      {/* face tracking frame */}
      <path d="M103 64v-8h8M167 64v-8h-8M103 120v8h8M167 120v8h-8" stroke="#c4b5fd" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* question card */}
      <g transform="translate(200 120)">
        <rect width="150" height="96" rx="14" fill="#ffffff" />
        <rect x="14" y="14" width="44" height="8" rx="4" fill="#ede8ff" />
        <rect x="14" y="30" width="118" height="6" rx="3" fill="#cbd5e1" />
        <rect x="14" y="42" width="96" height="6" rx="3" fill="#e2e8f0" />
        {/* waveform */}
        <g fill="#8b5cf6">
          <rect x="14" y="66" width="4" height="10" rx="2" />
          <rect x="22" y="61" width="4" height="20" rx="2" />
          <rect x="30" y="64" width="4" height="14" rx="2" />
          <rect x="38" y="58" width="4" height="26" rx="2" />
          <rect x="46" y="63" width="4" height="16" rx="2" />
          <rect x="54" y="66" width="4" height="10" rx="2" />
          <rect x="62" y="60" width="4" height="22" rx="2" />
          <rect x="70" y="65" width="4" height="12" rx="2" />
        </g>
        <rect x="96" y="62" width="40" height="18" rx="9" fill="#0d1f3c" />
        <rect x="104" y="69" width="24" height="4" rx="2" fill="#c4b5fd" />
      </g>

      {/* score bubble */}
      <g transform="translate(296 44)">
        <circle r="34" fill="#0d1f3c" stroke="#ffffff" strokeOpacity=".12" />
        <circle r="26" fill="none" stroke="#ffffff" strokeOpacity=".1" strokeWidth="6" />
        <circle r="26" fill="none" stroke="url(#as-g)" strokeWidth="6" strokeLinecap="round" strokeDasharray="140 164" transform="rotate(-90)" />
        <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff" fontFamily="Inter, sans-serif">86</text>
      </g>
    </svg>
  );
}

export default function AuthShowcase({ title, subtitle }) {
  return (
    <div className="auth-showcase relative hidden h-full flex-col justify-between overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-navy-950 via-navy-900 to-brand-900 p-10 text-white lg:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-200 ring-1 ring-white/15">
          <span className="live-dot" />
          AI interviewer online
        </span>
        <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight">
          {title}
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300">{subtitle}</p>
      </div>

      <span className="ui-orb ui-orb--teal right-10 top-40 h-12 w-12" />
      <span className="ui-orb ui-orb--glass left-8 top-1/2 h-8 w-8" style={{ animationDelay: "-3s" }} />
      <span className="ui-ring -bottom-16 -right-16 h-48 w-48" style={{ animationDelay: "-1.5s" }} />

      <div className="relative my-8 flex justify-center [animation:ui-float_8s_ease-in-out_infinite] [filter:drop-shadow(0_30px_40px_rgba(0,0,0,0.45))]">
        <InterviewIllustration />
      </div>

      <ul className="relative grid grid-cols-2 gap-x-6 gap-y-4">
        {SHOWCASE_FEATURES.map((f) => (
          <li key={f.title} className="flex gap-3">
            <span className="ui-icon-3d mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-white">
              <Check />
            </span>
            <span>
              <span className="block text-sm font-semibold">{f.title}</span>
              <span className="block text-xs leading-relaxed text-slate-400">{f.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
