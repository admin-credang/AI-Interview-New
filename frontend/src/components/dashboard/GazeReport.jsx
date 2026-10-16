/*
 * Eye Movement Detection (AI-Assisted Answer Check)
 * INTERVIEWER ONLY. The candidate never sees this.
 *
 * `gaze` comes from GET /hiring/candidates/{id} -> monitoring.gaze
 */

const LEVEL_STYLE = {
  HIGH: { bar: "#dc2626", text: "#ef4444", chip: "bg-red-600 text-white" },
  MEDIUM: { bar: "#f59e0b", text: "#f59e0b", chip: "bg-amber-500 text-white" },
  LOW: { bar: "#10b981", text: "#10b981", chip: "bg-emerald-600 text-white" },
};

const levelOf = (label) =>
  LEVEL_STYLE[String(label || "").toUpperCase()] || LEVEL_STYLE.LOW;

function Stat({ label, value, note, color }) {
  return (
    <div
      className="rounded-xl border border-black/10 bg-black/5 p-4 min-w-0"
      style={{ borderTop: `4px solid ${color}` }}
    >
      <p className="text-[11px] opacity-60 font-semibold mb-1">{label}</p>
      <p className="text-2xl font-black leading-tight" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] opacity-60 mt-1 break-words">{note}</p>
    </div>
  );
}

export default function GazeReport({ gaze, eyeRequired }) {
  if (!eyeRequired) {
    return null;
  }

  const header = (
    <div
      className="rounded-xl px-5 py-3 mb-5 font-black text-white text-sm md:text-base"
      style={{ background: "#db2777" }}
    >
      Eye Movement Detection (AI-Assisted Answer Check)
    </div>
  );

  if (!gaze) {
    return (
      <div>
        {header}
        <p className="text-sm opacity-70">
          No eye-movement data was recorded for this interview (the camera
          may have been off, or the answers were not spoken).
        </p>
      </div>
    );
  }

  const s = gaze.summary;

  return (
    <div>
      {header}

      {!s ? (
        <p className="text-sm opacity-70">
          Not enough answer time to assess. Every answer was shorter than 3
          seconds.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat
              label="Gaze on screen"
              value={`${s.gaze_pct}%`}
              note="Of answer time"
              color={s.gaze_pct >= 90 ? "#10b981" : s.gaze_pct >= 75 ? "#f59e0b" : "#dc2626"}
            />
            <Stat
              label="Off-screen glances"
              value={s.glances}
              note="Total, all questions"
              color="#2563eb"
            />
            <Stat
              label="Reading pattern"
              value={`${s.reading_flagged} / ${s.reading_total}`}
              note={s.reading_note}
              color={s.reading_flagged ? "#dc2626" : "#10b981"}
            />
            <Stat
              label="Second-screen risk"
              value={`${s.second_screen_pct}%`}
              note={s.second_screen_label}
              color={levelOf(s.second_screen_label).bar}
            />
            <Stat
              label="AI-answer risk"
              value={s.ai_answer_risk}
              note={s.ai_answer_note}
              color={levelOf(s.ai_answer_risk).bar}
            />
          </div>

          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr
                  className="text-left text-white text-xs"
                  style={{ background: "#db2777" }}
                >
                  <th className="px-4 py-3 font-bold">#</th>
                  <th className="px-4 py-3 font-bold">Gaze on screen</th>
                  <th className="px-4 py-3 font-bold">Off-screen glances</th>
                  <th className="px-4 py-3 font-bold">Reading pattern</th>
                  <th className="px-4 py-3 font-bold">Observation</th>
                  <th className="px-4 py-3 font-bold text-center">AI risk</th>
                </tr>
              </thead>
              <tbody>
                {gaze.questions.map((q) => (
                  <tr key={q.question} className="border-b border-black/10 align-top">
                    <td className="px-4 py-3 font-black" style={{ color: "#db2777" }}>
                      Q{q.question}
                    </td>
                    <td className="px-4 py-3">
                      {q.assessed ? `${q.gaze_pct}%` : "—"}
                    </td>
                    <td className="px-4 py-3">{q.assessed ? q.glances : "—"}</td>
                    <td
                      className="px-4 py-3 font-bold"
                      style={{ color: q.reading ? "#dc2626" : undefined }}
                    >
                      {q.assessed ? (q.reading ? "Yes" : "No") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs opacity-80">{q.observation}</td>
                    <td className="px-4 py-3 text-center">
                      {q.assessed ? (
                        <span
                          className={`inline-block px-3 py-1 rounded-md text-[11px] font-black ${levelOf(q.risk).chip}`}
                        >
                          {q.risk}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[11px] opacity-60 mt-4">
        These are indicators from the webcam, not proof. Lighting, glasses and
        camera position affect them. Review the answers before deciding.
        Candidates do not see this section.
      </p>
    </div>
  );
}
