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
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">My Assessments</h1>
          <p className="opacity-70 mt-2 text-sm">
            {isCandidate
              ? "Every assessment assigned to you, with its current status."
              : "Every assessment you have created."}
          </p>
        </div>

        {isInterviewer && (
          <button
            onClick={() => navigate("/create-interview")}
            className="px-6 py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
          >
            Create Assessment
          </button>
        )}
      </header>

      <section className={`p-5 rounded-[2rem] border ${t.card} flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-2xl`}>
        <div className="relative w-full md:max-w-sm">
          <span className="absolute left-4 top-1/2 -translate-y-1/2">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Filter assessments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-12 pr-4 py-3 rounded-2xl border ${t.input} outline-none focus:ring-2 focus:ring-fuchsia-500`}
          />
        </div>

        {isCandidate && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/20 border border-white/10 w-full md:w-auto shadow-inner overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`flex-1 md:flex-none whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === f.id
                    ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md"
                    : "hover:bg-white/5 opacity-75 hover:opacity-100"
                }`}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
        )}
      </section>

      {list.length === 0 ? (
        <div className={`text-center py-24 px-6 rounded-[3rem] border ${t.card}`}>
          <div className="opacity-30 mx-auto mb-6 flex justify-center scale-150">
            <IconAlert />
          </div>
          <h3 className="text-2xl font-bold mb-2">No Assessments Found</h3>
          <p className="opacity-60 max-w-md mx-auto text-sm leading-relaxed">
            {searchQuery
              ? "No matches for your search. Try different keywords."
              : isCandidate
              ? "No assessments in this view yet. Check back later or contact your recruiter."
              : "You haven't created any assessments yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 p-2">
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
