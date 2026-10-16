import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.scss"; // pages/Login.scss — same folder as this file

function Login() {
  const navigate = useNavigate();
  const { login, googleLogin, loading } = useAuth();

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

    const result = await login(email, password);

    if (!result.success) {
      setError(result.message);
      return;
    }

    // Came from an invitation e-mail? Go straight back to that
    // interview instead of the dashboard.
    afterLogin(result.user);
  };

  // ---- Google sign-in (needs VITE_GOOGLE_CLIENT_ID in .env of the frontend) ----
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleBox = useRef(null);

  const afterLogin = (user) => {
    let pending = null;

    try {
      pending = sessionStorage.getItem("pending_invite");
    } catch {
      /* ignore */
    }

    navigate(
      pending && user?.role === "candidate"
        ? `/invite/${pending}`
        : "/dashboard"
    );
  };

  useEffect(() => {
    if (!googleClientId || !googleBox.current) return undefined;

    let cancelled = false;

    const draw = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBox.current) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError("");
          const result = await googleLogin(response.credential);

          if (!result.success) {
            setError(result.message);
            return;
          }

          afterLogin(result.user);
        },
      });

      window.google.accounts.id.renderButton(googleBox.current, {
        theme: "outline",
        size: "large",
        width: googleBox.current.offsetWidth || 320,
        text: "continue_with",
      });
    };

    if (window.google?.accounts?.id) {
      draw();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = draw;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId]);

  const inputClass =
    "w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 outline-none";

  return (
    <div className="login-page flex min-h-screen items-center justify-center px-4 py-8">
      <span className="blob blob--pink" />
      <span className="blob blob--violet" />

      <div className="login-card relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-[#f6f4f0] p-3 lg:grid-cols-[0.85fr_1.15fr]">
        {/* ---------- Left: form ---------- */}
        <div className="login-form flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-sm font-bold text-white">
              AI
            </div>
            <span className="text-sm font-semibold text-stone-700">
              Interview Agent
            </span>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-stone-900">
            Log in to
            <br />
            your account
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            Practice interviews with your AI agent and get instant feedback.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            {hasPendingInvite && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800"
              >
                You opened an interview invitation. Log in (or register)
                with the <strong>same email address that received the
                invitation</strong> and your interview will open.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div className="field">
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs font-semibold text-stone-600"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className={inputClass}
                />
              </div>

              <div className="field">
                <label
                  htmlFor="password"
                  className="mb-2 block text-xs font-semibold text-stone-600"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 transition hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {showPassword ? (
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
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-stone-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 accent-orange-500"
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                className="font-medium text-stone-500 underline-offset-4 hover:text-orange-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="spinner" />}
              {loading ? "Signing in..." : "Log in"}
            </button>

            <div className="my-6 flex items-center gap-4 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-300" />
              or
              <span className="h-px flex-1 bg-stone-300" />
            </div>

            {googleClientId ? (
              <div ref={googleBox} className="flex w-full justify-center" />
            ) : (
              <p className="text-center text-xs text-stone-400">
                Google sign-in is not set up. Use your e-mail and password.
              </p>
            )}

            <p className="mt-8 text-center text-sm text-stone-500">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-stone-900 underline-offset-4 hover:text-orange-600 hover:underline"
              >
                Create account
              </Link>
            </p>
          </form>
        </div>

        {/* ---------- Right: robot image ---------- */}
        <div className="login-visual hidden overflow-hidden rounded-[1.5rem] lg:block">
          {/* blurred copy fills the empty space, sharp copy shows the full image */}
          <img
            src="/robot.png"
            alt=""
            aria-hidden="true"
            className="visual-bg absolute inset-0 h-full w-full object-cover"
          />
          <img
            src="/robot.png"
            alt="AI interview robot working on a laptop"
            className="visual-main relative h-full w-full object-contain"
          />

          <div className="glass-chip glass-chip--top flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white">
            <span className="live-dot" />
            Agent online
          </div>

          <div className="glass-chip glass-chip--bottom rounded-2xl p-4 text-white">
            <p className="text-sm font-semibold">Your next interview starts here</p>
            <p className="mt-1 text-xs text-white/70">
              Real questions, live follow-ups, and a score after every answer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;