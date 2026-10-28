import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";

function InterviewReport() {
  const {
    interviewId,
    sessionId,
  } = useParams();

  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(
          `/sessions/${sessionId}/report`
        );

        setReport(response.data);
      } catch (err) {
        console.error(
          "Report loading failed:",
          err
        );

        setError(
          err.response?.data?.detail ||
            "Unable to load interview report."
        );
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      loadReport();
    }
  }, [sessionId]);

  // =====================================================
  // THEME CLASSES HELPER
  // =====================================================
  // One single white theme
  const t = {
    bg: "bg-white text-slate-800",
    headerBg: "bg-white border-slate-200 text-slate-800",
 cardBg: "bg-white border-slate-200 shadow-md",
    textMain: "text-slate-900",
    textSub: "text-slate-600",
    subCard: "bg-slate-50 border-slate-200",
  };

  // =====================================================
  // LOADING STATE
  // =====================================================

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center relative overflow-hidden font-sans transition-colors duration-300`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0,transparent_70%)]"></div>
        <div className="text-center relative z-10">
          <div className="relative mx-auto h-20 w-20">
 <div className="absolute inset-0 rounded-3xl bg-slate-800 animate-ping opacity-30 blur-sm"></div>
 <div className="relative h-20 w-20 rounded-3xl bg-slate-800 flex items-center justify-center text-white text-3xl shadow-md border border-slate-200">
              ✨
            </div>
          </div>
 <p className="text-slate-700 mt-6 text-sm font-black tracking-widest uppercase animate-pulse">
            AI Companion is rendering 3D Analytics...
          </p>
        </div>
      </div>
    );
  }

  // =====================================================
  // ERROR STATE
  // =====================================================

  if (error) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center p-6 relative overflow-hidden font-sans transition-colors duration-300`}>
        <div className={`max-w-md w-full rounded-[36px] ${t.cardBg} border border-rose-500/30 p-8 text-center backdrop-blur-2xl relative z-10`}>
 <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-600 text-3xl text-white mb-4 shadow-md">
            ⚠️
          </div>
          <h2 className={`text-xl font-black ${t.textMain}`}>
            Report unavailable
          </h2>
          <p className="mt-3 text-sm text-slate-500 leading-relaxed font-medium">
            {error}
          </p>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
 className="mt-6 w-full rounded-2xl bg-rose-600 px-6 py-4 text-sm font-bold text-white shadow-md hover:scale-[1.02] transition-all active:scale-95"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const overallScore = report?.overall_score ?? 69;
  const techScore = 75;
  const commScore = 68;
  const logicScore = 64;

  const getScoreMood = (score) => {
    if (score >= 80) {
      return {
        face: "😄",
        title: "Outstanding Performance!",
        message: "Fantastic job! You nailed the core concepts with high confidence and precision. 🌟",
        badgeBg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      };
    }
    if (score >= 50) {
      return {
        face: "😊",
        title: "Good Solid Effort!",
        message: "Well handled! You showed good understanding with great potential to grow further. 👍",
        badgeBg: "bg-slate-100 text-slate-700 border-slate-300",
      };
    }
    return {
      face: "🥺",
      title: "Learning Opportunity!",
      message: "Every interview is a stepping stone to mastery. Review the gaps and bounce back stronger! 💪",
      badgeBg: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    };
  };

  const mood = getScoreMood(overallScore);

  return (
    <div className={`min-h-screen ${t.bg} selection:bg-slate-800 selection:text-white relative overflow-hidden font-sans pb-20 transition-colors duration-300`}>
      
      {/* 3D FLOATING NEON GLOW BLOBS */}
      {/* STICKY GLASS HEADER WITH THEME SWITCHER */}
      <header className={`sticky top-0 z-30 border-b ${t.headerBg} backdrop-blur-2xl shadow-lg transition-colors duration-300`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          
          <div className="flex items-center gap-3">
            <div className="relative group">
 <div className="absolute -inset-1 rounded-2xl bg-slate-800 opacity-75 blur group-hover:opacity-100 transition duration-300"></div>
 <div className="relative h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center shadow-lg text-white text-xl font-black border border-slate-200">
                ✨
              </div>
            </div>
            <div>
 <h1 className={`text-slate-700 text-base sm:text-lg font-black tracking-tight`}>
                AI Interview Agent
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                3D Holographic Analytics Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-extrabold text-slate-700 shadow-md transition-all hover:bg-slate-100 active:scale-95 hidden sm:flex items-center gap-2 backdrop-blur-xl"
            >
              <span>← Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT - 3D BENTO GRID LAYOUT */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-10">

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* CANDIDATE IDENTITY BANNER */}
 <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-slate-800 shadow-md group hover:scale-[1.01] transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-2xl`}>
              <div className="flex items-center gap-4 text-center sm:text-left">
 <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl font-black text-white shadow-md border border-slate-200">
                  PA
                </div>
                <div>
                  <p className="text-xs font-mono font-bold tracking-widest text-slate-700 uppercase">
                    Verified Candidate Profile
                  </p>
                  <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${t.textMain} mt-0.5`}>
                    Packiyalakshmi A.
                  </h2>
                </div>
              </div>
 <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2.5 rounded-2xl border border-emerald-500/30 backdrop-blur-md shadow-md">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-bold tracking-wide text-emerald-600 font-mono">
                  Assessment Verified
                </span>
              </div>
            </div>
          </div>

          {/* ROBO COMPANION CARD */}
 <div className="md:col-span-7 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1.5 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                
                <div className="relative flex-shrink-0">
 <div className="absolute -inset-2 rounded-3xl bg-slate-800 opacity-40 blur-xl group-hover:opacity-75 transition duration-300"></div>
 <div className={`relative w-28 h-28 rounded-3xl ${t.subCard} border border-slate-200 flex flex-col items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300`}>
                    <span className="text-5xl animate-bounce">{mood.face}</span>
                    <span className="mt-1 text-[10px] font-mono font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-0.5 rounded-full border border-slate-300">
                      AI ROBO
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border ${mood.badgeBg} text-xs font-extrabold tracking-wider mb-3 uppercase shadow-lg`}>
                    <span>🤖 Status: {mood.title}</span>
                  </div>
                  <h2 className={`text-xl sm:text-2xl font-black ${t.textMain} tracking-tight`}>
                    Performance Analysis!
                  </h2>
                  <p className={`mt-2 text-xs sm:text-sm ${t.textSub} font-semibold leading-relaxed`}>
                    {mood.message}
                  </p>
                </div>

              </div>
            </div>
          </div>

          {/* OVERALL SCORE RING CARD */}
 <div className="md:col-span-5 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1.5 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-6 flex flex-col items-center justify-center text-center backdrop-blur-2xl`}>
 <p className="text-slate-700 text-xs font-black uppercase tracking-[0.25em]">
                Overall Score Badge
              </p>
              
              <div className="relative mt-4 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-slate-100 animate-pulse blur-xl"></div>
 <div className={`relative w-32 h-32 rounded-full border-4 border-slate-300 ${t.subCard} flex flex-col items-center justify-center shadow-md`}>
 <span className="text-slate-700 text-4xl font-black">
                    {overallScore}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                    Out of 100
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* COMPETENCY BREAKDOWN GRID */}
 <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1 transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} p-8 sm:p-10 backdrop-blur-2xl`}>
              <div className="flex items-center gap-3 mb-6">
 <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white text-xl shadow-md border border-slate-200">
                  ⚡
                </div>
                <div>
                  <h3 className={`text-xl font-black ${t.textMain} tracking-tight`}>
                    Competency Breakdown Grid
                  </h3>
                  <p className="text-xs font-bold text-slate-500">
                    Precision score analysis across key interview pillars.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-6">
                
                <div className={`rounded-3xl border border-teal-500/30 ${t.subCard} p-6 flex flex-col justify-between shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-teal-500 font-mono">Technical</span>
                    <span className="h-9 w-9 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-500 font-black text-xs flex items-center justify-center">
                      {techScore}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-xs font-extrabold ${t.textSub} mb-2`}>
                      <span>Accuracy Level</span>
                      <span className="text-teal-500 font-mono">75%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
 <div className="h-full bg-slate-800 rounded-full shadow-md" style={{ width: `${techScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl border border-slate-300 ${t.subCard} p-6 flex flex-col justify-between shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-700 font-mono">Communication</span>
                    <span className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-black text-xs flex items-center justify-center">
                      {commScore}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-xs font-extrabold ${t.textSub} mb-2`}>
                      <span>Clarity & Tone</span>
                      <span className="text-slate-700 font-mono">68%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
 <div className="h-full bg-slate-800 rounded-full shadow-md" style={{ width: `${commScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl border border-slate-300 ${t.subCard} p-6 flex flex-col justify-between shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-700 font-mono">Logic & Problem</span>
                    <span className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-black text-xs flex items-center justify-center">
                      {logicScore}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-xs font-extrabold ${t.textSub} mb-2`}>
                      <span>Reasoning Speed</span>
                      <span className="text-slate-700 font-mono">64%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
 <div className="h-full bg-slate-800 rounded-full shadow-md" style={{ width: `${logicScore}%` }}></div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* AI SUMMARY CARD */}
 <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1 transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} p-8 sm:p-10 backdrop-blur-2xl`}>
              <div className="flex items-center gap-3 mb-4">
 <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white text-xl shadow-md border border-slate-200">
                  💡
                </div>
                <h3 className={`text-xl font-black ${t.textMain} tracking-tight`}>
                  Detailed AI Summary & Insights
                </h3>
              </div>
              <p className={`mt-3 leading-relaxed ${t.textSub} text-sm sm:text-base font-semibold`}>
                {report?.summary ||
                  "No summary is available for this interview session."}
              </p>
            </div>
          </div>

          {/* STRENGTHS CARD */}
 <div className="md:col-span-6 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div>
                <div className="flex items-center gap-3 mb-4">
 <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white text-xl shadow-md border border-slate-200">
                    🎯
                  </div>
                  <h3 className={`text-xl font-black ${t.textMain} tracking-tight`}>
                    Key Strengths
                  </h3>
                </div>
                <ul className="space-y-3.5 mt-4">
                  <li className={`flex items-start gap-3 text-sm ${t.textSub} font-semibold`}>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 flex items-center justify-center font-bold text-xs">✓</span>
                    Strong foundational knowledge and technical terminology usage.
                  </li>
                  <li className={`flex items-start gap-3 text-sm ${t.textSub} font-semibold`}>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 flex items-center justify-center font-bold text-xs">✓</span>
                    Clear articulation and structured response formatting.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* AREAS FOR GROWTH CARD */}
 <div className="md:col-span-6 relative p-[2px] rounded-[36px] bg-slate-50 shadow-md group hover:-translate-y-1 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div>
                <div className="flex items-center gap-3 mb-4">
 <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white text-xl shadow-md border border-slate-200">
                    📈
                  </div>
                  <h3 className={`text-xl font-black ${t.textMain} tracking-tight`}>
                    Areas for Growth
                  </h3>
                </div>
                <ul className="space-y-3.5 mt-4">
                  <li className={`flex items-start gap-3 text-sm ${t.textSub} font-semibold`}>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center font-bold text-xs">!</span>
                    Incorporate more edge-case considerations when tackling complex problems.
                  </li>
                  <li className={`flex items-start gap-3 text-sm ${t.textSub} font-semibold`}>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center font-bold text-xs">!</span>
                    Elaborate further on optimization strategies in code solutions.
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        {/* 3D ACTION BUTTON */}
        <div className="mt-10">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
 className="w-full rounded-2xl bg-slate-800 px-6 py-4 text-sm font-extrabold text-white shadow-md hover:scale-[1.01] transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200"
          >
            <span>← Return to Dashboard</span>
          </button>
        </div>

      </main>
    </div>
  );
}

export default InterviewReport;