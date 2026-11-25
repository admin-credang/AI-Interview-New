import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import BrandMark from "../components/BrandMark";
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

  // The interviewer chose "continue as candidate" in this browser
  const [switching, setSwitching] = useState(false);

  const isRecruiter =
    Boolean(user) && user.role !== "candidate" && !switching;

  useEffect(() => {
    if (isRecruiter) {
      setChecking(false);
      return;
    }

    if (started.current) return;
    started.current = true;
    setChecking(true);

    const fail = (err) => {
      setError(
        err?.response?.data?.detail ||
          (!err?.response
            ? "Cannot reach the interview server. Please check your internet connection and try again in a minute. (Interviewer: make sure the backend is running and VITE_API_BASE_URL is correct.)"
            : "We could not open this interview. Please try again.")
      );
      setChecking(false);
    };

    api
      .post(`/hiring/invitations/${encodeURIComponent(code)}/enter`)
      .then((res) => {
        setSession(res.data.access_token, res.data.user);
        try {
          sessionStorage.setItem(
            "active_invitation_code",
            res.data.invitation_code || code
          );
        } catch {
          /* A session can still start without this optional retry key. */
        }
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
            try {
              sessionStorage.setItem(
                "active_invitation_code",
                res.data.invitation_code || code
              );
            } catch {
              /* The authenticated candidate can still open the interview. */
            }
            navigate(`/interviews/${res.data.interview_id}`, { replace: true });
          })
          .catch(fail);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isRecruiter, switching]);

  if (checking && !error) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] text-navy-900 flex flex-col items-center justify-center gap-4 px-6">
        <BrandMark dark={false} />
        <div className="mt-4 w-10 h-10 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
        <p className="text-sm opacity-70">Opening your interview...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-navy-900 flex flex-col items-center justify-center gap-8 px-6">
      <BrandMark dark={false} />
      <div className="ui-card w-full max-w-md overflow-hidden text-center">
        <div className="bg-gradient-to-r from-navy-900 to-brand-900 px-8 py-5 text-white">
          <p className="text-[11px] uppercase tracking-wider text-brand-200 font-semibold mb-1">
            Interview ID
          </p>
          <p className="font-mono text-lg tracking-widest">{code}</p>
        </div>
        <div className="p-8">

        {isRecruiter ? (
          <>
            <h1 className="text-xl font-bold mb-2">You are signed in as an interviewer</h1>
            <p className="text-sm opacity-80 leading-relaxed mb-8">
              This link is for the candidate. Open it in another browser or a
              private window, or sign out here to continue as the candidate.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  // sign the interviewer out of THIS browser and open the
                  // candidate interview straight away (no reload needed)
                  logout();
                  started.current = false;
                  setError("");
                  setChecking(true);
                  setSwitching(true);
                }}
 className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm"
              >
                Sign out and continue as candidate
              </button>
              <button
                onClick={() => navigate("/dashboard", { replace: true })}
                className="bg-white text-navy-800 w-full py-3 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm"
              >
                Back to my dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-2">We could not open this interview</h1>
            <p className="text-sm text-rose-700 leading-relaxed mb-8">{error}</p>
            <p className="text-xs opacity-60">
              Use the button in your latest invitation email, or ask the
              interviewer to resend it.
            </p>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
