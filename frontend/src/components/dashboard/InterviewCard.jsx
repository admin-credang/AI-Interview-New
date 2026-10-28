import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSessionState, useDashboard } from "../../context/DashboardContext";
import { IconBriefcase, IconCheckCircle, IconClock, IconZap } from "./icons";

// --- Advanced 3D Interactive Futuristic Card Component ---
const BUTTON_LABELS = {
  completed: "Submitted",
  in_progress: "Resume Assessment",
  not_started: "Start Assessment",
};

export default function InterviewCard({ interview }) {
  const navigate = useNavigate();
  const { isInterviewer } = useDashboard();
  const getButtonLabel = (s) => BUTTON_LABELS[s];

  const onAction = (item, sessionState) => {
    if (!item?.id) return;
    // Completed interviews have no report for candidates.
    if (sessionState === "completed") return;
    navigate(`/interviews/${item.id}`);
  };

  const cardRef = useRef(null);

  const reduceMotion = (() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem("dashboard_preferences"))?.reduceMotion);
    } catch {
      return false;
    }
  })();

  const handleMouseMove = (e) => {
    if (!cardRef.current || reduceMotion) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
  };

  const status = getSessionState(interview?.session);

  const themeConfig = {
    completed: {
      border: "border-slate-200",
      text: "text-emerald-700",
 shadow: "shadow-md hover:shadow-md",
 button: "bg-slate-800 hover:bg-slate-700 ",
      icon: IconCheckCircle,
      statusText: "Completed"
    },
    in_progress: {
      border: "border-slate-200",
      text: "text-amber-700",
 shadow: "shadow-md hover:shadow-md",
 button: "bg-slate-800 hover:bg-slate-700 animate-pulse",
      icon: IconClock,
      statusText: "In Progress"
    },
    not_started: {
      border: "border-slate-200",
      text: "text-slate-700",
 shadow: "shadow-md hover:shadow-md",
 button: "bg-slate-800 hover:bg-slate-700 ",
      icon: IconZap,
      statusText: "Not Started"
    }
  };

  const cfg = themeConfig[status] || themeConfig.not_started;
  const StatusIcon = cfg.icon;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden rounded-[2.5rem] border backdrop-blur-2xl transition-all duration-300 ease-out h-full flex flex-col
 bg-slate-50 ${cfg.border} ${cfg.shadow}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="relative z-10 p-8 flex flex-col flex-grow" style={{ transform: "translateZ(35px)" }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-2xl font-black leading-tight tracking-tight text-slate-900 drop-shadow-md line-clamp-2">
            {interview.title || interview.name}
          </h3>
          {!isInterviewer && (
            <span className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border ${cfg.border} bg-white ${cfg.text} shadow-inner backdrop-blur-md`}>
              <StatusIcon />
              {cfg.statusText}
            </span>
          )}
        </div>

        <p className="text-sm text-slate-600 mb-8 leading-relaxed line-clamp-3 flex-grow font-normal">
          {interview.description || "AI-driven comprehensive competency assessment."}
        </p>

        <div className="mt-auto pt-5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-semibold tracking-wide">
           <span className="uppercase text-slate-700">{interview.type || 'Technical'}</span>
           <span className="bg-slate-50 px-3 py-1 rounded-full border border-slate-200">{interview.duration_minutes || 30} mins duration</span>
        </div>

        {isInterviewer ? (
          <button
            onClick={() => navigate(`/interviews/${interview.id}/configuration`)}
            className="mt-6 w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition-all duration-300 active:scale-[0.98] shadow-xl"
          >
            <IconBriefcase />
            Configure interview
          </button>
        ) : status === "completed" ? (
          <div className="mt-6 w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-100 text-center text-sm font-semibold text-slate-700">
            {interview?.session?.result === "selected"
              ? "Selected - we will contact you"
              : interview?.session?.result === "not_selected"
              ? "Not selected - check your email"
              : "Under review - we contact you if selected, otherwise email"}
          </div>
        ) : (
        <button
          onClick={() => onAction(interview, status)}
          className={`mt-6 w-full flex items-center justify-center gap-2.5 px-6 py-4 ${cfg.button} text-white rounded-2xl font-bold transition-all duration-300 active:scale-[0.98] shadow-xl hover:-translate-y-0.5`}
          style={{ transform: "translateZ(15px)" }}
        >
          {getButtonLabel(status)}
          <span className="transition-transform group-hover:translate-x-2 text-lg">→</span>
        </button>
        )}
      </div>

      <div className={`absolute -inset-px rounded-[2.5rem] opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-700 pointer-events-none ${cfg.border}`}></div>
    </div>
  );
}
