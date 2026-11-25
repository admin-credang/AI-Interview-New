import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Register.scss"; // pages/Register.scss — same folder as this file
import { Check, SHOWCASE_FEATURES } from "../components/AuthShowcase";
import GoogleButton from "../components/GoogleButton";
import BrandMark from "../components/BrandMark";

// Only hiring-team accounts can register here. Candidates join
// through the invitation link the interviewer sends them.
const ROLES = [
  { value: "interviewer", label: "Interviewer", hint: "Create interviews & review candidates", icon: "🎯" },
  { value: "admin", label: "Admin", hint: "Manage every interview on the platform", icon: "🛡️" },
];

const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLORS = ["#e5e7eb", "#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.max(score, 1);
}

const EyeIcon = ({ off }) =>
  off ? (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M1 1l22 22" />
    </svg>
  ) : (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

function Register() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "interviewer",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const strength = getStrength(form.password);
  const mismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const result = await register(
      form.name,
      form.email,
      form.password,
      form.role
    );

    if (!result.success) {
      setError(result.message);
      return;
    }

    navigate("/login");
  };


  const labelClass = "mb-2 block text-xs font-bold text-navy-900";

  return (
    <div className="rg3-page relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-6 sm:px-6 lg:px-10">
      <span className="rg3-orb rg3-orb--a" aria-hidden="true" />
      <span className="rg3-orb rg3-orb--b" aria-hidden="true" />

      <div className="relative z-10 grid w-full max-w-[1320px] items-center gap-8 lg:grid-cols-[1.02fr_1fr] lg:gap-14">
        {/* ---------- Left: 3D wave art panel ---------- */}
        <div data-tilt="0.45" className="rg3-panel relative hidden min-h-[640px] overflow-hidden rounded-[2rem] lg:block">
          <svg className="rg3-waves absolute inset-0 h-full w-full" viewBox="0 0 640 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="rg3-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c7d2fe" />
                <stop offset="0.45" stopColor="#ddd6fe" />
                <stop offset="1" stopColor="#f5d0fe" />
              </linearGradient>
              <linearGradient id="rg3-r1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a5b4fc" />
                <stop offset="0.5" stopColor="#c4b5fd" />
                <stop offset="1" stopColor="#f0abfc" />
              </linearGradient>
              <linearGradient id="rg3-r2" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#f472b6" />
                <stop offset="0.5" stopColor="#c084fc" />
                <stop offset="1" stopColor="#a5b4fc" />
              </linearGradient>
              <linearGradient id="rg3-r3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e9d5ff" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
              <filter id="rg3-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
              <filter id="rg3-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="10" />
                <feOffset dx="-10" dy="6" />
                <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <rect width="640" height="720" fill="url(#rg3-bg)" />
            {/* glossy concentric ribbons (3D) */}
            <g className="rg3-rib" filter="url(#rg3-shadow)">
              {[
                [980, "url(#rg3-r1)", 92],
                [870, "url(#rg3-r2)", 78],
                [770, "url(#rg3-r3)", 70],
                [680, "url(#rg3-r2)", 60],
                [600, "url(#rg3-r1)", 56],
                [528, "url(#rg3-r3)", 48],
              ].map(([r, fill, w], i) => (
                <g key={r}>
                  <circle cx="820" cy="900" r={r} fill="none" stroke={fill} strokeWidth={w} opacity={0.95 - i * 0.04} />
                  <circle cx="820" cy="900" r={r - w / 2 + 6} fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.75" filter="url(#rg3-soft)" />
                  <circle cx="820" cy="900" r={r + w / 2 - 4} fill="none" stroke="#7c3aed" strokeWidth="3" opacity="0.25" />
                </g>
              ))}
            </g>
          </svg>
          {/* soft shading for legible text */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#3b1a78]/75 via-[#4c1d95]/35 to-transparent" />

          {/* floating 3D glass graphics */}
          {[
            [12, 30, 0], [46, 14, 0.9], [84, 40, 1.6], [62, 52, 0.4], [24, 52, 2.1],
          ].map(([x, y, d], i) => (
            <svg key={i} viewBox="0 0 24 24" className="hx-spark pointer-events-none absolute h-4 w-4 text-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} aria-hidden="true">
              <path fill="currentColor" d="M12 0c.7 6.3 5.7 11.3 12 12-6.3.7-11.3 5.7-12 12-.7-6.3-5.7-11.3-12-12C6.3 11.3 11.3 6.3 12 0z" />
            </svg>
          ))}

          <div data-depth="3" className="rg3-float absolute right-9 top-10 w-56 rounded-2xl p-4 rg3-glass-card">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">Question 3 of 7</p>
            <p className="mt-1 text-sm font-bold leading-snug text-navy-900">How did you clean the data before analysis?</p>
            <div className="mt-3 flex h-8 items-end gap-1" aria-hidden="true">
              {[0.4, 0.8, 0.55, 1, 0.65, 0.9, 0.45, 0.75, 0.5, 0.85].map((h, i) => (
                <span key={i} className="hx-bar w-1.5 rounded-full bg-gradient-to-t from-brand-600 to-fuchsia-400" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>

          <div data-depth="4" className="rg3-float absolute right-16 top-[200px] flex items-center gap-3 rounded-2xl p-3 pr-5 rg3-glass-card" style={{ animationDelay: "-2.5s" }}>
            <svg viewBox="0 0 44 44" className="h-12 w-12" aria-hidden="true">
              <circle cx="22" cy="22" r="18" fill="none" stroke="#ede9fe" strokeWidth="5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="url(#rg3-r2)" strokeWidth="5" strokeLinecap="round" strokeDasharray="97 113" transform="rotate(-90 22 22)" />
              <text x="22" y="26.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2e1065">86</text>
            </svg>
            <div>
              <p className="text-sm font-bold text-navy-900">AI score</p>
              <p className="text-[11px] text-slate-500">Report ready · PDF</p>
            </div>
          </div>

          <div data-depth="2" className="rg3-float absolute left-10 top-[150px] flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-navy-900 rg3-glass-card" style={{ animationDelay: "-4s" }}>
            <span className="lm-live-dot h-2 w-2 rounded-full bg-emerald-500" />
            Face ✓ Eyes ✓ Phone ✓
          </div>

          <div data-depth="1" className="absolute left-9 top-9">
            <Link to="/" aria-label="Home" className="inline-flex rounded-2xl bg-white/70 px-3 py-2 shadow-lg backdrop-blur">
              <BrandMark dark={false} />
            </Link>
          </div>

          <div data-depth="2" className="absolute bottom-10 left-9 right-9 text-white">
            <span className="rg3-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
              AI interviewer online
            </span>
            <h2 className="rg3-title mt-4 font-display text-5xl font-extrabold leading-[1.05] tracking-tight xl:text-6xl">
              Start hiring with
              <br />
              AI in minutes
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
              Create your account, set up an interview and invite candidates — the AI handles questions, monitoring and scoring.
            </p>
            <ul className="mt-6 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3">
              {SHOWCASE_FEATURES.map((f) => (
                <li key={f.title} className="flex gap-2.5">
                  <span className="ui-icon-3d mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
                    <Check />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{f.title}</span>
                    <span className="block text-xs leading-relaxed text-white/75">{f.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- Right: form ---------- */}
        <div className="rg3-form relative mx-auto w-full max-w-[560px] rounded-[2rem] px-5 py-8 sm:px-10 sm:py-10">
          <div className="mb-6 lg:hidden">
            <Link to="/" aria-label="Home"><BrandMark dark={false} /></Link>
          </div>
          <div className="ui-icon-3d mb-5 flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-brand-400 via-brand-600 to-fuchsia-500 text-white shadow-[0_18px_36px_-12px_rgba(124,58,237,0.75)]">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="8" r="4" />
              <path d="M3 21a7 7 0 0 1 14 0" />
              <path d="M19 8v6M16 11h6" />
            </svg>
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">Create account</h1>
          <p className="mt-3 text-sm text-slate-500">Set up interviews, invite candidates and get AI reports.</p>

          <form onSubmit={handleSubmit} className="mt-8">
            {error && (
              <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className={labelClass}>Full name</label>
                <input id="name" name="name" autoComplete="name" value={form.name} onChange={handleChange} placeholder="Your name" required className="rg3-input" />
              </div>

              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required className="rg3-input" />
              </div>

              <div>
                <label htmlFor="password" className={labelClass}>Password</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    className="rg3-input !pr-12"
                  />
                  <button
                    data-plain
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-brand-500 transition hover:text-brand-700"
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="h-1 flex-1 rounded-full"
                          style={{ background: i <= strength ? STRENGTH_COLORS[strength] : STRENGTH_COLORS[0] }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {form.password.length < 8 ? STRENGTH_LABELS[0] : STRENGTH_LABELS[strength]}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className={labelClass}>Confirm password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  required
                  aria-invalid={mismatch}
                  className={`rg3-input ${mismatch ? "!border-rose-400" : ""}`}
                />
                {mismatch && <p className="mt-2 text-xs text-rose-600">Passwords do not match.</p>}
              </div>
            </div>

            <fieldset className="mt-6">
              <legend className={labelClass}>Account type</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {ROLES.map((r) => (
                  <div key={r.value}>
                    <input
                      id={`role-${r.value}`}
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={form.role === r.value}
                      onChange={handleChange}
                      className="peer sr-only"
                    />
                    <label htmlFor={`role-${r.value}`} className="rg3-role flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3.5">
                      <span className="ui-icon-3d flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-fuchsia-500 text-base">
                        {r.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-navy-900">{r.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{r.hint}</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={loading}
              className="rg3-btn mt-8 flex w-full items-center justify-center gap-2 rounded-full px-4 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="lg3-spinner" />}
              {loading ? "Creating account..." : "Create account"}
              {!loading && <span aria-hidden="true">→</span>}
            </button>

            <GoogleButton label="Sign up with Google" role={form.role} dividerLabel="or sign up with" />

            <p className="mt-7 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link to="/login" className="font-bold text-brand-700 underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Register;