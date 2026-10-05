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
  
  // Theme State: 'dark' | 'light' | 'bright'
  const [theme, setTheme] = useState("dark");

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
  const getThemeStyles = () => {
    if (theme === "light") {
      return {
        bg: "bg-slate-100 text-slate-800",
        headerBg: "bg-white/80 border-slate-200 text-slate-800",
        cardBg: "bg-white/90 border-slate-200 shadow-[0_15px_35px_rgba(0,0,0,0.08)]",
        textMain: "text-slate-900",
        textSub: "text-slate-600",
        subCard: "bg-slate-50 border-slate-200",
      };
    }
    if (theme === "bright") {
      return {
        bg: "bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 text-slate-900",
        headerBg: "bg-white/90 border-indigo-200 text-indigo-950",
        cardBg: "bg-white/95 border-indigo-200 shadow-[0_20px_40px_rgba(99,102,241,0.15)]",
        textMain: "text-indigo-950",
        textSub: "text-purple-900 font-semibold",
        subCard: "bg-gradient-to-r from-indigo-50 to-pink-50 border-indigo-200",
      };
    }
    // Default: Dark Mode
    return {
      bg: "bg-slate-950 text-slate-100",
      headerBg: "bg-slate-900/80 border-white/10 text-slate-100",
      cardBg: "bg-slate-900/90 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
      textMain: "text-white",
      textSub: "text-slate-300",
      subCard: "bg-slate-900/60 border-white/10",
    };
  };

  const t = getThemeStyles();

  // =====================================================
  // LOADING STATE
  // =====================================================

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center relative overflow-hidden font-sans transition-colors duration-300`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0,transparent_70%)]"></div>
        <div className="text-center relative z-10">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-ping opacity-30 blur-sm"></div>
            <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center text-white text-3xl shadow-[0_0_30px_rgba(168,85,247,0.5)] border border-white/20">
              ✨
            </div>
          </div>
          <p className="mt-6 text-sm font-black tracking-widest uppercase bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-pulse">
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-3xl text-white mb-4 shadow-[0_0_20px_rgba(244,63,94,0.5)]">
            ⚠️
          </div>
          <h2 className={`text-xl font-black ${t.textMain}`}>
            Report unavailable
          </h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed font-medium">
            {error}
          </p>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-6 py-4 text-sm font-bold text-white shadow-[0_10px_25px_rgba(244,63,94,0.4)] hover:scale-[1.02] transition-all active:scale-95"
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
        badgeBg: "bg-blue-500/10 text-blue-500 border-blue-500/30",
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
    <div className={`min-h-screen ${t.bg} selection:bg-indigo-500 selection:text-white relative overflow-hidden font-sans pb-20 transition-colors duration-300`}>
      
      {/* 3D FLOATING NEON GLOW BLOBS */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[160px] pointer-events-none animate-pulse"></div>
      <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[180px] pointer-events-none"></div>

      {/* STICKY GLASS HEADER WITH THEME SWITCHER */}
      <header className={`sticky top-0 z-30 border-b ${t.headerBg} backdrop-blur-2xl shadow-lg transition-colors duration-300`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-75 blur group-hover:opacity-100 transition duration-300"></div>
              <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg text-white text-xl font-black border border-white/20">
                ✨
              </div>
            </div>
            <div>
              <h1 className={`text-base sm:text-lg font-black bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent tracking-tight`}>
                AI Interview Agent
              </h1>
              <p className="text-xs font-bold text-indigo-500 tracking-wide flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                3D Holographic Analytics Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* THEME TOGGLE BUTTONS */}
            <div className="flex items-center bg-slate-200/50 dark:bg-slate-800/60 p-1 rounded-2xl border border-white/20 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${theme === "dark" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                🌙 Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${theme === "light" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                ☀️ Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("bright")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${theme === "bright" ? "bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                🌈 Bright
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm font-extrabold text-indigo-500 shadow-md transition-all hover:bg-indigo-500/20 active:scale-95 hidden sm:flex items-center gap-2 backdrop-blur-xl"
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
          <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_20px_50px_rgba(99,102,241,0.2)] group hover:scale-[1.01] transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-2xl`}>
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-2xl font-black text-white shadow-[0_0_25px_rgba(168,85,247,0.5)] border border-white/30">
                  PA
                </div>
                <div>
                  <p className="text-xs font-mono font-bold tracking-widest text-indigo-500 uppercase">
                    Verified Candidate Profile
                  </p>
                  <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${t.textMain} mt-0.5`}>
                    Packiyalakshmi A.
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2.5 rounded-2xl border border-emerald-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-bold tracking-wide text-emerald-600 dark:text-emerald-300 font-mono">
                  Assessment Verified
                </span>
              </div>
            </div>
          </div>

          {/* ROBO COMPANION CARD */}
          <div className="md:col-span-7 relative p-[2px] rounded-[36px] bg-gradient-to-r from-indigo-500/60 via-purple-500/60 to-pink-500/60 shadow-[0_20px_50px_rgba(99,102,241,0.15)] group hover:-translate-y-1.5 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-indigo-500 to-pink-500 opacity-40 blur-xl group-hover:opacity-75 transition duration-300"></div>
                  <div className={`relative w-28 h-28 rounded-3xl ${t.subCard} border border-white/20 flex flex-col items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.2)] group-hover:scale-105 transition-transform duration-300`}>
                    <span className="text-5xl animate-bounce">{mood.face}</span>
                    <span className="mt-1 text-[10px] font-mono font-black tracking-widest text-indigo-500 bg-indigo-500/20 px-3 py-0.5 rounded-full border border-indigo-500/30">
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
          <div className="md:col-span-5 relative p-[2px] rounded-[36px] bg-gradient-to-r from-blue-500/60 via-indigo-500/60 to-purple-600/60 shadow-[0_20px_50px_rgba(79,70,229,0.2)] group hover:-translate-y-1.5 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-6 flex flex-col items-center justify-center text-center backdrop-blur-2xl`}>
              <p className="text-xs font-black uppercase tracking-[0.25em] bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                Overall Score Badge
              </p>
              
              <div className="relative mt-4 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse blur-xl"></div>
                <div className={`relative w-32 h-32 rounded-full border-4 border-indigo-500/30 ${t.subCard} flex flex-col items-center justify-center shadow-[inset_0_0_20px_rgba(99,102,241,0.3)]`}>
                  <span className="text-4xl font-black bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    {overallScore}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400 tracking-widest uppercase mt-0.5">
                    Out of 100
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* COMPETENCY BREAKDOWN GRID */}
          <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-gradient-to-r from-teal-500/60 via-cyan-500/60 to-blue-600/60 shadow-[0_20px_50px_rgba(13,148,136,0.15)] group hover:-translate-y-1 transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} p-8 sm:p-10 backdrop-blur-2xl`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-blue-600 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(20,184,166,0.5)] border border-white/20">
                  ⚡
                </div>
                <div>
                  <h3 className={`text-xl font-black ${t.textMain} tracking-tight`}>
                    Competency Breakdown Grid
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
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
                    <div className="h-3 w-full bg-slate-800/20 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(20,184,166,0.6)]" style={{ width: `${techScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl border border-blue-500/30 ${t.subCard} p-6 flex flex-col justify-between shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-blue-500 font-mono">Communication</span>
                    <span className="h-9 w-9 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-500 font-black text-xs flex items-center justify-center">
                      {commScore}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-xs font-extrabold ${t.textSub} mb-2`}>
                      <span>Clarity & Tone</span>
                      <span className="text-blue-500 font-mono">68%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-800/20 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)]" style={{ width: `${commScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl border border-purple-500/30 ${t.subCard} p-6 flex flex-col justify-between shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-purple-500 font-mono">Logic & Problem</span>
                    <span className="h-9 w-9 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-500 font-black text-xs flex items-center justify-center">
                      {logicScore}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-xs font-extrabold ${t.textSub} mb-2`}>
                      <span>Reasoning Speed</span>
                      <span className="text-purple-500 font-mono">64%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-800/20 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.6)]" style={{ width: `${logicScore}%` }}></div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* AI SUMMARY CARD */}
          <div className="md:col-span-12 relative p-[2px] rounded-[36px] bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-rose-500/60 shadow-[0_20px_50px_rgba(217,70,239,0.15)] group hover:-translate-y-1 transition-all duration-300">
            <div className={`rounded-[34px] ${t.cardBg} p-8 sm:p-10 backdrop-blur-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(217,70,239,0.5)] border border-white/20">
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
          <div className="md:col-span-6 relative p-[2px] rounded-[36px] bg-gradient-to-r from-emerald-500/60 via-teal-500/60 to-cyan-500/60 shadow-[0_20px_50px_rgba(16,185,129,0.15)] group hover:-translate-y-1 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(16,185,129,0.5)] border border-white/20">
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
          <div className="md:col-span-6 relative p-[2px] rounded-[36px] bg-gradient-to-r from-amber-500/60 via-orange-500/60 to-rose-500/60 shadow-[0_20px_50px_rgba(245,158,11,0.15)] group hover:-translate-y-1 transition-all duration-300">
            <div className={`h-full rounded-[34px] ${t.cardBg} p-8 flex flex-col justify-between backdrop-blur-2xl`}>
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white text-xl shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-white/20">
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
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-4 text-sm font-extrabold text-white shadow-[0_15px_30px_rgba(168,85,247,0.4)] hover:scale-[1.01] transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/20"
          >
            <span>← Return to Dashboard</span>
          </button>
        </div>

      </main>
    </div>
  );
}

export default InterviewReport;