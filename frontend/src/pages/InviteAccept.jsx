import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";

/**
 * The button in the invitation e-mail opens   /invite/INV-XXXX-XXXX
 *
 *   not logged in -> remember the ID, go to login / register,
 *                    login brings the candidate back here
 *   logged in     -> the server checks the ID belongs to this e-mail
 *                    and returns the ONE interview -> open its lobby
 */
export default function InviteAccept() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    // not logged in yet
    if (!user) {
      try {
        sessionStorage.setItem("pending_invite", code);
      } catch {
        /* ignore */
      }
      navigate("/login", { replace: true });
      return;
    }

    if (started.current) return;
    started.current = true;

    api
      .post(`/hiring/invitations/${encodeURIComponent(code)}/open`)
      .then((res) => {
        try {
          sessionStorage.removeItem("pending_invite");
        } catch {
          /* ignore */
        }
        navigate(`/interviews/${res.data.interview_id}`, { replace: true });
      })
      .catch((err) => {
        try {
          sessionStorage.removeItem("pending_invite");
        } catch {
          /* ignore */
        }
        setError(
          err?.response?.data?.detail ||
            "We could not open this interview. Please try again."
        );
        setChecking(false);
      });
  }, [user, code, navigate]);

  if (checking && !error) {
    return (
      <div className="min-h-screen bg-[#06040C] text-white flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-fuchsia-400 animate-spin" />
        <p className="text-sm opacity-70">Checking your interview ID...</p>
      </div>
    );
  }

  const switchAccount = () => {
    try {
      sessionStorage.setItem("pending_invite", code);
    } catch {
      /* ignore */
    }
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#06040C] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-2">
          Interview ID
        </p>
        <p className="font-mono text-lg tracking-widest mb-5">{code}</p>

        <h1 className="text-xl font-black mb-2">We could not open this interview</h1>
        <p className="text-sm text-rose-300 leading-relaxed mb-8">{error}</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={switchAccount}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 font-bold text-sm"
          >
            Log in with a different email
          </button>
          <button
            onClick={() => navigate("/dashboard", { replace: true })}
            className="w-full py-3 rounded-2xl border border-white/15 hover:bg-white/10 font-bold text-sm"
          >
            Go to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
