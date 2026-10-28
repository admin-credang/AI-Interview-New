import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";
import InterviewSettingsForm from "../components/dashboard/InterviewSettingsForm";
import { FlowSteps } from "../components/dashboard/hiring";

// Step 3 of the interviewer flow: Create -> Configuration -> Monitoring setup
export default function MonitoringSetup() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/hiring/interviews")
      .then((res) => {
        if (cancelled) return;

        const found = res.data.interviews.find((i) => i.id === interviewId);

        if (found) setItem(found);
        else setError("Interview not found.");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Could not load the interview.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">AI Interview Agent</h1>
            <p className="text-sm text-slate-500">Monitoring Setup</p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm transition hover:bg-slate-100"
          >
            Skip to Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <FlowSteps current={2} />

        <div className="mb-8">
          <p className="text-sm font-medium text-slate-700">INTERVIEWER</p>
          <h2 className="mt-2 text-4xl font-bold">Monitoring Setup</h2>
          <p className="mt-3 text-slate-500">
            {item ? `For "${item.title}". ` : ""}
            Choose whether eye and face monitoring is required, whether follow-up questions are asked, and what the candidate sees.
            You can change this any time from Interview Controls.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : !item ? (
          <p className="text-sm text-slate-500 animate-pulse">Loading...</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
            <InterviewSettingsForm
              interviewId={item.id}
              initialProctoring={item.proctoring}
              initialFollowUps={item.follow_ups}
              initialResumeQuestions={item.resume_questions_enabled}
              initialJob={item.job}
              saveLabel="Save monitoring setup"
              onSaved={() => setSaved(true)}
            />

            {saved && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/dashboard/controls")}
                  className="px-6 py-3 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-500 transition"
                >
                  Finish and invite candidates →
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="px-6 py-3 rounded-2xl font-bold border border-slate-200 hover:bg-slate-100 transition"
                >
                  Go to dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
