import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Register.scss"; // pages/Register.scss — same folder as this file

const ROLES = [
  { value: "candidate", label: "Candidate", hint: "Practice interviews" },
  { value: "interviewer", label: "Interviewer", hint: "Review candidates" },
  { value: "admin", label: "Admin", hint: "Manage the platform" },
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
    role: "candidate",
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

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none";
  const labelClass = "mb-2 block text-xs font-semibold text-slate-600";

  return (
    <div className="register-page flex min-h-screen items-center justify-center px-4 py-8">
      <span className="blob blob--violet" />
      <span className="blob blob--blue" />

      <div className="register-card relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white p-3 lg:grid-cols-[0.9fr_1.1fr]">
        {/* ---------- Left: purple panel with robot ---------- */}
        <div className="register-visual hidden overflow-hidden rounded-[1.5rem] lg:block">
          <img
            src="/register-ai.png"
            alt=""
            aria-hidden="true"
            className="visual-bg absolute inset-0 h-full w-full object-cover"
          />
          <img
            src="/register-ai.png"
            alt="Hands typing on a laptop with glowing AI interface icons"
            className="visual-main relative h-full w-full object-contain"
          />

          <div className="brand flex items-center gap-2 text-slate-900">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold backdrop-blur">
              AI
            </div>
            <span className="text-sm font-semibold">Interview Agent</span>
          </div>

          <div className="glass-chip rounded-2xl p-4 text-slate-900">
            <p className="text-sm font-semibold">Your first interview is a minute away</p>
            <p className="mt-1 text-xs text-slate-500">
              Create an account, pick a role, and start practicing with live feedback.
            </p>
          </div>
        </div>

        {/* ---------- Right: form ---------- */}
        <div className="register-form flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-7">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Registration
            </h1>
            <span className="title-bar" />
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="name" className={labelClass}>
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your name"
                  required
                  className={inputClass}
                />
              </div>

              <div className="field">
                <label htmlFor="email" className={labelClass}>
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  className={inputClass}
                />
              </div>

              <div className="field">
                <label htmlFor="password" className={labelClass}>
                  Password
                </label>
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
                    className={`${inputClass} pr-12`}
                  />
                  <button data-plain
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>

                {form.password && (
                  <div className="mt-2">
                    <div className="strength flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="h-1 flex-1 rounded-full"
                          style={{
                            background:
                              i <= strength ? STRENGTH_COLORS[strength] : STRENGTH_COLORS[0],
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {form.password.length < 8 ? STRENGTH_LABELS[0] : STRENGTH_LABELS[strength]}
                    </p>
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="confirmPassword" className={labelClass}>
                  Confirm password
                </label>
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
                  className={`${inputClass} ${mismatch ? "!border-red-400" : ""}`}
                />
                {mismatch && (
                  <p className="mt-2 text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>
            </div>

            {/* Account type — radio cards, like the gender row in the template */}
            <fieldset className="mt-6">
              <legend className={labelClass}>Account type</legend>
              <div className="grid gap-3 sm:grid-cols-3">
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
                    <label
                      htmlFor={`role-${r.value}`}
 className="role-card block cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 peer-checked:border-slate-300 peer-checked:bg-slate-100 peer-checked:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400"
                    >
                      <span className="block text-sm font-semibold text-slate-800">
                        {r.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{r.hint}</span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-8 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="spinner" />}
              {loading ? "Creating account..." : "Create account"}
              {!loading && <span className="arrow">→</span>}
            </button>

            <p className="mt-6 text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-slate-700 underline-offset-4 hover:underline"
              >
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