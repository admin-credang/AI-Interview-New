import { useState } from "react";
import api from "../services/api";

// ------------------------------------------------------------------
// "Continue with Google" for the Login and Register pages.
//
// Uses the backend's Google OAuth client (the same one used to connect
// Gmail), so nothing extra is needed in the frontend .env:
//   1. GET /google-oauth/login-url  -> Google sign-in page
//   2. Google returns to the backend, which logs the user in (or creates
//      the account) and sends the browser to /login?google_ticket=...
//   3. The Login page swaps the ticket for a session (AuthContext).
// ------------------------------------------------------------------

export const GOOGLE_REMEMBER_KEY = "google_remember";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * @param {string}  label         button text
 * @param {string}  [role]        account type for a NEW Google account ("interviewer" | "admin")
 * @param {boolean} [remember]    keep the session after the browser closes
 * @param {string}  dividerLabel  text of the "or" line above the button
 */
export default function GoogleButton({
  label = "Continue with Google",
  role,
  remember = true,
  dividerLabel = "or continue with",
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const start = async () => {
    setNote("");
    setBusy(true);
    try {
      const res = await api.get("/google-oauth/login-url", { params: role ? { role } : {} });
      const url = res.data?.url;
      if (!url) throw new Error("no url");
      try {
        sessionStorage.setItem(GOOGLE_REMEMBER_KEY, remember ? "1" : "0");
      } catch {
        /* ignore */
      }
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      const status = err?.response?.status;
      setNote(
        status === 404
          ? "Google sign-in needs the latest backend update. Please update the backend and restart it."
          : err?.response?.data?.detail ||
              "Google sign-in is not available right now. Please use your e-mail and password."
      );
    }
  };

  return (
    <div>
      <div className="my-5 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {dividerLabel}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="g3-google rounded-2xl p-1.5">
        <button
          data-plain
          type="button"
          onClick={start}
          disabled={busy}
          className="g3-google-btn flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50/40 disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
          ) : (
            <GoogleLogo />
          )}
          {busy ? "Opening Google..." : label}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 ring-1 ring-amber-200">
          {note}
        </p>
      )}
    </div>
  );
}
