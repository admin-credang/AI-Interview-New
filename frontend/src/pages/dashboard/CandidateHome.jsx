import { useState } from "react";
import { useNavigate } from "react-router-dom";

import StatCard from "../../components/dashboard/StatCard";
import { Timeline, processSteps } from "../../components/dashboard/hiring";
import {
  IconAlert,
  IconAward,
  IconBriefcase,
  IconClock,
  IconLayers,
} from "../../components/dashboard/icons";
import { getSessionState, useDashboard } from "../../context/DashboardContext";

const RESULT = {
  under_review: {
    title: "Submitted - under review",
    text: "Thank you for attending. If you are selected, our team will contact you. Otherwise you will receive an email.",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  },
  selected: {
    title: "You have been selected",
    text: "Congratulations! Our team will contact you shortly.",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  not_selected: {
    title: "Not selected this time",
    text: "Thank you for your time. We have sent the details to your email.",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  },
};

function Chip({ children }) {
  return (
    <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-white/15 bg-white/5">
      {children}
    </span>
  );
}

function JobCard({ item, t }) {
  const navigate = useNavigate();

  const state = getSessionState(item.session);
  const job = item.job || {};
  const result = RESULT[item.session?.result] || RESULT.under_review;

  const heading = job.role || item.title;
  const closed = item.status === "closed" && state === "not_started";

  return (
    <article className={`rounded-[2.5rem] border ${t.card} p-8 flex flex-col gap-5`}>
      <div>
        <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-1">
          {job.company || "AI Tech Solutions"}
        </p>
        <h3 className="text-2xl font-black tracking-tight leading-tight">{heading}</h3>
        {job.role && job.role !== item.title && (
          <p className="text-sm opacity-60 mt-1">{item.title}</p>
        )}
      </div>

      <Timeline state={state} result={item.session?.result} />

      <div className="flex flex-wrap gap-2">
        {job.location && <Chip>{job.location}</Chip>}
        {job.employment_type && <Chip>{job.employment_type}</Chip>}
        {job.experience && <Chip>{job.experience}</Chip>}
        <Chip>{item.duration || 30} min</Chip>
        {item.question_count ? <Chip>{item.question_count} questions</Chip> : null}
      </div>

      {(job.responsibilities || item.description) && (
        <p className="text-sm leading-relaxed opacity-80 whitespace-pre-wrap line-clamp-6">
          {job.responsibilities || item.description}
        </p>
      )}

      {job.skills?.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider opacity-50 font-bold mb-2">Key Skills</p>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((s) => (
              <span
                key={s}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {state === "completed" ? (
        <div className={`p-5 rounded-2xl border ${result.cls}`}>
          <p className="font-bold mb-1">{result.title}</p>
          <p className="text-xs leading-relaxed opacity-90">{result.text}</p>
        </div>
      ) : closed ? (
        <div className="p-5 rounded-2xl border border-white/10 bg-white/5 text-sm opacity-80">
          This interview is no longer accepting candidates.
        </div>
      ) : (
        <button
          onClick={() => navigate(`/interviews/${item.id}`)}
          className="mt-auto w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-2xl font-bold transition active:scale-[0.98] shadow-xl"
        >
          {state === "in_progress" ? "Resume AI Interview" : "Start AI Interview"}
          <span>→</span>
        </button>
      )}
    </article>
  );
}

export default function CandidateHome() {
  const { t, userName, interviews, stats } = useDashboard();

  // Fallback demo candidate data if dynamic interviews are empty
  const defaultInterviews = interviews && interviews.length > 0 ? interviews : [
    {
      id: "demo-1",
      title: "Full-Stack AI Developer Interview",
      status: "active",
      duration: 30,
      question_count: 5,
      monitoring_required: true,
      job: {
        company: "Pydun Technology / Techmango",
        role: "Full-Stack & AI Developer",
        location: "Madurai, Tamil Nadu (Remote/Hybrid)",
        employment_type: "Full-time / Internship",
        experience: "2+ Years",
        responsibilities: "Develop scalable web applications using Django, integrate conversational AI agents via LangChain, RAG pipelines, and handle intelligent database operations.",
        skills: ["Python", "Django", "React", "LangChain", "XGBoost", "Tailwind CSS"]
      },
      session: { status: "not_started" }
    }
  ];

  const open = defaultInterviews.filter((i) => getSessionState(i.session) !== "completed");
  const anyMonitoring = open.some((i) => i.monitoring_required);

  const steps = processSteps({
    monitoring: anyMonitoring,
    questionCount: open[0]?.question_count,
    followUps: open[0]?.follow_ups_enabled !== false,
  });

  return (
    <div className="space-y-12">
      {/* Candidate Profile Welcome Banner */}
      <header className={`p-10 rounded-[3rem] border ${t.welcome} relative overflow-hidden`}>
        <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-xs font-semibold mb-4">
              <span>⚡ Active Candidate Profile</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                {userName || "Packiyalakshmi"}
              </span>
            </h1>
            <p className="text-base md:text-lg opacity-85 max-w-2xl leading-relaxed">
              Your technical assessment and AI interview portal is ready. Review the job details below, pass the system check, and begin when you feel confident.
            </p>
          </div>
          <div className="shrink-0 bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wider opacity-60 font-bold mb-1">Target Role</p>
            <p className="text-sm font-bold text-fuchsia-300">Full-Stack & AI Engineer</p>
            <p className="text-xs opacity-50 mt-1">Location: Madurai, IN</p>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard title="Assigned Interviews" value={stats?.total || defaultInterviews.length} icon={IconLayers} change="Ready to take" variant="purple" />
        <StatCard title="Completed" value={stats?.completed || 0} icon={IconAward} change="Under evaluation" variant="emerald" />
        <StatCard title="In Progress" value={stats?.inProgress || 0} icon={IconClock} change="Pending completion" variant="amber" />
      </section>

      {/* PROCESS SECTION */}
      <section>
        <h2 className="text-xl font-bold mb-6 px-1">How your AI interview works</h2>
        <ol className={`rounded-[2rem] border ${t.card} p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6`}>
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-lg shadow-fuchsia-500/30">
                {i + 1}
              </span>
              <div>
                <p className="font-bold text-sm">{s.title}</p>
                <p className="text-xs opacity-70 mt-1 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* JOBS SECTION */}
      <section>
        <div className="flex items-center gap-3 mb-6 px-1">
          <span className="text-fuchsia-400">
            <IconBriefcase />
          </span>
          <h2 className="text-xl font-bold">Your Active Interviews</h2>
        </div>

        {defaultInterviews.length === 0 ? (
          <div className={`text-center py-20 px-6 rounded-[3rem] border ${t.card}`}>
            <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150">
              <IconAlert />
            </div>
            <h3 className="text-2xl font-bold mb-2">No interviews scheduled</h3>
            <p className="opacity-60 text-sm max-w-md mx-auto">
              When a recruiter invites you to an AI interview, it will appear right here instantly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {defaultInterviews.map((i) => (
              <JobCard key={i.id} item={i} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}