import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.scss"; // pages/Login.scss — same folder as this file

function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const result = await login(email, password);

    if (!result.success) {
      setError(result.message);
      return;
    }

    navigate("/dashboard");
  };

  const handleGoogleLogin = async () => {
    try {
      setError("");
      // Connect your AuthContext googleLogin here
      // e.g., await googleLogin();
      navigate("/dashboard");
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
    }
  };

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

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-stone-200"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.8 7.4l3.7 2.9C6.4 7.3 9 5 12 5z" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                <path fill="#FBBC05" d="M5.5 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.8 6.4C.7 8.6 0 11.2 0 14s.7 5.4 1.8 7.6l3.7-2.9z" />
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.3-6.5-5.3L1.8 15.9C3.7 19.7 7.5 23 12 23z" />
              </svg>
              Continue with Google
            </button>

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