import { useState } from "react";

import { useDashboard } from "../../context/DashboardContext";

const CANDIDATE_FAQ = [
  ["How do I start an assessment?", "Open My Interviews, read the job details and press Start interview. You will pass through a lobby where you can check your setup before the live session begins."],
  ["What happens if I leave the interview page?", "The interview is monitored. Switching tabs or leaving the interview page can end your session, so stay on the page until you finish."],
  ["Can I resume an assessment?", "Yes. Interviews marked In progress show a Resume interview button."],
  ["How will I know the result?", "Right after you finish, you get a thank-you email. If you are selected, our team will contact you. If you are not selected, you will receive an email. Scores and analysis are only seen by the hiring team."],
  ["Is my camera used?", "Only if the recruiter turned monitoring on for that interview. The interview page tells you before you start. If it is off, no camera is used."],
];

const INTERVIEWER_FAQ = [
  ["How do I create an assessment?", "Use Create Assessment from the dashboard, then configure difficulty, categories and question count."],
  ["How do I change an assessment's configuration?", "Open My Assessments and press Configure interview on the assessment, or use the Configuration page."],
];

export default function Help() {
  const { t, isCandidate } = useDashboard();
  const faq = isCandidate ? CANDIDATE_FAQ : INTERVIEWER_FAQ;
  const [open, setOpen] = useState(0);

  return (
    <div className="space-y-10 max-w-3xl">
      <header className="px-1">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Help Center</h1>
        <p className="opacity-70 mt-2 text-sm">Answers to common questions about the platform.</p>
      </header>

      <section className={`rounded-[2rem] border ${t.card} divide-y divide-slate-200 overflow-hidden`}>
        {faq.map(([q, a], idx) => (
          <div key={q}>
            <button data-plain
              onClick={() => setOpen(open === idx ? -1 : idx)}
              className="w-full flex justify-between items-center gap-4 px-8 py-5 text-left font-semibold hover:bg-slate-50"
              aria-expanded={open === idx}
            >
              {q}
              <span className="opacity-60">{open === idx ? "−" : "+"}</span>
            </button>
            {open === idx && <p className="px-8 pb-6 text-sm opacity-80 leading-relaxed">{a}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
