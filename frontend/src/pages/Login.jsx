import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.scss"; // pages/Login.scss — same folder as this file
import BrandMark from "../components/BrandMark";
import GoogleButton, { GOOGLE_REMEMBER_KEY } from "../components/GoogleButton";
import { Check, InterviewIllustration, SHOWCASE_FEATURES } from "../components/AuthShowcase";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  // page the user tried to open before logging in (set by the route guard)
  const wanted = typeof location.state?.from === "string" ? location.state.from : "";
  const { login, googleTicketLogin, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const hasPendingInvite = (() => {
    try {
      return Boolean(sessionStorage.getItem("pending_invite"));
    } catch {
      return false;
    }
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const result = await login(email, password, remember);

    if (!result.success) {
      setError(result.message);
      return;
    }

    // Came from an invitation e-mail? Go straight back to that
    // interview instead of the dashboard.
    afterLogin(result.user);
  };


  const afterLogin = (user) => {
    let pending = null;

    try {
      pending = sessionStorage.getItem("pending_invite");
      if (pending) {
        sessionStorage.removeItem("pending_invite");
      }
    } catch {
      /* ignore */
    }

    // Candidates from an invitation e-mail go to that interview; everyone
    // else goes to the page they wanted, or the dashboard.
    if (pending && user?.role === "candidate") {
      navigate(`/invite/${pending}`, { replace: true });
      return;
    }
    const blocked = !wanted || wanted === "/" || wanted.startsWith("/login") || wanted.startsWith("/register") || wanted.startsWith("/welcome");
    navigate(blocked ? "/dashboard" : wanted, { replace: true });
  };

  // ---- Google sign-in: back from Google with ?google_ticket=... ----
  const googleDone = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ticket = params.get("google_ticket");
    const gError = params.get("google_error");
    if (!ticket && !gError) return;
    if (googleDone.current) return; // React StrictMode runs effects twice
    googleDone.current = true;

    // clean the address bar (the ticket is single-use and short-lived)
    navigate("/login", { replace: true, state: location.state });

    if (gError) {
      setError(gError);
      return;
    }

    let keep = true;
    try {
      keep = sessionStorage.getItem(GOOGLE_REMEMBER_KEY) !== "0";
      sessionStorage.removeItem(GOOGLE_REMEMBER_KEY);
    } catch {
      /* ignore */
    }

    googleTicketLogin(ticket, keep).then((result) => {
      if (!result.success) {
        setError(result.message);
        return;
      }
      afterLogin(result.user);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New Google accounts from this page join as interviewers; invited
  // candidates keep the default role. Existing accounts keep their role.
  const googleRole = hasPendingInvite ? undefined : "interviewer";

  const NAV = [["Home", "/"]];

  const icon = "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500";

  return (
    <div className="lg3-page relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-6 sm:px-6 sm:py-10">
      {/* floating 3D orbs in the background */}
      <span className="lg3-orb lg3-orb--a" aria-hidden="true" />
      <span className="lg3-orb lg3-orb--b" aria-hidden="true" />
      <span className="lg3-orb lg3-orb--c" aria-hidden="true" />

      <div className="lg3-card relative z-10 w-full max-w-6xl rounded-[1.9rem] bg-white">
        {/* ---------- top bar ---------- */}
        <header className="relative z-20 flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Link to="/" aria-label="Home"><BrandMark dark={false} /></Link>
          <nav className="hidden items-center gap-7 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 lg:flex">
            {NAV.map(([label, to]) => (
              <a key={label} href={to} className="transition hover:text-brand-700">{label}</a>
            ))}
          </nav>
          <Link
            to="/register"
            className="lg3-3d rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white"
          >
            Sign up
          </Link>
        </header>

        <div className="relative grid gap-2 p-3 pt-0 lg:min-h-[580px] lg:grid-cols-[0.85fr_1.15fr]">
          {/* ---------- Left: login form ---------- */}
          <div className="relative z-10 flex flex-col justify-center px-4 pb-8 pt-2 sm:px-10 lg:pb-10">
            <div className="mx-auto w-full max-w-sm">
              <div className="ui-icon-3d mx-auto flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-brand-400 via-brand-600 to-fuchsia-500 text-white shadow-[0_18px_36px_-12px_rgba(124,58,237,0.75)]">
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </div>
              <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-navy-900">Log in to your account</h1>
              <p className="mt-1.5 text-center text-sm text-slate-500">
                Sign in to manage interviews, candidates and AI reports.
              </p>

              <form onSubmit={handleSubmit} className="mt-7">
                {hasPendingInvite && (
                  <div role="status" className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800">
                    You opened an interview invitation. Log in (or register) with the{" "}
                    <strong>same email address that received the invitation</strong> and your interview will open.
                  </div>
                )}

                {error && (
                  <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="space-y-3.5">
                  <div className="relative">
                    <label htmlFor="email" className="sr-only">Email address</label>
                    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      required
                      className="lg3-input"
                    />
                  </div>

                  <div className="relative">
                    <label htmlFor="password" className="sr-only">Password</label>
                    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      className="lg3-input !pr-11"
                    />
                    <button
                      data-plain
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-brand-600"
                    >
                      {showPassword ? (
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M1 1l22 22" />
                        </svg>
                      ) : (
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between gap-3 text-xs">
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    Remember me
                  </label>
                  <span className="text-right text-[11px] text-slate-400">
                    Forgot password? Contact your administrator.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="lg3-btn mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-extrabold uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <span className="lg3-spinner" />}
                  {loading ? "Signing in..." : "Log in"}
                </button>

                <GoogleButton role={googleRole} remember={remember} />

                <p className="mt-6 text-center text-sm text-slate-500">
                  Don&apos;t have an account?{" "}
                  <Link to="/register" className="font-bold text-brand-700 underline-offset-4 hover:underline">
                    Sign up now
                  </Link>
                </p>
              </form>
            </div>
          </div>

          {/* ---------- Right: 3D purple panel + Welcome ---------- */}
          <div
            data-tilt="0.5"
            className="lg3-panel relative hidden overflow-hidden rounded-[1.5rem] lg:block"
          >
            <svg className="lg3-wave absolute inset-0 h-full w-full" viewBox="0 0 700 580" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <defs>
                <linearGradient id="lg3a" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="0.5" stopColor="#f0abfc" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.85" />
                </linearGradient>
                <linearGradient id="lg3b" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e9d5ff" />
                  <stop offset="0.5" stopColor="#f472b6" />
                  <stop offset="1" stopColor="#818cf8" />
                </linearGradient>
                <filter id="lg3blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18" /></filter>
                <filter id="lg3soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
              </defs>
              <g className="w1" filter="url(#lg3blur)" opacity="0.35">
                <path d="M110 380 C 190 150, 390 90, 490 200 S 580 440, 390 450 S 140 490, 110 380 Z" fill="url(#lg3a)" />
              </g>
            </svg>

            <span className="lg3-orb lg3-orb--in right-8 top-28 h-12 w-12" aria-hidden="true" />
            <span className="ui-ring -bottom-16 -right-16 h-48 w-48 opacity-60" aria-hidden="true" />

            <div className="relative flex h-full flex-col p-9 text-white">
              <div data-depth="1">
                <span className="lg3-glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
                  AI interviewer online
                </span>
                <h2 className="lg3-title mt-4 font-display text-6xl font-extrabold leading-none tracking-tight">Welcome.</h2>
                <p className="mt-4 text-xl font-bold tracking-tight">Smarter hiring with AI interviews</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/80">
                  Run live AI interviews with real-time monitoring, automatic transcripts and instant, detailed reports.
                </p>
              </div>

              <div data-depth="3" className="lg3-illus my-5 flex flex-1 items-center justify-center">
                <InterviewIllustration />
              </div>

              <ul data-depth="1" className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                {SHOWCASE_FEATURES.map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="ui-icon-3d mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
                      <Check />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{f.title}</span>
                      <span className="block text-xs leading-relaxed text-white/70">{f.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;