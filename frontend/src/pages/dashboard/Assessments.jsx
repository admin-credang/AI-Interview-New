import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import InterviewCard from "../../components/dashboard/InterviewCard";
import { IconAlert, IconBriefcase, IconSearch } from "../../components/dashboard/icons";
import {
  getSessionState,
  matchesSearch,
  useDashboard,
} from "../../context/DashboardContext";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

export default function Assessments() {
  const navigate = useNavigate();
  const { t, interviews, isCandidate, isInterviewer, searchQuery, setSearchQuery, stats } =
    useDashboard();

  const [statusFilter, setStatusFilter] = useState("all");

  const list = useMemo(
    () =>
      interviews
        .filter((i) => matchesSearch(i, searchQuery))
        .filter(
          (i) =>
            !isCandidate ||
            statusFilter === "all" ||
            getSessionState(i.session) === statusFilter
        ),
    [interviews, searchQuery, statusFilter, isCandidate]
  );

  const counts = {
    all: stats.total,
    not_started: stats.notStarted,
    in_progress: stats.inProgress,
    completed: stats.completed,
  };

  return (
    <div className="space-y-10 p-3">
      {/* Header with 3D shadow and gradient styling */}
      <header className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(8_11_20_0.22)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-violet-100/80 via-purple-100/50 to-transparent rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">My Assessments</h1>
          <p className="text-slate-600 mt-2 text-sm font-normal">
            {isCandidate
              ? "Every assessment assigned to you, with its current status."
              : "Every assessment you have created."}
          </p>
        </div>

        {isInterviewer && (
          <button
            onClick={() => navigate("/create-interview")}
            className="relative z-10 px-6 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
          >
            Create Assessment
          </button>
        )}
      </header>

      {/* Filter and Search Bar Section */}
      <section className="p-6 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Filter assessments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:bg-white text-slate-900 font-medium text-xs transition shadow-inner"
          />
        </div>

        {isCandidate && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200 w-full md:w-auto shadow-inner overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                data-plain
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`flex-1 md:flex-none whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === f.id
                    ? "bg-violet-600 text-white shadow-md"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
        )}
      </section>

      {list.length === 0 ? (
        <div className="text-center py-24 px-6 rounded-[2.5rem] bg-white shadow-[0_20px_50px_rgba(8_11_20_0.15)] border border-slate-100">
          <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150 text-slate-400">
            <IconAlert />
          </div>
          <h3 className="text-2xl font-bold mb-2 text-slate-900">No Assessments Found</h3>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            {searchQuery
              ? "No matches for your search. Try different keywords."
              : isCandidate
              ? "No assessments in this view yet. Check back later or contact your recruiter."
              : "You haven't created any assessments yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 p-2 [&>*]:rounded-[2.5rem] [&>*]:bg-white [&>*]:shadow-[0_20px_50px_rgba(8_11_20_0.15)] [&>*]:border [&>*]:border-slate-100 [&>*]:hover:-translate-y-2 [&>*]:hover:shadow-[0_30px_70px_rgba(8_11_20_0.25)] [&>*]:transition-all [&>*]:duration-300">
          {list.map((i) => (
            <div key={i.id} className="flex flex-col">
              <InterviewCard interview={i} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}