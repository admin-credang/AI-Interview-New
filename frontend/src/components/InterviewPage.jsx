import { useEffect, useRef } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://greasily-parkway-annually.ngrok-free.dev";

function InterviewPage({ sessionId }) {
  const terminatedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    const handleVisibilityChange = async () => {
      // Interview page still visible
      if (!document.hidden) return;

      // Prevent duplicate terminate requests
      if (terminatedRef.current) return;

      terminatedRef.current = true;

      try {
        await fetch(
          `${API_BASE_URL}/interview-monitoring/terminate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId,
              reason: "candidate_left_interview_page",
            }),
            keepalive: true,
          }
        );
      } catch (error) {
        console.error(
          "Interview termination failed:",
          error
        );
      }

      // Interview page close/end
      window.location.replace("/interview-ended");
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">

        <h1 className="mb-8 text-3xl font-bold">
          Online Interview
        </h1>

        {/* 
          Unga existing interview UI
          inga irukkum.

          Example:
          - Question
          - Answer textarea
          - Submit button
          - Next question
          - Timer etc.
        */}

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-300">
            Interview is in progress.
          </p>
        </div>

      </div>
    </div>
  );
}

export default InterviewPage;