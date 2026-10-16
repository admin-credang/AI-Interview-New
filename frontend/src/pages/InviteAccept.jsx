import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";

/**
 * The button in the invitation e-mail opens   /invite/INV-XXXX-XXXX
 *
 * There is NO login or password for the candidate:
 *   the server checks the Interview ID, signs the candidate in as the
 *   invited e-mail address and returns the ONE interview to open.
 *
 * An interviewer who clicks the link in their own browser is NOT signed
 * out - they are told to use another browser / private window instead.
 */
export default function InviteAccept() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, logout, setSession } = useAuth();

  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const started = useRef(false);

  const isRecruiter = Boolean(user) && user.role !== "candidate";

  useEffect(() => {
    if (isRecruiter) {
      setChecking(false);
      return;
    }

    if (started.current) return;
    started.current = true;

    const fail = (err) => {
      setError(
        err?.response?.data?.detail ||
          "We could not open this interview. Please try again."
      );
      setChecking(false);
    };

    api
      .post(`/hiring/invitations/${encodeURIComponent(code)}/enter`)
      .then((res) => {
        setSession(res.data.access_token, res.data.user);
        navigate(`/interviews/${res.data.interview_id}`, { replace: true });
      })
      .catch((err) => {
        // module "Open from e-mail without login" is OFF for this interview:
        // use the normal login flow instead
        if (err?.response?.data?.detail !== "LOGIN_REQUIRED") {
          fail(err);
          return;
        }

        if (!user) {
          try {
            sessionStorage.setItem("pending_invite", code);
          } catch {
            /* ignore */
          }
          navigate("/login", { replace: true });
          return;
        }

        api
          .post(`/hiring/invitations/${encodeURIComponent(code)}/open`)
          .then((res) => {
            navigate(`/interviews/${res.data.interview_id}`, { replace: true });
          })
          .catch(fail);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isRecruiter]);

  if (checking && !error) {
    return (
      <div className="min-h-screen bg-[#06040C] text-white flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-fuchsia-400 animate-spin" />
        <p className="text-sm opacity-70">Opening your interview...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06040C] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-2">
          Interview ID
        </p>
        <p className="font-mono text-lg tracking-widest mb-5">{code}</p>

        {isRecruiter ? (
          <>
            <h1 className="text-xl font-black mb-2">You are signed in as an interviewer</h1>
            <p className="text-sm opacity-80 leading-relaxed mb-8">
              This link is for the candidate. Open it in another browser or a
              private window, or sign out here to continue as the candidate.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  logout();
                  window.location.reload();
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 font-bold text-sm"
              >
                Sign out and continue as candidate
              </button>
              <button
                onClick={() => navigate("/dashboard", { replace: true })}
                className="w-full py-3 rounded-2xl border border-white/15 hover:bg-white/10 font-bold text-sm"
              >
                Back to my dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-black mb-2">We could not open this interview</h1>
            <p className="text-sm text-rose-300 leading-relaxed mb-8">{error}</p>
            <p className="text-xs opacity-60">
              Use the button in your latest invitation email, or ask the
              interviewer to resend it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
